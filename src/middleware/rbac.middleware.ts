// Middleware – Role-based access control guard
import { createMiddleware } from "hono/factory";
import { ForbiddenError }   from "@/lib/errors";
import type { Role }        from "@/db/schema";
import type { AuthVariables } from "./auth.middleware";

const ROLE_HIERARCHY: Record<Role, number> = {
  student:     0,
  faculty:     1,
  admin:       2,
  super_admin: 3,
};

/**
 * requireRole(['admin', 'super_admin'])
 * — passes if the authenticated user's role is in the allowed list.
 *
 * requireMinRole('faculty')
 * — passes if the user's role is >= faculty in the hierarchy.
 */
export function requireRole(allowed: Role[]) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const userRole = c.get("userRole");
    if (!allowed.includes(userRole)) throw new ForbiddenError();
    await next();
  });
}

export function requireMinRole(minRole: Role) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const userRole = c.get("userRole");
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minRole]) throw new ForbiddenError();
    await next();
  });
}