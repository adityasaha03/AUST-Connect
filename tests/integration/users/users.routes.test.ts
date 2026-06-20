import {
  describe, it, expect,
  beforeAll, beforeEach,
} from "bun:test";
import { runMigrations, clearDatabase, testDb } from "../../setup/db";
import { createTestUser }  from "../../setup/fixtures";
import { req }             from "../../setup/app";
import { eq }              from "drizzle-orm";
import { users }           from "@/db/schema";


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
  email?: string;
  role?:  "student" | "faculty" | "admin" | "super_admin";
} = {}) {
  const { user, plainPassword } = await createTestUser(opts);
  const token = await loginAs(user.email, plainPassword);
  return { user, token };
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => { await runMigrations(); });
beforeEach(async () => { await clearDatabase(); });

// ─── GET /api/v1/users/me ─────────────────────────────────────────────────────

describe("GET /api/v1/users/me", () => {
  const endpoint = "/api/v1/users/me";

  it("200 — returns own user record without passwordHash", async () => {
    const { user, token } = await registerAndLogin({ email: "me@aust.edu" });

    const res  = await req(endpoint, { token });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.email).toBe(user.email);
    expect(body.data).not.toHaveProperty("passwordHash");
    expect(body.data).not.toHaveProperty("password_hash");
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint);
    expect(res.status).toBe(401);
  });

  it("401 — rejects malformed Bearer token", async () => {
    const res = await req(endpoint, { token: "not.a.real.jwt" });
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/v1/users/me ───────────────────────────────────────────────────

describe("PATCH /api/v1/users/me", () => {
  const endpoint = "/api/v1/users/me";

  it("200 — updates email successfully", async () => {
    const { token } = await registerAndLogin({ email: "old@aust.edu" });

    const res  = await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({
        email:           "new@aust.edu",
        currentPassword: "TestPassword123!",
      }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.email).toBe("new@aust.edu");
  });

  it("200 — emailVerified resets to false after email change", async () => {
    const { user, token } = await registerAndLogin({ email: "verify@aust.edu" });

    // Manually set emailVerified = true first
    await testDb
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));

    await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({
        email:           "newemail@aust.edu",
        currentPassword: "TestPassword123!",
      }),
    });

    const [updated] = await testDb
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, user.id));

    expect(updated?.emailVerified).toBe(false);
  });

  it("200 — updates password successfully", async () => {
    const { user, token } = await registerAndLogin({ email: "passchange@aust.edu" });

    const res = await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({
        currentPassword: "TestPassword123!",
        newPassword:     "BrandNewPass456!",
      }),
    });
    expect(res.status).toBe(200);

    // Verify new password works for login
    const loginRes = await req("/api/v1/auth/login", {
      method: "POST",
      body:   JSON.stringify({ email: user.email, password: "BrandNewPass456!" }),
    });
    expect(loginRes.status).toBe(200);
  });

  it("401 — rejects wrong currentPassword", async () => {
    const { token } = await registerAndLogin({ email: "wrongpass@aust.edu" });

    const res = await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({
        email:           "new@aust.edu",
        currentPassword: "WrongPassword!",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("409 — rejects email already taken by another user", async () => {
    await createTestUser({ email: "taken@aust.edu" });
    const { token } = await registerAndLogin({ email: "changer@aust.edu" });

    const res = await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({
        email:           "taken@aust.edu",
        currentPassword: "TestPassword123!",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("400 — rejects update with no email or newPassword", async () => {
    const { token } = await registerAndLogin();

    const res = await req(endpoint, {
      method: "PATCH",
      token,
      body:   JSON.stringify({ currentPassword: "TestPassword123!" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 — rejects unauthenticated request", async () => {
    const res = await req(endpoint, { method: "PATCH", body: JSON.stringify({}) });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/users/:id  (admin only) ─────────────────────────────────────

describe("GET /api/v1/users/:id", () => {
  it("200 — admin can fetch any user by ID", async () => {
    const { user: target }  = await createTestUser({ email: "target@aust.edu" });
    const { token: adminTk } = await registerAndLogin({ email: "admin@aust.edu", role: "admin" });

    const res  = await req(`/api/v1/users/${target.id}`, { token: adminTk });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(target.id);
    expect(body.data).not.toHaveProperty("passwordHash");
  });

  it("403 — student cannot fetch another user by ID", async () => {
    const { user: target }     = await createTestUser({ email: "target2@aust.edu" });
    const { token: studentTk } = await registerAndLogin({ email: "student@aust.edu", role: "student" });

    const res = await req(`/api/v1/users/${target.id}`, { token: studentTk });
    expect(res.status).toBe(403);
  });

  it("403 — faculty cannot fetch another user by ID", async () => {
    const { user: target }     = await createTestUser({ email: "target3@aust.edu" });
    const { token: facultyTk } = await registerAndLogin({ email: "faculty@aust.edu", role: "faculty" });

    const res = await req(`/api/v1/users/${target.id}`, { token: facultyTk });
    expect(res.status).toBe(403);
  });

  it("404 — admin gets 404 for non-existent user", async () => {
    const { token: adminTk } = await registerAndLogin({ email: "admin2@aust.edu", role: "admin" });

    const res = await req(
      "/api/v1/users/00000000-0000-0000-0000-000000000000",
      { token: adminTk },
    );
    expect(res.status).toBe(404);
  });

  it("401 — unauthenticated request is rejected", async () => {
    const res = await req("/api/v1/users/some-id");
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/v1/users/:id/role  (super_admin only) ────────────────────────

describe("PATCH /api/v1/users/:id/role", () => {
  it("200 — super_admin can assign role", async () => {
    const { user: target }       = await createTestUser({ email: "promote@aust.edu" });
    const { token: superAdminTk } = await registerAndLogin({
      email: "superadmin@aust.edu",
      role:  "super_admin",
    });

    const res  = await req(`/api/v1/users/${target.id}/role`, {
      method: "PATCH",
      token:  superAdminTk,
      body:   JSON.stringify({ role: "faculty" }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data.role).toBe("faculty");
  });

  it("403 — admin cannot assign roles", async () => {
    const { user: target }   = await createTestUser({ email: "promote2@aust.edu" });
    const { token: adminTk } = await registerAndLogin({ email: "admin3@aust.edu", role: "admin" });

    const res = await req(`/api/v1/users/${target.id}/role`, {
      method: "PATCH",
      token:  adminTk,
      body:   JSON.stringify({ role: "faculty" }),
    });
    expect(res.status).toBe(403);
  });

  it("403 — super_admin cannot change their own role", async () => {
    const { user, token } = await registerAndLogin({
      email: "selfchange@aust.edu",
      role:  "super_admin",
    });

    const res = await req(`/api/v1/users/${user.id}/role`, {
      method: "PATCH",
      token,
      body:   JSON.stringify({ role: "student" }),
    });
    expect(res.status).toBe(403);
  });

  it("400 — rejects invalid role value", async () => {
    const { user: target }        = await createTestUser({ email: "promote3@aust.edu" });
    const { token: superAdminTk } = await registerAndLogin({
      email: "superadmin2@aust.edu",
      role:  "super_admin",
    });

    const res = await req(`/api/v1/users/${target.id}/role`, {
      method: "PATCH",
      token:  superAdminTk,
      body:   JSON.stringify({ role: "overlord" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/v1/users/:id  (admin only) ──────────────────────────────────

describe("DELETE /api/v1/users/:id", () => {
  it("204 — admin can deactivate a user", async () => {
    const { user: target }   = await createTestUser({ email: "deactivate@aust.edu" });
    const { token: adminTk } = await registerAndLogin({ email: "admin4@aust.edu", role: "admin" });

    const res = await req(`/api/v1/users/${target.id}`, {
      method: "DELETE",
      token:  adminTk,
    });
    expect(res.status).toBe(204);
  });

  it("deactivated user cannot log in", async () => {
    const { user: target, plainPassword } = await createTestUser({ email: "nologin@aust.edu" });
    const { token: adminTk }              = await registerAndLogin({
      email: "admin5@aust.edu",
      role:  "admin",
    });

    await req(`/api/v1/users/${target.id}`, { method: "DELETE", token: adminTk });

    const loginRes = await req("/api/v1/auth/login", {
      method: "POST",
      body:   JSON.stringify({ email: target.email, password: plainPassword }),
    });
    expect(loginRes.status).toBe(401);
  });

  it("409 — cannot deactivate already inactive user", async () => {
    const { user: target }   = await createTestUser({ email: "alreadyoff@aust.edu", isActive: false });
    const { token: adminTk } = await registerAndLogin({ email: "admin6@aust.edu", role: "admin" });

    const res = await req(`/api/v1/users/${target.id}`, {
      method: "DELETE",
      token:  adminTk,
    });
    expect(res.status).toBe(409);
  });

  it("403 — student cannot deactivate a user", async () => {
    const { user: target }     = await createTestUser({ email: "target4@aust.edu" });
    const { token: studentTk } = await registerAndLogin({ email: "student2@aust.edu" });

    const res = await req(`/api/v1/users/${target.id}`, {
      method: "DELETE",
      token:  studentTk,
    });
    expect(res.status).toBe(403);
  });

  it("403 — admin cannot deactivate their own account", async () => {
    const { user, token } = await registerAndLogin({ email: "selfdeact@aust.edu", role: "admin" });

    const res = await req(`/api/v1/users/${user.id}`, { method: "DELETE", token });
    expect(res.status).toBe(403);
  });

  it("404 — returns 404 for non-existent user", async () => {
    const { token: adminTk } = await registerAndLogin({ email: "admin7@aust.edu", role: "admin" });

    const res = await req(
      "/api/v1/users/00000000-0000-0000-0000-000000000000",
      { method: "DELETE", token: adminTk },
    );
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/v1/users/  (admin: list users) ──────────────────────────────────

describe("GET /api/v1/users/", () => {
  it("200 — admin gets paginated user list", async () => {
    const { token: adminTk } = await registerAndLogin({ email: "admin8@aust.edu", role: "admin" });
    await createTestUser({ email: "s1@aust.edu" });
    await createTestUser({ email: "s2@aust.edu" });

    const res  = await req("/api/v1/users/?page=1&limit=10", { token: adminTk });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.meta.pagination).toHaveProperty("total");
    expect(body.meta.pagination).toHaveProperty("totalPages");
  });

  it("200 — filters by role correctly", async () => {
    const { token: adminTk } = await registerAndLogin({ email: "admin9@aust.edu", role: "admin" });
    await createTestUser({ email: "fac@aust.edu", role: "faculty" });

    const res  = await req("/api/v1/users/?role=faculty", { token: adminTk });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    body.data.forEach((u: { role: string }) => expect(u.role).toBe("faculty"));
  });

  it("403 — student cannot list users", async () => {
    const { token } = await registerAndLogin({ email: "student3@aust.edu" });
    const res = await req("/api/v1/users/", { token });
    expect(res.status).toBe(403);
  });

  it("400 — rejects invalid limit param", async () => {
    const { token: adminTk } = await registerAndLogin({ email: "admin10@aust.edu", role: "admin" });
    const res = await req("/api/v1/users/?limit=999", { token: adminTk });
    expect(res.status).toBe(400);
  });
});