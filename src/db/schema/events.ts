import {
  pgTable, uuid, varchar, text, boolean, integer,
  timestamp, pgEnum, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventTypeEnum       = pgEnum("event_type",   ["event", "task"]);
export const visibilityEnum      = pgEnum("visibility",   ["public", "private"]);
export const eventStatusEnum     = pgEnum("event_status", ["draft", "published", "cancelled", "completed"]);
export const participantStatusEnum = pgEnum("participant_status", ["registered", "waitlisted", "attended", "cancelled"]);

export const events = pgTable("events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  title:       varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type:        eventTypeEnum("type").notNull(),
  visibility:  visibilityEnum("visibility").notNull().default("private"),
  status:      eventStatusEnum("status").notNull().default("draft"),
  creatorId:   uuid("creator_id").notNull(),     // FK → users in index.ts
  departmentId: uuid("department_id"),           // FK → departments in index.ts

  // Scheduling
  startsAt:       timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt:         timestamp("ends_at",   { withTimezone: true }),
  isAllDay:       boolean("is_all_day").notNull().default(false),
  timezone:       varchar("timezone", { length: 64 }).notNull().default("Asia/Dhaka"),
  recurrenceRule: text("recurrence_rule"),

  // Location
  locationName: varchar("location_name", { length: 255 }),
  locationUrl:  text("location_url"),

  // Capacity
  maxParticipants: integer("max_participants"),
  currentCount:    integer("current_count").notNull().default(0),

  // Google Calendar
  gcalEventId:    text("gcal_event_id").unique(),
  gcalCalendarId: text("gcal_calendar_id"),
  gcalSyncToken:  text("gcal_sync_token"),
  gcalSyncedAt:   timestamp("gcal_synced_at", { withTimezone: true }),

  // Metadata
  tags:      text("tags").array().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const eventParticipants = pgTable("event_participants", {
  id:           uuid("id").primaryKey().defaultRandom(),
  eventId:      uuid("event_id").notNull(),   // FK → events in index.ts
  userId:       uuid("user_id").notNull(),    // FK → users in index.ts
  status:       participantStatusEnum("status").notNull().default("registered"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  attendedAt:   timestamp("attended_at",   { withTimezone: true }),
});

export const userGoogleCredentials = pgTable("user_google_credentials", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       uuid("user_id").notNull().unique(),
  accessToken:  text("access_token").notNull(),   // encrypted at rest
  refreshToken: text("refresh_token").notNull(),  // encrypted at rest
  expiresAt:    timestamp("expires_at", { withTimezone: true }).notNull(),
  scope:        text("scope").notNull(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Event              = typeof events.$inferSelect;
export type NewEvent           = typeof events.$inferInsert;
export type EventParticipant   = typeof eventParticipants.$inferSelect;
export type GoogleCredentials  = typeof userGoogleCredentials.$inferSelect;