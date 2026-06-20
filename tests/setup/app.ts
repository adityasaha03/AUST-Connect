import { Hono }    from "hono";

// Re-export a fresh Hono test client using the real app
// but pointed at the test DB via TEST_DATABASE_URL env var.
// Because our db/client.ts reads from env at module load time,
// we just set TEST_DATABASE_URL before importing the app.

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

// Import AFTER overriding DATABASE_URL
const { default: app } = await import("@/app");

export { app };

// Helper: fire a request directly through Hono without starting HTTP server
export async function req(
  path:    string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, headers = {}, ...rest } = options;

  return app.request(path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string>),
    },
  });
}