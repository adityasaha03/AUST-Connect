import { eq, and, gt, isNull } from "drizzle-orm";
import { hash, verify }        from "@node-rs/argon2";
import { SignJWT, importPKCS8, importSPKI } from "jose";
import { createHash, randomBytes }          from "node:crypto";
import { db }                  from "@/db/client";
import { users, refreshTokens, userProfiles } from "@/db/schema";
import { env }                 from "@/env";
import { logger }              from "@/lib/logger";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "@/lib/errors";
import type { RegisterInput, LoginInput, SafeUser } from "./auth.schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

async function generateAccessToken(userId: string, role: string): Promise<string> {
  const privateKey = await importPKCS8(
    env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    "RS256",
  );

  return new SignJWT({ role })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TOKEN_EXPIRY)
    .sign(privateKey);
}

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  return {
    id:            user.id,
    email:         user.email,
    role:          user.role,
    emailVerified: user.emailVerified,
    createdAt:     user.createdAt,
  };
}

// ─── TTL helper: parse "30d", "15m" → ms ─────────────────────────────────────

function parseTTLtoMs(ttl: string): number {
  const unit  = ttl.slice(-1);
  const value = parseInt(ttl.slice(0, -1), 10);
  const map: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (map[unit] ?? 86_400_000);
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function register(input: RegisterInput) {
  // 1. Check email uniqueness
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) throw new ConflictError("Email already registered");

  // 2. Hash password
  const passwordHash = await hash(input.password);

  // 3. Insert user + profile in a transaction
  const result = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash, role: "student" })
      .returning();

    if (!newUser) throw new Error("User insert failed");

    await tx.insert(userProfiles).values({
      userId:      newUser.id,
      displayName: input.displayName,
    });

    return newUser;
  });

  // 4. Issue tokens
  const accessToken     = await generateAccessToken(result.id, result.role);
  const rawRefresh      = generateRefreshToken();
  const refreshTokenTTL = parseTTLtoMs(env.JWT_REFRESH_TOKEN_EXPIRY);

  await db.insert(refreshTokens).values({
    userId:    result.id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: new Date(Date.now() + refreshTokenTTL),
  });

  logger.info({ userId: result.id }, "User registered");

  return { accessToken, refreshToken: rawRefresh, user: toSafeUser(result) };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function login(input: LoginInput, meta: { userAgent?: string | undefined; ip?: string | undefined }) {
  // 1. Fetch user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user || !user.isActive) {
    // Same error for not-found and inactive — prevents email enumeration
    throw new UnauthorizedError("Invalid email or password");
  }

  // 2. Verify password
  const valid = await verify(user.passwordHash, input.password);
  if (!valid) {
    logger.warn({ email: input.email }, "Failed login attempt");
    throw new UnauthorizedError("Invalid email or password");
  }

  // 3. Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // 4. Issue tokens
  const accessToken     = await generateAccessToken(user.id, user.role);
  const rawRefresh      = generateRefreshToken();
  const refreshTokenTTL = parseTTLtoMs(env.JWT_REFRESH_TOKEN_EXPIRY);

  await db.insert(refreshTokens).values({
    userId:    user.id,
    tokenHash: hashToken(rawRefresh),
    expiresAt: new Date(Date.now() + refreshTokenTTL),
    userAgent: meta.userAgent,
    ipAddress: meta.ip ?? null,
  });

  logger.info({ userId: user.id }, "User logged in");

  return { accessToken, refreshToken: rawRefresh, user: toSafeUser(user) };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function refreshTokenPair(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  // 1. Lookup token
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!stored) throw new UnauthorizedError("Invalid or expired refresh token");

  // 2. Fetch associated user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  if (!user || !user.isActive) throw new UnauthorizedError("User not found or inactive");

  // 3. Rotate: revoke old, issue new pair
  const rawNewRefresh   = generateRefreshToken();
  const refreshTokenTTL = parseTTLtoMs(env.JWT_REFRESH_TOKEN_EXPIRY);

  await db.transaction(async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    await tx.insert(refreshTokens).values({
      userId:    user.id,
      tokenHash: hashToken(rawNewRefresh),
      expiresAt: new Date(Date.now() + refreshTokenTTL),
    });
  });

  const accessToken = await generateAccessToken(user.id, user.role);

  logger.info({ userId: user.id }, "Token pair rotated");

  return { accessToken, refreshToken: rawNewRefresh };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function logout(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
      ),
    )
    .returning({ id: refreshTokens.id });

  if (result.length === 0) {
    // Token already revoked or never existed — still a 204, don't leak info
    logger.warn("Logout attempted with unknown/already-revoked token");
  }
}