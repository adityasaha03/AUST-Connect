import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@/db/client", () => ({
  db: {
    select:      mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(async () => []) })) })) })),
    insert:      mock(() => ({ values: mock(() => ({ returning: mock(async () => []) })) })),
    update:      mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(async () => []) })) })) })),
    transaction: mock(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}));

mock.module("@node-rs/argon2", () => ({
  hash:   mock(async () => "$argon2id$new_hash"),
  verify: mock(async () => true),
}));

import * as UsersService from "@/modules/users/users.service";
import { db }            from "@/db/client";
import { verify }        from "@node-rs/argon2";
import {
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/errors";

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockUser = {
  id:            "user-uuid-1",
  email:         "user@aust.edu",
  emailVerified: false,
  passwordHash:  "$argon2id$hash",
  role:          "student" as const,
  departmentId:  null,
  isActive:      true,
  lastLoginAt:   null,
  createdAt:     new Date(),
  updatedAt:     new Date(),
};

const safeUser = (({ passwordHash: _, ...rest }) => rest)(mockUser);

// ─── getMe() ──────────────────────────────────────────────────────────────────

describe("UsersService.getMe()", () => {
  it("returns safe user when found", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [safeUser] }) }),
    }));

    const result = await UsersService.getMe("user-uuid-1");
    expect(result.email).toBe(mockUser.email);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("throws NotFoundError when user does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(UsersService.getMe("ghost-uuid")).rejects.toThrow(NotFoundError);
  });
});

// ─── updateMe() ───────────────────────────────────────────────────────────────

describe("UsersService.updateMe()", () => {
  const input = { email: "new@aust.edu", currentPassword: "OldPass123!" };

  beforeEach(() => {
    // First select → full user with hash, second select → conflict check
    let callCount = 0;
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callCount++;
            if (callCount === 1) return [mockUser];
            return []; // no email conflict
          },
        }),
      }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [safeUser],
        }),
      }),
    }));

    (verify as ReturnType<typeof mock>).mockImplementation(async () => true);
    callCount = 0;
  });

  it("returns updated safe user on success", async () => {
    const result = await UsersService.updateMe("user-uuid-1", input);
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("throws UnauthorizedError when currentPassword is wrong", async () => {
    (verify as ReturnType<typeof mock>).mockImplementation(async () => false);
    await expect(UsersService.updateMe("user-uuid-1", input)).rejects.toThrow(UnauthorizedError);
  });

  it("throws ConflictError when new email is taken", async () => {
    let callCount = 0;
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callCount++;
            // First call: current user, Second call: email conflict found
            return callCount === 1 ? [mockUser] : [{ id: "other-uuid" }];
          },
        }),
      }),
    }));

    await expect(UsersService.updateMe("user-uuid-1", input)).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError when user does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(UsersService.updateMe("ghost-uuid", input)).rejects.toThrow(NotFoundError);
  });

  it("sets emailVerified to false when email is changed", async () => {
    let capturedSet: Record<string, unknown> = {};

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: (data: Record<string, unknown>) => {
        capturedSet = data;
        return { where: () => ({ returning: async () => [safeUser] }) };
      },
    }));

    await UsersService.updateMe("user-uuid-1", input);
    expect(capturedSet.emailVerified).toBe(false);
  });
});

// ─── assignRole() ─────────────────────────────────────────────────────────────

describe("UsersService.assignRole()", () => {
  const adminUser = { ...mockUser, id: "admin-uuid", role: "super_admin" as const };

  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [safeUser] }) }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ ...safeUser, role: "faculty" }],
        }),
      }),
    }));
  });

  it("assigns new role to target user", async () => {
    const result = await UsersService.assignRole(
      "user-uuid-1",
      { role: "faculty" },
      adminUser.id,
      adminUser.role,
    );
    expect(result.role).toBe("faculty");
  });

  it("throws ForbiddenError when trying to change own role", async () => {
    await expect(
      UsersService.assignRole("admin-uuid", { role: "student" }, "admin-uuid", "super_admin"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError when target user does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      UsersService.assignRole("ghost-uuid", { role: "faculty" }, adminUser.id, adminUser.role),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── deactivateUser() ─────────────────────────────────────────────────────────

describe("UsersService.deactivateUser()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "user-uuid-1", isActive: true }],
        }),
      }),
    }));

    (db.transaction as ReturnType<typeof mock>).mockImplementation(
      async (fn: (tx: unknown) => unknown) =>
        fn({
          update: () => ({ set: () => ({ where: async () => [] }) }),
        }),
    );
  });

  it("resolves without error on valid deactivation", async () => {
    await expect(
      UsersService.deactivateUser("user-uuid-1", "admin-uuid"),
    ).resolves.toBeUndefined();
  });

  it("throws ForbiddenError when deactivating own account", async () => {
    await expect(
      UsersService.deactivateUser("admin-uuid", "admin-uuid"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError when target user does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      UsersService.deactivateUser("ghost-uuid", "admin-uuid"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when user is already inactive", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "user-uuid-1", isActive: false }],
        }),
      }),
    }));

    await expect(
      UsersService.deactivateUser("user-uuid-1", "admin-uuid"),
    ).rejects.toThrow(ConflictError);
  });
});

// ─── listUsers() ──────────────────────────────────────────────────────────────

describe("UsersService.listUsers()", () => {
  beforeEach(() => {
    let callCount = 0;
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            offset: async () => {
              callCount++;
              return callCount === 1 ? [safeUser] : [];
            },
          }),
          // for count query
          returning: async () => [{ total: 1 }],
        }),
      }),
    }));
  });

  it("returns paginated data with correct shape", async () => {
    const result = await UsersService.listUsers({ page: 1, limit: 20 });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("pagination");
    expect(result.pagination).toHaveProperty("page", 1);
    expect(result.pagination).toHaveProperty("limit", 20);
    expect(result.pagination).toHaveProperty("total");
    expect(result.pagination).toHaveProperty("totalPages");
  });
});