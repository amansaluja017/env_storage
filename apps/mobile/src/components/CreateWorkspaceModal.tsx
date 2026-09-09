import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { apiClient } from '../utils/apiClient';
import { showCustomAlert } from './CustomAlert';

interface CreateWorkspaceFormData {
  name: string;
  slug?: string;
}

interface CreateWorkspaceModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  apiBaseUrl: string;
  onCreated: (newWorkspace: { id: string; name: string; slug: string }) => void;
}

export function CreateWorkspaceModal({
  visible,
  onClose,
  token,
  apiBaseUrl,
  onCreated,
}: CreateWorkspaceModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWorkspaceFormData>({
    defaultValues: {
      name: '',
      slug: '',
    },
  });

  const onSubmit = async (formData: CreateWorkspaceFormData) => {
    setSubmitting(true);
    try {
      const response = await apiClient.post(`${apiBaseUrl}/trpc/workspace.create`, {
        name: formData.name.trim(),
        slug: formData.slug?.trim() || undefined,
      });

      const data = response.data;
      if (data.result?.data) {
        onCreated(data.result.data);
        reset();
        onClose();
        showCustomAlert({
          title: 'Workspace Created!',
          message: `Workspace "${data.result.data.name}" was successfully created.`,
          type: 'success',
        });
      } else {
        throw new Error(data.error?.message || 'Failed to create workspace');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Unable to create workspace';
      showCustomAlert({
        title: 'Workspace Error',
        message: msg,
        type: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIconBox}>
                <Ionicons name="business" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Create Workspace</Text>
                <Text style={styles.modalSubtitle}>Organize teams and environment vaults</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={COLORS.textSubtle} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Workspace Name *</Text>
          <Controller
            control={control}
            name="name"
            rules={{
              required: 'Workspace name is required',
              validate: (val) => (val ? val.trim().length >= 2 : false) || 'Name must be at least 2 characters',
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, errors.name && styles.inputError]}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="e.g. Acme Corp Infrastructure"
                placeholderTextColor={COLORS.textMuted}
              />
            )}
          />
          {errors.name && (
            <Text style={styles.fieldErrorText}>{errors.name.message}</Text>
          )}

          <Text style={styles.label}>Custom Slug (Optional)</Text>
          <Controller
            control={control}
            name="slug"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={styles.input}
                value={value}
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="acme-corp"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
            )}
          />

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit(onSubmit)}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#000" size="small" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Creating...</Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Create Workspace</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 6,
    marginTop: 10,
    textTransform: 'uppercase',
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
  inputError: {
    borderColor: COLORS.danger,
  },
  fieldErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: 4,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  submitBtnText: {
    color: '#000',
    fontWeight: '800',
  },
});
