import { neon }       from "@neondatabase/serverless";
import { drizzle }    from "drizzle-orm/neon-http";
import { migrate }    from "drizzle-orm/neon-http/migrator";
import * as schema    from "@/db/schema";
import { sql }        from "drizzle-orm";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must be set for tests — use your Neon test branch URL");
}

const testSql = neon(process.env.TEST_DATABASE_URL);
export const testDb = drizzle(testSql, { schema });

// ─── Run all migrations against test branch ───────────────────────────────────

export async function runMigrations(): Promise<void> {
  await migrate(testDb, { migrationsFolder: "./src/db/migrations" });
}

// ─── Wipe all tables in correct FK order ─────────────────────────────────────
// Called in beforeEach for integration tests to guarantee clean slate

export async function clearDatabase(): Promise<void> {
  await testDb.execute(sql`
    TRUNCATE TABLE
      event_participants,
      user_google_credentials,
      refresh_tokens,
      events,
      user_profiles,
      users,
      departments
    RESTART IDENTITY CASCADE
  `);
}

// ─── Verify connectivity ──────────────────────────────────────────────────────

export async function verifyTestDb(): Promise<void> {
  await testDb.execute(sql`SELECT 1`);
}