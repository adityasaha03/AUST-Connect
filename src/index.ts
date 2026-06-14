import { env } from "@/env";
import app from "@/app";

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`🚀 Server running at http://localhost:${server.port} in ${env.NODE_ENV} mode`);