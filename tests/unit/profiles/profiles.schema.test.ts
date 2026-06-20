import { describe, it, expect } from "bun:test";
import { UpdateProfileSchema, AvatarUploadSchema } from "@/modules/profiles/profiles.schema";

// ─── UpdateProfileSchema ──────────────────────────────────────────────────────

describe("UpdateProfileSchema", () => {

  // ─── Valid inputs ───────────────────────────────────────────────────────────

  it("accepts empty object (all fields optional)", () => {
    expect(UpdateProfileSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid full profile update", () => {
    const result = UpdateProfileSchema.safeParse({
      displayName:     "Jane Doe",
      bio:             "PhD student in CSE",
      batchYear:       2022,
      semester:        5,
      program:         "BSc Computer Science",
      phoneNumber:     "+8801712345678",
      linkedinUrl:     "https://linkedin.com/in/janedoe",
      githubUrl:       "https://github.com/janedoe",
      personalWebsite: "https://janedoe.dev",
      isProfilePublic: true,
      showEmail:       false,
      showPhone:       false,
      timezone:        "Asia/Dhaka",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with only displayName", () => {
    expect(
      UpdateProfileSchema.safeParse({ displayName: "Updated Name" }).success,
    ).toBe(true);
  });

  it("accepts null for nullable URL fields", () => {
    const result = UpdateProfileSchema.safeParse({
      avatarUrl:       null,
      bannerUrl:       null,
      linkedinUrl:     null,
      githubUrl:       null,
      personalWebsite: null,
    });
    expect(result.success).toBe(true);
  });

  // ─── URL validation ─────────────────────────────────────────────────────────

  it.each(["linkedinUrl", "githubUrl", "personalWebsite", "avatarUrl", "bannerUrl"])(
    "rejects invalid URL for %s",
    (field) => {
      const result = UpdateProfileSchema.safeParse({ [field]: "not-a-url" });
      expect(result.success).toBe(false);
    },
  );

  it.each(["linkedinUrl", "githubUrl", "personalWebsite"])(
    "accepts valid https URL for %s",
    (field) => {
      const result = UpdateProfileSchema.safeParse({
        [field]: "https://example.com/profile",
      });
      expect(result.success).toBe(true);
    },
  );

  // ─── batchYear ──────────────────────────────────────────────────────────────

  it("accepts batchYear within valid range", () => {
    expect(UpdateProfileSchema.safeParse({ batchYear: 2022 }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ batchYear: 2000 }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ batchYear: 2100 }).success).toBe(true);
  });

  it("rejects batchYear before 2000", () => {
    expect(UpdateProfileSchema.safeParse({ batchYear: 1999 }).success).toBe(false);
  });

  it("rejects batchYear after 2100", () => {
    expect(UpdateProfileSchema.safeParse({ batchYear: 2101 }).success).toBe(false);
  });

  it("accepts null batchYear", () => {
    expect(UpdateProfileSchema.safeParse({ batchYear: null }).success).toBe(true);
  });

  // ─── semester ───────────────────────────────────────────────────────────────

  it("accepts semester within 1–12", () => {
    expect(UpdateProfileSchema.safeParse({ semester: 1 }).success).toBe(true);
    expect(UpdateProfileSchema.safeParse({ semester: 12 }).success).toBe(true);
  });

  it("rejects semester 0", () => {
    expect(UpdateProfileSchema.safeParse({ semester: 0 }).success).toBe(false);
  });

  it("rejects semester above 12", () => {
    expect(UpdateProfileSchema.safeParse({ semester: 13 }).success).toBe(false);
  });

  it("accepts null semester", () => {
    expect(UpdateProfileSchema.safeParse({ semester: null }).success).toBe(true);
  });

  // ─── notificationPrefs ──────────────────────────────────────────────────────

  it("accepts valid notificationPrefs structure", () => {
    const result = UpdateProfileSchema.safeParse({
      notificationPrefs: {
        email: {
          eventReminders:   true,
          newAnnouncements: false,
          directMessages:   true,
        },
        push: {
          eventReminders: true,
          rsvpUpdates:    false,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial notificationPrefs", () => {
    const result = UpdateProfileSchema.safeParse({
      notificationPrefs: {
        email: { eventReminders: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty notificationPrefs object", () => {
    expect(UpdateProfileSchema.safeParse({ notificationPrefs: {} }).success).toBe(true);
  });

  it("rejects non-boolean values inside notificationPrefs", () => {
    const result = UpdateProfileSchema.safeParse({
      notificationPrefs: {
        email: { eventReminders: "yes" },
      },
    });
    expect(result.success).toBe(false);
  });

  // ─── displayName ────────────────────────────────────────────────────────────

  it("rejects displayName over 100 characters", () => {
    expect(
      UpdateProfileSchema.safeParse({ displayName: "A".repeat(101) }).success,
    ).toBe(false);
  });

  it("accepts displayName exactly 100 characters", () => {
    expect(
      UpdateProfileSchema.safeParse({ displayName: "A".repeat(100) }).success,
    ).toBe(true);
  });
});

// ─── AvatarUploadSchema ───────────────────────────────────────────────────────

describe("AvatarUploadSchema", () => {
  it("accepts valid https URL", () => {
    const result = AvatarUploadSchema.safeParse({
      avatarUrl: "https://cdn.aust.edu/avatars/user-123.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-URL string", () => {
    expect(AvatarUploadSchema.safeParse({ avatarUrl: "just-a-string" }).success).toBe(false);
  });

  it("rejects missing avatarUrl", () => {
    expect(AvatarUploadSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(AvatarUploadSchema.safeParse({ avatarUrl: "" }).success).toBe(false);
  });
});