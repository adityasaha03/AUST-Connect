// Pino logger instance
import pino from "pino";
import { env } from "@/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
  redact: {
    paths: ["password", "passwordHash", "token", "accessToken", "refreshToken",
            "req.headers.authorization", "*.password_hash"],
    censor: "[REDACTED]",
  },
});