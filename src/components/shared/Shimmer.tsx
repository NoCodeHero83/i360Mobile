import React, { useEffect, useRef, memo } from "react";
import { Animated, StyleSheet, View } from "react-native";
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

export const ShimmerCard = memo(function ShimmerCard({
  width,
}: {
  width: number;
}) {
  return (
    <View style={[styles.shimmerCard, { width }]}>
      <View style={styles.shimmerAvatarWrap}>
        <Shimmer width={72} height={72} borderRadius={36} />
      </View>

      <Shimmer width={80} height={17} borderRadius={4} style={styles.shimmerName} />

      <View style={styles.shimmerMetricRow}>
        <Shimmer width={15} height={15} borderRadius={7} />
        <Shimmer width={30} height={15} borderRadius={4} />
      </View>

      <Shimmer width={75} height={11} borderRadius={4} style={styles.shimmerLabel} />

      <View style={styles.shimmerDivider} />

      <View style={styles.shimmerMetricRow}>
        <Shimmer width={16} height={16} borderRadius={8} />
        <Shimmer width={30} height={15} borderRadius={4} />
      </View>

      <Shimmer width={50} height={11} borderRadius={4} />
    </View>
  );
});

const styles = StyleSheet.create({
  shimmerCard: {
    minHeight: 206,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  shimmerAvatarWrap: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
  },
  shimmerName: {
    marginTop: 10,
  },
  shimmerMetricRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  shimmerLabel: {
    marginTop: 2,
  },
  shimmerDivider: {
    marginTop: 10,
    width: "72%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
});
