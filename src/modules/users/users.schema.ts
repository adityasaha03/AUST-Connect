import { z }                  from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { users }              from "@/db/schema";

// ─── Base from Drizzle ────────────────────────────────────────────────────────

const baseSelect = createSelectSchema(users);

// ─── Safe public-facing user shape (never expose passwordHash) ────────────────

export const SafeUserSchema = baseSelect.omit({
  passwordHash: true,
});

export type SafeUser = z.infer<typeof SafeUserSchema>;

// ─── Update own credentials (email or password) ───────────────────────────────

export const UpdateMeSchema = z
  .object({
    email:           z.string().email().optional(),
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(8).max(128).optional(),
  })
  .refine(
    (data) => data.email || data.newPassword,
    { message: "Provide at least one field to update (email or newPassword)" },
  );

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

// ─── Admin: assign role ───────────────────────────────────────────────────────

export const AssignRoleSchema = z.object({
  role: z.enum(["student", "faculty", "admin", "super_admin"]),
});

export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;

// ─── Query params for listing users (admin) ───────────────────────────────────

export const ListUsersQuerySchema = z.object({
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  role:         z.enum(["student", "faculty", "admin", "super_admin"]).optional(),
  departmentId: z.string().uuid().optional(),
  isActive:     z.coerce.boolean().optional(),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;