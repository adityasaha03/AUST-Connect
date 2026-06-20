import {
  describe, it, expect,
  beforeAll, afterAll, beforeEach,
} from "bun:test";
import { runMigrations, clearDatabase, testDb } from "../../setup/db";
import { createTestUser, createTestRefreshToken } from "../../setup/fixtures";
import { req } from "../../setup/app";
import { eq }  from "drizzle-orm";
import { refreshTokens } from "@/db/schema";

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await clearDatabase();
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

describe("POST /api/v1/auth/register", () => {
  const endpoint = "/api/v1/auth/register";
  const validBody = {
    email:       "new@aust.edu",
    password:    "SecurePass123!",
    displayName: "Jane Doe",
  };

  it("201 — creates user and returns token pair", async () => {
    const res  = await req(endpoint, { method: "POST", body: JSON.stringify(validBody) });
    const body = await res.json() as any;

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("accessToken");
    expect(body.data).toHaveProperty("refreshToken");
    expect(body.data.user.email).toBe(validBody.email);
    expect(body.data.user.role).toBe("student");
  });

  it("201 — never exposes passwordHash in response", async () => {
    const res  = await req(endpoint, { method: "POST", body: JSON.stringify(validBody) });
    const text = await res.text();
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("password_hash");
  });

  it("409 — rejects duplicate email", async () => {
    await req(endpoint, { method: "POST", body: JSON.stringify(validBody) });
    const res  = await req(endpoint, { method: "POST", body: JSON.stringify(validBody) });
    const body = await res.json() as any;

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("400 — rejects invalid email format", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ ...validBody, email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("VALIDATION_ERROR");
  });

  it("400 — rejects password under 8 chars", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ ...validBody, password: "Short1!" }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects password over 128 chars", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ ...validBody, password: "A1!".repeat(50) }),
    });
    expect(res.status).toBe(400);
  });

  it("400 — rejects missing displayName", async () => {
    const { displayName: _, ...noName } = validBody;
    const res = await req(endpoint, { method: "POST", body: JSON.stringify(noName) });
    expect(res.status).toBe(400);
  });

  it("400 — rejects empty body", async () => {
    const res = await req(endpoint, { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

describe("POST /api/v1/auth/login", () => {
  const endpoint = "/api/v1/auth/login";

  it("200 — returns token pair for valid credentials", async () => {
    const { user, plainPassword } = await createTestUser({ email: "login@aust.edu" });

    const res  = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ email: user.email, password: plainPassword }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("accessToken");
    expect(body.data).toHaveProperty("refreshToken");
  });

  it("401 — rejects wrong password", async () => {
    const { user } = await createTestUser({ email: "wp@aust.edu" });

    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ email: user.email, password: "WrongPassword!" }),
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error.code).toBe("UNAUTHORIZED");
  });

  it("401 — rejects non-existent email (same message as wrong password)", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ email: "ghost@aust.edu", password: "AnyPass123!" }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(401);
    expect(body.error.message).toBe("Invalid email or password");
  });

  it("401 — rejects inactive user", async () => {
    const { user, plainPassword } = await createTestUser({
      email:    "inactive@aust.edu",
      isActive: false,
    });

    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ email: user.email, password: plainPassword }),
    });

    expect(res.status).toBe(401);
  });

  it("400 — rejects missing password field", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ email: "x@aust.edu" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/auth/refresh ────────────────────────────────────────────────

describe("POST /api/v1/auth/refresh", () => {
  const endpoint = "/api/v1/auth/refresh";

  it("200 — returns new token pair for valid refresh token", async () => {
    const { user } = await createTestUser();
    const { rawToken } = await createTestRefreshToken(user.id);

    const res  = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawToken }),
    });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("accessToken");
    expect(body.data).toHaveProperty("refreshToken");
    // New token must differ from old
    expect(body.data.refreshToken).not.toBe(rawToken);
  });

  it("200 — old refresh token is revoked after rotation", async () => {
    const { user }    = await createTestUser();
    const { rawToken, token } = await createTestRefreshToken(user.id);

    await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawToken }),
    });

    const [stored] = await testDb
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, token.id));

    expect(stored?.revokedAt).not.toBeNull();
  });

  it("401 — rejects unknown refresh token", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: "completely-fake-token" }),
    });
    expect(res.status).toBe(401);
  });

  it("401 — rejects already-revoked token", async () => {
    const { user } = await createTestUser();
    const { rawToken } = await createTestRefreshToken(user.id, { revoked: true });

    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawToken }),
    });
    expect(res.status).toBe(401);
  });

  it("401 — rejects expired token", async () => {
    const { user } = await createTestUser();
    const { rawToken } = await createTestRefreshToken(user.id, { expiresInMs: -1000 });

    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawToken }),
    });
    expect(res.status).toBe(401);
  });

  it("401 — cannot reuse a rotated token (replay attack)", async () => {
    const { user }    = await createTestUser();
    const { rawToken } = await createTestRefreshToken(user.id);

    // First use — valid
    await req(endpoint, { method: "POST", body: JSON.stringify({ refreshToken: rawToken }) });

    // Second use — must fail
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawToken }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

describe("POST /api/v1/auth/logout", () => {
  const endpoint = "/api/v1/auth/logout";

  async function getAccessToken(): Promise<{ accessToken: string; rawRefreshToken: string }> {
    const { user, plainPassword } = await createTestUser();
    const res  = await req("/api/v1/auth/login", {
      method: "POST",
      body:   JSON.stringify({ email: user.email, password: plainPassword }),
    });
    const body = await res.json() as any;
    return { accessToken: body.data.accessToken, rawRefreshToken: body.data.refreshToken };
  }

  it("204 — revokes the refresh token", async () => {
    const { accessToken, rawRefreshToken } = await getAccessToken();

    const res = await req(endpoint, {
      method: "POST",
      token:  accessToken,
      body:   JSON.stringify({ refreshToken: rawRefreshToken }),
    });

    expect(res.status).toBe(204);
  });

  it("204 — subsequent logout with same token still returns 204 (no info leak)", async () => {
    const { accessToken, rawRefreshToken } = await getAccessToken();

    await req(endpoint, {
      method: "POST",
      token:  accessToken,
      body:   JSON.stringify({ refreshToken: rawRefreshToken }),
    });

    // Second logout — must not 4xx
    const res = await req(endpoint, {
      method: "POST",
      token:  accessToken,
      body:   JSON.stringify({ refreshToken: rawRefreshToken }),
    });

    expect(res.status).toBe(204);
  });

  it("401 — requires Authorization header", async () => {
    const res = await req(endpoint, {
      method: "POST",
      body:   JSON.stringify({ refreshToken: "any" }),
    });
    expect(res.status).toBe(401);
  });

  it("revoked token cannot be used to refresh after logout", async () => {
    const { accessToken, rawRefreshToken } = await getAccessToken();

    await req(endpoint, {
      method: "POST",
      token:  accessToken,
      body:   JSON.stringify({ refreshToken: rawRefreshToken }),
    });

    const refreshRes = await req("/api/v1/auth/refresh", {
      method: "POST",
      body:   JSON.stringify({ refreshToken: rawRefreshToken }),
    });

    expect(refreshRes.status).toBe(401);
  });
});