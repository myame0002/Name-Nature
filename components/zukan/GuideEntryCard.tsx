import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type GuideEntry, CategoryId } from "@/lib/api";

const categoryLabel: Record<string, string> = {
  flower: "🌸 花",
  fungus: "🍄 菌類",
  bird: "🐦 鳥",
  insect: "🦋 昆虫",
};

type GuideEntryCardProps = {
  entry: GuideEntry;
  entryNumber?: number;
  isSelected?: boolean;
  isEditMode?: boolean;
  onPress: () => void;
};

export function GuideEntryCard({ entry, entryNumber, isSelected = false, isEditMode = false, onPress }: GuideEntryCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        {entryNumber && (
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>No.{entryNumber}</Text>
          </View>
        )}
        
        <View style={[
          styles.checkbox,
          isSelected && styles.checkboxChecked,
          !isEditMode && styles.checkboxHidden
        ]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </View>

      <View style={[
        styles.card,
        isSelected && styles.cardSelected
      ]}>
        <Image
          source={{ uri: entry.imageDataUrl || entry.imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
        />
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{entry.title}</Text>
          {!!entry.scientificName && (
            <Text style={styles.scientific}>{entry.scientificName}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F8F3E6",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E0CE",
    padding: 8,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  cardSelected: {
    borderColor: "#2D6A4F",
    backgroundColor: "#F0F7F2",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#C5D5C9",
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
    minHeight: 22,
  },
  numberBadge: {
    backgroundColor: "#E8DDC4",
    borderWidth: 1,
    borderColor: "#D8CBB8",
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 6,
    marginBottom: -10,
    marginTop: 2,
  },
  numberText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#5C4A32",
  },
  checkboxHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  cardImage: {
    width: "100%",
    height: 110,
    borderRadius: 10,
  },
  cardBody: {
    paddingHorizontal: 4,
    gap: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F3D29",
    lineHeight: 17,
  },
  scientific: {
    fontSize: 10,
    color: "#5E7766",
    fontStyle: "italic",
  },
  meta: {
    fontSize: 12,
    color: "#627A6B",
  },
  taxonomyLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  taxonomyText: {
    fontSize: 11,
    color: "#5C7465",
  },
  note: {
    fontSize: 12,
    color: "#6B8574",
    lineHeight: 17,
    marginTop: 6,
  },
  badgeConfirmed: {
    backgroundColor: "#DDF3E6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRejected: {
    backgroundColor: "#EFEFEF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#355340",
  },
});