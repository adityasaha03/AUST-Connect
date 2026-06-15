import { Hono }           from "hono";
import { authMiddleware } from "@/middleware/auth.middleware";
import * as handlers      from "./google.handlers";

const google = new Hono();

// ─── OAuth flow (authenticated — user must be logged in to connect) ───────────
google.get("/authorize", authMiddleware, handlers.authorizeHandler);
google.get("/callback",  authMiddleware, handlers.callbackHandler);
google.delete("/disconnect", authMiddleware, handlers.disconnectHandler);

// ─── Manual sync ──────────────────────────────────────────────────────────────
google.post("/sync/:eventId", authMiddleware, handlers.manualSyncHandler);

export default google;