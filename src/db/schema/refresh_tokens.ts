import { pgTable, uuid, text, timestamp, inet } from "drizzle-orm/pg-core";

// users FK added in index.ts to avoid circular dep
export const refreshTokens = pgTable("refresh_tokens", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  userAgent: text("user_agent"),
  ipAddress: inet("ip_address"),
});

export type RefreshToken    = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;