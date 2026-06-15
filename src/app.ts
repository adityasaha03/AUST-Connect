import { Hono }              from "hono";
import { cors }              from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders }     from "hono/secure-headers";
import { timeout }           from "hono/timeout";

import { globalErrorHandler } from "@/middleware/error.middleware";
import { logger }             from "@/lib/logger";
import { env }                from "@/env";

// ─── Route modules ────────────────────────────────────────────────────────────
import authRoutes       from "@/modules/auth/auth.routes";
import usersRoutes      from "@/modules/users/users.routes";
import profilesRoutes   from "@/modules/profiles/profiles.routes";
import eventsRoutes     from "@/modules/events/events.routes";
import googleRoutes     from "@/modules/integrations/google/google.routes";
import webhookRoutes    from "@/modules/webhooks/google.webhook.routes";

// ─── App instantiation ────────────────────────────────────────────────────────

const app = new Hono();

// ─── Global middleware ────────────────────────────────────────────────────────

// Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use("*", secureHeaders());

// CORS — tighten allowedOrigins before going to production
app.use(
  "*",
  cors({
    origin: env.NODE_ENV === "production"
      ? ["https://aust-connect.app"]   // replace with real domain
      : ["http://localhost:3000", "http://localhost:5173"],
    allowMethods:  ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders:  ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Total-Count"],
    credentials:   true,
    maxAge:        600,
  }),
);

// Request timeout — abort handlers that take longer than 30s
app.use("*", timeout(30_000));

// HTTP request logging (dev: pretty, prod: JSON via pino)
app.use("*", honoLogger((message) => logger.info(message)));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({
    status:  "ok",
    version: "1.0.0",
    env:     env.NODE_ENV,
    ts:      new Date().toISOString(),
  }),
);

// ─── API routes ───────────────────────────────────────────────────────────────

const api = new Hono();

api.route("/auth",                  authRoutes);
api.route("/users",                 usersRoutes);
api.route("/profiles",              profilesRoutes);
api.route("/events",                eventsRoutes);
api.route("/integrations/google",   googleRoutes);

app.route("/api/v1", api);

// ─── Webhook routes (outside /api/v1 — Google posts directly here) ────────────

app.route("/webhooks", webhookRoutes);

// ─── 404 catch-all ────────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: {
        code:    "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404,
  ),
);

// ─── Global error handler ─────────────────────────────────────────────────────

app.onError(globalErrorHandler);

export default app;