// Events module – Hono route definitions  
import { Hono }              from "hono";
import { authMiddleware }    from "@/middleware/auth.middleware";
import { requireMinRole }    from "@/middleware/rbac.middleware";
import * as handlers         from "./events.handlers";

const eventsRouter = new Hono();

// ─── Public ───────────────────────────────────────────────────────────────────
eventsRouter.get("/",    handlers.listEventsHandler);

// ─── Authenticated: own events + tasks ────────────────────────────────────────
// NOTE: /mine must be registered BEFORE /:id to avoid being swallowed by the param route
eventsRouter.get("/mine", authMiddleware, handlers.getMyEventsHandler);

// ─── Public with optional auth (privacy handled in service) ───────────────────
eventsRouter.get("/:id", handlers.getEventHandler);

// ─── Faculty+ : create events ─────────────────────────────────────────────────
eventsRouter.post(
  "/",
  authMiddleware,
  requireMinRole("faculty"),
  handlers.createEventHandler,
);

// ─── Creator / Admin: mutate events ───────────────────────────────────────────
eventsRouter.patch("/:id",  authMiddleware, handlers.updateEventHandler);
eventsRouter.delete("/:id", authMiddleware, handlers.deleteEventHandler);

// ─── Authenticated: RSVP ──────────────────────────────────────────────────────
eventsRouter.post("/:id/rsvp",   authMiddleware, handlers.rsvpEventHandler);
eventsRouter.delete("/:id/rsvp", authMiddleware, handlers.cancelRsvpHandler);

export default eventsRouter;