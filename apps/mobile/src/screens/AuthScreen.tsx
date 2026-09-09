import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
  Image,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { apiClient, setApiBaseUrl } from '../utils/apiClient';
import { showCustomAlert } from '../components/CustomAlert';

interface AuthFormData {
  email: string;
  password: string;
  name?: string;
}

interface AuthScreenProps {
  onLoginSuccess: (
    accessToken: string,
    refreshToken: string,
    user: { id: string; email: string; name: string; role?: 'admin' | 'member' }
  ) => void;
  apiBaseUrl: string;
}

export function AuthScreen({ onLoginSuccess, apiBaseUrl }: AuthScreenProps) {
  const { width, height } = useWindowDimensions();
  const isCompactHeight = height < 700;

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pingStatus, setPingStatus] = useState<string>('Ping API Status');
  const [pingColor, setPingColor] = useState<string>(COLORS.textMuted);

  // Forgot password modal state
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormData>({
    defaultValues: {
      email: '',
      password: '',
      name: '',
    },
  });

  const onSubmit = async (formData: AuthFormData) => {
    setLoading(true);
    setErrorMsg('');
    setApiBaseUrl(apiBaseUrl);

    try {
      const endpoint = isLogin ? '/trpc/auth.login' : '/trpc/auth.register';
      const bodyPayload = isLogin
        ? { email: formData.email.trim(), password: formData.password.trim() }
        : {
            email: formData.email.trim(),
            password: formData.password.trim(),
            name: (formData.name || '').trim(),
          };

      const response = await apiClient.post(`${apiBaseUrl}${endpoint}`, bodyPayload);
      const data = response.data;

      if (data.error) {
        throw new Error(data.error?.message || 'Authentication failed');
      }

      if (data.result && data.result.data) {
        const payload = data.result.data;
        const accessToken = payload.accessToken || payload.token;
        const refreshToken = payload.refreshToken;
        const userObj = payload.user;

        if (!accessToken) {
          throw new Error('No access token returned from authentication server');
        }

        onLoginSuccess(accessToken, refreshToken, userObj);
      } else {
        throw new Error('Unexpected response format from auth service');
      }
    } catch (err: any) {
      console.error('Auth submit error:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Authentication failed';
      setErrorMsg(msg);
      showCustomAlert({
        title: isLogin ? 'Sign In Failed' : 'Registration Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      showCustomAlert({
        title: 'Valid Email Required',
        message: 'Please enter a valid email address to receive reset instructions.',
        type: 'warning',
      });
      return;
    }

    setForgotSubmitting(true);
    try {
      const response = await apiClient.post(`${apiBaseUrl}/trpc/auth.requestPasswordReset`, {
        email: forgotEmail.trim().toLowerCase(),
      });

      const data = response.data?.result?.data;
      const previewUrl = data?.previewUrl;
      setForgotPasswordModalOpen(false);
      const targetEmail = forgotEmail;
      setForgotEmail('');

      showCustomAlert({
        title: 'Password Reset Sent',
        message: `Password reset instructions have been sent to ${targetEmail}. Please check your email inbox.`,
        type: 'success',
        buttons: previewUrl
          ? [
              { text: 'Close', style: 'cancel' },
              {
                text: 'Open Reset Portal',
                style: 'default',
                onPress: () => Linking.openURL(previewUrl),
              },
            ]
          : [{ text: 'Got it', style: 'default' }],
      });
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Unable to request password reset.';
      const isNotFound =
        msg.toLowerCase().includes('not registered') ||
        msg.toLowerCase().includes('no account') ||
        err.response?.status === 404;

      showCustomAlert({
        title: isNotFound ? 'Email Not Registered' : 'Password Reset Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setForgotSubmitting(false);
    }
  };


  const handlePing = async () => {
    setPingStatus('Pinging...');
    setPingColor(COLORS.textMuted);
    try {
      const res = await apiClient.get(`${apiBaseUrl}/health`, { timeout: 4000 });
      if (res.status === 200) {
        setPingStatus('API Online 🟢');
        setPingColor(COLORS.primary);
      } else {
        setPingStatus('API Offline 🔴');
        setPingColor(COLORS.danger);
      }
    } catch {
      setPingStatus('API Offline 🔴');
      setPingColor(COLORS.danger);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isCompactHeight && { paddingVertical: 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.mainWrapper, { maxWidth: Math.min(width - 32, 460) }]}>
            {/* Brand Header */}
            <View style={[styles.brandContainer, isCompactHeight && { marginBottom: 18 }]}>
              <Image
                source={require('../../assets/icon.png')}
                style={[
                  styles.logoImage,
                  isCompactHeight && { width: 52, height: 52, marginBottom: 8 },
                ]}
                resizeMode="contain"
              />
              <Text style={[styles.title, isCompactHeight && { fontSize: 26 }]}>ENV VAULT</Text>
              <Text style={styles.subtitle}>
                Secure Environment Variable Vault & Team Workspace
              </Text>
            </View>

            {/* Auth Card */}
            <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>
            {isLogin ? 'Sign In to Workspace' : 'Create New Account'}
          </Text>

          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Full Name Input (Register Only) */}
          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full Name</Text>
              <Controller
                control={control}
                name="name"
                rules={{
                  required: !isLogin ? 'Full name is required' : false,
                  minLength: { value: 2, message: 'Name must be at least 2 characters' },
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    placeholder="e.g. Alex Vance"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
              />
              {errors.name && (
                <Text style={styles.fieldErrorText}>{errors.name.message}</Text>
              )}
            </View>
          )}

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address</Text>
            <Controller
              control={control}
              name="email"
              rules={{
                required: 'Email address is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="name@company.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            />
            {errors.email && (
              <Text style={styles.fieldErrorText}>{errors.email.message}</Text>
            )}
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Master Password</Text>
            <Controller
              control={control}
              name="password"
              rules={{
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="••••••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            />
            {errors.password && (
              <Text style={styles.fieldErrorText}>{errors.password.message}</Text>
            )}

            {/* Forgot Password Link (Login Mode) */}
            {isLogin && (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={() => {
                  setForgotEmail(control._formValues?.email || '');
                  setForgotPasswordModalOpen(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotBtnText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && { opacity: 0.75 }]}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color="#000" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>
                  {isLogin ? 'Authenticating with Server...' : 'Creating Account...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Login/Register */}
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsLogin(!isLogin)}
          >
            <Text style={styles.toggleText}>
              {isLogin
                ? "Don't have an account? Create one"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>

          {/* Ping API Status */}
          <TouchableOpacity
            style={[styles.demoButton, { marginTop: 16, borderColor: pingColor }]}
            onPress={handlePing}
            activeOpacity={0.8}
          >
            <Text style={[styles.demoButtonText, { color: pingColor }]}>📡 {pingStatus}</Text>
          </TouchableOpacity>

          <Text style={styles.urlIndicator}>Target: {apiBaseUrl}</Text>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>

  {/* Forgot Password Modal */}
  <Modal
    visible={forgotPasswordModalOpen}
    transparent
    animationType="fade"
    onRequestClose={() => setForgotPasswordModalOpen(false)}
  >
    <KeyboardAvoidingView
      style={styles.modalOverlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleRow}>
            <Ionicons name="key-outline" size={18} color={COLORS.secondary} style={{ marginRight: 8 }} />
            <Text style={styles.modalTitle}>Reset Password</Text>
          </View>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setForgotPasswordModalOpen(false)}
          >
            <Ionicons name="close" size={18} color={COLORS.textSubtle} />
          </TouchableOpacity>
        </View>

        <Text style={styles.modalSubtitle}>
          Enter your account email. We'll generate a secure reset token and send instructions to your inbox.
        </Text>

        <View style={{ marginBottom: 18 }}>
          <Text style={styles.label}>Account Email</Text>
          <TextInput
            style={styles.input}
            placeholder="name@company.com"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={forgotEmail}
            onChangeText={setForgotEmail}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, forgotSubmitting && { opacity: 0.7 }]}
          onPress={handleForgotPasswordSubmit}
          disabled={forgotSubmitting}
          activeOpacity={0.8}
        >
          {forgotSubmitting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </Modal>
</SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  mainWrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 68,
    height: 68,
    borderRadius: 18,
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
  },
  cardHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
  },
  fieldErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSubtle,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  toggleButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  toggleText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  demoButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  urlIndicator: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#121316',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 4,
  },
  forgotBtnText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
