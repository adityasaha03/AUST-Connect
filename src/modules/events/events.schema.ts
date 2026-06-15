// Events module – Zod request/response schemas
import { z }                  from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { events, eventParticipants } from "@/db/schema";

// ─── Base from Drizzle ────────────────────────────────────────────────────────

const baseInsert = createInsertSchema(events);
const baseSelect = createSelectSchema(events);

// ─── Shared field validators ──────────────────────────────────────────────────

const rruleString = z
  .string()
  .regex(/^RRULE:/, "Must be a valid RRULE string (RFC 5545)")
  .optional()
  .nullable();

const futureDate = z.coerce
  .date()
  .refine((d) => d > new Date(), { message: "Date must be in the future" });

// ─── Create Event / Task ──────────────────────────────────────────────────────

export const CreateEventSchema = baseInsert
  .omit({
    id:           true,
    creatorId:    true,  // injected from auth context
    currentCount: true,
    gcalEventId:  true,
    gcalCalendarId: true,
    gcalSyncToken:  true,
    gcalSyncedAt:   true,
    createdAt:    true,
    updatedAt:    true,
    deletedAt:    true,
  })
  .extend({
    title:          z.string().min(1).max(255),
    startsAt:       futureDate,
    endsAt:         z.coerce.date().optional().nullable(),
    recurrenceRule: rruleString,
    tags:           z.array(z.string().max(50)).max(10).default([]),
    maxParticipants: z.number().int().positive().optional().nullable(),
  })
  .refine(
    (data) => !data.endsAt || data.endsAt > data.startsAt,
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

// ─── Update Event ─────────────────────────────────────────────────────────────

export const UpdateEventSchema = CreateEventSchema
  .partial()
  .omit({ startsAt: true })   // startsAt becomes optional on update
  .extend({
    startsAt: z.coerce.date().optional(),
    status:   z.enum(["draft", "published", "cancelled", "completed"]).optional(),
  })
  .refine(
    (data) => !data.endsAt || !data.startsAt || data.endsAt > data.startsAt,
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );

export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

// ─── List / filter events ─────────────────────────────────────────────────────

export const ListEventsQuerySchema = z.object({
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  type:         z.enum(["event", "task"]).optional(),
  status:       z.enum(["draft", "published", "cancelled", "completed"]).optional(),
  departmentId: z.string().uuid().optional(),
  tag:          z.string().max(50).optional(),
  from:         z.coerce.date().optional(),   // startsAt >= from
  to:           z.coerce.date().optional(),   // startsAt <= to
  search:       z.string().max(100).optional(),
});

export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

// ─── RSVP ─────────────────────────────────────────────────────────────────────

export const ParticipantStatusSchema = createSelectSchema(eventParticipants).pick({
  status: true,
});

// ─── Event response shape ─────────────────────────────────────────────────────

export const EventSchema = baseSelect;
export type Event = z.infer<typeof EventSchema>;