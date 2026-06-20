import { hash }          from "@node-rs/argon2";
import { testDb }        from "./db";
import { users, userProfiles, events, refreshTokens } from "@/db/schema";
import { createHash, randomBytes } from "node:crypto";
import type { Role }     from "@/db/schema";

// ─── User factory ─────────────────────────────────────────────────────────────

interface CreateUserOptions {
  email?:    string;
  password?: string;
  role?:     Role;
  isActive?: boolean;
}

export async function createTestUser(opts: CreateUserOptions = {}) {
  const password     = opts.password ?? "TestPassword123!";
  const passwordHash = await hash(password);

  const [user] = await testDb
    .insert(users)
    .values({
      email:        opts.email    ?? `test-${randomBytes(4).toString("hex")}@aust.edu`,
      passwordHash,
      role:         opts.role     ?? "student",
      isActive:     opts.isActive ?? true,
      emailVerified: false,
    })
    .returning();

  if (!user) throw new Error("createTestUser: insert failed");

  // Always create matching profile
  await testDb.insert(userProfiles).values({
    userId:      user.id,
    displayName: `Test User ${user.id.slice(0, 6)}`,
  });

  return { user, plainPassword: password };
}

// ─── Refresh token factory ────────────────────────────────────────────────────

export async function createTestRefreshToken(userId: string, opts: {
  expiresInMs?: number;
  revoked?:     boolean;
} = {}) {
  const rawToken  = randomBytes(48).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 30 * 24 * 60 * 60 * 1000));

  const [token] = await testDb
    .insert(refreshTokens)
    .values({
      userId,
      tokenHash,
      expiresAt,
      revokedAt: opts.revoked ? new Date() : null,
    })
    .returning();

  if (!token) throw new Error("createTestRefreshToken: insert failed");

  return { token, rawToken };
}

// ─── Event factory ────────────────────────────────────────────────────────────

interface CreateEventOptions {
  creatorId:   string;
  type?:       "event" | "task";
  visibility?: "public" | "private";
  status?:     "draft" | "published" | "cancelled" | "completed";
  maxParticipants?: number | null;
}

export async function createTestEvent(opts: CreateEventOptions) {
  const [event] = await testDb
    .insert(events)
    .values({
      title:           "Test Event",
      type:            opts.type       ?? "event",
      visibility:      opts.visibility ?? "public",
      status:          opts.status     ?? "published",
      creatorId:       opts.creatorId,
      startsAt:        new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      timezone:        "Asia/Dhaka",
      maxParticipants: opts.maxParticipants ?? null,
      currentCount:    0,
      tags:            [],
    })
    .returning();

  if (!event) throw new Error("createTestEvent: insert failed");
  return event;
}