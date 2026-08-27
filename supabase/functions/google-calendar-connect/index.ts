import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_ID =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_ID") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_SECRET =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_SECRET") ?? "";
const GOOGLE_CALENDAR_WEBHOOK_URL =
  Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL") ?? "";
const GOOGLE_CALENDAR_WEBHOOK_TOKEN =
  Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_TOKEN") ?? "";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "unauthorized" }, 401);
    }

    const { serverAuthCode, calendarId = "primary" } = await req.json();
    if (!serverAuthCode) {
      return json({ error: "serverAuthCode_required" }, 400);
    }
    if (
      !GOOGLE_CALENDAR_WEB_CLIENT_ID ||
      !GOOGLE_CALENDAR_WEB_CLIENT_SECRET ||
      !GOOGLE_CALENDAR_WEBHOOK_URL ||
      !GOOGLE_CALENDAR_WEBHOOK_TOKEN
    ) {
      return json({ error: "missing_google_calendar_secrets" }, 500);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: serverAuthCode,
        client_id: GOOGLE_CALENDAR_WEB_CLIENT_ID,
        client_secret: GOOGLE_CALENDAR_WEB_CLIENT_SECRET,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      return json({ error: "google_token_exchange_failed", detail }, 502);
    }

    const token = (await tokenResponse.json()) as TokenResponse;
    const expiresAt = new Date(
      Date.now() + Math.max(token.expires_in - 60, 60) * 1000,
    ).toISOString();

    const previous = await serviceClient
      .from("google_calendar_connections")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    const refreshToken =
      token.refresh_token ?? previous.data?.refresh_token ?? null;

    if (!refreshToken) {
      return json({ error: "missing_refresh_token" }, 400);
    }

    const channelId = crypto.randomUUID();
    const watchResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/watch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: GOOGLE_CALENDAR_WEBHOOK_URL,
          token: GOOGLE_CALENDAR_WEBHOOK_TOKEN,
          params: { ttl: "604800" },
        }),
      },
    );

    if (!watchResponse.ok) {
      const detail = await watchResponse.text();
      return json({ error: "google_watch_failed", detail }, 502);
    }

    const channel = await watchResponse.json();

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events?singleEvents=true&showDeleted=true&maxResults=2500`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
    );
    const eventsList = eventsResponse.ok ? await eventsResponse.json() : {};

    const { error: upsertError } = await serviceClient
      .from("google_calendar_connections")
      .upsert({
        user_id: user.id,
        calendar_id: calendarId,
        access_token: token.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scope: token.scope ?? null,
        token_type: token.token_type ?? null,
        sync_token: eventsList.nextSyncToken ?? null,
        channel_id: channel.id,
        resource_id: channel.resourceId,
        channel_expiration: channel.expiration
          ? new Date(Number(channel.expiration)).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) throw upsertError;

    return json({ ok: true });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});