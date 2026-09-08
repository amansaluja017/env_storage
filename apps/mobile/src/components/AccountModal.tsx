import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { apiClient } from '../utils/apiClient';
import { showCustomAlert } from './CustomAlert';

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role?: 'admin' | 'member';
}

interface AccountModalProps {
  visible: boolean;
  onClose: () => void;
  user: UserInfo;
  apiBaseUrl: string;
  onUserUpdated: (updatedUser: UserInfo) => void;
  onReplayTour?: () => void;
}

interface ChangeEmailFormData {
  newEmail: string;
  currentPassword: string;
}

interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function AccountModal({
  visible,
  onClose,
  user,
  apiBaseUrl,
  onUserUpdated,
  onReplayTour,
}: AccountModalProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'email' | 'password'>('account');

  // Email form
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const {
    control: emailControl,
    handleSubmit: handleEmailSubmit,
    reset: resetEmailForm,
    formState: { errors: emailErrors },
  } = useForm<ChangeEmailFormData>({
    defaultValues: {
      newEmail: '',
      currentPassword: '',
    },
  });

  // Password form
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    control: passwordControl,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    watch: watchPassword,
    formState: { errors: passwordErrors },
  } = useForm<ChangePasswordFormData>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Fetch account info whenever modal is opened
  const onChangeEmail = async (formData: ChangeEmailFormData) => {
    setEmailSubmitting(true);
    try {
      const response = await apiClient.post(`${apiBaseUrl}/trpc/auth.requestEmailChange`, {
        newEmail: formData.newEmail.trim().toLowerCase(),
        currentPassword: formData.currentPassword,
      });

      const data = response.data;
      if (data.result?.data?.success) {
        const previewUrl = data.result.data.previewUrl;
        resetEmailForm();
        showCustomAlert({
          title: 'Verification Link Sent',
          message: `A verification link has been sent to ${formData.newEmail.trim().toLowerCase()}.\n\nPlease check your email inbox and click the button to verify your new address.`,
          type: 'success',
          buttons: previewUrl
            ? [
                { text: 'Close', style: 'cancel' },
                {
                  text: 'Open Verification Link',
                  style: 'default',
                  onPress: () => Linking.openURL(previewUrl),
                },
              ]
            : [{ text: 'OK', style: 'default' }],
        });
        setActiveTab('account');
      } else {
        throw new Error(data.error?.message || 'Failed to request email change');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Unable to request email change';
      showCustomAlert({
        title: 'Request Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setEmailSubmitting(false);
    }
  };

  const onChangePassword = async (formData: ChangePasswordFormData) => {
    if (formData.newPassword !== formData.confirmPassword) {
      showCustomAlert({
        title: 'Password Mismatch',
        message: 'New password and confirmation password do not match.',
        type: 'warning',
      });
      return;
    }

    setPasswordSubmitting(true);
    try {
      const response = await apiClient.post(`${apiBaseUrl}/trpc/auth.changePassword`, {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword,
      });

      const data = response.data;
      if (data.result?.data?.success) {
        resetPasswordForm();
        showCustomAlert({
          title: 'Password Changed',
          message: 'Your account password has been successfully updated.',
          type: 'success',
        });
        setActiveTab('account');
      } else {
        throw new Error(data.error?.message || 'Failed to update password');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Unable to change password';
      showCustomAlert({
        title: 'Change Failed',
        message: msg,
        type: 'danger',
      });
    } finally {
      setPasswordSubmitting(false);
    }
  };


  const handleClose = () => {
    resetEmailForm();
    resetPasswordForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          {/* Header Bar */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarLargeBox}>
                <Text style={styles.avatarLargeText}>
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.userNameRow}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {user.name || 'Account'}
                  </Text>
                </View>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={COLORS.textSubtle} />
            </TouchableOpacity>
          </View>

          {/* Segmented Navigation Tabs */}
          <View style={styles.navTabs}>
            <TouchableOpacity
              style={[styles.navTabBtn, activeTab === 'account' && styles.navTabBtnActive]}
              onPress={() => setActiveTab('account')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person-circle-outline"
                size={16}
                color={activeTab === 'account' ? COLORS.primary : COLORS.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.navTabText, activeTab === 'account' && styles.navTabTextActive]}>
                Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTabBtn, activeTab === 'email' && styles.navTabBtnActive]}
              onPress={() => setActiveTab('email')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="mail"
                size={14}
                color={activeTab === 'email' ? COLORS.primary : COLORS.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.navTabText, activeTab === 'email' && styles.navTabTextActive]}>
                Email
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navTabBtn, activeTab === 'password' && styles.navTabBtnActive]}
              onPress={() => setActiveTab('password')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="key"
                size={14}
                color={activeTab === 'password' ? COLORS.primary : COLORS.textMuted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.navTabText, activeTab === 'password' && styles.navTabTextActive]}>
                Password
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Body */}
          <ScrollView
            style={styles.tabContentScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* TAB 1: Account Information */}
            {activeTab === 'account' && (
              <View style={styles.tabPane}>
                {/* Account Details Box */}
                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Full Name</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {user.name || 'User'}
                    </Text>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Email Address</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>
                      {user.email}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* TAB 2: Change Email */}
            {activeTab === 'email' && (
              <View style={styles.tabPane}>
                <View style={styles.infoPill}>
                  <Ionicons name="mail-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.infoPillText}>
                    A secure verification link will be emailed to confirm your new email before updating your account.
                  </Text>
                </View>

                {/* New Email Input */}
                <Text style={styles.label}>New Email Address</Text>
                <Controller
                  control={emailControl}
                  name="newEmail"
                  rules={{
                    required: 'New email address is required',
                    pattern: {
                      value: /\S+@\S+\.\S+/,
                      message: 'Please enter a valid email format',
                    },
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, emailErrors.newEmail && styles.inputError]}
                      placeholder="e.g. name@company.com"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {emailErrors.newEmail && (
                  <Text style={styles.fieldErrorText}>{emailErrors.newEmail.message}</Text>
                )}

                {/* Current Password Verification */}
                <Text style={styles.label}>Verify Current Password</Text>
                <Controller
                  control={emailControl}
                  name="currentPassword"
                  rules={{
                    required: 'Current password is required to confirm change',
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View
                      style={[
                        styles.passwordInputContainer,
                        emailErrors.currentPassword && styles.inputError,
                      ]}
                    >
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Enter current password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry={!showEmailPassword}
                        autoCapitalize="none"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                      <TouchableOpacity
                        onPress={() => setShowEmailPassword(!showEmailPassword)}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showEmailPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {emailErrors.currentPassword && (
                  <Text style={styles.fieldErrorText}>{emailErrors.currentPassword.message}</Text>
                )}

                <TouchableOpacity
                  style={[styles.actionSubmitBtn, emailSubmitting && styles.btnDisabled]}
                  onPress={handleEmailSubmit(onChangeEmail)}
                  disabled={emailSubmitting}
                  activeOpacity={0.8}
                >
                  {emailSubmitting ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane-outline" size={16} color="#000" style={{ marginRight: 6 }} />
                      <Text style={styles.actionSubmitBtnText}>Send Verification Email</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 3: Change Password */}
            {activeTab === 'password' && (
              <View style={styles.tabPane}>
                <View style={styles.infoPill}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.secondary} />
                  <Text style={styles.infoPillText}>
                    Choose a strong password with at least 6 characters.
                  </Text>
                </View>

                {/* Current Password */}
                <Text style={styles.label}>Current Password</Text>
                <Controller
                  control={passwordControl}
                  name="currentPassword"
                  rules={{ required: 'Current password is required' }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View
                      style={[
                        styles.passwordInputContainer,
                        passwordErrors.currentPassword && styles.inputError,
                      ]}
                    >
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Current password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry={!showCurrentPassword}
                        autoCapitalize="none"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                      <TouchableOpacity
                        onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {passwordErrors.currentPassword && (
                  <Text style={styles.fieldErrorText}>{passwordErrors.currentPassword.message}</Text>
                )}

                {/* New Password */}
                <Text style={styles.label}>New Password</Text>
                <Controller
                  control={passwordControl}
                  name="newPassword"
                  rules={{
                    required: 'New password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
                    },
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View
                      style={[
                        styles.passwordInputContainer,
                        passwordErrors.newPassword && styles.inputError,
                      ]}
                    >
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="At least 6 characters"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry={!showNewPassword}
                        autoCapitalize="none"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                      <TouchableOpacity
                        onPress={() => setShowNewPassword(!showNewPassword)}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {passwordErrors.newPassword && (
                  <Text style={styles.fieldErrorText}>{passwordErrors.newPassword.message}</Text>
                )}

                {/* Confirm New Password */}
                <Text style={styles.label}>Confirm New Password</Text>
                <Controller
                  control={passwordControl}
                  name="confirmPassword"
                  rules={{
                    required: 'Please confirm your new password',
                    validate: (val) =>
                      val === watchPassword('newPassword') || 'Passwords do not match',
                  }}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <View
                      style={[
                        styles.passwordInputContainer,
                        passwordErrors.confirmPassword && styles.inputError,
                      ]}
                    >
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Repeat new password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry={!showConfirmPassword}
                        autoCapitalize="none"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeBtn}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {passwordErrors.confirmPassword && (
                  <Text style={styles.fieldErrorText}>{passwordErrors.confirmPassword.message}</Text>
                )}

                <TouchableOpacity
                  style={[styles.actionSubmitBtn, passwordSubmitting && styles.btnDisabled]}
                  onPress={handlePasswordSubmit(onChangePassword)}
                  disabled={passwordSubmitting}
                  activeOpacity={0.8}
                >
                  {passwordSubmitting ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="key" size={16} color="#000" style={{ marginRight: 6 }} />
                      <Text style={styles.actionSubmitBtnText}>Update Password</Text>
                    </>
                  )}
                </TouchableOpacity>

              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#121316',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarLargeBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarLargeText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  roleBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  roleBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },

  // Navigation Tabs
  navTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  navTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  navTabBtnActive: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  navTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  navTabTextActive: {
    color: COLORS.primary,
  },

  tabContentScroll: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  tabPane: {
    paddingBottom: 20,
  },

  // Account details box
  detailsBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: COLORS.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '65%',
  },
  detailValueHighlight: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  detailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },

  // Form elements
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    gap: 8,
  },
  infoPillText: {
    color: COLORS.textSubtle,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readOnlyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  readOnlyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 14,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 6,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  fieldErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
  actionSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 24,
  },
  actionSubmitBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  roleBadgeAdmin: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: COLORS.primary,
  },
  roleBadgeMember: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: COLORS.secondary,
  },
  roleBadgeTextAdmin: {
    color: COLORS.primary,
  },
  roleBadgeTextMember: {
    color: COLORS.secondary,
  },
  detailValueMember: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
});
