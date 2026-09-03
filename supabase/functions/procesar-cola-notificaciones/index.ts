/**
 * PROCESAR COLA DE NOTIFICACIONES - PUSH ONLY v2
 * Solo envía Push Notifications, no guarda en tablas
 * 
 * Formato Push:
 * - heading: "Tienes 1 nuevo comentario" / "Tienes 6 nuevos comentarios"
 * - content: "Juan Perez y Maria Lopez comentaron tu publicación en 'Casa'"
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";

interface RequestBody {
  tipo: "immediate_push" | "batch_push";
  notification_id?: string;
  lock_key?: string;
  message_count?: number;
  triggered_at?: string;
}

async function createSupabaseClient() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function getNotificationById(notificationId: string) {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("id", notificationId)
    .single();
  
  if (error) throw error;
  return data;
}

async function getNotificationByLockKey(lockKey: string) {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("lock_key", lockKey)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAuthorShortNames(authorIds: string[]): Promise<string[]> {
  if (!authorIds || authorIds.length === 0) return [];
  
  const supabase = await createSupabaseClient();
  
  const { data } = await supabase
    .from("perfiles")
    .select("nombre, apellido_paterno")
    .in("id", authorIds);
  
  return (data || []).map(p => {
    const nombre = p.nombre || '';
    const apellido = p.apellido_paterno || '';
    return `${nombre} ${apellido}`.trim() || 'Alguien';
  });
}

function formatNamesString(names: string[], totalCount: number): string {
  const count = names.length;
  
  if (count === 0) return 'Alguien';
  if (count === 1) return names[0];
  if (count === 2) return `${names[0]} y ${names[1]}`;
  if (count === 3) return `${names[0]}, ${names[1]} y ${names[2]}`;
  if (count === 4) return `${names[0]}, ${names[1]}, ${names[2]} y ${names[3]}`;
  return `${names[0]} y ${totalCount - 1} personas`;
}

function formatPushHeading(totalCount: number, lockType: string): string {
  if (lockType === 'comment') {
    return totalCount === 1 
      ? 'Tienes 1 respuesta a tu comentario'
      : `Tienes ${totalCount} respuestas a tu comentario`;
  }
  return totalCount === 1 
    ? 'Tienes 1 nuevo comentario'
    : `Tienes ${totalCount} nuevos comentarios`;
}

function formatMessageContent(names: string[], totalCount: number, lockType: string, postTitle: string): string {
  const nameStr = formatNamesString(names, totalCount);
  const suffix = postTitle ? ` en "${postTitle}"` : '';
  
  if (lockType === 'comment') {
    if (totalCount === 1) {
      return `${nameStr} respondió a tu comentario${suffix}`;
    }
    return `${nameStr} respondieron a tu comentario${suffix}`;
  }
  
  if (totalCount === 1) {
    return `${nameStr} comentó tu publicación${suffix}`;
  }
  return `${nameStr} comentaron tu publicación${suffix}`;
}

async function sendToOneSignal(
  userIds: string[],
  heading: string,
  content: string,
  data: Record<string, unknown>
): Promise<void> {
  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: userIds,
      headings: { en: heading },
      contents: { en: content },
      data,
      ios_sound: "audio_ilyrox.wav",
      android_sound: "audio_ilyrox",
      android_channel_id: "custom_sound",
      adm_sound: "audio_ilyrox"
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OneSignal error ${response.status}: ${errorText}`);
  }
}

async function logPushResult(
  userId: string,
  lockKey: string,
  titulo: string,
  mensaje: string,
  estado: "enviada" | "fallida",
  errorMessage?: string
): Promise<void> {
  const supabase = await createSupabaseClient();
  
  await supabase.from("notificaciones_log").insert({
    user_id: userId,
    titulo,
    mensaje,
    screen: "push_notification",
    additional_data: { lock_key: lockKey },
    estado,
    error_message: errorMessage || null
  });
}

async function markAsPushed(notificationId: string): Promise<void> {
  const supabase = await createSupabaseClient();
  
  await supabase
    .from("user_notifications")
    .update({
      push_estado: "enviada"
    })
    .eq("id", notificationId);
}

async function readQueuedMessages(): Promise<any[]> {
  const supabase = await createSupabaseClient();
  
  const { data, error } = await supabase.rpc("read_notification_queue");
  
  if (error) throw error;
  
  return (data || []).map((row: any) => ({
    msg_id: row.msg_id,
    message: typeof row.message === 'string' ? JSON.parse(row.message) : row.message,
    vt: row.vt
  }));
}

async function deleteMessage(msgId: number): Promise<void> {
  const supabase = await createSupabaseClient();
  await supabase.rpc("delete_from_notification_queue", { p_msg_id: msgId });
}

async function sendPush(notification: any): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = notification.user_id;
    const data = notification.data || {};
    const authorIds = data.author_ids || [];
    const totalCount = data.total_count || 1;
    const lockType = data.lock_type || 'post';
    const lockKey = notification.lock_key;
    const feedItemId = notification.feed_item_id;
    const postTitle = ''; // Se puede obtener de la notificación si es necesario
    
    const authorNames = await getAuthorShortNames(authorIds);
    const heading = formatPushHeading(totalCount, lockType);
    const content = formatMessageContent(authorNames, totalCount, lockType, postTitle);
    
    console.log(`Enviando push: "${heading}" - "${content}"`);
    
    await sendToOneSignal(
      [userId],
      heading,
      content,
      {
        type: "comment_notification",
        feed_item_id: feedItemId,
        lock_key: lockKey,
        total_count: totalCount,
        notification_id: notification.id
      }
    );
    
    await logPushResult(userId, lockKey, heading, content, "enviada");
    await markAsPushed(notification.id);
    
    console.log(`Push enviado: ${notification.id}`);
    return { success: true };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error enviando push:`, error);
    return { success: false, error: errorMsg };
  }
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  console.log("==========================================");
  console.log("Edge Function: Procesar Push Notifications v2");
  console.log("==========================================");
  
  try {
    const body: RequestBody = await req.json();
    console.log("Tipo:", body.tipo);
    
    if (body.tipo === "immediate_push") {
      console.log("Procesando PUSH INMEDIATO");
      
      let notification;
      if (body.notification_id) {
        notification = await getNotificationById(body.notification_id);
      } else if (body.lock_key) {
        notification = await getNotificationByLockKey(body.lock_key);
      }
      
      if (!notification) {
        console.log("Notificación no encontrada");
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Notificación no encontrada" 
        }), { headers: { "Content-Type": "application/json" } });
      }
      
      const result = await sendPush(notification);
      
      return new Response(JSON.stringify({
        success: result.success,
        tipo: "immediate_push",
        notification_id: notification.id,
        error: result.error,
        duration_ms: Date.now() - startTime
      }), { headers: { "Content-Type": "application/json" } });
      
    } else if (body.tipo === "batch_push") {
      console.log("Procesando BATCH PUSH");
      
      const messages = await readQueuedMessages();
      console.log(`Mensajes en cola: ${messages.length}`);
      
      if (messages.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          tipo: "batch_push",
          processed: 0,
          duration_ms: Date.now() - startTime
        }), { headers: { "Content-Type": "application/json" } });
      }
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const msg of messages) {
        const notification = await getNotificationByLockKey(msg.message.lock_key);
        
        if (notification) {
          const result = await sendPush(notification);
          if (result.success) successCount++;
          else errorCount++;
        }
        
        await deleteMessage(msg.msg_id);
      }
      
      console.log(`Batch completado: ${successCount} ok, ${errorCount} errores`);
      
      return new Response(JSON.stringify({
        success: true,
        tipo: "batch_push",
        processed: successCount,
        errors: errorCount,
        duration_ms: Date.now() - startTime
      }), { headers: { "Content-Type": "application/json" } });
    }
    
    throw new Error(`Tipo desconocido: ${body.tipo}`);
    
  } catch (error) {
    console.error("Error general:", error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      duration_ms: Date.now() - startTime
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
