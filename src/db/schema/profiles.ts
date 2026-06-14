import { pgTable, uuid, varchar, text, boolean, smallint, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const departments = pgTable("departments", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        varchar("name", { length: 150 }).notNull().unique(),
  code:        varchar("code", { length: 20 }).notNull().unique(),
  facultyName: varchar("faculty_name", { length: 150 }),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userProfiles = pgTable("user_profiles", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().unique(), // FK added after users is defined (see index.ts)
  studentId:   varchar("student_id", { length: 50 }).unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio:         text("bio"),
  avatarUrl:   text("avatar_url"),
  bannerUrl:   text("banner_url"),

  // Academic
  departmentId: uuid("department_id").references(() => departments.id),
  batchYear:    smallint("batch_year"),
  program:      varchar("program", { length: 100 }),
  semester:     smallint("semester"),

  // Contact & Social
  phoneNumber:     varchar("phone_number", { length: 20 }),
  linkedinUrl:     text("linkedin_url"),
  githubUrl:       text("github_url"),
  personalWebsite: text("personal_website"),

  // Privacy
  isProfilePublic: boolean("is_profile_public").notNull().default(true),
  showEmail:       boolean("show_email").notNull().default(false),
  showPhone:       boolean("show_phone").notNull().default(false),

  // Preferences
  notificationPrefs: jsonb("notification_prefs").notNull().default({}),
  uiPreferences:     jsonb("ui_preferences").notNull().default({}),
  timezone:          varchar("timezone", { length: 64 }).notNull().default("Asia/Dhaka"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Department    = typeof departments.$inferSelect;
export type UserProfile   = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;