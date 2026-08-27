import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { profileService } from "../../services/profileService";
import { propertyService } from "../../services/propertyService";
import { postsService } from "../../services/postsService";
import { reelService } from "../../services/reelService";
import { perfiles, EstadisticasResenas, Property, Post, Reel } from "@/types";
import {
  useProfileStore,
  useAuthProfileStore,
  RecommendedByUser,
} from "@/store/profileStore";
import { logger } from "@/utils/logger";

const log = logger.scoped("useProfile");

export type { RecommendedByUser };

interface UseProfileReturn {
  profile: perfiles | null;
  reviewStats: EstadisticasResenas | null;
  userRecommendation: boolean | null;
  properties: Property[];
  posts: Post[];
  reels: Reel[];
  recommendedByUsers: RecommendedByUser[];
  recommendedByHasMore: boolean;
  loadingRecommendedBy: boolean;
  recommendedByError: string | null;
  notRecommendedByUsers: RecommendedByUser[];
  notRecommendedByHasMore: boolean;
  loadingNotRecommendedBy: boolean;
  notRecommendedByError: string | null;
  loading: boolean;
  submittingRecommendation: boolean;
  isMe: boolean;
  fetchProfileData: () => Promise<void>;
  handleRecommendation: (recomienda: boolean) => Promise<boolean | null | void>;
  loadRecommendedByUsers: (options?: { reset?: boolean }) => Promise<void>;
  loadNotRecommendedByUsers: (options?: { reset?: boolean }) => Promise<void>;
  updateProfilePhoto: (newUrl: string) => void;
}

export const useProfile = (userId?: string | null): UseProfileReturn => {
  const { user: authUser, profile: authProfile, refreshProfile } = useAuth();
  const targetUserId = userId || authUser?.id;
  const isMe = !userId || targetUserId === authUser?.id;

  // Use selectors for data to ensure stability of the hook itself
  // and to only trigger re-renders on relevant data changes
  const activeStore = isMe ? useAuthProfileStore : useProfileStore;
  const state = activeStore();

  // Prevents infinite loop by using a ref to check if a fetch is in progress
  // and by NOT depending on the whole 'state' object in callbacks
  const isFetchingRef = useRef(false);
  const prevUserId = useRef<string | null | undefined>(null);

  useEffect(() => {
    if (targetUserId !== prevUserId.current) {
      if (!isMe) {
        useProfileStore.getState().resetProfileState();
      }
      prevUserId.current = targetUserId;
    }
  }, [targetUserId, isMe]);

  const fetchProfileData = useCallback(async () => {
    if (!targetUserId || isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      const storeActions = activeStore.getState();
      storeActions.setLoading(true);

      const profilePromise = (async () => {
        if (isMe && authProfile) return authProfile;
        return await profileService.getProfile(targetUserId);
      })();

      const statsPromise = profileService.getReviewStats(
        targetUserId,
        authUser?.id,
      );
      const recommendationPromise =
        !isMe && authUser?.id
          ? profileService.getUserRecommendation(authUser.id, targetUserId)
          : Promise.resolve(null);

      const propertiesPromise = propertyService.propertiesByUser(
        targetUserId,
        isMe,
      );
      const postsPromise = postsService.postsByUser(targetUserId);
      const reelsPromise = reelService.reelsByUser(targetUserId);

      const [
        fetchedProfile,
        fetchedStats,
        fetchedRecommendation,
        fetchedProperties,
        fetchedPosts,
        fetchedReels,
      ] = await Promise.all([
        profilePromise,
        statsPromise,
        recommendationPromise,
        propertiesPromise,
        postsPromise,
        reelsPromise,
      ]);

      storeActions.setProfile(fetchedProfile);
      storeActions.setReviewStats(fetchedStats);
      storeActions.setUserRecommendation(fetchedRecommendation);
      storeActions.setProperties(fetchedProperties as Property[]);
      storeActions.setPosts(fetchedPosts as Post[]);
      storeActions.setReels(fetchedReels as Reel[]);
    } catch (error) {
      log.error("Error fetching profile data:", error);
    } finally {
      activeStore.getState().setLoading(false);
      isFetchingRef.current = false;
    }
  }, [targetUserId, isMe, authProfile, authUser?.id, activeStore]);

  const loadRecommendedByUsers = useCallback(async (options?: { reset?: boolean }) => {
    if (!targetUserId) return;

    try {
      const storeState = activeStore.getState();
      const reset = options?.reset === true;
      storeState.setLoadingRecommendedBy(true);
      storeState.setRecommendedByError(null);

      const pageSize = 30;
      const nextPage = reset ? 0 : storeState.recommendedByPage;
      const from = nextPage * pageSize;
      const to = from + pageSize - 1;

      const results = await profileService.getRecommendedByUsers(
        targetUserId,
        from,
        to,
        true,
        authUser?.id,
      );

      const mappedUsers = results as RecommendedByUser[];

      storeState.setRecommendedByUsers((prev) =>
        reset ? mappedUsers : [...prev, ...mappedUsers],
      );

      storeState.setRecommendedByHasMore(mappedUsers.length === pageSize);
      storeState.setRecommendedByPage((p) => (reset ? 1 : p + 1));
    } catch (error: any) {
      const storeState = activeStore.getState();
      if (options?.reset) {
        storeState.setRecommendedByUsers([]);
      }
      storeState.setRecommendedByHasMore(false);
      storeState.setRecommendedByError(
        error?.message || "Error al cargar recomendaciones",
      );
    } finally {
      const storeState = activeStore.getState();
      storeState.setLoadingRecommendedBy(false);
      // Marcamos que ya se intentó cargar (con éxito o vacío) para evitar
      // que un useEffect dispare la carga en bucle cuando el resultado es vacío.
      storeState.setRecommendedByLoaded(true);
    }
  }, [targetUserId, activeStore, authUser?.id]);

  const loadNotRecommendedByUsers = useCallback(async (options?: { reset?: boolean }) => {
    if (!targetUserId) return;

    try {
      const storeState = activeStore.getState();
      const reset = options?.reset === true;
      storeState.setLoadingNotRecommendedBy(true);
      storeState.setNotRecommendedByError(null);

      const pageSize = 30;
      const nextPage = reset ? 0 : storeState.notRecommendedByPage;
      const from = nextPage * pageSize;
      const to = from + pageSize - 1;

      const results = await profileService.getRecommendedByUsers(
        targetUserId,
        from,
        to,
        false,
        authUser?.id,
      );

      const mappedUsers = results as RecommendedByUser[];

      storeState.setNotRecommendedByUsers((prev) =>
        reset ? mappedUsers : [...prev, ...mappedUsers],
      );

      storeState.setNotRecommendedByHasMore(mappedUsers.length === pageSize);
      storeState.setNotRecommendedByPage((p) => (reset ? 1 : p + 1));
    } catch (error: any) {
      const storeState = activeStore.getState();
      if (options?.reset) {
        storeState.setNotRecommendedByUsers([]);
      }
      storeState.setNotRecommendedByHasMore(false);
      storeState.setNotRecommendedByError(
        error?.message || "Error al cargar recomendaciones",
      );
    } finally {
      const storeState = activeStore.getState();
      storeState.setLoadingNotRecommendedBy(false);
      storeState.setNotRecommendedByLoaded(true);
    }
  }, [targetUserId, activeStore, authUser?.id]);

  const handleRecommendation = useCallback(async (recomienda: boolean): Promise<boolean | null | void> => {
    const storeState = activeStore.getState();
    if (!authUser?.id || !targetUserId || isMe || storeState.submittingRecommendation)
      return;

    const prev = storeState.userRecommendation;
    // Optimista: el botón refleja el voto AL INSTANTE (sin esperar a la red).
    // Si se repite el mismo voto se alterna (toggle off). Se revierte si falla.
    const optimistic = prev === recomienda ? null : recomienda;

    try {
      storeState.setSubmittingRecommendation(true);
      storeState.setUserRecommendation(optimistic);

      const newStatus = await profileService.toggleRecommendation(
        authUser.id,
        targetUserId,
        prev,
        recomienda,
      );

      storeState.setUserRecommendation(newStatus);

      const newStats = await profileService.getReviewStats(
        targetUserId,
        authUser.id,
      );
      if (newStats) {
        storeState.setReviewStats(newStats);
      }

      // Refrescamos ambas listas para que el cambio se vea de inmediato:
      // quien acaba de recomendar (o dejar de hacerlo) aparece/desaparece
      // y se mueve entre la lista positiva y la negativa según corresponda.
      await Promise.all([
        loadRecommendedByUsers({ reset: true }),
        loadNotRecommendedByUsers({ reset: true }),
      ]);

      return newStatus;
    } catch (error) {
      log.error("Error updating recommendation:", error);
      // Revertir el optimista si la red falló.
      activeStore.getState().setUserRecommendation(prev);
    } finally {
      activeStore.getState().setSubmittingRecommendation(false);
    }
  }, [
    authUser?.id,
    targetUserId,
    isMe,
    activeStore,
    loadRecommendedByUsers,
    loadNotRecommendedByUsers,
  ]);

  const updateProfilePhoto = useCallback(
    (newUrl: string) => {
      const currentProfile = activeStore.getState().profile;
      activeStore.getState().setProfile(
        currentProfile ? { ...currentProfile, foto: newUrl } : null,
      );

      // Sincronizar también el perfil cacheado del AuthContext. Sin esto, el
      // store queda con la foto nueva pero `authProfile` con la vieja; como
      // `fetchProfileData` para el perfil propio (isMe) devuelve `authProfile`,
      // el siguiente refetch (pull-to-refresh, navegar, borrar un item)
      // reescribe la foto VIEJA encima de la nueva y parece que no se guardó.
      if (isMe && authProfile) {
        refreshProfile({ ...authProfile, foto: newUrl });
      }
    },
    [activeStore, isMe, authProfile, refreshProfile],
  );

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  return {
    profile: state.profile,
    reviewStats: state.reviewStats,
    userRecommendation: state.userRecommendation,
    properties: state.properties,
    posts: state.posts,
    reels: state.reels,
    recommendedByUsers: state.recommendedByUsers,
    recommendedByHasMore: state.recommendedByHasMore,
    loadingRecommendedBy: state.loadingRecommendedBy,
    recommendedByError: state.recommendedByError,
    notRecommendedByUsers: state.notRecommendedByUsers,
    notRecommendedByHasMore: state.notRecommendedByHasMore,
    loadingNotRecommendedBy: state.loadingNotRecommendedBy,
    notRecommendedByError: state.notRecommendedByError,
    loading: state.loading,
    submittingRecommendation: state.submittingRecommendation,
    isMe,
    fetchProfileData,
    handleRecommendation,
    loadRecommendedByUsers,
    loadNotRecommendedByUsers,
    updateProfilePhoto,
  };
};