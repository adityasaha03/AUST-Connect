// Profiles module – Hono route definitions
import { Hono }            from "hono";
import { authMiddleware }  from "@/middleware/auth.middleware";
import * as handlers       from "./profiles.handlers";

const profiles = new Hono();

// ─── Own profile (authenticated) ──────────────────────────────────────────────
profiles.get("/me",         authMiddleware, handlers.getMyProfileHandler);
profiles.put("/me",         authMiddleware, handlers.updateMyProfileHandler);
profiles.post("/me/avatar", authMiddleware, handlers.uploadAvatarHandler);

// ─── Public profile (auth optional — privacy handled in service) ───────────────
// authMiddleware is NOT applied here so unauthenticated users can view public profiles.
// The handler reads userId from context if present, falls back to null.
profiles.get("/:userId", handlers.getPublicProfileHandler);

export default profiles;