import React, { useEffect, useRef, memo } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { COLORS } from "@/constants/colors";

interface ShimmerProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}

const Shimmer = memo(function Shimmer({
  width,
  height,
  borderRadius = 4,
  style,
}: ShimmerProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: "#e0e0e0",
          opacity,
        },
        style,
      ]}
    />
  );
});

interface FeedShimmerCardProps {
  type: "property" | "reel" | "post";
}

const FeedShimmerCard = memo(function FeedShimmerCard({ type }: FeedShimmerCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const imageHeight = type === "property" ? 200 : type === "reel" ? 300 : 180;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatarWrap}>
          <Shimmer width={44} height={44} borderRadius={22} />
        </View>
        <View style={styles.headerText}>
          <Shimmer width={120} height={14} borderRadius={4} style={styles.nameShimmer} />
          <Shimmer width={80} height={10} borderRadius={4} style={styles.timeShimmer} />
        </View>
      </View>

      <View style={styles.imageWrap}>
        <Shimmer width={cardWidth - 16} height={imageHeight} borderRadius={8} />
      </View>

      <View style={styles.content}>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Shimmer width={24} height={24} borderRadius={12} />
            <Shimmer width={30} height={14} borderRadius={4} style={styles.metricText} />
          </View>
          <View style={styles.metric}>
            <Shimmer width={24} height={24} borderRadius={12} />
            <Shimmer width={30} height={14} borderRadius={4} style={styles.metricText} />
          </View>
          <View style={styles.metric}>
            <Shimmer width={24} height={24} borderRadius={12} />
            <Shimmer width={30} height={14} borderRadius={4} style={styles.metricText} />
          </View>
        </View>

        {type === "property" && (
          <>
            <Shimmer width="90%" height={16} borderRadius={4} style={styles.priceShimmer} />
            <Shimmer width="70%" height={12} borderRadius={4} style={styles.addressShimmer} />
            <View style={styles.featuresRow}>
              <Shimmer width={60} height={24} borderRadius={12} />
              <Shimmer width={60} height={24} borderRadius={12} />
              <Shimmer width={60} height={24} borderRadius={12} />
            </View>
          </>
        )}

        {type === "post" && (
          <>
            <Shimmer width="95%" height={14} borderRadius={4} style={styles.titleShimmer} />
            <Shimmer width="80%" height={14} borderRadius={4} />
          </>
        )}
      </View>
    </View>
  );
});

export const FeedShimmer = memo(function FeedShimmer() {
  return (
    <View style={styles.container}>
      <FeedShimmerCard type="property" />
      <FeedShimmerCard type="reel" />
      <FeedShimmerCard type="post" />
      <FeedShimmerCard type="post" />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  avatarWrap: {
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  nameShimmer: {
    marginBottom: 6,
  },
  timeShimmer: {},
  imageWrap: {
    paddingHorizontal: 8,
  },
  content: {
    padding: 12,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 12,
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricText: {},
  priceShimmer: {
    marginBottom: 8,
  },
  addressShimmer: {
    marginBottom: 12,
  },
  featuresRow: {
    flexDirection: "row",
    gap: 8,
  },
  titleShimmer: {
    marginBottom: 8,
  },
});
