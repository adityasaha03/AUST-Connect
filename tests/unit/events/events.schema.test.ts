import { describe, it, expect, beforeAll } from "bun:test";
import { CreateEventSchema, UpdateEventSchema, ListEventsQuerySchema } from "@/modules/events/events.schema";

// ─── Shared valid base ────────────────────────────────────────────────────────

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dayAfter  = new Date(Date.now() + 48 * 60 * 60 * 1000);

const validEvent = {
  title:      "CSE Seminar",
  type:       "event" as const,
  visibility: "public" as const,
  status:     "draft" as const,
  startsAt:   tomorrow.toISOString(),
  timezone:   "Asia/Dhaka",
  tags:       [],
};

const validTask = {
  title:    "Assignment submission",
  type:     "task" as const,
  startsAt: tomorrow.toISOString(),
  timezone: "Asia/Dhaka",
  tags:     [],
};

// ─── CreateEventSchema ────────────────────────────────────────────────────────

describe("CreateEventSchema", () => {

  // ─── Valid inputs ───────────────────────────────────────────────────────────

  it("accepts valid public event", () => {
    expect(CreateEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it("accepts valid private task", () => {
    expect(CreateEventSchema.safeParse(validTask).success).toBe(true);
  });

  it("accepts event with valid endsAt after startsAt", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      endsAt: dayAfter.toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts event with maxParticipants set", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      maxParticipants: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null maxParticipants (unlimited)", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      maxParticipants: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid RRULE recurrenceRule", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
    });
    expect(result.success).toBe(true);
  });

  it("accepts tags array up to 10 items", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      tags: ["cse", "seminar", "ai", "ml", "workshop", "2024", "faculty", "research", "lab", "event"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all-day event", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      isAllDay: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts location fields", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      locationName: "AUST Auditorium",
      locationUrl:  "https://maps.google.com/?q=AUST",
    });
    expect(result.success).toBe(true);
  });

  // ─── Title validation ───────────────────────────────────────────────────────

  it("rejects empty title", () => {
    expect(CreateEventSchema.safeParse({ ...validEvent, title: "" }).success).toBe(false);
  });

  it("rejects title over 255 characters", () => {
    expect(
      CreateEventSchema.safeParse({ ...validEvent, title: "A".repeat(256) }).success,
    ).toBe(false);
  });

  it("rejects missing title", () => {
    const { title: _, ...noTitle } = validEvent;
    expect(CreateEventSchema.safeParse(noTitle).success).toBe(false);
  });

  // ─── Date validation ────────────────────────────────────────────────────────

  it("rejects startsAt in the past", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      startsAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects endsAt before startsAt", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      startsAt: dayAfter.toISOString(),
      endsAt:   tomorrow.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects endsAt equal to startsAt", () => {
    const sameTime = tomorrow.toISOString();
    const result   = CreateEventSchema.safeParse({
      ...validEvent,
      startsAt: sameTime,
      endsAt:   sameTime,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing startsAt", () => {
    const { startsAt: _, ...noStart } = validEvent;
    expect(CreateEventSchema.safeParse(noStart).success).toBe(false);
  });

  // ─── Type & visibility ──────────────────────────────────────────────────────

  it("rejects invalid type value", () => {
    expect(
      CreateEventSchema.safeParse({ ...validEvent, type: "meeting" }).success,
    ).toBe(false);
  });

  it("rejects invalid visibility value", () => {
    expect(
      CreateEventSchema.safeParse({ ...validEvent, visibility: "secret" }).success,
    ).toBe(false);
  });

  it("rejects missing type", () => {
    const { type: _, ...noType } = validEvent;
    expect(CreateEventSchema.safeParse(noType).success).toBe(false);
  });

  // ─── Tags ───────────────────────────────────────────────────────────────────

  it("rejects tags array with more than 10 items", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects tag string longer than 50 chars", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      tags: ["A".repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  // ─── maxParticipants ────────────────────────────────────────────────────────

  it("rejects zero maxParticipants", () => {
    expect(
      CreateEventSchema.safeParse({ ...validEvent, maxParticipants: 0 }).success,
    ).toBe(false);
  });

  it("rejects negative maxParticipants", () => {
    expect(
      CreateEventSchema.safeParse({ ...validEvent, maxParticipants: -5 }).success,
    ).toBe(false);
  });

  // ─── recurrenceRule ─────────────────────────────────────────────────────────

  it("rejects recurrenceRule not starting with RRULE:", () => {
    expect(
      CreateEventSchema.safeParse({
        ...validEvent,
        recurrenceRule: "FREQ=WEEKLY",
      }).success,
    ).toBe(false);
  });

  // ─── Injected fields must be absent ─────────────────────────────────────────

  it("strips creatorId if provided (server-injected field)", () => {
    const result = CreateEventSchema.safeParse({
      ...validEvent,
      creatorId: "injected-uuid",
    });
    // Schema omits creatorId so it should succeed but not include it
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("creatorId");
    }
  });
});

// ─── UpdateEventSchema ────────────────────────────────────────────────────────

describe("UpdateEventSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(UpdateEventSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with only title", () => {
    expect(UpdateEventSchema.safeParse({ title: "New Title" }).success).toBe(true);
  });

  it("accepts status update to published", () => {
    expect(
      UpdateEventSchema.safeParse({ status: "published" }).success,
    ).toBe(true);
  });

  it("accepts status update to cancelled", () => {
    expect(
      UpdateEventSchema.safeParse({ status: "cancelled" }).success,
    ).toBe(true);
  });

  it("rejects invalid status value", () => {
    expect(
      UpdateEventSchema.safeParse({ status: "deleted" }).success,
    ).toBe(false);
  });

  it("accepts startsAt without future constraint on update", () => {
    // On update, startsAt does not require future date (editing historical records)
    const result = UpdateEventSchema.safeParse({
      startsAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects endsAt before startsAt on update", () => {
    const result = UpdateEventSchema.safeParse({
      startsAt: dayAfter.toISOString(),
      endsAt:   tomorrow.toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type on update", () => {
    expect(
      UpdateEventSchema.safeParse({ type: "meeting" }).success,
    ).toBe(false);
  });
});

// ─── ListEventsQuerySchema ────────────────────────────────────────────────────

describe("ListEventsQuerySchema", () => {
  it("applies defaults when no params provided", () => {
    const result = ListEventsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string page and limit to numbers", () => {
    const result = ListEventsQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("accepts valid type filter", () => {
    expect(ListEventsQuerySchema.safeParse({ type: "event" }).success).toBe(true);
    expect(ListEventsQuerySchema.safeParse({ type: "task" }).success).toBe(true);
  });

  it("rejects invalid type filter", () => {
    expect(ListEventsQuerySchema.safeParse({ type: "meeting" }).success).toBe(false);
  });

  it("accepts valid status filter", () => {
    expect(ListEventsQuerySchema.safeParse({ status: "published" }).success).toBe(true);
    expect(ListEventsQuerySchema.safeParse({ status: "cancelled" }).success).toBe(true);
  });

  it("rejects invalid status filter", () => {
    expect(ListEventsQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
  });

  it("rejects limit over 100", () => {
    expect(ListEventsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects page of 0", () => {
    expect(ListEventsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("coerces ISO date strings for from and to", () => {
    const result = ListEventsQuerySchema.safeParse({
      from: tomorrow.toISOString(),
      to:   dayAfter.toISOString(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeInstanceOf(Date);
      expect(result.data.to).toBeInstanceOf(Date);
    }
  });

  it("rejects search string over 100 characters", () => {
    expect(
      ListEventsQuerySchema.safeParse({ search: "A".repeat(101) }).success,
    ).toBe(false);
  });

  it("rejects tag string over 50 characters", () => {
    expect(
      ListEventsQuerySchema.safeParse({ tag: "A".repeat(51) }).success,
    ).toBe(false);
  });

  it("accepts valid departmentId UUID", () => {
    const result = ListEventsQuerySchema.safeParse({
      departmentId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid departmentId format", () => {
    expect(
      ListEventsQuerySchema.safeParse({ departmentId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});