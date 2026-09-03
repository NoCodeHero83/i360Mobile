import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, Dimensions } from "react-native";
import { COLORS } from "@/constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface ShimmerProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

export const Shimmer: React.FC<ShimmerProps> = ({
  width = "100%",
  height = 16,
  borderRadius = 4,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.shimmer,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: "rgba(255,255,255,0.3)",
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
};

export const PropertyDetailShimmer: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Shimmer height={300} borderRadius={0} />
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Shimmer width={100} height={14} style={styles.marginBottom} />
          <Shimmer width="80%" height={24} style={styles.marginBottom} />
          <Shimmer width="60%" height={20} style={styles.marginBottom} />
          <Shimmer width="40%" height={32} style={styles.marginBottom} />
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Shimmer width={120} height={18} style={styles.marginBottom} />
          <View style={styles.statsRow}>
            <Shimmer width={70} height={60} style={styles.statBox} />
            <Shimmer width={70} height={60} style={styles.statBox} />
            <Shimmer width={70} height={60} style={styles.statBox} />
            <Shimmer width={70} height={60} style={styles.statBox} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Shimmer width={100} height={18} style={styles.marginBottom} />
          <Shimmer width="100%" height={60} />
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Shimmer width={80} height={18} style={styles.marginBottom} />
          <View style={styles.chipsRow}>
            <Shimmer width={80} height={28} borderRadius={14} style={styles.chip} />
            <Shimmer width={100} height={28} borderRadius={14} style={styles.chip} />
            <Shimmer width={70} height={28} borderRadius={14} style={styles.chip} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Shimmer width={100} height={18} style={styles.marginBottom} />
          <Shimmer width="100%" height={100} />
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Shimmer width="100%" height={200} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  imageContainer: {
    width: "100%",
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 8,
  },
  marginBottom: {
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 20,
  },
  section: {
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statBox: {
    marginRight: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
});
