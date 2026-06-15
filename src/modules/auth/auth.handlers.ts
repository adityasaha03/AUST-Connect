import type { Context }       from "hono";
import * as AuthService        from "./auth.service";
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from "./auth.schema";
import { successResponse, errorResponse } from "@/lib/response";
import { ValidationError }    from "@/lib/errors";

export async function registerHandler(c: Context) {
  const body   = await c.req.json();
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const result = await AuthService.register(parsed.data);
  return successResponse(c, result, 201);
}

export async function loginHandler(c: Context) {
  const body   = await c.req.json();
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const result = await AuthService.login(parsed.data, {
    userAgent: c.req.header("User-Agent"),
    ip:        c.req.header("X-Forwarded-For") ?? undefined,
  });

  return successResponse(c, result);
}

export async function refreshHandler(c: Context) {
  const body   = await c.req.json();
  const parsed = RefreshTokenSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  const result = await AuthService.refreshTokenPair(parsed.data.refreshToken);
  return successResponse(c, result);
}

export async function logoutHandler(c: Context) {
  const body   = await c.req.json();
  const parsed = RefreshTokenSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

  await AuthService.logout(parsed.data.refreshToken);
  return c.body(null, 204);
}