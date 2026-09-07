import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeNetworkLoading } from '../utils/apiClient';
import { useGsapLoadingIndicator } from '../utils/gsapAnimation';
import { COLORS } from '../theme';

export function ServerLoadingIndicator() {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [activeRequests, setActiveRequests] = useState(0);

  // GSAP-powered smooth loading animations (entrance spring, breathing pulse, smooth exit)
  const { fadeAnim, translateYAnim, pulseAnim } = useGsapLoadingIndicator(isLoading);

  // Calculate safe top offset to clear punch-hole cameras, notches, and status bar
  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const rawTop = Math.max(insets.top, statusBarHeight);
  // Add an 8px buffer below the notch / punch hole / status bar; on web/desktop use 14px
  const safePillTop = rawTop > 0 ? rawTop + 8 : 14;

  useEffect(() => {
    return subscribeNetworkLoading((loading, count) => {
      setIsLoading(loading);
      setActiveRequests(count);
    });
  }, []);

  return (
    <View style={styles.rootWrapper} pointerEvents="none">
      {/* Top Ambient Glow Line along top edge */}
      <Animated.View
        style={[
          styles.glowLine,
          {
            opacity: Animated.multiply(fadeAnim, pulseAnim),
          },
        ]}
      />

      {/* Floating Status Pill positioned below notch & punch hole camera */}
      <Animated.View
        style={[
          styles.pillContainer,
          {
            top: safePillTop,
            opacity: fadeAnim,
            transform: [{ translateY: translateYAnim }],
          },
        ]}
      >
        <View style={styles.pill}>
          <ActivityIndicator
            size="small"
            color={COLORS.primary}
            style={styles.spinner}
          />
          <Text style={styles.pillText}>
            {activeRequests > 1 ? `Syncing (${activeRequests})...` : 'Connecting to server...'}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 99999,
  },
  glowLine: {
    width: '100%',
    height: 3,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8,
  },
  pillContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 23, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 12,
  },
  spinner: {
    marginRight: 8,
    transform: [{ scale: 0.85 }],
  },
  pillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
