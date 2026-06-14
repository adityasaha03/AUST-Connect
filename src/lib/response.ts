// Standardized API response helpers
import type { Context } from "hono";

interface PaginationMeta {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
}

export function successResponse<T>(c: Context, data: T, status = 200) {
  return c.json({ success: true, data }, status as 200);
}

export function paginatedResponse<T>(
  c: Context,
  data:       T,
  pagination: PaginationMeta,
) {
  return c.json({ success: true, data, meta: { pagination } }, 200);
}

export function errorResponse(
  c:          Context,
  code:       string,
  message:    string,
  statusCode: number,
  details?:   unknown,
) {
  return c.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    statusCode as 400,
  );
}