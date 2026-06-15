import { z }               from "zod";
import { createInsertSchema } from "drizzle-zod";
import { users }           from "@/db/schema";

// ─── Base from Drizzle ────────────────────────────────────────────────────────

const baseUserInsert = createInsertSchema(users);

// ─── Register ─────────────────────────────────────────────────────────────────

export const RegisterSchema = baseUserInsert
  .pick({ email: true })
  .extend({
    password:    z.string().min(8).max(128),
    displayName: z.string().min(2).max(100),
  });

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ─── Login ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

// ─── Verify Email ─────────────────────────────────────────────────────────────

export const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

// ─── Response Shapes (no sensitive fields) ────────────────────────────────────

export const SafeUserSchema = baseUserInsert
  .pick({ id: true, email: true, role: true, emailVerified: true, createdAt: true })
  .partial({ id: true, createdAt: true });

export type SafeUser = z.infer<typeof SafeUserSchema>;