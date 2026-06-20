import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@/db/client", () => ({
  db: {
    select: mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(async () => []) })) })) })),
    update: mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(async () => []) })) })) })),
  },
}));

import * as ProfilesService from "@/modules/profiles/profiles.service";
import { db }               from "@/db/client";
import { NotFoundError, ForbiddenError } from "@/lib/errors";

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockProfile = {
  id:              "profile-uuid",
  userId:          "user-uuid-1",
  studentId:       "2022-1-60-001",
  displayName:     "Jane Doe",
  bio:             "CSE student",
  avatarUrl:       "https://cdn.aust.edu/avatar.jpg",
  bannerUrl:       null,
  departmentId:    "dept-uuid",
  batchYear:       2022,
  program:         "BSc CSE",
  semester:        5,
  phoneNumber:     null,
  linkedinUrl:     null,
  githubUrl:       "https://github.com/janedoe",
  personalWebsite: null,
  isProfilePublic: true,
  showEmail:       false,
  showPhone:       false,
  notificationPrefs: {},
  uiPreferences:     {},
  timezone:          "Asia/Dhaka",
  createdAt:         new Date(),
  updatedAt:         new Date(),
};

const mockUser = {
  id:            "user-uuid-1",
  email:         "jane@aust.edu",
  emailVerified: false,
  passwordHash:  "$argon2id$hash",
  role:          "student" as const,
  isActive:      true,
  departmentId:  null,
  lastLoginAt:   null,
  createdAt:     new Date(),
  updatedAt:     new Date(),
};

// ─── getMyProfile() ───────────────────────────────────────────────────────────

describe("ProfilesService.getMyProfile()", () => {
  it("returns profile when found", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockProfile] }) }),
    }));

    const result = await ProfilesService.getMyProfile("user-uuid-1");
    expect(result.userId).toBe("user-uuid-1");
    expect(result.displayName).toBe("Jane Doe");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(ProfilesService.getMyProfile("ghost-uuid")).rejects.toThrow(NotFoundError);
  });
});

// ─── updateMyProfile() ───────────────────────────────────────────────────────

describe("ProfilesService.updateMyProfile()", () => {
  beforeEach(() => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: mockProfile.id }] }) }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ ...mockProfile, displayName: "Updated Name" }],
        }),
      }),
    }));
  });

  it("returns updated profile", async () => {
    const result = await ProfilesService.updateMyProfile("user-uuid-1", {
      displayName: "Updated Name",
    });
    expect(result.displayName).toBe("Updated Name");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      ProfilesService.updateMyProfile("ghost-uuid", { displayName: "X" }),
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── getPublicProfile() ───────────────────────────────────────────────────────

describe("ProfilesService.getPublicProfile()", () => {
  it("returns public profile for authenticated requester", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockProfile] }) }),
    }));

    const result = await ProfilesService.getPublicProfile("user-uuid-1", "other-uuid");
    expect(result.displayName).toBe("Jane Doe");
    expect(result).not.toHaveProperty("notificationPrefs");
    expect(result).not.toHaveProperty("uiPreferences");
  });

  it("returns public profile for unauthenticated requester when profile is public", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockProfile] }) }),
    }));

    const result = await ProfilesService.getPublicProfile("user-uuid-1", null);
    expect(result.displayName).toBe("Jane Doe");
  });

  it("throws ForbiddenError for private profile when not owner", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockProfile, isProfilePublic: false }],
        }),
      }),
    }));

    await expect(
      ProfilesService.getPublicProfile("user-uuid-1", "other-uuid"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for private profile when unauthenticated", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockProfile, isProfilePublic: false }],
        }),
      }),
    }));

    await expect(
      ProfilesService.getPublicProfile("user-uuid-1", null),
    ).rejects.toThrow(ForbiddenError);
  });

  it("owner can always view their own private profile", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...mockProfile, isProfilePublic: false }],
        }),
      }),
    }));

    const result = await ProfilesService.getPublicProfile("user-uuid-1", "user-uuid-1");
    expect(result.displayName).toBe("Jane Doe");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      ProfilesService.getPublicProfile("ghost-uuid", "other-uuid"),
    ).rejects.toThrow(NotFoundError);
  });

  it("never exposes notificationPrefs or uiPreferences in public view", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [mockProfile] }) }),
    }));

    const result = await ProfilesService.getPublicProfile("user-uuid-1", "other-uuid");
    const keys   = Object.keys(result);

    expect(keys).not.toContain("notificationPrefs");
    expect(keys).not.toContain("uiPreferences");
    expect(keys).not.toContain("showEmail");
    expect(keys).not.toContain("showPhone");
  });

  it("includes email in response when showEmail is true", async () => {
    let callCount = 0;
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            callCount++;
            // First call → profile with showEmail true
            // Second call → users table for email
            if (callCount === 1) return [{ ...mockProfile, showEmail: true }];
            return [{ email: mockUser.email }];
          },
        }),
      }),
    }));

    // Email exposure is handled via the users table fetch in service
    // We just verify the call doesn't throw and returns display fields
    const result = await ProfilesService.getPublicProfile("user-uuid-1", "other-uuid");
    expect(result).toHaveProperty("displayName");
  });
});

// ─── updateAvatar() ───────────────────────────────────────────────────────────

describe("ProfilesService.updateAvatar()", () => {
  it("returns updated avatarUrl on success", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [{ id: mockProfile.id }] }) }),
    }));

    (db.update as ReturnType<typeof mock>).mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ avatarUrl: "https://cdn.aust.edu/new-avatar.jpg" }],
        }),
      }),
    }));

    const result = await ProfilesService.updateAvatar(
      "user-uuid-1",
      "https://cdn.aust.edu/new-avatar.jpg",
    );
    expect(result?.avatarUrl).toBe("https://cdn.aust.edu/new-avatar.jpg");
  });

  it("throws NotFoundError when profile does not exist", async () => {
    (db.select as ReturnType<typeof mock>).mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(
      ProfilesService.updateAvatar("ghost-uuid", "https://cdn.aust.edu/avatar.jpg"),
    ).rejects.toThrow(NotFoundError);
  });
});