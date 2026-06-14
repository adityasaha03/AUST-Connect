import { relations } from "drizzle-orm";
import { users, roleEnum }        from "./users";
import { userProfiles, departments } from "./profiles";
import { refreshTokens }           from "./refresh_tokens";
import { events, eventParticipants, userGoogleCredentials } from "./events";

// ─── Wire FK references that couldn't be in their own files ──────────────────

// userProfiles.userId → users.id
// (declared here; Drizzle relations handle the join logic)

// ─── Drizzle Relations ────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile:           one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  department:        one(departments,  { fields: [users.departmentId], references: [departments.id] }),
  refreshTokens:     many(refreshTokens),
  createdEvents:     many(events),
  participations:    many(eventParticipants),
  googleCredentials: one(userGoogleCredentials, { fields: [users.id], references: [userGoogleCredentials.userId] }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  users:    many(users),
  profiles: many(userProfiles),
  events:   many(events),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user:       one(users,       { fields: [userProfiles.userId],      references: [users.id] }),
  department: one(departments, { fields: [userProfiles.departmentId], references: [departments.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  creator:      one(users,       { fields: [events.creatorId],    references: [users.id] }),
  department:   one(departments, { fields: [events.departmentId], references: [departments.id] }),
  participants: many(eventParticipants),
}));

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
  event: one(events, { fields: [eventParticipants.eventId], references: [events.id] }),
  user:  one(users,  { fields: [eventParticipants.userId],  references: [users.id] }),
}));

// ─── Re-exports (single import surface for the rest of the app) ───────────────
export { users, roleEnum }                         from "./users";
export { userProfiles, departments }               from "./profiles";
export { refreshTokens }                           from "./refresh_tokens";
export { events, eventParticipants, userGoogleCredentials,
         eventTypeEnum, visibilityEnum, eventStatusEnum,
         participantStatusEnum }                   from "./events";

export type { User, NewUser, Role }                from "./users";
export type { UserProfile, NewUserProfile, Department } from "./profiles";
export type { RefreshToken, NewRefreshToken }      from "./refresh_tokens";
export type { Event, NewEvent, EventParticipant, GoogleCredentials } from "./events";