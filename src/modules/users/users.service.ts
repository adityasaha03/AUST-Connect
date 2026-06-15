import { eq, and, count, SQL } from "drizzle-orm";
import { hash, verify }        from "@node-rs/argon2";
import { db }                  from "@/db/client";
import { users, refreshTokens } from "@/db/schema";
import { logger }              from "@/lib/logger";
import {
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/errors";
import type { UpdateMeInput, AssignRoleInput, ListUsersQuery, SafeUser } from "./users.schema";
import type { Role } from "@/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Columns safe to return — never include passwordHash
const safeColumns = {
  id:            users.id,
  email:         users.email,
  emailVerified: users.emailVerified,
  role:          users.role,
  departmentId:  users.departmentId,
  isActive:      users.isActive,
  lastLoginAt:   users.lastLoginAt,
  createdAt:     users.createdAt,
  updatedAt:     users.updatedAt,
} as const;

// ─── Get own user record ──────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<SafeUser> {
  const [user] = await db
    .select(safeColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError("User");
  return user as SafeUser;
}

// ─── Update own email / password ─────────────────────────────────────────────

export async function updateMe(userId: string, input: UpdateMeInput): Promise<SafeUser> {
  // 1. Fetch current user (need passwordHash for verification)
  const [current] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) throw new NotFoundError("User");

  // 2. Verify current password before any sensitive change
  const validPassword = await verify(current.passwordHash, input.currentPassword);
  if (!validPassword) throw new UnauthorizedError("Current password is incorrect");

  // 3. Build update payload
  const updates: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.email && input.email !== current.email) {
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (conflict) throw new ConflictError("Email already in use");

    updates.email         = input.email;
    updates.emailVerified = false; // re-verify on email change
  }

  if (input.newPassword) {
    updates.passwordHash = await hash(input.newPassword);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning(safeColumns);

  if (!updated) throw new NotFoundError("User");

  logger.info({ userId }, "User updated own credentials");
  return updated as SafeUser;
}

// ─── Admin: get any user by ID ────────────────────────────────────────────────

export async function getUserById(id: string): Promise<SafeUser> {
  const [user] = await db
    .select(safeColumns)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) throw new NotFoundError("User");
  return user as SafeUser;
}

// ─── Admin: list users with filters + pagination ──────────────────────────────

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, role, departmentId, isActive } = query;
  const offset = (page - 1) * limit;

  // Build dynamic where conditions
  const conditions: SQL[] = [];
  if (role)         conditions.push(eq(users.role, role));
  if (departmentId) conditions.push(eq(users.departmentId, departmentId));
  if (isActive !== undefined) conditions.push(eq(users.isActive, isActive));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, [totals]] = await Promise.all([
    db.select(safeColumns).from(users).where(where).limit(limit).offset(offset),
    db.select({ total: count() }).from(users).where(where),
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

// ─── Super Admin: assign role ─────────────────────────────────────────────────

export async function assignRole(
  targetId:    string,
  input:       AssignRoleInput,
  requesterId: string,
  requesterRole: Role,
): Promise<SafeUser> {
  // Prevent self-demotion
  if (targetId === requesterId) {
    throw new ForbiddenError("Cannot change your own role");
  }

  const [target] = await db
    .select(safeColumns)
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target) throw new NotFoundError("User");

  const [updated] = await db
    .update(users)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(users.id, targetId))
    .returning(safeColumns);

  if (!updated) throw new NotFoundError("User");

  logger.info({ requesterId, targetId, newRole: input.role }, "Role assigned");
  return updated as SafeUser;
}

// ─── Admin: deactivate user ───────────────────────────────────────────────────

export async function deactivateUser(targetId: string, requesterId: string): Promise<void> {
  if (targetId === requesterId) {
    throw new ForbiddenError("Cannot deactivate your own account");
  }

  const [target] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target) throw new NotFoundError("User");
  if (!target.isActive) throw new ConflictError("User is already inactive");

  // Deactivate + revoke all refresh tokens in one transaction
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, targetId));

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, targetId),
        ),
      );
  });

  logger.info({ requesterId, targetId }, "User deactivated and sessions revoked");
}