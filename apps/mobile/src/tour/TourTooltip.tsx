import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TooltipRenderProps } from 'guideway';
import { COLORS } from '../theme';

export function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  isFirst,
  isLast,
  next,
  back,
  skip,
}: TooltipRenderProps) {
  return (
    <View style={styles.card}>
      {/* Header Row with Step Indicator & Close Button */}
      <View style={styles.topRow}>
        <View style={styles.stepBadge}>
          <View style={styles.stepDot} />
          <Text style={styles.stepBadgeText}>
            STEP {stepIndex + 1} OF {totalSteps}
          </Text>
        </View>

        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={skip}
          style={styles.closeBtn}
          accessibilityLabel="Close tour"
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      {step.title ? (
        <View style={styles.titleRow}>
          <Ionicons name="compass" size={17} color={COLORS.primary} style={{ marginRight: 6 }} />
          <Text style={styles.title}>{step.title}</Text>
        </View>
      ) : null}

      {/* Body Content */}
      <View style={styles.bodyContainer}>
        {typeof step.body === 'string' ? (
          <Text style={styles.bodyText}>{step.body}</Text>
        ) : (
          step.body
        )}
      </View>

      {/* Footer Navigation Controls */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={skip}
          style={styles.skipBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip Tour</Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        {!isFirst && (
          <TouchableOpacity
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={back}
            style={styles.backBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={14} color={COLORS.text} style={{ marginRight: 2 }} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={next}
          style={styles.nextBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.nextText}>{isLast ? 'Got it!' : 'Next'}</Text>
          <Ionicons
            name={isLast ? 'checkmark' : 'chevron-forward'}
            size={14}
            color="#090D16"
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111726',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1F2B44',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    minWidth: 260,
    maxWidth: 340,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 153, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 153, 0.25)',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 6,
  },
  stepBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  bodyContainer: {
    marginBottom: 14,
  },
  bodyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 8,
  },
  backText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  nextText: {
    color: '#090D16',
    fontSize: 12,
    fontWeight: '700',
  },
});
