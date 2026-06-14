import { pgTable, uuid, varchar, boolean, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { departments } from "./profiles";

export const roleEnum = pgEnum("role", ["student", "faculty", "admin", "super_admin"]);

export const users = pgTable("users", {
  id:            uuid("id").primaryKey().defaultRandom(),
  email:         varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  passwordHash:  varchar("password_hash", { length: 255 }).notNull(),
  role:          roleEnum("role").notNull().default("student"),
  departmentId:  uuid("department_id").references(() => departments.id),
  isActive:      boolean("is_active").notNull().default(true),
  lastLoginAt:   timestamp("last_login_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User         = typeof users.$inferSelect;
export type NewUser      = typeof users.$inferInsert;
export type Role         = (typeof roleEnum.enumValues)[number];