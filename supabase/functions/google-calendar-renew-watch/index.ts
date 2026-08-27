import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_ID =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_ID") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_SECRET =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_SECRET") ?? "";
const GOOGLE_CALENDAR_WEBHOOK_URL =
  Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_URL") ?? "";
const GOOGLE_CALENDAR_WEBHOOK_TOKEN =
  Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_TOKEN") ?? "";
const GOOGLE_CALENDAR_RENEW_TOKEN =
  Deno.env.get("GOOGLE_CALENDAR_RENEW_TOKEN") ?? "";

type Connection = {
  user_id: string;
  calendar_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function refreshAccessToken(db: any, connection: Connection) {
  if (new Date(connection.expires_at).getTime() > Date.now() + 60_000) {
    return connection.access_token;
  }

  if (!connection.refresh_token) {
    throw new Error(`missing_refresh_token:${connection.user_id}`);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CALENDAR_WEB_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_WEB_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const token = await response.json();
  const expiresAt = new Date(
    Date.now() + Math.max((token.expires_in ?? 3600) - 60, 60) * 1000,
  ).toISOString();

  await db
    .from("google_calendar_connections")
    .update({
      access_token: token.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", connection.user_id);

  return token.access_token as string;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    if (GOOGLE_CALENDAR_RENEW_TOKEN) {
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (token !== GOOGLE_CALENDAR_RENEW_TOKEN) {
        return json({ error: "unauthorized" }, 401);
      }
    }

    if (
      !GOOGLE_CALENDAR_WEB_CLIENT_ID ||
      !GOOGLE_CALENDAR_WEB_CLIENT_SECRET ||
      !GOOGLE_CALENDAR_WEBHOOK_URL ||
      !GOOGLE_CALENDAR_WEBHOOK_TOKEN
    ) {
      return json({ error: "missing_google_calendar_secrets" }, 500);
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const renewBefore = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: connections, error } = await db
      .from("google_calendar_connections")
      .select("*")
      .or(`channel_expiration.is.null,channel_expiration.lt.${renewBefore}`);

    if (error) throw error;

    let renewed = 0;
    for (const connection of (connections ?? []) as Connection[]) {
      const accessToken = await refreshAccessToken(db, connection);
      const channelId = crypto.randomUUID();
      const watchResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          connection.calendar_id,
        )}/events/watch`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
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
        throw new Error(await watchResponse.text());
      }

      const channel = await watchResponse.json();
      await db
        .from("google_calendar_connections")
        .update({
          channel_id: channel.id,
          resource_id: channel.resourceId,
          channel_expiration: channel.expiration
            ? new Date(Number(channel.expiration)).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", connection.user_id);
      renewed++;
    }

    return json({ ok: true, renewed });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});