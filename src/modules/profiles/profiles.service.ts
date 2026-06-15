// Profiles module – business logic / service layer
import { eq }              from "drizzle-orm";
import { db }              from "@/db/client";
import { userProfiles, users } from "@/db/schema";
import { logger }          from "@/lib/logger";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import type { UpdateProfileInput, PublicProfile } from "./profiles.schema";

// ─── Get own profile ──────────────────────────────────────────────────────────

export async function getMyProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError("Profile");
  return profile;
}

// ─── Update own profile ───────────────────────────────────────────────────────

export async function updateMyProfile(userId: string, input: UpdateProfileInput) {
  const [existing] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!existing) throw new NotFoundError("Profile");

  const [updated] = await db
    .update(userProfiles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId))
    .returning();

  if (!updated) throw new NotFoundError("Profile");

  logger.info({ userId }, "Profile updated");
  return updated;
}

// ─── Get public profile by userId ─────────────────────────────────────────────
// Respects is_profile_public, show_email, show_phone privacy flags

export async function getPublicProfile(
  targetUserId: string,
  requesterId:  string | null, // null = unauthenticated
): Promise<PublicProfile> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, targetUserId))
    .limit(1);

  if (!profile) throw new NotFoundError("Profile");

  // Own profile is always fully visible
  const isOwner = requesterId === targetUserId;

  if (!isOwner && !profile.isProfilePublic) {
    throw new ForbiddenError("This profile is private");
  }

  // Fetch user email if needed (stored on users table, not profiles)
  let email: string | undefined;
  if (profile.showEmail || isOwner) {
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);
    email = user?.email;
  }

  // Build response — strip fields based on privacy settings
  return {
    userId:          profile.userId,
    displayName:     profile.displayName,
    bio:             profile.bio,
    avatarUrl:       profile.avatarUrl,
    bannerUrl:       profile.bannerUrl,
    departmentId:    profile.departmentId,
    batchYear:       profile.batchYear,
    program:         profile.program,
    semester:        profile.semester,
    linkedinUrl:     profile.linkedinUrl,
    githubUrl:       profile.githubUrl,
    personalWebsite: profile.personalWebsite,
  };
}

// ─── Update avatar URL (post-upload) ──────────────────────────────────────────
// Avatar binary upload/storage is handled externally (S3/R2).
// This service receives the final object URL and persists it.

export async function updateAvatar(userId: string, avatarUrl: string) {
  const [existing] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!existing) throw new NotFoundError("Profile");

  const [updated] = await db
    .update(userProfiles)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId))
    .returning({ avatarUrl: userProfiles.avatarUrl });

  logger.info({ userId }, "Avatar updated");
  return updated;
}