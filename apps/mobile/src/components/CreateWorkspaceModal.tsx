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
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { COLORS } from '../theme';
import { apiClient } from '../utils/apiClient';

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
      } else {
        throw new Error(data.error?.message || 'Failed to create workspace');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error?.message || e.message || 'Unable to create workspace';
      Alert.alert('Error', msg);
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>🏢 Create Workspace</Text>
          <Text style={styles.modalSubtitle}>
            Workspaces organize teams, projects, and environment variables.
          </Text>

          <Text style={styles.label}>Workspace Name *</Text>
          <Controller
            control={control}
            name="name"
            rules={{
              required: 'Workspace name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
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
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit(onSubmit)}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Create Workspace</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 20,
    lineHeight: 18,
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
