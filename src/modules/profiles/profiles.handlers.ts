// Profiles module – route handler functions
import type { Context }       from "hono";
import * as ProfilesService    from "./profiles.service";
import {
  UpdateProfileSchema,
  AvatarUploadSchema,
} from "./profiles.schema";
import { successResponse }    from "@/lib/response";
import { ValidationError }    from "@/lib/errors";
import type { AuthVariables } from "@/middleware/auth.middleware";

export async function getMyProfileHandler(c: Context<{ Variables: AuthVariables }>) {
  const profile = await ProfilesService.getMyProfile(c.get("userId"));
  return successResponse(c, profile);
}

export async function updateMyProfileHandler(c: Context<{ Variables: AuthVariables }>) {
  const body   = await c.req.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const profile = await ProfilesService.updateMyProfile(c.get("userId"), parsed.data);
  return successResponse(c, profile);
}

export async function getPublicProfileHandler(c: Context<{ Variables: AuthVariables | Record<string, never> }>) {
  const targetUserId = c.req.param("userId")!;

  // requesterId is null for unauthenticated requests
  // authMiddleware is optional on this route — userId may not be set
  const requesterId = (c.get as (key: string) => string | undefined)("userId") ?? null;

  const profile = await ProfilesService.getPublicProfile(targetUserId, requesterId);
  return successResponse(c, profile);
}

export async function uploadAvatarHandler(c: Context<{ Variables: AuthVariables }>) {
  const body   = await c.req.json();
  const parsed = AvatarUploadSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const result = await ProfilesService.updateAvatar(c.get("userId"), parsed.data.avatarUrl);
  return successResponse(c, result);
}   