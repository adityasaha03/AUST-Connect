import type { Context }       from "hono";
import * as UsersService       from "./users.service";
import {
  UpdateMeSchema,
  AssignRoleSchema,
  ListUsersQuerySchema,
} from "./users.schema";
import { successResponse, paginatedResponse } from "@/lib/response";
import { ValidationError }    from "@/lib/errors";
import type { AuthVariables } from "@/middleware/auth.middleware";

export async function getMeHandler(c: Context<{ Variables: AuthVariables }>) {
  const userId = c.get("userId");
  const user   = await UsersService.getMe(userId);
  return successResponse(c, user);
}

export async function updateMeHandler(c: Context<{ Variables: AuthVariables }>) {
  const body   = await c.req.json();
  const parsed = UpdateMeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const user = await UsersService.updateMe(c.get("userId"), parsed.data);
  return successResponse(c, user);
}

export async function getUserByIdHandler(c: Context<{ Variables: AuthVariables }>) {
  const id   = c.req.param("id")!;
  const user = await UsersService.getUserById(id);
  return successResponse(c, user);
}

export async function listUsersHandler(c: Context<{ Variables: AuthVariables }>) {
  const parsed = ListUsersQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const { data, pagination } = await UsersService.listUsers(parsed.data);
  return paginatedResponse(c, data, pagination);
}

export async function assignRoleHandler(c: Context<{ Variables: AuthVariables }>) {
  const body   = await c.req.json();
  const parsed = AssignRoleSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const user = await UsersService.assignRole(
    c.req.param("id")!,
    parsed.data,
    c.get("userId"),
    c.get("userRole"),
  );
  return successResponse(c, user);
}

export async function deactivateUserHandler(c: Context<{ Variables: AuthVariables }>) {
  await UsersService.deactivateUser(c.req.param("id")!, c.get("userId"));
  return c.body(null, 204);
}