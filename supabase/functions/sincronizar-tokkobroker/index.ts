import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKKO_BASE_URL = 'https://www.tokkobroker.com/api/v1';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';

interface TokkoApiResponse {
  meta: {
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total_count: number;
  };
  objects: TokkoProperty[];
}

interface TokkoProperty {
  id: number;
  publication_title: string;
  reference_code: string;
  address: string;
  location: {
    full_location: string;
    short_location: string;
    zip_code?: string;
  };
  geo_lat?: string;
  geo_long?: string;
  type: { name: string };
  operations: Array<{
    operation_type: string;
    prices: Array<{
      price: string | number;
      currency: string;
    }>;
  }>;
  bathroom_amount?: number;
  parking_lot_amount?: number;
  surface?: string;
  total_surface?: string;
  bedrooms?: number;
  age?: number;
  photos: Array<{ image: string }>;
  tags: Array<{ name: string }>;
  created_at?: string;
  updated_at?: string;
  description?: string;
}

interface SyncState {
  processed: number;
  new: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorDetails: Array<{ message: string; property_id?: string }>;
  totalPublished: number;
}

// TokenBucket and CircuitBreaker removed (not needed for stable API)

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<{ data: T | null; etag?: string; error?: string; status: number }> {
  console.log('[Tokko] Fetching:', url);
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        console.log('[Tokko] Rate limited, waiting:', retryAfter);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      if (!response.ok && response.status !== 304) {
        const errorText = await response.text();
        console.error('[Tokko] HTTP Error:', response.status, errorText);
        return { data: null, error: `HTTP ${response.status}: ${errorText}`, status: response.status };
      }

      const etag = response.headers.get('ETag') || undefined;
      const data = response.status !== 304 ? await response.json() : null;
      console.log('[Tokko] Fetch success, data keys:', data ? Object.keys(data) : null, 'status:', response.status);
      return { data: data as T, etag, status: response.status };
    } catch (error: any) {
      console.error('[Tokko] Fetch error attempt', attempt + 1, ':', error.message);
      if (attempt === maxRetries - 1) {
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, jitter));
        return { data: null, error: error.message, status: 0 };
      }
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      const jitter = Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }
  return { data: null, error: 'Max retries exceeded', status: 0 };
}

async function sendPushNotification(
  userId: string,
  heading: string,
  content: string,
  data: Record<string, string>
): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.log('[Tokko] OneSignal not configured, skipping push');
    return;
  }

  try {
    await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [userId],
        headings: { es: heading, en: heading },
        contents: { es: content, en: content },
        data,
      }),
    });
    console.log('[Tokko] Push notification sent');
  } catch (error) {
    console.error('[Tokko] Failed to send push notification:', error);
  }
}

async function getConfig(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from('tokkobroker_config')
    .select('*')
    .eq('usuario_id', userId)
    .single();
  return data;
}

async function updateSyncStatus(
  supabaseAdmin: any,
  syncId: string,
  status: string,
  state?: Partial<SyncState>,
  userId?: string
) {
  try {
    console.log('[Tokko] updateSyncStatus called:', { syncId, status, userId });
    const updateData: any = { status };
    if (state) {
      updateData.propiedades_procesadas = state.processed;
      updateData.propiedades_nuevas = state.new;
      updateData.propiedades_actualizadas = state.updated;
      updateData.propiedades_sin_cambios = state.unchanged;
      updateData.errores = state.errors;
      updateData.errores_detalle = state.errorDetails?.length > 0 ? state.errorDetails : null;
      updateData.total_publicadas = state.totalPublished;
    }
    if (status === 'completada' || status === 'error' || status === 'cancelada') {
      updateData.completed_at = new Date().toISOString();
    }

    await supabaseAdmin
      .from('sincronizaciones_tokkobroker')
      .update(updateData)
      .eq('id', syncId);

    console.log('[Tokko] Sync record updated for syncId:', syncId);

    if (status === 'completada' || status === 'error' || status === 'cancelada') {
      if (!userId) {
        console.error('[Tokko] ERROR: Cannot update tokkobroker_config without userId');
        return;
      }
      console.log('[Tokko] Updating tokkobroker_config for user:', userId, 'status:', status);
      await supabaseAdmin
        .from('tokkobroker_config')
        .update({
          sincronizacion_en_progreso: false,
          sincronizacion_actual_id: null,
          ultima_sincronizacion: status === 'completada' ? new Date().toISOString() : undefined,
          total_propiedades_sincronizadas: state?.totalPublished,
        })
        .eq('usuario_id', userId);
      console.log('[Tokko] tokkobroker_config updated successfully');
    }
    console.log('[Tokko] Sync status updated:', status);
  } catch (error: any) {
    console.error('[Tokko] Error updating sync status:', error.message);
  }
}

async function sendNotification(
  supabaseAdmin: any,
  userId: string,
  syncId: string,
  state: SyncState
) {
  let title = 'Toko Broker';
  let message = '';

  if (state.errors > 0 && state.new === 0 && state.updated === 0) {
    title = 'Toko Broker: Error';
    message = 'No se pudieron sincronizar las propiedades. Intenta de nuevo.';
  } else if (state.new === 0 && state.updated === 0) {
    title = 'Toko Broker: Sincronizado';
    message = 'Todas las propiedades ya estaban actualizadas.';
  } else {
    title = 'Toko Broker: Sincronización completada';
    const parts = [];
    if (state.new > 0) parts.push(`${state.new} nueva${state.new > 1 ? 's' : ''}`);
    if (state.updated > 0) parts.push(`${state.updated} actualizada${state.updated > 1 ? 's' : ''}`);
    if (state.errors > 0) parts.push(`${state.errors} error${state.errors > 1 ? 'es' : ''}`);
    message = parts.join(', ') + '.';
  }

  try {
    const { error } = await supabaseAdmin.rpc('enviar_notificacion_push', {
      p_user_id: userId,
      p_title: title,
      p_message: message,
      p_screen: 'tokko-broker',
      p_additional_data: {
        sync_id: syncId,
        propiedades_nuevas: state.new,
        propiedades_actualizadas: state.updated,
      },
    });

    if (error) {
      console.error('[Tokko] Failed to send notification:', error);
    } else {
      console.log('[Tokko] Notification sent:', title, message);
    }
  } catch (error: any) {
    console.error('[Tokko] Error sending notification:', error.message);
  }
}

serve(async (req) => {
  console.log('=================== TOKKO SYNC START ===================');
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json();
    const { test_only, sync_id, force, test_limit } = body;
    console.log('[Tokko] Request:', { test_only, sync_id, force, test_limit });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[Tokko] No authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) {
      console.error('[Tokko] User error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log('[Tokko] User authenticated:', user.id);

    const config = await getConfig(supabaseAdmin, user.id);
    console.log('[Tokko] Config:', config ? 'found' : 'not found');

    if (!config?.api_key) {
      console.error('[Tokko] No API key configured');
      return new Response(JSON.stringify({ error: 'No API key configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (test_only) {
      console.log('[Tokko] Testing API key...');
      const testResult = await fetchWithRetry<TokkoApiResponse>(
        `${TOKKO_BASE_URL}/property/?limit=1&format=json&key=${config.api_key}`,
        { method: 'GET' },
        new CircuitBreaker(3, 15000)
      );
      if (testResult.error) {
        console.error('[Tokko] API test failed:', testResult.error);
        return new Response(JSON.stringify({ error: 'API Key inválida o expirada' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const total = testResult.data?.meta?.total_count || 0;
      console.log('[Tokko] API test success, total properties:', total);
      return new Response(JSON.stringify({ success: true, total }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!sync_id) {
      console.error('[Tokko] No sync_id provided');
      return new Response(JSON.stringify({ error: 'sync_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate sync belongs to user
    const { data: syncRecord } = await supabaseAdmin
      .from('sincronizaciones_tokkobroker')
      .select('usuario_id, status')
      .eq('id', sync_id)
      .single();

    console.log('[Tokko] Sync record validation:', syncRecord);

    if (!syncRecord) {
      console.error('[Tokko] Sync not found:', sync_id);
      return new Response(JSON.stringify({ error: 'Sync no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (syncRecord.usuario_id !== user.id) {
      console.error('[Tokko] Sync does not belong to user:', sync_id, user.id);
      return new Response(JSON.stringify({ error: 'Sync no pertenece al usuario' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cleanup: Clear any stuck syncs for this user
    console.log('[Tokko] Cleaning up stuck syncs for user:', user.id);
    const { data: cleanupResult } = await supabaseAdmin
      .from('tokkobroker_config')
      .update({ sincronizacion_en_progreso: false, sincronizacion_actual_id: null })
      .eq('usuario_id', user.id)
      .eq('sincronizacion_en_progreso', true)
      .select();

    if (cleanupResult && cleanupResult.length > 0) {
      console.log('[Tokko] Cleaned up stuck syncs:', cleanupResult.length);
    }

    // Mark this sync as in progress
    await supabaseAdmin
      .from('tokkobroker_config')
      .update({ sincronizacion_en_progreso: true, sincronizacion_actual_id: sync_id })
      .eq('usuario_id', user.id);

    console.log('[Tokko] Starting sync, sync_id:', sync_id);

    const USE_RATE_LIMIT = false; // Disabled - Toko API doesn't have strict rate limits
    const state: SyncState = {
      processed: 0,
      new: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      errorDetails: [],
      totalPublished: 0,
    };

    const headers = {
      key: config.api_key,
      format: 'json',
      lang: 'es_ar',
    };

    let allProperties: any[] = [];
    const limit = 50;
    const PARALLEL_FETCH = 3;

    const etagHash = config.etag_hash;
    let currentEtag: string | undefined;
    let totalCount = 0;
    let totalPages = 0;

    console.log('[Tokko] Starting parallel fetch loop...');

    async function fetchPage(pageNum: number, forceFetch: boolean = false): Promise<{ objects: any[], meta: any }> {
      const params = new URLSearchParams({
        ...headers,
        limit: limit.toString(),
        offset: ((pageNum - 1) * limit).toString(),
      });

      const fetchOptions: RequestInit = { method: 'GET' };
      if (!force && etagHash && pageNum === 1 && !forceFetch) {
        fetchOptions.headers = { 'If-None-Match': etagHash };
      }

      const result = await fetchWithRetry<TokkoApiResponse>(
        `${TOKKO_BASE_URL}/property/?${params}`,
        fetchOptions
      );

      if (result.error) {
        console.error(`[Tokko] Fetch page ${pageNum} error:`, result.error);
        state.errors++;
        state.errorDetails.push({ message: `Page ${pageNum}: ${result.error}` });
        return { objects: [], meta: null };
      }

      if (result.etag && pageNum === 1) {
        currentEtag = result.etag.replace(/"/g, '');
      }

      return {
        objects: result.data?.objects || [],
        meta: result.data?.meta || null,
        status: result.status
      };
    }

    const firstPageResult = await fetchPage(1);

    // ETag 304 Not Modified - skip sync completely
    if (firstPageResult.status === 304) {
      console.log('[Tokko] ETag unchanged (304), skipping sync');
      state.unchanged = 0;
      await updateSyncStatus(supabaseAdmin, sync_id, 'completada', state, user.id);
      return new Response(JSON.stringify({ success: true, skipped: true, message: 'No changes since last sync', state }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (firstPageResult.objects.length === 0 && !firstPageResult.meta) {
      console.log('[Tokko] No data received');
      await updateSyncStatus(supabaseAdmin, sync_id, 'completada', state, user.id);
      return new Response(JSON.stringify({ success: true, message: 'No data received', state }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    allProperties.push(...firstPageResult.objects);
    totalCount = firstPageResult.meta?.total_count || allProperties.length;
    state.totalPublished = totalCount;

    if (test_limit) {
      allProperties = allProperties.slice(0, test_limit);
    }

    if (firstPageResult.objects.length < limit || !firstPageResult.meta?.next) {
      console.log(`[Tokko] Only one page (${allProperties.length} properties)`);
    } else {
      totalPages = Math.ceil(totalCount / limit);
      console.log(`[Tokko] Total pages to fetch: ${totalPages}, fetching in groups of ${PARALLEL_FETCH}`);

      for (let pageGroup = 2; pageGroup <= totalPages; pageGroup += PARALLEL_FETCH) {
        const pagesToFetch: number[] = [];
        for (let i = 0; i < PARALLEL_FETCH; i++) {
          const pg = pageGroup + i;
          if (pg <= totalPages) pagesToFetch.push(pg);
        }

        console.log(`[Tokko] Fetching pages: ${pagesToFetch.join(', ')}`);
        const results = await Promise.all(pagesToFetch.map(pg => fetchPage(pg)));

        for (const pageResult of results) {
          if (test_limit && allProperties.length >= test_limit) break;
          const remaining = test_limit ? test_limit - allProperties.length : pageResult.objects.length;
          allProperties.push(...pageResult.objects.slice(0, remaining));
        }

        state.totalPublished = allProperties.length;
      }
    }

    console.log('[Tokko] Total properties collected:', allProperties.length);

    if (allProperties.length === 0) {
      console.log('[Tokko] No properties to insert');
      await updateSyncStatus(supabaseAdmin, sync_id, 'completada', state, user.id);
      await sendNotification(supabaseAdmin, user.id, sync_id, state);
      return new Response(JSON.stringify({ success: true, state }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[Tokko] Starting bulk insert with single RPC for ${allProperties.length} properties`);

    try {
      const { data: bulkResult, error: bulkError } = await supabaseAdmin.rpc(
        'bulk_insertar_propiedades_tokkobroker_full',
        {
          p_usuario_id: user.id,
          p_propiedades: allProperties,
        }
      );

      if (bulkError) {
        console.error('[Tokko] Bulk insert error:', bulkError.message);
        state.errors += allProperties.length;
        state.errorDetails.push({ message: `Bulk insert: ${bulkError.message}` });
      } else if (bulkResult?.success) {
        console.log('[Tokko] Bulk insert success:', bulkResult);
        state.new = bulkResult.nuevas || 0;
        state.updated = bulkResult.actualizadas || 0;
        state.unchanged = bulkResult.sin_cambios || 0;
        state.processed = (bulkResult.nuevas || 0) + (bulkResult.actualizadas || 0) + (bulkResult.sin_cambios || 0);
        console.log(`[Tokko] Sync summary - new: ${state.new}, updated: ${state.updated}, unchanged: ${state.unchanged}, total_api: ${bulkResult.total_api}`);
      } else {
        console.warn('[Tokko] Bulk insert unexpected result:', bulkResult);
        state.errors += allProperties.length;
      }
    } catch (bulkErr: any) {
      console.error('[Tokko] Bulk insert exception:', bulkErr.message);
      state.errors += allProperties.length;
      state.errorDetails.push({ message: `Bulk insert exception: ${bulkErr.message}` });
    }

    // Mark eliminated properties
    const tokkoIds = allProperties.map((p: any) => String(p.id));
    console.log('[Tokko] Marking eliminated properties, count:', tokkoIds.length);

    // Helper functions for parallel operations (Supabase doesn't return native Promises)
    const markEliminated = async () => {
      if (tokkoIds.length === 0) return { data: null };
      try {
        const { data, error } = await supabaseAdmin.rpc('marcar_propiedades_eliminadas_tokkobroker', {
          p_usuario_id: user.id,
          p_tokkobroker_ids: tokkoIds,
        });
        if (error) throw error;
        return { data };
      } catch (markErr: any) {
        console.error('[Tokko] Error marking eliminated:', markErr.message);
        return { data: null };
      }
    };

    const countProperties = async () => {
      try {
        const { count, error } = await supabaseAdmin
          .from('propiedades')
          .select('*', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .eq('es_tokkobroker', true)
          .is('deleted_at', null);
        if (error) throw error;
        return { count };
      } catch (countErr: any) {
        console.error('[Tokko] Error counting properties:', countErr.message);
        return { count: null };
      }
    };

    const updateEtag = async () => {
      if (!currentEtag || currentEtag === etagHash) return null;
      try {
        const { error } = await supabaseAdmin
          .from('tokkobroker_config')
          .update({ etag_hash: currentEtag })
          .eq('usuario_id', user.id);
        if (error) throw error;
        return true;
      } catch (etagErr: any) {
        console.error('[Tokko] Error updating etag:', etagErr.message);
        return null;
      }
    };

    // Execute all independent operations in parallel
    const [markResult, countResult, etagResult] = await Promise.all([
      markEliminated(),
      countProperties(),
      updateEtag()
    ]);

    console.log('[Tokko] Mark eliminated result:', markResult?.data);
    console.log('[Tokko] Real properties in DB:', countResult?.count);
    state.totalPublished = countResult?.count || state.totalPublished;

    console.log('[Tokko] Final state:', JSON.stringify(state));

    // Update sync status
    await updateSyncStatus(supabaseAdmin, sync_id, 'completada', state, user.id);

    // Send notification async (non-blocking)
    sendNotification(supabaseAdmin, user.id, sync_id, state).catch((err: any) => {
      console.error('[Tokko] Notification error:', err.message);
    });

    console.log('=================== TOKKO SYNC END ===================');
    return new Response(JSON.stringify({ success: true, state }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Tokko] Sync error:', error);
    console.log('=================== TOKKO SYNC ERROR ===================');
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
