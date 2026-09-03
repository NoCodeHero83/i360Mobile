import { create } from 'zustand';
import { supabase } from '../lib/supabase';

/**
 * Store simple para notificaciones
 * 
 * NOTA: El Realtime y fetching de notificaciones está centralizado en
 * NotificationContext. Este store solo proporciona funciones auxiliares
 * para casos específicos donde no se puede usar el contexto.
 */

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  feed_item_id: string | null;
  data: Record<string, unknown>;
  estado: 'pendiente' | 'leida';
  leida_en: string | null;
  created_at: string;
}

interface NotificacionStore {
  markAsRead: (notificationId: string, userId: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
}

export const useNotificacionStore = create<NotificacionStore>((set, get) => ({
  markAsRead: async (notificationId: string, userId: string) => {
    try {
      const { error } = await supabase.rpc('mark_notification_as_read', {
        p_notification_id: notificationId,
        p_user_id: userId
      });
      
      if (error) {
        console.error('Error marking as read:', error);
      }
    } catch (err) {
      console.error('Exception marking as read:', err);
    }
  },
  
  markAllAsRead: async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ estado: 'leida', leida_en: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('estado', 'pendiente');
      
      if (error) {
        console.error('Error marking all as read:', error);
      }
    } catch (err) {
      console.error('Exception marking all as read:', err);
    }
  },
}));
