import { logger } from "@/lib/logger";
import { env }    from "@/env";
import type { GoogleCalendarEvent } from "./google.schema";

const GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth";

// ─── Token types ──────────────────────────────────────────────────────────────

export interface GoogleTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    Date;
  scope:        string;
}

export interface GoogleTokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in:    number;
  scope:         string;
  token_type:    string;
}

// ─── Build OAuth authorization URL ───────────────────────────────────────────

export function buildAuthorizationUrl(csrfToken: string): string {
  const params = new URLSearchParams({
    client_id:     env.GOOGLE_CLIENT_ID!,
    redirect_uri:  env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
    access_type:   "offline",
    prompt:        "consent",  // force refresh_token issuance
    state:         csrfToken,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ─── Exchange auth code for tokens ────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  env.GOOGLE_REDIRECT_URI!,
      grant_type:    "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ err }, "Google token exchange failed");
    throw new Error("Failed to exchange code for tokens");
  }

  const data = (await res.json()) as GoogleTokenResponse;

  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt:    new Date(Date.now() + data.expires_in * 1000),
    scope:        data.scope,
  };
}

// ─── Refresh an expired access token ─────────────────────────────────────────

export async function refreshAccessToken(encryptedRefreshToken: string): Promise<Pick<GoogleTokens, "accessToken" | "expiresAt">> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: encryptedRefreshToken,
      client_id:     env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Google access token");
  }

  const data = (await res.json()) as GoogleTokenResponse;

  return {
    accessToken: data.access_token,
    expiresAt:   new Date(Date.now() + data.expires_in * 1000),
  };
}

// ─── Create calendar event ────────────────────────────────────────────────────

export async function createCalendarEvent(
  accessToken: string,
  calendarId:  string,
  payload:     object,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    logger.error({ err }, "Google Calendar create event failed");
    throw new Error("Failed to create Google Calendar event");
  }

  return res.json() as Promise<GoogleCalendarEvent>;
}

// ─── Patch (partial update) calendar event ────────────────────────────────────

export async function patchCalendarEvent(
  accessToken: string,
  calendarId:  string,
  gcalEventId: string,
  payload:     object,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events/${gcalEventId}`,
    {
      method:  "PATCH",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    logger.error({ err, gcalEventId }, "Google Calendar patch event failed");
    throw new Error("Failed to update Google Calendar event");
  }

  return res.json() as Promise<GoogleCalendarEvent>;
}

// ─── Fetch a single calendar event ───────────────────────────────────────────

export async function getCalendarEvent(
  accessToken: string,
  calendarId:  string,
  gcalEventId: string,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events/${gcalEventId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) throw new Error("Failed to fetch Google Calendar event");
  return res.json() as Promise<GoogleCalendarEvent>;
}

// ─── Register push notification channel ──────────────────────────────────────

export async function registerWebhookChannel(
  accessToken:  string,
  calendarId:   string,
  webhookUrl:   string,
  channelId:    string,
  channelToken: string,
): Promise<{ expiration: string }> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_URL}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id:      channelId,
        type:    "web_hook",
        address: webhookUrl,
        token:   channelToken,
      }),
    },
  );

  if (!res.ok) throw new Error("Failed to register Google webhook channel");
  return res.json() as Promise<{ expiration: string }>;
}