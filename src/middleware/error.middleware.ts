// Middleware – Global error handler
import type { Context }    from "hono";
import { AppError }        from "@/lib/errors";
import { errorResponse }   from "@/lib/response";
import { logger }          from "@/lib/logger";

export function globalErrorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return errorResponse(c, err.code, err.message, err.statusCode, err.details);
  }

  logger.error({ err }, "Unhandled error");
  return errorResponse(c, "INTERNAL_ERROR", "An unexpected error occurred", 500);
}