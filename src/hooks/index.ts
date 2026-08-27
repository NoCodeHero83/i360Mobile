// hooks/index.ts - Export all custom hooks

export { useFeed, useFeedItem } from "./useFeed";
export { useLikes } from "./useLikes";
export { useComments } from "./useComments";
export { useShare } from "./useShare";
export { useUserApprovals } from "./useUserApprovals";
export { useUserBlock } from "./useUserBlock";
export { useViewTracking } from "./useViewTracking";

// Re-export existing hooks if you have them
export { useFeedInteractions } from "./useFeedInteractions";
export { useImageGallery } from "./useImageGallery";
export { useVideoPlayer } from "./useVideoPlayer";
export { useImageUpload } from "./useImageUpload";
export { useVideoUpload } from "./useVideoUpload";
export { useCurrentUserId } from "./useCurrentUserId";
export { useSearch } from "./useSearch";
export { notifyMatchingUsers } from "./useMatchNotifier";