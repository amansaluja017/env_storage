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
import { COLORS } from '../theme';

interface AuthScreenProps {
  onLoginSuccess: (token: string, user: { id: string; email: string; name: string }) => void;
  apiBaseUrl: string;
}

export function AuthScreen({ onLoginSuccess, apiBaseUrl }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('alex@tubo.dev');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('Alex Vance');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuth = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const endpoint = isLogin ? '/trpc/auth.login' : '/trpc/auth.register';
      const bodyPayload = isLogin
        ? { email, password }
        : { email, password, name };

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error?.message || 'Authentication failed');
      }

      const result = data.result?.data;
      if (result?.token && result?.user) {
        onLoginSuccess(result.token, result.user);
      } else {
        throw new Error('Invalid authentication response');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network request failed. Is the API server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = () => {
    onLoginSuccess('demo_token_alex_123', {
      id: 'user_demo_123',
      email: 'alex@tubo.dev',
      name: 'Alex Vance',
    });
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

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alex Vance"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="name@company.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Master Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAuth}
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

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>DEMO MODE</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleQuickDemo}
            activeOpacity={0.8}
          >
            <Text style={styles.demoButtonText}>⚡ Instant Demo Sign-In</Text>
          </TouchableOpacity>
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 10,
    letterSpacing: 1,
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
});
