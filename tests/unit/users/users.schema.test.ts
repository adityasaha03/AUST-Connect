import { describe, it, expect } from "bun:test";
import {
  UpdateMeSchema,
  AssignRoleSchema,
  ListUsersQuerySchema,
} from "@/modules/users/users.schema";

// ─── UpdateMeSchema ───────────────────────────────────────────────────────────

describe("UpdateMeSchema", () => {
  it("accepts valid email change with currentPassword", () => {
    const result = UpdateMeSchema.safeParse({
      email:           "new@aust.edu",
      currentPassword: "OldPass123!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid password change with currentPassword", () => {
    const result = UpdateMeSchema.safeParse({
      currentPassword: "OldPass123!",
      newPassword:     "NewPass456!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts both email and newPassword together", () => {
    const result = UpdateMeSchema.safeParse({
      email:           "new@aust.edu",
      currentPassword: "OldPass123!",
      newPassword:     "NewPass456!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when neither email nor newPassword is provided", () => {
    const result = UpdateMeSchema.safeParse({
      currentPassword: "OldPass123!",
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain("at least one field");
  });

  it("rejects missing currentPassword", () => {
    const result = UpdateMeSchema.safeParse({
      email: "new@aust.edu",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = UpdateMeSchema.safeParse({
      email:           "not-an-email",
      currentPassword: "OldPass123!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newPassword under 8 characters", () => {
    const result = UpdateMeSchema.safeParse({
      currentPassword: "OldPass123!",
      newPassword:     "Short1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newPassword over 128 characters", () => {
    const result = UpdateMeSchema.safeParse({
      currentPassword: "OldPass123!",
      newPassword:     "A1!".repeat(50),
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty currentPassword", () => {
    const result = UpdateMeSchema.safeParse({
      email:           "new@aust.edu",
      currentPassword: "",
    });
    expect(result.success).toBe(false);
  });
});

// ─── AssignRoleSchema ─────────────────────────────────────────────────────────

describe("AssignRoleSchema", () => {
  it.each(["student", "faculty", "admin", "super_admin"])(
    "accepts valid role: %s",
    (role) => {
      expect(AssignRoleSchema.safeParse({ role }).success).toBe(true);
    },
  );

  it("rejects unknown role value", () => {
    expect(AssignRoleSchema.safeParse({ role: "god" }).success).toBe(false);
  });

  it("rejects missing role field", () => {
    expect(AssignRoleSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty string role", () => {
    expect(AssignRoleSchema.safeParse({ role: "" }).success).toBe(false);
  });
});

// ─── ListUsersQuerySchema ─────────────────────────────────────────────────────

describe("ListUsersQuerySchema", () => {
  it("applies defaults when no query params provided", () => {
    const result = ListUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string page and limit to numbers", () => {
    const result = ListUsersQuerySchema.safeParse({ page: "2", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects limit over 100", () => {
    expect(ListUsersQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("rejects limit of 0", () => {
    expect(ListUsersQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects negative page", () => {
    expect(ListUsersQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
  });

  it("rejects invalid role filter", () => {
    expect(ListUsersQuerySchema.safeParse({ role: "overlord" }).success).toBe(false);
  });

  it("rejects invalid UUID for departmentId", () => {
    expect(ListUsersQuerySchema.safeParse({ departmentId: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts valid UUID for departmentId", () => {
    const result = ListUsersQuerySchema.safeParse({
      departmentId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("coerces isActive string to boolean", () => {
    const result = ListUsersQuerySchema.safeParse({ isActive: "true" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });
});