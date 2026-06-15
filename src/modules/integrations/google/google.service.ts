import { eq, and }         from "drizzle-orm";
import { randomBytes }     from "node:crypto";
import { db }              from "@/db/client";
import { events, userGoogleCredentials } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { logger }           from "@/lib/logger";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import * as GoogleClient    from "./google.client";
import type { ManualSyncInput } from "./google.schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGCalPayload(event: typeof events.$inferSelect) {
  return {
    summary:     event.title,
    description: event.description ?? undefined,
    location:    event.locationName ?? event.locationUrl ?? undefined,
    start: event.isAllDay
      ? { date: event.startsAt.toISOString().split("T")[0] }
      : { dateTime: event.startsAt.toISOString(), timeZone: event.timezone },
    end: event.endsAt
      ? event.isAllDay
        ? { date: event.endsAt.toISOString().split("T")[0] }
        : { dateTime: event.endsAt.toISOString(), timeZone: event.timezone }
      : undefined,
  };
}

// Fetch stored credentials, refresh access token if expired
async function getValidAccessToken(userId: string): Promise<{
  accessToken: string;
  calendarId:  string;
}> {
  const [creds] = await db
    .select()
    .from(userGoogleCredentials)
    .where(eq(userGoogleCredentials.userId, userId))
    .limit(1);

  if (!creds) throw new ForbiddenError("Google account not connected");

  const decryptedRefresh = decrypt(creds.refreshToken);

  // Refresh if expired (with 60s buffer)
  if (creds.expiresAt <= new Date(Date.now() + 60_000)) {
    const refreshed = await GoogleClient.refreshAccessToken(decryptedRefresh);

    await db
      .update(userGoogleCredentials)
      .set({
        accessToken: encrypt(refreshed.accessToken),
        expiresAt:   refreshed.expiresAt,
        updatedAt:   new Date(),
      })
      .where(eq(userGoogleCredentials.userId, userId));

    return { accessToken: refreshed.accessToken, calendarId: "primary" };
  }

  return { accessToken: decrypt(creds.accessToken), calendarId: "primary" };
}

// ─── OAuth: build redirect URL ────────────────────────────────────────────────

export function getAuthorizationUrl(): { url: string; csrfToken: string } {
  const csrfToken = randomBytes(16).toString("hex");
  const url       = GoogleClient.buildAuthorizationUrl(csrfToken);
  return { url, csrfToken };
}

// ─── OAuth: handle callback, store credentials ────────────────────────────────

export async function handleOAuthCallback(
  code:      string,
  userId:    string,
) {
  const tokens = await GoogleClient.exchangeCodeForTokens(code);

  await db
    .insert(userGoogleCredentials)
    .values({
      userId,
      accessToken:  encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      expiresAt:    tokens.expiresAt,
      scope:        tokens.scope,
    })
    .onConflictDoUpdate({
      target: userGoogleCredentials.userId,
      set: {
        accessToken:  encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        expiresAt:    tokens.expiresAt,
        scope:        tokens.scope,
        updatedAt:    new Date(),
      },
    });

  logger.info({ userId }, "Google account connected");
}

// ─── Disconnect Google account ────────────────────────────────────────────────

export async function disconnectGoogle(userId: string) {
  await db
    .delete(userGoogleCredentials)
    .where(eq(userGoogleCredentials.userId, userId));

  logger.info({ userId }, "Google account disconnected");
}

// ─── Sync single event → Google Calendar ─────────────────────────────────────

export async function syncEventToGoogle(
  eventId: string,
  userId:  string,
  input:   ManualSyncInput,
) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!event)                  throw new NotFoundError("Event");
  if (event.creatorId !== userId) throw new ForbiddenError("Not the event creator");

  const { accessToken, calendarId } = await getValidAccessToken(userId);
  const payload = buildGCalPayload(event);

  if (event.gcalEventId) {
    // Update existing GCal event
    await GoogleClient.patchCalendarEvent(
      accessToken,
      input.calendarId ?? calendarId,
      event.gcalEventId,
      payload,
    );

    await db
      .update(events)
      .set({ gcalSyncedAt: new Date() })
      .where(eq(events.id, eventId));

    logger.info({ eventId, gcalEventId: event.gcalEventId }, "Event synced to GCal (patch)");
  } else {
    // Create new GCal event
    const created = await GoogleClient.createCalendarEvent(
      accessToken,
      input.calendarId ?? calendarId,
      payload,
    );

    await db
      .update(events)
      .set({
        gcalEventId:    created.id,
        gcalCalendarId: input.calendarId ?? calendarId,
        gcalSyncedAt:   new Date(),
      })
      .where(eq(events.id, eventId));

    logger.info({ eventId, gcalEventId: created.id }, "Event synced to GCal (create)");
  }
}

// ─── Inbound webhook: Google → AUST Connect ──────────────────────────────────
// AUST Connect is source of truth.
// Only scheduling fields are updated from Google.

export async function handleGoogleWebhook(
  channelToken: string,
  gcalEventId:  string,
  calendarId:   string,
  accessToken:  string,
) {
  // Fetch updated event from Google
  const gcalEvent = await GoogleClient.getCalendarEvent(
    accessToken,
    calendarId,
    gcalEventId,
  );

  // Find matching local event
  const [localEvent] = await db
    .select()
    .from(events)
    .where(eq(events.gcalEventId, gcalEventId))
    .limit(1);

  if (!localEvent) {
    logger.warn({ gcalEventId }, "Webhook received for unknown gcalEventId — ignoring");
    return;
  }

  // Apply only scheduling + location fields (AUST Connect owns title/description)
  const startsAt = gcalEvent.start.dateTime
    ? new Date(gcalEvent.start.dateTime)
    : gcalEvent.start.date
      ? new Date(gcalEvent.start.date)
      : undefined;

  const endsAt = gcalEvent.end.dateTime
    ? new Date(gcalEvent.end.dateTime)
    : gcalEvent.end.date
      ? new Date(gcalEvent.end.date)
      : undefined;

  await db
    .update(events)
    .set({
      ...(startsAt      && { startsAt }),
      ...(endsAt        && { endsAt }),
      ...(gcalEvent.location && { locationName: gcalEvent.location }),
      gcalSyncedAt: new Date(),
      updatedAt:    new Date(),
    })
    .where(eq(events.id, localEvent.id));

  logger.info({ eventId: localEvent.id, gcalEventId }, "Inbound GCal webhook applied");
}