import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";

// ─── Mock heavy dependencies before importing the service ─────────────────────

mock.module("@/db/client", () => ({
  db: {
    select:      mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(() => []) })) })) })),
    insert:      mock(() => ({ values: mock(() => ({ returning: mock(() => []) })) })),
    update:      mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(() => []) })) })) })),
    transaction: mock(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}));

mock.module("@node-rs/argon2", () => ({
  hash:   mock(async () => "$argon2id$mocked_hash"),
  verify: mock(async () => true),
}));

mock.module("jose", () => ({
  SignJWT: mock(() => ({
    setProtectedHeader: mock(() => ({
      setSubject: mock(() => ({
        setIssuedAt: mock(() => ({
          setExpirationTime: mock(() => ({
            sign: mock(async () => "mocked.access.token"),
          })),
        })),
      })),
    })),
  })),
  importPKCS8: mock(async () => "mocked-private-key"),
  importSPKI:  mock(async () => "mocked-public-key"),
  jwtVerify:   mock(async () => ({ payload: { sub: "user-id", role: "student" } })),
}));

// ─── Now import the service (mocks are in place) ──────────────────────────────

import * as AuthService from "@/modules/auth/auth.service";
import { db }           from "@/db/client";
import { hash, verify } from "@node-rs/argon2";
import { ConflictError, UnauthorizedError } from "@/lib/errors";

// ─── register() ───────────────────────────────────────────────────────────────

describe("AuthService.register()", () => {
  const validInput = {
    email:       "new@aust.edu",
    password:    "SecurePass123!",
    displayName: "New User",
  };

  beforeEach(() => {
    // Default: email not taken
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    // Default: insert succeeds
    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          insert: () => ({
            values: () => ({
              returning: async () => [{
                id: "uuid-1", email: validInput.email, role: "student",
                emailVerified: false, createdAt: new Date(),
              }],
            }),
          }),
        }),
    );

    (db.insert as ReturnType<typeof mock>).mockImplementation(() => ({
      values: () => ({ returning: async () => [] }),
    }));
  });

  it("returns accessToken, refreshToken and safe user on success", async () => {
    const result = await AuthService.register(validInput);

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.user).toHaveProperty("email", validInput.email);
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("hashes the password with Argon2id before storing", async () => {
    await AuthService.register(validInput);
    expect(hash).toHaveBeenCalledWith(validInput.password);
  });

  it("throws ConflictError when email already exists", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: "existing-id" }] }) }),
    }));

    await expect(AuthService.register(validInput)).rejects.toThrow(ConflictError);
  });

  it("never returns passwordHash in the user object", async () => {
    const result = await AuthService.register(validInput);
    expect(Object.keys(result.user)).not.toContain("passwordHash");
    expect(Object.keys(result.user)).not.toContain("password_hash");
  });
});

// ─── login() ─────────────────────────────────────────────────────────────────

describe("AuthService.login()", () => {
  const validInput = { email: "user@aust.edu", password: "SecurePass123!" };
  const mockUser   = {
    id: "uuid-1", email: "user@aust.edu", role: "student",
    passwordHash: "$argon2id$hash", isActive: true,
    emailVerified: false, createdAt: new Date(), updatedAt: new Date(),
    departmentId: null, lastLoginAt: null,
  };

  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockUser] }) }),
    }));
    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({ where: async () => [] }),
    }));
    (db.insert as ReturnType<typeof mock>).mockImplementation(() => ({
      values: () => ({ returning: async () => [] }),
    }));
    (verify as ReturnType<typeof mock>).mockImplementation(async () => true);
  });

  it("returns token pair and safe user on valid credentials", async () => {
    const result = await AuthService.login(validInput, {});
    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.user.email).toBe(validInput.email);
  });

  it("throws UnauthorizedError when user is not found", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(AuthService.login(validInput, {})).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when user is inactive", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [{ ...mockUser, isActive: false }] }) }),
    }));

    await expect(AuthService.login(validInput, {})).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when password is wrong", async () => {
    (verify as ReturnType<typeof mock>).mockImplementation(async () => false);
    await expect(AuthService.login(validInput, {})).rejects.toThrow(UnauthorizedError);
  });

  it("returns the same error message for not-found and wrong password (prevents enumeration)", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));
    let notFoundMsg = "";
    try { await AuthService.login(validInput, {}); }
    catch (e) { notFoundMsg = (e as Error).message; }

    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockUser] }) }),
    }));
    (verify as ReturnType<typeof mock>).mockImplementation(async () => false);
    let wrongPassMsg = "";
    try { await AuthService.login(validInput, {}); }
    catch (e) { wrongPassMsg = (e as Error).message; }

    expect(notFoundMsg).toBe(wrongPassMsg);
  });
});

// ─── refreshTokenPair() ───────────────────────────────────────────────────────

describe("AuthService.refreshTokenPair()", () => {
  const mockStoredToken = {
    id:        "token-uuid",
    userId:    "user-uuid",
    tokenHash: "hashed",
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
    userAgent: null,
    ipAddress: null,
  };

  const mockUser = {
    id: "user-uuid", email: "u@aust.edu", role: "student",
    isActive: true, passwordHash: "", emailVerified: false,
    createdAt: new Date(), updatedAt: new Date(),
    departmentId: null, lastLoginAt: null,
  };

  beforeEach(() => {
    let callCount = 0;
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callCount++;
            // First select → refresh token, second → user
            return callCount === 1 ? [mockStoredToken] : [mockUser];
          },
        }),
      }),
    }));

    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn({
        update: () => ({ set: () => ({ where: async () => [] }) }),
        insert: () => ({ values: () => ({ returning: async () => [] }) }),
      }),
    );
  });

  it("returns a new token pair on valid refresh token", async () => {
    const result = await AuthService.refreshTokenPair("valid-raw-token");
    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
  });

  it("throws UnauthorizedError for unknown token", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(AuthService.refreshTokenPair("bad-token")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for revoked token", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockStoredToken, revokedAt: new Date() }],
        }),
      }),
    }));

    await expect(AuthService.refreshTokenPair("revoked-token")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError for expired token", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockStoredToken, expiresAt: new Date(Date.now() - 1000) }],
        }),
      }),
    }));

    await expect(AuthService.refreshTokenPair("expired-token")).rejects.toThrow(UnauthorizedError);
  });
});

// ─── logout() ────────────────────────────────────────────────────────────────

describe("AuthService.logout()", () => {
  it("resolves without error when token is valid", async () => {
    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "token-id" }],
        }),
      }),
    }));

    await expect(AuthService.logout("valid-raw-token")).resolves.toBeUndefined();
  });

  it("resolves silently when token is already revoked (no error leak)", async () => {
    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [],  // no rows updated
        }),
      }),
    }));

    // Must not throw — prevents token existence enumeration
    await expect(AuthService.logout("unknown-token")).resolves.toBeUndefined();
  });
});