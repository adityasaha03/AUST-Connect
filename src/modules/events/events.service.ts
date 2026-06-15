// Events module – business logic / service layer
import { eq, and, or, gte, lte, isNull, count, ilike, arrayContains, SQL } from "drizzle-orm";
import { db }                  from "@/db/client";
import { events, eventParticipants, users } from "@/db/schema";
import { logger }              from "@/lib/logger";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "@/lib/errors";
import type {
  CreateEventInput,
  UpdateEventInput,
  ListEventsQuery,
} from "./events.schema";
import type { Role } from "@/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Soft-delete guard reused across queries
const notDeleted = isNull(events.deletedAt);

function assertEventAccess(
  event:     typeof events.$inferSelect,
  userId:    string,
  userRole:  Role,
  action:    "read" | "write",
) {
  const isCreator = event.creatorId === userId;
  const isAdmin   = userRole === "admin" || userRole === "super_admin";

  if (action === "read") {
    // Private events: only creator, admin+, or authenticated participants
    if (event.visibility === "private" && !isCreator && !isAdmin) {
      throw new ForbiddenError("This event is private");
    }
  }

  if (action === "write") {
    if (!isCreator && !isAdmin) {
      throw new ForbiddenError("You do not have permission to modify this event");
    }
  }
}

// ─── Create event / task ──────────────────────────────────────────────────────

export async function createEvent(
  input:    CreateEventInput,
  creatorId: string,
) {
  const [event] = await db
    .insert(events)
    .values({ ...input, creatorId })
    .returning();

  if (!event) throw new Error("Event insert failed");

  logger.info({ eventId: event.id, creatorId, type: event.type }, "Event created");
  return event;
}

// ─── Get single event ─────────────────────────────────────────────────────────

export async function getEvent(
  eventId:  string,
  userId:   string | null,
  userRole: Role | null,
) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), notDeleted))
    .limit(1);

  if (!event) throw new NotFoundError("Event");

  if (event.visibility === "private") {
    if (!userId || !userRole) throw new ForbiddenError("Authentication required");
    assertEventAccess(event, userId, userRole, "read");
  }

  return event;
}

// ─── List public events (paginated + filtered) ────────────────────────────────

export async function listEvents(query: ListEventsQuery) {
  const { page, limit, type, status, departmentId, tag, from, to, search } = query;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [
    notDeleted,
    eq(events.visibility, "public"),
  ];

  if (type)         conditions.push(eq(events.type, type));
  if (status)       conditions.push(eq(events.status, status));
  if (departmentId) conditions.push(eq(events.departmentId, departmentId));
  if (from)         conditions.push(gte(events.startsAt, from));
  if (to)           conditions.push(lte(events.startsAt, to));
  if (tag)          conditions.push(arrayContains(events.tags, [tag]));
  if (search)       conditions.push(ilike(events.title, `%${search}%`));

  const where = and(...conditions);

  const [data, [totals]] = await Promise.all([
    db.select().from(events).where(where).limit(limit).offset(offset)
      .orderBy(events.startsAt),
    db.select({ total: count() }).from(events).where(where),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total:      totals?.total ?? 0,
      totalPages: Math.ceil((totals?.total ?? 0) / limit),
    },
  };
}

// ─── Get own events + tasks ───────────────────────────────────────────────────

export async function getMyEvents(userId: string, query: ListEventsQuery) {
  const { page, limit, type, status } = query;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [
    notDeleted,
    eq(events.creatorId, userId),
  ];

  if (type)   conditions.push(eq(events.type, type));
  if (status) conditions.push(eq(events.status, status));

  const where = and(...conditions);

  const [data, [totals]] = await Promise.all([
    db.select().from(events).where(where).limit(limit).offset(offset)
      .orderBy(events.startsAt),
    db.select({ total: count() }).from(events).where(where),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total:      totals?.total ?? 0,
      totalPages: Math.ceil((totals?.total ?? 0) / limit),
    },
  };
}

// ─── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(
  eventId:  string,
  input:    UpdateEventInput,
  userId:   string,
  userRole: Role,
) {
  const [existing] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), notDeleted))
    .limit(1);

  if (!existing) throw new NotFoundError("Event");
  assertEventAccess(existing, userId, userRole, "write");

  const [updated] = await db
    .update(events)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(events.id, eventId))
    .returning();

  logger.info({ eventId, userId }, "Event updated");
  return updated;
}

// ─── Soft delete event ────────────────────────────────────────────────────────

export async function deleteEvent(
  eventId:  string,
  userId:   string,
  userRole: Role,
) {
  const [existing] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), notDeleted))
    .limit(1);

  if (!existing) throw new NotFoundError("Event");
  assertEventAccess(existing, userId, userRole, "write");

  await db
    .update(events)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(events.id, eventId));

  logger.info({ eventId, userId }, "Event soft-deleted");
}

// ─── RSVP: register for event ─────────────────────────────────────────────────

export async function rsvpEvent(eventId: string, userId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), notDeleted))
    .limit(1);

  if (!event)                          throw new NotFoundError("Event");
  if (event.type !== "event")          throw new ForbiddenError("Cannot RSVP to a task");
  if (event.status !== "published")    throw new ForbiddenError("Event is not open for registration");
  if (event.visibility === "private")  throw new ForbiddenError("Event is private");

  // Check capacity
  if (event.maxParticipants !== null && event.currentCount >= event.maxParticipants) {
    // Register as waitlisted instead of rejecting
    const [participant] = await db
      .insert(eventParticipants)
      .values({ eventId, userId, status: "waitlisted" })
      .onConflictDoNothing()
      .returning();

    if (!participant) throw new ConflictError("Already registered for this event");
    return participant;
  }

  // Register + increment count atomically
  const result = await db.transaction(async (tx) => {
    const [participant] = await tx
      .insert(eventParticipants)
      .values({ eventId, userId, status: "registered" })
      .onConflictDoNothing()
      .returning();

    if (!participant) throw new ConflictError("Already registered for this event");

    await tx
      .update(events)
      .set({ currentCount: event.currentCount + 1 })
      .where(eq(events.id, eventId));

    return participant;
  });

  logger.info({ eventId, userId }, "User RSVP'd to event");
  return result;
}

// ─── RSVP: cancel registration ────────────────────────────────────────────────

export async function cancelRsvp(eventId: string, userId: string) {
  const [participant] = await db
    .select()
    .from(eventParticipants)
    .where(
      and(
        eq(eventParticipants.eventId, eventId),
        eq(eventParticipants.userId,  userId),
      ),
    )
    .limit(1);

  if (!participant) throw new NotFoundError("RSVP");
  if (participant.status === "cancelled") {
    throw new ConflictError("Registration already cancelled");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventParticipants)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          eq(eventParticipants.userId,  userId),
        ),
      );

    // Only decrement if they were registered (not waitlisted)
    if (participant.status === "registered") {
      const [event] = await tx
        .select({ currentCount: events.currentCount })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);

      if (event && event.currentCount > 0) {
        await tx
          .update(events)
          .set({ currentCount: event.currentCount - 1 })
          .where(eq(events.id, eventId));
      }
    }
  });

  logger.info({ eventId, userId }, "User cancelled RSVP");
}