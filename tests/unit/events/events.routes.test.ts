import {
  describe, it, expect,
  beforeAll, beforeEach,
} from "bun:test";
import { runMigrations, clearDatabase, testDb } from "../../setup/db";
import { createTestUser, createTestEvent }       from "../../setup/fixtures";
import { req }                                   from "../../setup/app";
import { eq }                                    from "drizzle-orm";
import { events, eventParticipants }             from "@/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const dayAfter  = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

async function loginAs(email: string, password: string): Promise<string> {
  const res  = await req("/api/v1/auth/login", {
    method: "POST",
    body:   JSON.stringify({ email, password }),
  });
  return ((await res.json()) as any).data.accessToken as string;
}

async function registerAndLogin(opts: {
  email?: string;
  role?:  "student" | "faculty" | "admin" | "super_admin";
} = {}) {
  const { user, plainPassword } = await createTestUser(opts);
  const token = await loginAs(user.email, plainPassword);
  return { user, token };
}

const baseEvent = {
  title:      "Test Seminar",
  type:       "event",
  visibility: "public",
  status:     "published",
  startsAt:   tomorrow,
  endsAt:     dayAfter,
  timezone:   "Asia/Dhaka",
  tags:       [],
};

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await clearDatabase(); });

// ─── GET /api/v1/events ───────────────────────────────────────────────────────

describe("GET /api/v1/events", () => {
  it("200 — returns public events without authentication", async () => {
    const { user } = await createTestUser({ email: "creator@aust.edu", role: "faculty" });
    await createTestEvent({ creatorId: user.id, visibility: "public", status: "published" });

    const res  = await req("/api/v1/events");
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.pagination).toHaveProperty("total");
  });

  it("200 — does not include private events in public listing", async () => {
    const { user } = await createTestUser({ email: "creator2@aust.edu", role: "faculty" });
    await createTestEvent({ creatorId: user.id, visibility: "private", status: "published" });

    const res  = await req("/api/v1/events");
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    const hasPrivate = body.data.some((e: { visibility: string }) => e.visibility === "private");
    expect(hasPrivate).toBe(false);
  });

  it("200 — does not include soft-deleted events", async () => {
    const { user } = await createTestUser({ email: "creator3@aust.edu", role: "faculty" });
    const event    = await createTestEvent({ creatorId: user.id, status: "published" });

    // Soft delete
    await testDb
      .update(events)
      .set({ deletedAt: new Date() })
      .where(eq(events.id, event.id));

    const res  = await req("/api/v1/events");
    const body = await res.json() as any;

    const found = body.data.some((e: { id: string }) => e.id === event.id);
    expect(found).toBe(false);
  });

  it("200 — filters by type correctly", async () => {
    const { user } = await createTestUser({ email: "creator4@aust.edu", role: "faculty" });
    await createTestEvent({ creatorId: user.id, type: "event",  status: "published" });
    await createTestEvent({ creatorId: user.id, type: "task",   status: "published" });

    const res  = await req("/api/v1/events?type=event");
    const body = await res.json() as any;

    body.data.forEach((e: { type: string }) => expect(e.type).toBe("event"));
  });

  it("200 — returns paginated results with correct meta", async () => {
    const { user } = await createTestUser({ email: "creator5@aust.edu", role: "faculty" });
    await Promise.all([
      createTestEvent({ creatorId: user.id }),
      createTestEvent({ creatorId: user.id }),
      createTestEvent({ creatorId: user.id }),
    ]);

    const res  = await req("/api/v1/events?page=1&limit=2");
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.meta.pagination.limit).toBe(2);
    expect(body.meta.pagination.total).toBeGreaterThanOrEqual(3);
  });

  it("400 — rejects invalid limit param", async () => {
    const res = await req("/api/v1/events?limit=999");
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/v1/events/:id ───────────────────────────────────────────────────

describe("GET /api/v1/events/:id", () => {
  it("200 — returns public event without auth", async () => {
    const { user } = await createTestUser({ email: "ev1@aust.edu", role: "faculty" });
    const event    = await createTestEvent({ creatorId: user.id });

    const res  = await req(`/api/v1/events/${event.id}`);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(event.id);
  });

  it("403 — returns 403 for private event when unauthenticated", async () => {
    const { user } = await createTestUser({ email: "ev2@aust.edu", role: "faculty" });
    const event    = await createTestEvent({ creatorId: user.id, visibility: "private" });

    const res = await req(`/api/v1/events/${event.id}`);
    expect(res.status).toBe(403);
  });

  it("200 — creator can view their own private event", async () => {
    const { user, token } = await registerAndLogin({ email: "ev3@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id, visibility: "private" });

    const res = await req(`/api/v1/events/${event.id}`, { token });
    expect(res.status).toBe(200);
  });

  it("200 — admin can view private events", async () => {
    const { user: creator } = await createTestUser({ email: "ev4@aust.edu", role: "faculty" });
    const { token: adminTk } = await registerAndLogin({ email: "admin@aust.edu", role: "admin" });
    const event              = await createTestEvent({ creatorId: creator.id, visibility: "private" });

    const res = await req(`/api/v1/events/${event.id}`, { token: adminTk });
    expect(res.status).toBe(200);
  });

  it("404 — returns 404 for non-existent event", async () => {
    const res = await req("/api/v1/events/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/v1/events ─────────────────────────────────────────────────────

describe("POST /api/v1/events", () => {
  const endpoint = "/api/v1/events";

  it("201 — faculty can create an event", async () => {
    const { token } = await registerAndLogin({ email: "fac@aust.edu", role: "faculty" });

    const res  = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify(baseEvent),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(201);
    expect(body.data.title).toBe("Test Seminar");
    expect(body.data).not.toHaveProperty("creatorId", "injected-uuid");
  });

  it("201 — faculty can create a task", async () => {
    const { token } = await registerAndLogin({ email: "fac2@aust.edu", role: "faculty" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({ ...baseEvent, type: "task", visibility: "private" }),
    });
    expect(res.status).toBe(201);
  });

  it("201 — admin can create an event", async () => {
    const { token } = await registerAndLogin({ email: "adm@aust.edu", role: "admin" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify(baseEvent),
    });
    expect(res.status).toBe(201);
  });

  it("403 — student cannot create an event", async () => {
    const { token } = await registerAndLogin({ email: "stu@aust.edu", role: "student" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify(baseEvent),
    });
    expect(res.status).toBe(403);
  });

  it("400 — rejects event with startsAt in the past", async () => {
    const { token } = await registerAndLogin({ email: "fac3@aust.edu", role: "faculty" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({
        ...baseEvent,
        startsAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects endsAt before startsAt", async () => {
    const { token } = await registerAndLogin({ email: "fac4@aust.edu", role: "faculty" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({ ...baseEvent, endsAt: tomorrow, startsAt: dayAfter }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects missing title", async () => {
    const { token } = await registerAndLogin({ email: "fac5@aust.edu", role: "faculty" });
    const { title: _, ...noTitle } = baseEvent;

    const res = await req(endpoint, { method: "POST", token, body: JSON.stringify(noTitle) });
    expect(res.status).toBe(400);
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint, { method: "POST", body: JSON.stringify(baseEvent) });
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/v1/events/:id ─────────────────────────────────────────────────

describe("PATCH /api/v1/events/:id", () => {
  it("200 — creator can update their event", async () => {
    const { user, token } = await registerAndLogin({ email: "upd1@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id });

    const res  = await req(`/api/v1/events/${event.id}`, {
      method: "PATCH",
      token,
      body:   JSON.stringify({ title: "Updated Title" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.title).toBe("Updated Title");
  });

  it("200 — admin can update any event", async () => {
    const { user: creator } = await createTestUser({ email: "upd2@aust.edu", role: "faculty" });
    const { token: adminTk } = await registerAndLogin({ email: "adm2@aust.edu", role: "admin" });
    const event              = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}`, {
      method: "PATCH",
      token:  adminTk,
      body:   JSON.stringify({ title: "Admin Updated" }),
    });
    expect(res.status).toBe(200);
  });

  it("403 — non-creator student cannot update event", async () => {
    const { user: creator } = await createTestUser({ email: "upd3@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu2@aust.edu" });
    const event             = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}`, {
      method: "PATCH",
      token:  stuTk,
      body:   JSON.stringify({ title: "Hacked" }),
    });
    expect(res.status).toBe(403);
  });

  it("400 — rejects invalid status value", async () => {
    const { user, token } = await registerAndLogin({ email: "upd4@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id });

    const res = await req(`/api/v1/events/${event.id}`, {
      method: "PATCH",
      token,
      body:   JSON.stringify({ status: "deleted" }),
    });
    expect(res.status).toBe(400);
  });

  it("404 — returns 404 for non-existent event", async () => {
    const { token } = await registerAndLogin({ email: "upd5@aust.edu", role: "faculty" });

    const res = await req("/api/v1/events/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      token,
      body:   JSON.stringify({ title: "Ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/v1/events/:id ────────────────────────────────────────────────

describe("DELETE /api/v1/events/:id", () => {
  it("204 — creator can soft-delete their event", async () => {
    const { user, token } = await registerAndLogin({ email: "del1@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id });

    const res = await req(`/api/v1/events/${event.id}`, { method: "DELETE", token });
    expect(res.status).toBe(204);
  });

  it("soft delete sets deletedAt not removes row", async () => {
    const { user, token } = await registerAndLogin({ email: "del2@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id });

    await req(`/api/v1/events/${event.id}`, { method: "DELETE", token });

    const [row] = await testDb
      .select({ deletedAt: events.deletedAt })
      .from(events)
      .where(eq(events.id, event.id));

    expect(row?.deletedAt).not.toBeNull();
  });

  it("404 — soft-deleted event not accessible after deletion", async () => {
    const { user, token } = await registerAndLogin({ email: "del3@aust.edu", role: "faculty" });
    const event           = await createTestEvent({ creatorId: user.id });

    await req(`/api/v1/events/${event.id}`, { method: "DELETE", token });
    const res = await req(`/api/v1/events/${event.id}`);
    expect(res.status).toBe(404);
  });

  it("403 — non-creator cannot delete event", async () => {
    const { user: creator } = await createTestUser({ email: "del4@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu3@aust.edu" });
    const event             = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}`, { method: "DELETE", token: stuTk });
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/v1/events/:id/rsvp ────────────────────────────────────────────

describe("POST /api/v1/events/:id/rsvp", () => {
  it("201 — authenticated user can RSVP to published public event", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp1@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu4@aust.edu" });
    const event             = await createTestEvent({
      creatorId:  creator.id,
      status:     "published",
      visibility: "public",
    });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, {
      method: "POST",
      token:  stuTk,
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).data.status).toBe("registered");
  });

  it("201 — waitlisted when event is at capacity", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp2@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu5@aust.edu" });
    const event             = await createTestEvent({
      creatorId:       creator.id,
      status:          "published",
      maxParticipants: 0, // capacity already 0 = immediate waitlist
    });

    // Set currentCount to match maxParticipants
    await testDb
      .update(events)
      .set({ maxParticipants: 1, currentCount: 1 })
      .where(eq(events.id, event.id));

    const res  = await req(`/api/v1/events/${event.id}/rsvp`, {
      method: "POST",
      token:  stuTk,
    });
    const body = await res.json() as any;

    expect(res.status).toBe(201);
    expect(body.data.status).toBe("waitlisted");
  });

  it("409 — cannot RSVP twice to the same event", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp3@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu6@aust.edu" });
    const event             = await createTestEvent({ creatorId: creator.id });

    await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token: stuTk });
    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token: stuTk });
    expect(res.status).toBe(409);
  });

  it("403 — cannot RSVP to a draft event", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp4@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu7@aust.edu" });
    const event             = await createTestEvent({ creatorId: creator.id, status: "draft" });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token: stuTk });
    expect(res.status).toBe(403);
  });

  it("403 — cannot RSVP to a task", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp5@aust.edu", role: "faculty" });
    const { token: stuTk }  = await registerAndLogin({ email: "stu8@aust.edu" });
    const event             = await createTestEvent({ creatorId: creator.id, type: "task" });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token: stuTk });
    expect(res.status).toBe(403);
  });

  it("401 — unauthenticated users cannot RSVP", async () => {
    const { user: creator } = await createTestUser({ email: "rsvp6@aust.edu", role: "faculty" });
    const event             = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/v1/events/:id/rsvp ──────────────────────────────────────────

describe("DELETE /api/v1/events/:id/rsvp", () => {
  it("204 — user can cancel their RSVP", async () => {
    const { user: creator }         = await createTestUser({ email: "crsvp1@aust.edu", role: "faculty" });
    const { user: student, token }  = await registerAndLogin({ email: "stu9@aust.edu" });
    const event                     = await createTestEvent({ creatorId: creator.id });

    await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token });
    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE", token });
    expect(res.status).toBe(204);
  });

  it("currentCount decrements after RSVP cancellation", async () => {
    const { user: creator }        = await createTestUser({ email: "crsvp2@aust.edu", role: "faculty" });
    const { token }                = await registerAndLogin({ email: "stu10@aust.edu" });
    const event                    = await createTestEvent({ creatorId: creator.id });

    await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token });
    await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE", token });

    const [row] = await testDb
      .select({ currentCount: events.currentCount })
      .from(events)
      .where(eq(events.id, event.id));

    expect(row?.currentCount).toBe(0);
  });

  it("409 — cannot cancel an already-cancelled RSVP", async () => {
    const { user: creator }        = await createTestUser({ email: "crsvp3@aust.edu", role: "faculty" });
    const { token }                = await registerAndLogin({ email: "stu11@aust.edu" });
    const event                    = await createTestEvent({ creatorId: creator.id });

    await req(`/api/v1/events/${event.id}/rsvp`, { method: "POST", token });
    await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE", token });
    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE", token });
    expect(res.status).toBe(409);
  });

  it("404 — cannot cancel RSVP that does not exist", async () => {
    const { user: creator }  = await createTestUser({ email: "crsvp4@aust.edu", role: "faculty" });
    const { token }          = await registerAndLogin({ email: "stu12@aust.edu" });
    const event              = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE", token });
    expect(res.status).toBe(404);
  });

  it("401 — unauthenticated users cannot cancel RSVP", async () => {
    const { user: creator } = await createTestUser({ email: "crsvp5@aust.edu", role: "faculty" });
    const event             = await createTestEvent({ creatorId: creator.id });

    const res = await req(`/api/v1/events/${event.id}/rsvp`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/events/mine ──────────────────────────────────────────────────

describe("GET /api/v1/events/mine", () => {
  it("200 — returns only own events and tasks", async () => {
    const { user: u1, token: t1 } = await registerAndLogin({ email: "mine1@aust.edu", role: "faculty" });
    const { user: u2 }            = await createTestUser({ email: "mine2@aust.edu", role: "faculty" });

    await createTestEvent({ creatorId: u1.id });
    await createTestEvent({ creatorId: u2.id }); // other user's event

    const res  = await req("/api/v1/events/mine", { token: t1 });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    body.data.forEach((e: { creatorId: string }) =>
      expect(e.creatorId).toBe(u1.id),
    );
  });

  it("200 — includes private events in own listing", async () => {
    const { user, token } = await registerAndLogin({ email: "mine3@aust.edu", role: "faculty" });
    await createTestEvent({ creatorId: user.id, visibility: "private" });

    const res  = await req("/api/v1/events/mine", { token });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    const hasPrivate = body.data.some((e: { visibility: string }) => e.visibility === "private");
    expect(hasPrivate).toBe(true);
  });

  it("200 — includes tasks in own listing", async () => {
    const { user, token } = await registerAndLogin({ email: "mine4@aust.edu", role: "faculty" });
    await createTestEvent({ creatorId: user.id, type: "task" });

    const res  = await req("/api/v1/events/mine?type=task", { token });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    body.data.forEach((e: { type: string }) => expect(e.type).toBe("task"));
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req("/api/v1/events/mine");
    expect(res.status).toBe(401);
  });
});