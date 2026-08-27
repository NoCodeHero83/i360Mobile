import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { blockService } from "@/services/blockService";
import { useAuth } from "@/context/AuthContext";
import { logger } from "@/utils/logger";

const log = logger.scoped("usePropertyDetails");

const usePropertyDetails = (feedItemId: string) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [propertyDetails, setPropertyDetails] = useState<any>(null);
  const [error] = useState(null);

  const fetchPropertyDetails = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("propiedades")
        .select(
          `
                    *,
                    operaciones:operaciones_propiedad(*),
                    perfil:perfiles!propiedades_creado_por_fkey(*),
                    amenidades:propiedad_amenidades(amenidad:catalogo_amenidades(nombre)),
                    gravamenes:propiedad_gravamenes(*, institucion:catalogo_instituciones_financieras(nombre)),
                    financiamientos:propiedad_financiamientos(tipo:catalogo_tipos_financiamiento(nombre))
                    `,
        )
        .eq("id", feedItemId)
        .single();

      if (error) throw error;

      const blockedUserIds = await blockService.getBlockedUserIds(user?.id);
      if (data?.created_by && blockedUserIds.includes(data.created_by)) {
        setPropertyDetails(null);
        return;
      }

      const { data: feed_items, error: feed_items_error } = await supabase
        .from("feed_items")
        .select("*")
        .eq("contenido_id", feedItemId)
        .single();

      setPropertyDetails({
        ...data,
        feed_items: feed_items || {},
      });

      if (feed_items_error) {
        log.warn("No feed_item found for property:");
      }
    } catch (error) {
      log.error("Error fetching property details:", error);
    } finally {
      setLoading(false);
    }
  }, [feedItemId, user?.id]);

  useEffect(() => {
    fetchPropertyDetails();
  }, [fetchPropertyDetails]);

  return { propertyDetails, loading, error, refetch: fetchPropertyDetails };
};

export default usePropertyDetails;