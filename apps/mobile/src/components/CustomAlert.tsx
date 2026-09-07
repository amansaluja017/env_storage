import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
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

  const showAlert = useCallback((options: AlertOptions) => {
    // Infer alert type if not explicitly provided
    let type = options.type;
    if (!type) {
      const isDestructive = options.buttons?.some(b => b.style === 'destructive');
      const lowerTitle = (options.title || '').toLowerCase();
      if (isDestructive || lowerTitle.includes('delete') || lowerTitle.includes('error') || lowerTitle.includes('failed')) {
        type = 'danger';
      } else if (lowerTitle.includes('success') || lowerTitle.includes('sent') || lowerTitle.includes('joined')) {
        type = 'success';
      } else if (lowerTitle.includes('warn') || lowerTitle.includes('log out')) {
        type = 'warning';
      } else {
        type = 'info';
      }
    }

    setAlertConfig({
      ...options,
      type,
      buttons: options.buttons && options.buttons.length > 0
        ? options.buttons
        : [{ text: 'OK', style: 'default' }],
    });
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
  }, []);

  globalAlertDispatcher = showAlert;

  const handleButtonPress = (btn: AlertButton) => {
    setVisible(false);
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress?.();
      }, 100);
    }
  };

  const getAlertAccent = () => {
    switch (alertConfig.type) {
      case 'danger':
        return {
          icon: 'alert-circle' as const,
          color: COLORS.danger,
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.3)',
        };
      case 'warning':
        return {
          icon: 'warning' as const,
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.3)',
        };
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          color: COLORS.primary,
          bg: 'rgba(34, 197, 94, 0.15)',
          border: 'rgba(34, 197, 94, 0.3)',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          color: COLORS.secondary,
          bg: 'rgba(6, 182, 212, 0.15)',
          border: 'rgba(6, 182, 212, 0.3)',
        };
    }
  };

  const accent = getAlertAccent();

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={hideAlert}>
        <View style={styles.overlay}>
          <View style={[styles.dialogCard, { borderColor: accent.border }]}>
            {/* Glowing Accent Top Bar */}
            <View style={[styles.topAccentBar, { backgroundColor: accent.color }]} />

            {/* Icon Header */}
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: accent.bg, borderColor: accent.border }]}>
                <Ionicons name={accent.icon} size={28} color={accent.color} />
              </View>
            </View>

            {/* Title & Message */}
            <View style={styles.content}>
              <Text style={styles.title}>{alertConfig.title}</Text>
              {alertConfig.message ? (
                <Text style={styles.message}>{alertConfig.message}</Text>
              ) : null}
            </View>

            {/* Buttons Row / Column */}
            <View
              style={[
                styles.buttonRow,
                (alertConfig.buttons || []).length > 2 && styles.buttonColumn,
              ]}
            >
              {(alertConfig.buttons || []).map((btn, index) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';

                let btnStyle: any = styles.defaultBtn;
                let textStyle: any = styles.defaultBtnText;

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
                    activeOpacity={0.75}
                  >
                    <Text style={textStyle}>{btn.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: Math.min(width - 48, 380),
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 24,
  },
  topAccentBar: {
    height: 3,
    width: '100%',
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 4,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    alignItems: 'center',
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  flexBtn: {
    flex: 1,
  },
  btnBase: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultBtn: {
    backgroundColor: COLORS.primary,
  },
  defaultBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  destructiveBtn: {
    backgroundColor: COLORS.danger,
    shadowColor: COLORS.danger,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  destructiveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
