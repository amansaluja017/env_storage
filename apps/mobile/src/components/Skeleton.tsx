import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  ViewStyle,
  DimensionValue,
} from 'react-native';
import { COLORS } from '../theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle | ViewStyle[];
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 6,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Skeleton card matching a folder in EnvVaultScreen
 */
export function FolderCardSkeleton() {
  return (
    <View style={styles.folderCardSkeleton}>
      <View style={styles.folderCardLeft}>
        <Skeleton width={42} height={42} borderRadius={10} style={{ marginRight: 12 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="55%" height={15} borderRadius={4} />
          <Skeleton width="80%" height={11} borderRadius={4} />
          <Skeleton width="35%" height={9} borderRadius={3} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Skeleton width={52} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

export function FoldersListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <FolderCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton card matching an environment variable card in EnvVaultScreen
 */
export function EnvCardSkeleton() {
  return (
    <View style={styles.envCardSkeleton}>
      {/* Header: Key & actions */}
      <View style={styles.envHeaderSkeleton}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={130} height={16} borderRadius={4} />
          <Skeleton width={50} height={14} borderRadius={4} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={26} height={26} borderRadius={6} />
          <Skeleton width={26} height={26} borderRadius={6} />
          <Skeleton width={26} height={26} borderRadius={6} />
        </View>
      </View>

      {/* Value Box */}
      <Skeleton width="100%" height={38} borderRadius={8} style={{ marginVertical: 10 }} />

      {/* Footer Meta */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="30%" height={10} borderRadius={3} />
        <Skeleton width="25%" height={10} borderRadius={3} />
      </View>
    </View>
  );
}

export function EnvsListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <EnvCardSkeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Skeleton card matching a team member item in TeamScreen
 */
export function MemberCardSkeleton() {
  return (
    <View style={styles.memberCardSkeleton}>
      <Skeleton width={38} height={38} borderRadius={19} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width="45%" height={14} borderRadius={4} />
        <Skeleton width="65%" height={11} borderRadius={3} />
      </View>
      <Skeleton width={54} height={22} borderRadius={6} />
    </View>
  );
}

export function MembersListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <MemberCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  listContainer: {
    gap: 10,
  },
  folderCardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  folderCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  envCardSkeleton: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  envHeaderSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberCardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
