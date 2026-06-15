// Events module – route handler functions
import type { Context }       from "hono";
import * as EventsService      from "./events.service";
import {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
} from "./events.schema";
import { successResponse, paginatedResponse } from "@/lib/response";
import { ValidationError }    from "@/lib/errors";
import type { AuthVariables } from "@/middleware/auth.middleware";
import type { Role }          from "@/db/schema";

type AuthCtx = Context<{ Variables: AuthVariables }>;

// ─── Public ───────────────────────────────────────────────────────────────────

export async function listEventsHandler(c: Context) {
  const parsed = ListEventsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const { data, pagination } = await EventsService.listEvents(parsed.data);
  return paginatedResponse(c, data, pagination);
}

export async function getEventHandler(c: Context) {
  // Auth is optional on this route — handler reads from context if present
  const userId   = (c.get as (k: string) => string | undefined)("userId") ?? null;
  const userRole = (c.get as (k: string) => Role | undefined)("userRole") ?? null;

  const event = await EventsService.getEvent(c.req.param("id")!, userId, userRole);
  return successResponse(c, event);
}

// ─── Authenticated ────────────────────────────────────────────────────────────

export async function createEventHandler(c: AuthCtx) {
  const body   = await c.req.json();
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const event = await EventsService.createEvent(parsed.data, c.get("userId"));
  return successResponse(c, event, 201);
}

export async function updateEventHandler(c: AuthCtx) {
  const body   = await c.req.json();
  const parsed = UpdateEventSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const event = await EventsService.updateEvent(
    c.req.param("id")!,
    parsed.data,
    c.get("userId"),
    c.get("userRole"),
  );
  return successResponse(c, event);
}

export async function deleteEventHandler(c: AuthCtx) {
  await EventsService.deleteEvent(
    c.req.param("id")!,
    c.get("userId"),
    c.get("userRole"),
  );
  return c.body(null, 204);
}

export async function getMyEventsHandler(c: AuthCtx) {
  const parsed = ListEventsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const { data, pagination } = await EventsService.getMyEvents(
    c.get("userId"),
    parsed.data,
  );
  return paginatedResponse(c, data, pagination);
}

export async function rsvpEventHandler(c: AuthCtx) {
  const participant = await EventsService.rsvpEvent(
    c.req.param("id")!,
    c.get("userId"),
  );
  return successResponse(c, participant, 201);
}

export async function cancelRsvpHandler(c: AuthCtx) {
  await EventsService.cancelRsvp(c.req.param("id")!, c.get("userId"));
  return c.body(null, 204);
}