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

const DEFAULT_CALENDAR_ID = "primary";
const SERVER_SYNC_ORIGIN = "ilyrox-server";
const TYPE_LABELS: Record<string, string> = {
  visita: "Visita",
  llamada: "Llamada",
  videollamada: "Videollamada",
  reunion: "Reunión",
};

type Connection = {
  user_id: string;
  calendar_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  sync_token: string | null;
  channel_id: string | null;
};

type Appointment = {
  id: string;
  agente_id: string;
  cliente_id: string;
  propiedad_id: string | null;
  fecha: string;
  hora: string;
  tipo: string;
  descripcion: string | null;
  estado: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
};

type StoredEvent = {
  cita_id: string;
  user_id: string;
  google_event_id: string;
  google_calendar_id: string;
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

function padTime(time: string) {
  const [hours = "09", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:00`;
}

function addOneHour(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000);
}

function getParticipantIds(appointment: Appointment) {
  return Array.from(
    new Set([appointment.agente_id, appointment.cliente_id].filter(Boolean)),
  );
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

async function getAppointment(db: any, appointmentId: string) {
  const { data, error } = await db
    .from("citas")
    .select(
      "id, agente_id, cliente_id, propiedad_id, fecha, hora, tipo, descripcion, estado, google_event_id, google_calendar_id",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (error) throw error;
  return data as Appointment | null;
}

async function getConnectionsByUserId(db: any, userIds: string[]) {
  const { data, error } = await db
    .from("google_calendar_connections")
    .select("*")
    .in("user_id", userIds);

  if (error) throw error;

  return new Map(
    ((data ?? []) as Connection[]).map((connection) => [
      connection.user_id,
      connection,
    ]),
  );
}

async function getStoredEventsByUserId(db: any, appointment: Appointment) {
  const { data, error } = await db
    .from("cita_google_events")
    .select("*")
    .eq("cita_id", appointment.id);

  if (error) throw error;

  const map = new Map(
    ((data ?? []) as StoredEvent[]).map((event) => [event.user_id, event]),
  );

  if (appointment.google_event_id && !map.has(appointment.agente_id)) {
    map.set(appointment.agente_id, {
      cita_id: appointment.id,
      user_id: appointment.agente_id,
      google_event_id: appointment.google_event_id,
      google_calendar_id: appointment.google_calendar_id || DEFAULT_CALENDAR_ID,
    });
  }

  return map;
}

async function getPropertyInfo(db: any, propertyId: string | null) {
  if (!propertyId) return { title: "Cita Ilyrox", location: "" };

  const { data } = await db
    .from("propiedades")
    .select("tipo, subtipo, calle, numero_exterior, ciudad, codigo_postal")
    .eq("id", propertyId)
    .maybeSingle();

  if (!data) return { title: "Cita Ilyrox", location: "" };

  return {
    title:
      [data.tipo, data.subtipo, data.ciudad].filter(Boolean).join(" en ") ||
      "Propiedad",
    location: [data.calle, data.numero_exterior, data.ciudad, data.codigo_postal]
      .filter(Boolean)
      .join(", "),
  };
}

async function getUserName(db: any, userId: string) {
  const { data } = await db
    .from("perfiles")
    .select("nombre, apellido_paterno")
    .eq("id", userId)
    .maybeSingle();

  return [data?.nombre, data?.apellido_paterno].filter(Boolean).join(" ");
}

async function buildEventBody(
  db: any,
  appointment: Appointment,
  ownerUserId: string,
) {
  const property = await getPropertyInfo(db, appointment.propiedad_id);
  const otherUserId =
    ownerUserId === appointment.agente_id
      ? appointment.cliente_id
      : appointment.agente_id;
  const otherName = await getUserName(db, otherUserId);
  const start = new Date(`${appointment.fecha}T${padTime(appointment.hora)}`);
  const end = addOneHour(start);
  const typeLabel = TYPE_LABELS[appointment.tipo] ?? appointment.tipo;

  return {
    summary: `${typeLabel} - ${property.title}`,
    location: property.location || undefined,
    description: [
      "Cita creada desde Ilyrox.",
      otherName ? `Con: ${otherName}` : undefined,
      appointment.descripcion ? `Detalles: ${appointment.descripcion}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: { useDefault: true },
    extendedProperties: {
      private: {
        ilyroxAppointmentId: appointment.id,
        ilyroxCalendarOwnerId: ownerUserId,
        ilyroxSyncOrigin: SERVER_SYNC_ORIGIN,
      },
    },
  };
}

async function updateOtherCalendarEvents(
  db: any,
  appointment: Appointment,
  sourceUserId: string,
) {
  const participantIds = getParticipantIds(appointment).filter(
    (userId) => userId !== sourceUserId,
  );
  const connections = await getConnectionsByUserId(db, participantIds);
  const storedEvents = await getStoredEventsByUserId(db, appointment);

  for (const userId of participantIds) {
    const connection = connections.get(userId);
    const storedEvent = storedEvents.get(userId);
    if (!connection || !storedEvent) continue;

    const accessToken = await refreshAccessToken(db, connection);
    const calendarId =
      storedEvent.google_calendar_id ||
      connection.calendar_id ||
      DEFAULT_CALENDAR_ID;
    const body = await buildEventBody(db, appointment, userId);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${encodeURIComponent(storedEvent.google_event_id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(
        `Google Calendar error ${response.status}: ${await response.text()}`,
      );
    }
  }
}

async function deleteOtherCalendarEvents(
  db: any,
  appointment: Appointment,
  sourceUserId: string,
) {
  const participantIds = getParticipantIds(appointment).filter(
    (userId) => userId !== sourceUserId,
  );
  const connections = await getConnectionsByUserId(db, participantIds);
  const storedEvents = await getStoredEventsByUserId(db, appointment);

  for (const userId of participantIds) {
    const connection = connections.get(userId);
    const storedEvent = storedEvents.get(userId);
    if (!connection || !storedEvent) continue;

    const accessToken = await refreshAccessToken(db, connection);
    const calendarId =
      storedEvent.google_calendar_id ||
      connection.calendar_id ||
      DEFAULT_CALENDAR_ID;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${encodeURIComponent(storedEvent.google_event_id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(
        `Google Calendar error ${response.status}: ${await response.text()}`,
      );
    }
  }

  await db.from("cita_google_events").delete().eq("cita_id", appointment.id);
}

async function upsertCurrentEvent(
  db: any,
  appointmentId: string,
  userId: string,
  eventId: string,
  calendarId: string,
) {
  const { error } = await db.from("cita_google_events").upsert({
    cita_id: appointmentId,
    user_id: userId,
    google_event_id: eventId,
    google_calendar_id: calendarId,
    sync_origin: "google",
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
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

      const appointment = await getAppointment(db, appointmentId);
      if (!appointment) continue;

      await upsertCurrentEvent(
        db,
        appointment.id,
        typedConnection.user_id,
        event.id,
        typedConnection.calendar_id || DEFAULT_CALENDAR_ID,
      );

      if (event.status === "cancelled") {
        const wasAlreadyCancelled = appointment.estado === "cancelada";
        const { error } = await db
          .from("citas")
          .update({
            estado: "cancelada",
            google_event_id: null,
            google_calendar_id: null,
            google_sync_origin: "google",
            google_last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointmentId);
        if (error) throw error;

        if (!wasAlreadyCancelled) {
          await deleteOtherCalendarEvents(db, appointment, typedConnection.user_id);
          await sendPush(
            appointment.agente_id,
            "Cita cancelada desde Google Calendar",
            "Ilyrox actualizó la cita porque fue cancelada en Google Calendar.",
          );
          changed++;
        }
        continue;
      }

      const dateTime = getDateAndTime(event);
      if (!dateTime) continue;

      const alreadySameDateTime =
        appointment.fecha === dateTime.fecha && appointment.hora === dateTime.hora;
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

      if (!alreadySameDateTime) {
        await updateOtherCalendarEvents(
          db,
          { ...appointment, fecha: dateTime.fecha, hora: dateTime.hora },
          typedConnection.user_id,
        );
        await sendPush(
          appointment.agente_id,
          "Cita modificada desde Google Calendar",
          "Ilyrox actualizó la cita con el nuevo horario de Google Calendar.",
        );
        changed++;
      }
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