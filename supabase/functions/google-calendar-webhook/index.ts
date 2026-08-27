import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_ID =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_ID") ?? "";
const GOOGLE_CALENDAR_WEB_CLIENT_SECRET =
  Deno.env.get("GOOGLE_CALENDAR_WEB_CLIENT_SECRET") ?? "";
const GOOGLE_CALENDAR_WEBHOOK_TOKEN =
  Deno.env.get("GOOGLE_CALENDAR_WEBHOOK_TOKEN") ?? "";
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

type Connection = {
  user_id: string;
  calendar_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  sync_token: string | null;
  channel_id: string | null;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
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
    throw new Error("missing_refresh_token");
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

async function sendPush(userId: string, heading: string, content: string) {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) return;

  await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [userId],
      headings: { es: heading, en: heading },
      contents: { es: content, en: content },
      data: {
        screen: "AppointmentDetail",
        type: "google_calendar_change",
      },
    }),
  });
}

function getAppointmentId(event: GoogleEvent) {
  return event.extendedProperties?.private?.ilyroxAppointmentId ?? null;
}

function getDateAndTime(event: GoogleEvent) {
  const value = event.start?.dateTime ?? event.start?.date;
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    fecha: date.toISOString().slice(0, 10),
    hora: date.toISOString().slice(11, 19),
  };
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const token = req.headers.get("x-goog-channel-token");
    if (GOOGLE_CALENDAR_WEBHOOK_TOKEN && token !== GOOGLE_CALENDAR_WEBHOOK_TOKEN) {
      return json({ error: "invalid_channel_token" }, 403);
    }

    const channelId = req.headers.get("x-goog-channel-id");
    if (!channelId) return json({ error: "missing_channel_id" }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: connection, error: connectionError } = await db
      .from("google_calendar_connections")
      .select("*")
      .eq("channel_id", channelId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) return json({ ok: true, ignored: "unknown_channel" });

    const typedConnection = connection as Connection;
    const accessToken = await refreshAccessToken(db, typedConnection);
    const params = new URLSearchParams({
      showDeleted: "true",
      singleEvents: "true",
      maxResults: "2500",
    });
    if (typedConnection.sync_token) {
      params.set("syncToken", typedConnection.sync_token);
    }

    let eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        typedConnection.calendar_id,
      )}/events?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (eventsResponse.status === 410) {
      params.delete("syncToken");
      eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          typedConnection.calendar_id,
        )}/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    }

    if (!eventsResponse.ok) {
      throw new Error(await eventsResponse.text());
    }

    const eventsList = await eventsResponse.json();
    const items = (eventsList.items ?? []) as GoogleEvent[];
    let changed = 0;

    for (const event of items) {
      const appointmentId = getAppointmentId(event);
      if (!appointmentId) continue;

      if (event.status === "cancelled") {
        const { error } = await db
          .from("citas")
          .update({
            estado: "cancelada",
            google_sync_origin: "google",
            google_last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointmentId);
        if (error) throw error;
        await sendPush(
          typedConnection.user_id,
          "Cita cancelada desde Google Calendar",
          "Ilyrox actualizó la cita porque fue cancelada en Google Calendar.",
        );
        changed++;
        continue;
      }

      const dateTime = getDateAndTime(event);
      if (!dateTime) continue;

      const { error } = await db
        .from("citas")
        .update({
          fecha: dateTime.fecha,
          hora: dateTime.hora,
          google_sync_origin: "google",
          google_last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", appointmentId);
      if (error) throw error;

      await sendPush(
        typedConnection.user_id,
        "Cita modificada desde Google Calendar",
        "Ilyrox actualizó la cita con el nuevo horario de Google Calendar.",
      );
      changed++;
    }

    await db
      .from("google_calendar_connections")
      .update({
        sync_token: eventsList.nextSyncToken ?? typedConnection.sync_token,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", typedConnection.user_id);

    return json({ ok: true, changed });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});