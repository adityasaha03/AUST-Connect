import app    from "@/app";
import { env }    from "@/env";
import { logger } from "@/lib/logger";
import { db }     from "@/db/client";
import { sql }    from "drizzle-orm";

// ─── Startup checks ───────────────────────────────────────────────────────────

async function verifyDatabaseConnection(): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection verified");
  } catch (err) {
    logger.error({ err }, "Database connection failed — aborting startup");
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function registerShutdownHandlers(server: ReturnType<typeof Bun.serve>): void {
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    server.stop();
    logger.info("Server stopped");
    process.exit(0);
  };

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
    process.exit(1);
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info(
    { env: env.NODE_ENV, port: env.PORT },
    "Starting AUST Connect API",
  );

  // Verify DB before accepting traffic
  await verifyDatabaseConnection();

  const server = Bun.serve({
    port:  env.PORT,
    fetch: app.fetch,
  });

  registerShutdownHandlers(server);

  logger.info(
    { port: env.PORT, url: `http://localhost:${env.PORT}` },
    "AUST Connect API is running",
  );
}

bootstrap();