import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';

export type AlertType = 'info' | 'success' | 'warning' | 'danger';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertOptions {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
  dismissable?: boolean;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType>({
  showAlert: () => {},
  hideAlert: () => {},
});

let globalAlertDispatcher: ((options: AlertOptions) => void) | null = null;

/**
 * Imperative global custom alert helper that can be called anywhere
 * without needing React hook context
 */
export function showCustomAlert(options: AlertOptions) {
  if (globalAlertDispatcher) {
    globalAlertDispatcher(options);
  } else {
    console.warn('CustomAlert: AlertProvider not mounted yet.');
  }
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertOptions>({
    title: '',
    message: '',
    type: 'info',
    buttons: [{ text: 'OK', style: 'default' }],
  });

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((options: AlertOptions) => {
    // Infer alert type if not explicitly provided
    let type = options.type;
    if (!type) {
      const isDestructive = options.buttons?.some((b) => b.style === 'destructive');
      const lowerTitle = (options.title || '').toLowerCase();
      const lowerMessage = (options.message || '').toLowerCase();
      if (
        isDestructive ||
        lowerTitle.includes('delete') ||
        lowerTitle.includes('error') ||
        lowerTitle.includes('failed') ||
        lowerMessage.includes('error') ||
        lowerMessage.includes('not found') ||
        lowerMessage.includes('invalid')
      ) {
        type = 'danger';
      } else if (
        lowerTitle.includes('success') ||
        lowerTitle.includes('sent') ||
        lowerTitle.includes('joined') ||
        lowerTitle.includes('created')
      ) {
        type = 'success';
      } else if (
        lowerTitle.includes('warn') ||
        lowerTitle.includes('required') ||
        lowerTitle.includes('missing') ||
        lowerTitle.includes('log out')
      ) {
        type = 'warning';
      } else {
        type = 'info';
      }
    }

    setAlertConfig({
      ...options,
      type,
      buttons:
        options.buttons && options.buttons.length > 0
          ? options.buttons
          : [{ text: 'Got it', style: 'default' }],
      dismissable: options.dismissable ?? true,
    });
    setVisible(true);

    // Reset animations
    scaleAnim.setValue(0.88);
    opacityAnim.setValue(0);
    backdropAnim.setValue(0);

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim, backdropAnim]);

  const hideAlert = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });
  }, [scaleAnim, opacityAnim, backdropAnim]);

  globalAlertDispatcher = showAlert;

  const handleButtonPress = (btn: AlertButton) => {
    hideAlert();
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress?.();
      }, 180);
    }
  };

  const getAlertAccent = () => {
    switch (alertConfig.type) {
      case 'danger':
        return {
          icon: 'alert-circle' as const,
          label: 'ERROR',
          color: '#ef4444',
          glowColor: 'rgba(239, 68, 68, 0.35)',
          bg: 'rgba(239, 68, 68, 0.18)',
          bgGlow: 'rgba(239, 68, 68, 0.08)',
          border: 'rgba(239, 68, 68, 0.45)',
          topBar: '#ef4444',
          actionBtnBg: '#ef4444',
          actionBtnText: '#ffffff',
        };
      case 'warning':
        return {
          icon: 'warning' as const,
          label: 'WARNING',
          color: '#f59e0b',
          glowColor: 'rgba(245, 158, 11, 0.35)',
          bg: 'rgba(245, 158, 11, 0.18)',
          bgGlow: 'rgba(245, 158, 11, 0.08)',
          border: 'rgba(245, 158, 11, 0.45)',
          topBar: '#f59e0b',
          actionBtnBg: '#f59e0b',
          actionBtnText: '#000000',
        };
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          label: 'SUCCESS',
          color: '#10b981',
          glowColor: 'rgba(16, 185, 129, 0.35)',
          bg: 'rgba(16, 185, 129, 0.18)',
          bgGlow: 'rgba(16, 185, 129, 0.08)',
          border: 'rgba(16, 185, 129, 0.45)',
          topBar: '#10b981',
          actionBtnBg: '#10b981',
          actionBtnText: '#000000',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          label: 'NOTICE',
          color: '#06b6d4',
          glowColor: 'rgba(6, 182, 212, 0.35)',
          bg: 'rgba(6, 182, 212, 0.18)',
          bgGlow: 'rgba(6, 182, 212, 0.08)',
          border: 'rgba(6, 182, 212, 0.45)',
          topBar: '#06b6d4',
          actionBtnBg: '#06b6d4',
          actionBtnText: '#000000',
        };
    }
  };

  const accent = getAlertAccent();

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal visible={visible} transparent animationType="none" onRequestClose={hideAlert}>
        <TouchableWithoutFeedback
          onPress={() => {
            if (alertConfig.dismissable) {
              hideAlert();
            }
          }}
        >
          <Animated.View style={[styles.overlay, { opacity: backdropAnim }]}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.dialogCard,
                  {
                    borderColor: accent.border,
                    shadowColor: accent.color,
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                {/* Glowing Top Ambient Line */}
                <View style={[styles.topAccentBar, { backgroundColor: accent.topBar }]} />

                {/* Header with Icon and Badge */}
                <View style={styles.iconContainer}>
                  <View
                    style={[
                      styles.iconOuterRing,
                      { backgroundColor: accent.bgGlow, borderColor: accent.border },
                    ]}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: accent.bg }]}>
                      <Ionicons name={accent.icon} size={30} color={accent.color} />
                    </View>
                  </View>
                  <View style={[styles.categoryBadge, { borderColor: accent.border, backgroundColor: accent.bg }]}>
                    <Text style={[styles.categoryBadgeText, { color: accent.color }]}>
                      {accent.label}
                    </Text>
                  </View>
                </View>

                {/* Title & Message Content */}
                <View style={styles.content}>
                  <Text style={styles.title}>{alertConfig.title}</Text>
                  {alertConfig.message ? (
                    <Text style={styles.message}>{alertConfig.message}</Text>
                  ) : null}
                </View>

                {/* Action Buttons */}
                <View
                  style={[
                    styles.buttonRow,
                    (alertConfig.buttons || []).length > 2 && styles.buttonColumn,
                  ]}
                >
                  {(alertConfig.buttons || []).map((btn, index) => {
                    const isCancel = btn.style === 'cancel';
                    const isDestructive = btn.style === 'destructive';

                    let btnStyle: any = [
                      styles.actionBtn,
                      { backgroundColor: accent.actionBtnBg },
                    ];
                    let textStyle: any = [
                      styles.actionBtnText,
                      { color: accent.actionBtnText },
                    ];

                    if (isCancel) {
                      btnStyle = styles.cancelBtn;
                      textStyle = styles.cancelBtnText;
                    } else if (isDestructive) {
                      btnStyle = styles.destructiveBtn;
                      textStyle = styles.destructiveBtnText;
                    }

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.btnBase,
                          btnStyle,
                          (alertConfig.buttons || []).length <= 2 && styles.flexBtn,
                        ]}
                        onPress={() => handleButtonPress(btn)}
                        activeOpacity={0.8}
                      >
                        <Text style={textStyle}>{btn.text}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  return useContext(AlertContext);
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: Math.min(width - 44, 380),
    backgroundColor: '#0f1118',
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 28,
    elevation: 24,
  },
  topAccentBar: {
    height: 3.5,
    width: '100%',
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 6,
  },
  iconOuterRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 22,
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  message: {
    color: '#94a3b8',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 10,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  flexBtn: {
    flex: 1,
  },
  btnBase: {
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    backgroundColor: '#181b26',
    borderWidth: 1,
    borderColor: '#2d3345',
  },
  cancelBtnText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  destructiveBtn: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  destructiveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
