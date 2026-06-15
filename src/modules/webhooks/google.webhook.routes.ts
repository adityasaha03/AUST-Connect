import { Hono }      from "hono";
import { webhookHandler } from "@/modules/integrations/google/google.handlers";

const webhooks = new Hono();

// Public — verified via X-Goog-Channel-Token header inside the handler
webhooks.post("/google-calendar", webhookHandler);

export default webhooks;   