import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { COLORS } from '../theme';
import { apiClient, setApiBaseUrl } from '../utils/apiClient';

interface AuthFormData {
  email: string;
  password: string;
  name?: string;
}

interface AuthScreenProps {
  onLoginSuccess: (
    accessToken: string,
    refreshToken: string,
    user: { id: string; email: string; name: string }
  ) => void;
  apiBaseUrl: string;
}

export function AuthScreen({ onLoginSuccess, apiBaseUrl }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pingStatus, setPingStatus] = useState<string>('Ping API Status');
  const [pingColor, setPingColor] = useState<string>(COLORS.textMuted);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormData>({
    defaultValues: {
      email: 'alex@tubo.dev',
      password: 'password123',
      name: 'Alex Vance',
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

      const result = data.result?.data;
      if (result?.user && (result?.accessToken || result?.token)) {
        const accessToken = result.accessToken || result.token;
        const refreshToken = result.refreshToken || '';
        onLoginSuccess(accessToken, refreshToken, result.user);
      } else {
        throw new Error('Invalid authentication response from API');
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        `Network request failed to ${apiBaseUrl}. Is the API server running?`;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {/* Brand Header */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>⚡</Text>
          </View>
          <Text style={styles.title}>TUBO</Text>
          <Text style={styles.subtitle}>
            Secure Monorepo Environment Vault & Team Workspace
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
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 32,
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
});
