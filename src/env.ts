import { createEnv } from "@t3-oss/env-core";
import { z }         from "zod";

export const env = createEnv({
  server: {
    NODE_ENV:                   z.enum(["development", "staging", "production"]).default("development"),
    PORT:                       z.coerce.number().default(3000),
    LOG_LEVEL:                  z.enum(["debug", "info", "warn", "error"]).default("info"),
    DATABASE_URL:               z.string().url(),
    JWT_PRIVATE_KEY:            z.string().min(1),
    JWT_PUBLIC_KEY:             z.string().min(1),
    JWT_ACCESS_TOKEN_EXPIRY:    z.string().default("15m"),
    JWT_REFRESH_TOKEN_EXPIRY:   z.string().default("30d"),
    GOOGLE_CLIENT_ID:           z.string().optional(),
    GOOGLE_CLIENT_SECRET:       z.string().optional(),
    GOOGLE_REDIRECT_URI:        z.string().url().optional(),
    ENCRYPTION_KEY:             z.string().length(64), // 32-byte hex for AES-256
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});