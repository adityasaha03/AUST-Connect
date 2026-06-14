// Custom error classes (AppError, NotFoundError, etc.)
export class AppError extends Error {
  constructor(
    public readonly code:       string,
    message:                    string,
    public readonly statusCode: number,
    public readonly details?:   unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown) {
    super("VALIDATION_ERROR", "Validation failed", 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitedError extends AppError {
  constructor() {
    super("RATE_LIMITED", "Too many requests", 429);
  }
}