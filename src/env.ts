import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Application
    NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Database
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

    // JWT
    JWT_PRIVATE_KEY: z.string().min(1).transform(key => key.replace(/\\n/g, "\n")),
    JWT_PUBLIC_KEY: z.string().min(1).transform(key => key.replace(/\\n/g, "\n")),
    JWT_ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_TOKEN_EXPIRY: z.string().default("30d"),

    // Google OAuth (optional until you implement the integration)
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
  },
  runtimeEnv: process.env,
});