import { View, StyleSheet, ScrollView, type ScrollViewProps } from "react-native";
import { FallingLeaves, type FallingLeafConfig } from "./falling-leaves";

type ScreenWithLeavesProps = {
  children: React.ReactNode;
  scrollViewProps?: ScrollViewProps & React.RefAttributes<ScrollView>;
  leavesProps?: FallingLeafConfig;
  noScroll?: boolean;
};

export function ScreenWithLeaves({
  children,
  scrollViewProps,
  leavesProps,
  noScroll = false,
  fixedOverlay,
}: ScreenWithLeavesProps & { fixedOverlay?: React.ReactNode }) {
  return (
    <View style={styles.wrapper}>
      <FallingLeaves {...leavesProps} />

      {noScroll ? (
        <View style={styles.contentLayer}>{children}</View>
      ) : (
        <ScrollView style={styles.contentLayer} {...scrollViewProps}>
          {children}
        </ScrollView>
      )}

      {fixedOverlay && (
        <View style={styles.fixedOverlay}>{fixedOverlay}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F5F8F4",
    position: "relative",
    overflow: "hidden",
  },
  contentLayer: {
    flex: 1,
    zIndex: 10,
  },
  fixedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
});
