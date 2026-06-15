// Profiles module – Zod request/response schemas
import { z }                  from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { userProfiles }       from "@/db/schema";

// ─── Base from Drizzle ────────────────────────────────────────────────────────

const baseInsert = createInsertSchema(userProfiles);
const baseSelect = createSelectSchema(userProfiles);

// ─── Full profile response shape ──────────────────────────────────────────────

export const ProfileSchema = baseSelect;
export type Profile = z.infer<typeof ProfileSchema>;

// ─── Update own profile ───────────────────────────────────────────────────────

export const UpdateProfileSchema = baseInsert
  .omit({
    id:        true,
    userId:    true,
    createdAt: true,
    updatedAt: true,
  })
  .partial()
  .extend({
    // Validated URL fields
    avatarUrl:       z.string().url().nullable().optional(),
    bannerUrl:       z.string().url().nullable().optional(),
    linkedinUrl:     z.string().url().nullable().optional(),
    githubUrl:       z.string().url().nullable().optional(),
    personalWebsite: z.string().url().nullable().optional(),

    // Constrained numeric fields
    batchYear: z.number().int().min(2000).max(2100).nullable().optional(),
    semester:  z.number().int().min(1).max(12).nullable().optional(),

    // Notification prefs — structured, not freeform
    notificationPrefs: z
      .object({
        email: z
          .object({
            eventReminders:    z.boolean().optional(),
            newAnnouncements:  z.boolean().optional(),
            directMessages:    z.boolean().optional(),
          })
          .optional(),
        push: z
          .object({
            eventReminders: z.boolean().optional(),
            rsvpUpdates:    z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  });

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ─── Avatar upload ────────────────────────────────────────────────────────────

export const AvatarUploadSchema = z.object({
  avatarUrl: z.string().url(),
});

export type AvatarUploadInput = z.infer<typeof AvatarUploadSchema>;

// ─── Public profile (respects privacy settings) ───────────────────────────────
// Built dynamically in the service — this is the maximal shape

export const PublicProfileSchema = baseSelect.pick({
  userId:      true,
  displayName: true,
  bio:         true,
  avatarUrl:   true,
  bannerUrl:   true,
  departmentId: true,
  batchYear:   true,
  program:     true,
  semester:    true,
  linkedinUrl: true,
  githubUrl:   true,
  personalWebsite: true,
  // email and phone omitted — gated by show_email / show_phone
});

export type PublicProfile = z.infer<typeof PublicProfileSchema>;