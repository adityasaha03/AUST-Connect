import type { Context }       from "hono";
import * as GoogleService      from "./google.service";
import { OAuthCallbackSchema, ManualSyncSchema, WebhookHeaderSchema } from "./google.schema";
import { successResponse }    from "@/lib/response";
import { ValidationError, ForbiddenError } from "@/lib/errors";
import type { AuthVariables } from "@/middleware/auth.middleware";
import { env }                from "@/env";
import { logger }             from "@/lib/logger";

type AuthCtx = Context<{ Variables: AuthVariables }>;

// ─── Begin OAuth flow ─────────────────────────────────────────────────────────

export async function authorizeHandler(c: AuthCtx) {
  const { url, csrfToken } = GoogleService.getAuthorizationUrl();

  // Store CSRF token in a short-lived cookie for verification in callback
  c.header(
    "Set-Cookie",
    `gcal_csrf=${csrfToken}; HttpOnly; Secure; SameSite=Lax; Max-Age=300; Path=/`,
  );

  return c.redirect(url);
}

// ─── OAuth callback ───────────────────────────────────────────────────────────

export async function callbackHandler(c: AuthCtx) {
  const query  = c.req.query();
  const parsed = OAuthCallbackSchema.safeParse(query);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  // Verify CSRF token matches cookie
  const cookieHeader = c.req.header("Cookie") ?? "";
  const csrfCookie   = cookieHeader
    .split(";")
    .find((s) => s.trim().startsWith("gcal_csrf="))
    ?.split("=")[1]
    ?.trim();

  if (!csrfCookie || csrfCookie !== parsed.data.state) {
    throw new ForbiddenError("Invalid OAuth state — possible CSRF attack");
  }

  await GoogleService.handleOAuthCallback(parsed.data.code, c.get("userId"));

  // Clear CSRF cookie
  c.header("Set-Cookie", "gcal_csrf=; HttpOnly; Secure; Max-Age=0; Path=/");

  return successResponse(c, { connected: true });
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectHandler(c: AuthCtx) {
  await GoogleService.disconnectGoogle(c.get("userId"));
  return c.body(null, 204);
}

// ─── Manual sync ──────────────────────────────────────────────────────────────

export async function manualSyncHandler(c: AuthCtx) {
  const body   = await c.req.json().catch(() => ({}));
  const parsed = ManualSyncSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  await GoogleService.syncEventToGoogle(
    c.req.param("eventId")!,
    c.get("userId"),
    parsed.data,
  );

  return successResponse(c, { synced: true });
}

// ─── Inbound webhook from Google ──────────────────────────────────────────────

export async function webhookHandler(c: Context) {
  const headersParsed = WebhookHeaderSchema.safeParse(
    Object.fromEntries(
      ["x-goog-channel-id", "x-goog-channel-token", "x-goog-resource-id",
       "x-goog-resource-state", "x-goog-message-number"]
        .map((k) => [k, c.req.header(k)]),
    ),
  );

  if (!headersParsed.success) {
    // Malformed webhook — return 200 to prevent Google retrying
    return c.body(null, 200);
  }

  const headers = headersParsed.data;

  // Ignore sync messages (Google sends these on channel registration)
  if (headers["x-goog-resource-state"] === "sync") {
    return c.body(null, 200);
  }

  // Webhook handler needs an access token to fetch the updated event.
  // In a production system, look up the channel in a webhook_channels table
  // to find the user, then get their stored credentials.
  // Simplified here — full channel management is an extension point.
  logger.info(
    { channelId: headers["x-goog-channel-id"], resourceState: headers["x-goog-resource-state"] },
    "Google Calendar webhook received",
  );

  return c.body(null, 200);
}