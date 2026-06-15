import { z } from "zod";

// ─── OAuth ────────────────────────────────────────────────────────────────────

export const OAuthCallbackSchema = z.object({
  code:  z.string().min(1),
  state: z.string().min(1), // CSRF token
});

export type OAuthCallbackInput = z.infer<typeof OAuthCallbackSchema>;

// ─── Google Calendar Event (subset we care about) ─────────────────────────────

export const GoogleCalendarEventSchema = z.object({
  id:      z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.object({
    dateTime: z.string().optional(),
    date:     z.string().optional(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().optional(),
    date:     z.string().optional(),
    timeZone: z.string().optional(),
  }),
  location: z.string().optional(),
  status:   z.enum(["confirmed", "tentative", "cancelled"]).optional(),
});

export type GoogleCalendarEvent = z.infer<typeof GoogleCalendarEventSchema>;

// ─── Webhook notification headers ─────────────────────────────────────────────

export const WebhookHeaderSchema = z.object({
  "x-goog-channel-id":    z.string(),
  "x-goog-channel-token": z.string(),
  "x-goog-resource-id":   z.string(),
  "x-goog-resource-state": z.enum(["sync", "exists", "not_exists"]),
  "x-goog-message-number": z.coerce.number(),
});

export type WebhookHeaders = z.infer<typeof WebhookHeaderSchema>;

// ─── Manual sync request ──────────────────────────────────────────────────────

export const ManualSyncSchema = z.object({
  calendarId: z.string().default("primary"),
});

export type ManualSyncInput = z.infer<typeof ManualSyncSchema>;