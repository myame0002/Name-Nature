import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity } from "react-native";
import { useLanguage } from '@/context/LanguageContext';
import { setInaturalistToken } from '@/lib/api';
import { useState } from 'react';
import * as Clipboard from "expo-clipboard";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function TokenInputModal({ visible, onClose, onSuccess }: Props) {
  const { t } = useLanguage();
  const [tokenInputValue, setTokenInputValue] = useState("");

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('setApiToken')}</Text>
          <Text style={styles.modalDescription}>
            {t('tokenDescription')}
          </Text>

          <TextInput
            style={styles.tokenInput}
            value={tokenInputValue}
            onChangeText={setTokenInputValue}
            placeholder={t('tokenPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={4}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setTokenInputValue("");
                onClose();
              }}
            >
              <Text style={styles.modalCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={async () => {
                if (tokenInputValue.trim()) {
                  await setInaturalistToken(tokenInputValue.trim());
                  setTokenInputValue("");
                  onClose();
                  if (onSuccess) {
                    onSuccess();
                  }
                }
              }}
            >
              <Text style={styles.modalSaveText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#17351F",
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 14,
    color: "#5C7A62",
    textAlign: "center",
    lineHeight: 20,
  },
  tokenInput: {
    borderWidth: 1.5,
    borderColor: "#D0E1D1",
    borderRadius: 12,
    padding: 14,
    fontSize: 13,
    backgroundColor: "#FBFDFC",
    textAlignVertical: "top",
    minHeight: 100,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0E1D1",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#4A6652",
    fontWeight: "700",
    fontSize: 15,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
  },
  modalSaveText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});