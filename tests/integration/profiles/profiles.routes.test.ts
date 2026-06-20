import {
  describe, it, expect,
  beforeAll, beforeEach,
} from "bun:test";
import { runMigrations, clearDatabase, testDb } from "../../setup/db";
import { createTestUser }  from "../../setup/fixtures";
import { req }             from "../../setup/app";
import { eq }              from "drizzle-orm";
import { userProfiles }    from "@/db/schema";
import { any }             from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(email: string, password: string): Promise<string> {
  const res  = await req("/api/v1/auth/login", {
    method: "POST",
    body:   JSON.stringify({ email, password }),
  });
  const body = await res.json() as any;
  return body.data.accessToken as string;
}

async function registerAndLogin(opts: {
  email?:    string;
  role?:     "student" | "faculty" | "admin" | "super_admin";
  password?: string;
} = {}) {
  const { user, plainPassword } = await createTestUser(opts);
  const token = await loginAs(user.email, plainPassword);
  return { user, token };
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await clearDatabase(); });

// ─── GET /api/v1/profiles/me ──────────────────────────────────────────────────

describe("GET /api/v1/profiles/me", () => {
  const endpoint = "/api/v1/profiles/me";

  it("200 — returns own full profile", async () => {
    const { user, token } = await registerAndLogin({ email: "me@aust.edu" });

    const res  = await req(endpoint, { token });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.userId).toBe(user.id);
    expect(body.data).toHaveProperty("displayName");
    expect(body.data).toHaveProperty("notificationPrefs");
    expect(body.data).toHaveProperty("uiPreferences");
  });

  it("200 — includes private fields not exposed in public view", async () => {
    const { token } = await registerAndLogin({ email: "private@aust.edu" });

    const res  = await req(endpoint, { token });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    // Own profile shows all fields
    expect(body.data).toHaveProperty("showEmail");
    expect(body.data).toHaveProperty("showPhone");
    expect(body.data).toHaveProperty("notificationPrefs");
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /api/v1/profiles/me ──────────────────────────────────────────────────

describe("PUT /api/v1/profiles/me", () => {
  const endpoint = "/api/v1/profiles/me";

  it("200 — updates displayName", async () => {
    const { token } = await registerAndLogin({ email: "update@aust.edu" });

    const res  = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ displayName: "Updated Name" }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.displayName).toBe("Updated Name");
  });

  it("200 — updates bio and social links", async () => {
    const { token } = await registerAndLogin({ email: "social@aust.edu" });

    const res  = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({
        bio:       "Senior CSE student",
        githubUrl: "https://github.com/testuser",
      }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.bio).toBe("Senior CSE student");
    expect(body.data.githubUrl).toBe("https://github.com/testuser");
  });

  it("200 — updates notificationPrefs with valid structure", async () => {
    const { token } = await registerAndLogin({ email: "notifpref@aust.edu" });

    const notificationPrefs = {
      email: { eventReminders: true, newAnnouncements: false },
      push:  { rsvpUpdates: true },
    };

    const res  = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ notificationPrefs }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.notificationPrefs).toMatchObject(notificationPrefs);
  });

  it("200 — can set profile to private", async () => {
    const { user, token } = await registerAndLogin({ email: "gopriv@aust.edu" });

    await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ isProfilePublic: false }),
    });

    const [profile] = await testDb
      .select({ isProfilePublic: userProfiles.isProfilePublic })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id));

    expect(profile?.isProfilePublic).toBe(false);
  });

  it("400 — rejects invalid URL for githubUrl", async () => {
    const { token } = await registerAndLogin({ email: "badurl@aust.edu" });

    const res = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ githubUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects batchYear before 2000", async () => {
    const { token } = await registerAndLogin({ email: "oldyear@aust.edu" });

    const res = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ batchYear: 1990 }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects semester above 12", async () => {
    const { token } = await registerAndLogin({ email: "badsem@aust.edu" });

    const res = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({ semester: 15 }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects non-boolean in notificationPrefs", async () => {
    const { token } = await registerAndLogin({ email: "badpref@aust.edu" });

    const res = await req(endpoint, {
      method: "PUT",
      token,
      body:   JSON.stringify({
        notificationPrefs: { email: { eventReminders: "yes" } },
      }),
    });
    expect(res.status).toBe(400);
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint, {
      method: "PUT",
      body:   JSON.stringify({ displayName: "Hacker" }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/profiles/:userId ────────────────────────────────────────────

describe("GET /api/v1/profiles/:userId", () => {
  it("200 — returns public profile for unauthenticated requester", async () => {
    const { user } = await createTestUser({ email: "public@aust.edu" });

    const res  = await req(`/api/v1/profiles/${user.id}`);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("displayName");
  });

  it("200 — does not expose private fields in public profile", async () => {
    const { user } = await createTestUser({ email: "noleak@aust.edu" });

    const res  = await req(`/api/v1/profiles/${user.id}`);
    const body = await res.json() as any    ;

    expect(res.status).toBe(200);
    expect(body.data).not.toHaveProperty("notificationPrefs");
    expect(body.data).not.toHaveProperty("uiPreferences");
    expect(body.data).not.toHaveProperty("showEmail");
    expect(body.data).not.toHaveProperty("showPhone");
  });

  it("403 — returns 403 for private profile when unauthenticated", async () => {
    const { user, token } = await registerAndLogin({ email: "priv@aust.edu" });

    // Set profile to private
    await req("/api/v1/profiles/me", {
      method: "PUT",
      token,
      body:   JSON.stringify({ isProfilePublic: false }),
    });

    const res = await req(`/api/v1/profiles/${user.id}`);
    expect(res.status).toBe(403);
  });

  it("403 — returns 403 for private profile when authenticated as another user", async () => {
    const { user: owner, token: ownerToken } = await registerAndLogin({
      email: "privowner@aust.edu",
    });
    const { token: otherToken } = await registerAndLogin({ email: "other@aust.edu" });

    await req("/api/v1/profiles/me", {
      method: "PUT",
      token:  ownerToken,
      body:   JSON.stringify({ isProfilePublic: false }),
    });

    const res = await req(`/api/v1/profiles/${owner.id}`, { token: otherToken });
    expect(res.status).toBe(403);
  });

  it("200 — owner can always view their own private profile", async () => {
    const { user, token } = await registerAndLogin({ email: "selfview@aust.edu" });

    await req("/api/v1/profiles/me", {
      method: "PUT",
      token,
      body:   JSON.stringify({ isProfilePublic: false }),
    });

    const res = await req(`/api/v1/profiles/${user.id}`, { token });
    expect(res.status).toBe(200);
  });

  it("404 — returns 404 for non-existent user profile", async () => {
    const res = await req("/api/v1/profiles/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/v1/profiles/me/avatar ─────────────────────────────────────────

describe("POST /api/v1/profiles/me/avatar", () => {
  const endpoint = "/api/v1/profiles/me/avatar";

  it("200 — updates avatar URL", async () => {
    const { token } = await registerAndLogin({ email: "avatar@aust.edu" });

    const res  = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({ avatarUrl: "https://cdn.aust.edu/avatars/test.jpg" }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.avatarUrl).toBe("https://cdn.aust.edu/avatars/test.jpg");
  });

  it("400 — rejects non-URL avatarUrl", async () => {
    const { token } = await registerAndLogin({ email: "badavatar@aust.edu" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({ avatarUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects missing avatarUrl", async () => {
    const { token } = await registerAndLogin({ email: "noavatar@aust.edu" });

    const res = await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ avatarUrl: "https://cdn.aust.edu/avatar.jpg" }),
    });
    expect(res.status).toBe(401);
  });

  it("200 — persists avatarUrl to database", async () => {
    const { user, token } = await registerAndLogin({ email: "persistavatar@aust.edu" });
    const newUrl          = "https://cdn.aust.edu/avatars/persisted.jpg";

    await req(endpoint, {
      method: "POST",
      token,
      body:   JSON.stringify({ avatarUrl: newUrl }),
    });

    const [profile] = await testDb
      .select({ avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id));

    expect(profile?.avatarUrl).toBe(newUrl);
  });
});