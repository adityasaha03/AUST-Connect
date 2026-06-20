import { describe, it, expect } from "bun:test";
import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
} from "@/modules/auth/auth.schema";

describe("RegisterSchema", () => {
  const valid = {
    email:       "student@aust.edu",
    password:    "SecurePass123!",
    displayName: "John Doe",
  };

  it("accepts valid registration input", () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = RegisterSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("email");
  });

  it("rejects password shorter than 8 characters", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "Short1!" });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 128 characters", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "A".repeat(129) });
    expect(result.success).toBe(false);
  });

  it("rejects displayName shorter than 2 characters", () => {
    const result = RegisterSchema.safeParse({ ...valid, displayName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(RegisterSchema.safeParse({}).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: valid.email }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: valid.email, password: valid.password }).success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid login input", () => {
    const result = LoginSchema.safeParse({
      email:    "student@aust.edu",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email:    "student@aust.edu",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    expect(LoginSchema.safeParse({ password: "pass" }).success).toBe(false);
  });
});

describe("RefreshTokenSchema", () => {
  it("accepts a non-empty token string", () => {
    expect(RefreshTokenSchema.safeParse({ refreshToken: "abc123" }).success).toBe(true);
  });

  it("rejects empty token string", () => {
    expect(RefreshTokenSchema.safeParse({ refreshToken: "" }).success).toBe(false);
  });

  it("rejects missing token field", () => {
    expect(RefreshTokenSchema.safeParse({}).success).toBe(false);
  });
});