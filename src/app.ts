import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check route
app.get("/health", (c) => {
  return c.json({ success: true, message: "AUST Connect API is running" });
});

export default app;