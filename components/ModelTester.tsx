import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ModelTester() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Model Tester (placeholder)</Text>
      <Text style={styles.desc}>
        Proof-of-concept component for explore screen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    marginTop: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  desc: {
    fontSize: 13,
    color: "#666",
  },
});
