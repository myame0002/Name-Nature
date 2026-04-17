import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity } from "react-native";
import { useState } from 'react';
import { verifyTesterCode, activateTesterPremium } from '@/lib/premium';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function TesterCodeModal({ visible, onClose }: Props) {
  const [codeValue, setCodeValue] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (verifyTesterCode(codeValue)) {
      activateTesterPremium();
      setCodeValue("");
      setError(false);
      onClose();
    } else {
      setError(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>🔑 クローズドテスター登録</Text>
          <Text style={styles.modalDescription}>
            テスター用に配布されたコードを入力してください。
            完全版が永久に開放されます。
          </Text>

          <TextInput
            style={[
              styles.codeInput,
              error && styles.codeInputError
            ]}
            value={codeValue}
            onChangeText={(text) => {
              setCodeValue(text);
              setError(false);
            }}
            placeholder="コードを入力"
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {error && (
            <Text style={styles.errorText}>
              コードが正しくありません。もう一度お試しください。
            </Text>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setCodeValue("");
                setError(false);
                onClose();
              }}
            >
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalActivateButton}
              onPress={handleSubmit}
            >
              <Text style={styles.modalActivateText}>開放する</Text>
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
  codeInput: {
    borderWidth: 1.5,
    borderColor: "#D0E1D1",
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    backgroundColor: "#FBFDFC",
    textAlign: "center",
    letterSpacing: 3,
    fontWeight: "600",
  },
  codeInputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
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
  modalActivateButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#2D6A4F",
    alignItems: "center",
  },
  modalActivateText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});