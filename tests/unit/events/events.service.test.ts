import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@/db/client", () => ({
  db: {
    select:      mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(async () => []) })) })) })),
    insert:      mock(() => ({ values: mock(() => ({ onConflictDoNothing: mock(() => ({ returning: mock(async () => []) })) })) })),
    update:      mock(() => ({ set: mock(() => ({ where: mock(async () => []) })) })),
    transaction: mock(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}));

import * as EventsService from "@/modules/events/events.service";
import { db }             from "@/db/client";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "@/lib/errors";

// ─── Shared mock data ─────────────────────────────────────────────────────────

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const dayAfter  = new Date(Date.now() + 48 * 60 * 60 * 1000);

const mockEvent = {
  id:              "event-uuid-1",
  title:           "CSE Seminar",
  description:     null,
  type:            "event"   as const,
  visibility:      "public"  as const,
  status:          "published" as const,
  creatorId:       "user-uuid-1",
  departmentId:    null,
  startsAt:        tomorrow,
  endsAt:          dayAfter,
  isAllDay:        false,
  timezone:        "Asia/Dhaka",
  recurrenceRule:  null,
  locationName:    null,
  locationUrl:     null,
  maxParticipants: null,
  currentCount:    0,
  gcalEventId:     null,
  gcalCalendarId:  null,
  gcalSyncToken:   null,
  gcalSyncedAt:    null,
  tags:            [],
  createdAt:       new Date(),
  updatedAt:       new Date(),
  deletedAt:       null,
};

const mockParticipant = {
  id:           "part-uuid-1",
  eventId:      "event-uuid-1",
  userId:       "user-uuid-2",
  status:       "registered" as const,
  registeredAt: new Date(),
  attendedAt:   null,
};

// ─── createEvent() ────────────────────────────────────────────────────────────

describe("EventsService.createEvent()", () => {
  beforeEach(() => {
    (db.insert as ReturnType<typeof mock>).mockImplementation(() => ({
      values: () => ({ returning: async () => [mockEvent] }),
    }));
  });

  it("returns created event on success", async () => {
    const result = await EventsService.createEvent(
      {
        title:      "CSE Seminar",
        type:       "event",
        visibility: "public",
        startsAt:   tomorrow,
        timezone:   "Asia/Dhaka",
        tags:       [],
      },
      "user-uuid-1",
    );

    expect(result.title).toBe("CSE Seminar");
    expect(result.creatorId).toBe("user-uuid-1");
  });

  it("throws when insert fails", async () => {
    (db.insert as ReturnType<typeof mock>).mockImplementation(() => ({
      values: () => ({ returning: async () => [] }),
    }));

    await expect(
      EventsService.createEvent(
        { title: "X", type: "event", startsAt: tomorrow, timezone: "Asia/Dhaka", tags: [] },
        "user-uuid-1",
      ),
    ).rejects.toThrow();
  });
});

// ─── getEvent() ───────────────────────────────────────────────────────────────

describe("EventsService.getEvent()", () => {
  it("returns public event for unauthenticated requester", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockEvent] }) }),
    }));

    const result = await EventsService.getEvent("event-uuid-1", null, null);
    expect(result.id).toBe("event-uuid-1");
  });

  it("returns private event for the creator", async () => {
    const privateEvent = { ...mockEvent, visibility: "private" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [privateEvent] }) }),
    }));

    const result = await EventsService.getEvent("event-uuid-1", "user-uuid-1", "student");
    expect(result.id).toBe("event-uuid-1");
  });

  it("returns private event for admin", async () => {
    const privateEvent = { ...mockEvent, visibility: "private" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [privateEvent] }) }),
    }));

    const result = await EventsService.getEvent("event-uuid-1", "admin-uuid", "admin");
    expect(result.id).toBe("event-uuid-1");
  });

  it("throws ForbiddenError for private event when unauthenticated", async () => {
    const privateEvent = { ...mockEvent, visibility: "private" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [privateEvent] }) }),
    }));

    await expect(
      EventsService.getEvent("event-uuid-1", null, null),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for private event for non-creator student", async () => {
    const privateEvent = { ...mockEvent, visibility: "private" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [privateEvent] }) }),
    }));

    await expect(
      EventsService.getEvent("event-uuid-1", "other-uuid", "student"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError for soft-deleted event", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.getEvent("deleted-uuid", null, null),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for non-existent event", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.getEvent("ghost-uuid", "user-uuid-1", "student"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── updateEvent() ────────────────────────────────────────────────────────────

describe("EventsService.updateEvent()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockEvent] }) }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ ...mockEvent, title: "Updated Title" }],
        }),
      }),
    }));
  });

  it("allows creator to update their event", async () => {
    const result = await EventsService.updateEvent(
      "event-uuid-1",
      { title: "Updated Title" },
      "user-uuid-1",   // creator
      "student",
    );
    expect(result?.title).toBe("Updated Title");
  });

  it("allows admin to update any event", async () => {
    const result = await EventsService.updateEvent(
      "event-uuid-1",
      { title: "Admin Updated" },
      "admin-uuid",
      "admin",
    );
    expect(result).toBeDefined();
  });

  it("throws ForbiddenError when non-creator student tries to update", async () => {
    await expect(
      EventsService.updateEvent(
        "event-uuid-1",
        { title: "Hacked" },
        "other-uuid",
        "student",
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when faculty tries to update another's event", async () => {
    await expect(
      EventsService.updateEvent(
        "event-uuid-1",
        { title: "Hacked" },
        "other-faculty-uuid",
        "faculty",
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError for non-existent event", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.updateEvent("ghost-uuid", { title: "X" }, "user-uuid-1", "student"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── deleteEvent() ────────────────────────────────────────────────────────────

describe("EventsService.deleteEvent()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockEvent] }) }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({ where: async () => [] }),
    }));
  });

  it("allows creator to soft-delete their event", async () => {
    await expect(
      EventsService.deleteEvent("event-uuid-1", "user-uuid-1", "student"),
    ).resolves.toBeUndefined();
  });

  it("allows admin to soft-delete any event", async () => {
    await expect(
      EventsService.deleteEvent("event-uuid-1", "admin-uuid", "admin"),
    ).resolves.toBeUndefined();
  });

  it("throws ForbiddenError when non-creator tries to delete", async () => {
    await expect(
      EventsService.deleteEvent("event-uuid-1", "other-uuid", "student"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError for already-deleted event", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.deleteEvent("ghost-uuid", "user-uuid-1", "student"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── rsvpEvent() ─────────────────────────────────────────────────────────────

describe("EventsService.rsvpEvent()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockEvent] }) }),
    }));

    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({
                returning: async () => [mockParticipant],
              }),
            }),
          }),
          update: () => ({ set: () => ({ where: async () => [] }) }),
        }),
    );
  });

  it("registers user for published public event", async () => {
    const result = await EventsService.rsvpEvent("event-uuid-1", "user-uuid-2");
    expect(result.status).toBe("registered");
  });

  it("waitlists user when event is at capacity", async () => {
    const fullEvent = { ...mockEvent, maxParticipants: 1, currentCount: 1 };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [fullEvent] }) }),
    }));

    (db.insert as ReturnType<typeof mock>).mockImplementation(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ ...mockParticipant, status: "waitlisted" }],
        }),
      }),
    }));

    const result = await EventsService.rsvpEvent("event-uuid-1", "user-uuid-2");
    expect(result.status).toBe("waitlisted");
  });

  it("throws ForbiddenError when RSVPing to a task", async () => {
    const taskEvent = { ...mockEvent, type: "task" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [taskEvent] }) }),
    }));

    await expect(
      EventsService.rsvpEvent("event-uuid-1", "user-uuid-2"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when event is not published", async () => {
    const draftEvent = { ...mockEvent, status: "draft" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [draftEvent] }) }),
    }));

    await expect(
      EventsService.rsvpEvent("event-uuid-1", "user-uuid-2"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when event is private", async () => {
    const privateEvent = { ...mockEvent, visibility: "private" as const };
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [privateEvent] }) }),
    }));

    await expect(
      EventsService.rsvpEvent("event-uuid-1", "user-uuid-2"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ConflictError when user already registered", async () => {
    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({
                returning: async () => [], // empty = conflict
              }),
            }),
          }),
          update: () => ({ set: () => ({ where: async () => [] }) }),
        }),
    );

    await expect(
      EventsService.rsvpEvent("event-uuid-1", "user-uuid-2"),
    ).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError for non-existent event", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.rsvpEvent("ghost-uuid", "user-uuid-2"),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── cancelRsvp() ────────────────────────────────────────────────────────────

describe("EventsService.cancelRsvp()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockParticipant] }) }),
    }));

    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          update: () => ({ set: () => ({ where: async () => [] }) }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [{ currentCount: 1 }],
              }),
            }),
          }),
        }),
    );
  });

  it("resolves without error for registered participant", async () => {
    await expect(
      EventsService.cancelRsvp("event-uuid-1", "user-uuid-2"),
    ).resolves.toBeUndefined();
  });

  it("throws ConflictError when registration already cancelled", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockParticipant, status: "cancelled" }],
        }),
      }),
    }));

    await expect(
      EventsService.cancelRsvp("event-uuid-1", "user-uuid-2"),
    ).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError when RSVP does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      EventsService.cancelRsvp("event-uuid-1", "ghost-uuid"),
    ).rejects.toThrow(NotFoundError);
  });
});