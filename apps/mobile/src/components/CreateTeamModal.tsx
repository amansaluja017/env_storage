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
import { COLORS } from '../theme';

interface CreateTeamModalProps {
  visible: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  apiBaseUrl: string;
  onCreated: (newTeam: any) => void;
}

export function CreateTeamModal({
  visible,
  onClose,
  workspaceId,
  token,
  apiBaseUrl,
  onCreated,
}: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a team name');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/trpc/team.create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.result?.data) {
        onCreated(data.result.data);
        setName('');
        setDescription('');
        onClose();
      } else {
        throw new Error(data.error?.message || 'Failed to create team');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>👥 Create Team</Text>
          <Text style={styles.modalSubtitle}>
            Teams separate access permissions within a workspace.
          </Text>

          <Text style={styles.label}>Team Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Backend Microservices"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. API tokens & database secrets"
            placeholderTextColor={COLORS.textMuted}
          />

          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreate}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveBtnText}>Create Team</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSubtle,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#000',
    fontWeight: '800',
  },
});
