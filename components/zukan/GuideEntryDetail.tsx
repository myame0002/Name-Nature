import { useLanguage } from "@/context/LanguageContext";
import { type GuideEntry, updateGuideEntry } from "@/lib/api";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";

type GuideEntryDetailProps = {
  entry: GuideEntry;
  entryNumber: number;
  hasPrevEntry: boolean;
  hasNextEntry: boolean;
  currentPositionText: string;
  onPrevEntry: () => void;
  onNextEntry: () => void;
  onBackToList: () => void;
  onEntryUpdated: () => void;
};

export function GuideEntryDetail({
  entry,
  entryNumber,
  hasPrevEntry,
  hasNextEntry,
  currentPositionText,
  onPrevEntry,
  onNextEntry,
  onBackToList,
  onEntryUpdated,
}: GuideEntryDetailProps) {
  const { t } = useLanguage();
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;

  // 画面を開いた最初の瞬間のデータを永久に保持
  const originalEntry = useRef({
    title: entry.title,
    scientificName: entry.scientificName,
    observedAt: entry.observedAt,
    taxonomy: {
      kingdom: entry.taxonomy?.kingdom || "",
      phylum: entry.taxonomy?.phylum || "",
      class: entry.taxonomy?.class || "",
      order: entry.taxonomy?.order || "",
      family: entry.taxonomy?.family || "",
    },
    note: entry.note,
  }).current;

  const [editValues, setEditValues] = useState({
    title: entry.title,
    scientificName: entry.scientificName,
    observedAt: entry.observedAt,
    taxonomy: {
      kingdom: entry.taxonomy?.kingdom || "",
      phylum: entry.taxonomy?.phylum || "",
      class: entry.taxonomy?.class || "",
      order: entry.taxonomy?.order || "",
      family: entry.taxonomy?.family || "",
    },
    note: entry.note,
  });

  // キーボード表示/非表示の監視
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        Animated.timing(keyboardOffsetAnim, {
          toValue: event.endCoordinates.height,
          duration: event.duration || 250,
          useNativeDriver: false,
          easing: Easing.out(Easing.ease),
        }).start();
      },
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        Animated.timing(keyboardOffsetAnim, {
          toValue: 0,
          duration: event.duration || 250,
          useNativeDriver: false,
          easing: Easing.out(Easing.ease),
        }).start();
      },
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Android 戻るボタンハンドラ
  const handleBackPress = useCallback(() => {
    onBackToList();
    return true; // デフォルトの戻る動作をキャンセル
  }, [onBackToList]);

  useEffect(() => {
    if (Platform.OS === "android") {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        handleBackPress,
      );
      return () => {
        subscription.remove();
      };
    }
  }, [handleBackPress]);

  // シーケンスアニメーション用
  const animMainCard = useRef(new Animated.Value(0)).current;
  const animSection1 = useRef(new Animated.Value(0)).current;
  const animSection2 = useRef(new Animated.Value(0)).current;
  const animSection3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.timing(animMainCard, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.12)),
      }),
      Animated.timing(animSection1, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.12)),
      }),
      Animated.timing(animSection2, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.12)),
      }),
      Animated.timing(animSection3, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
        easing: Easing.out(Easing.back(1.12)),
      }),
    ]).start();
  }, []);

  // 親から渡されるentryが更新された時にローカルステートも更新する
  useEffect(() => {
    setEditValues({
      title: entry.title,
      scientificName: entry.scientificName,
      observedAt: entry.observedAt,
      taxonomy: {
        kingdom: entry.taxonomy?.kingdom || "",
        phylum: entry.taxonomy?.phylum || "",
        class: entry.taxonomy?.class || "",
        order: entry.taxonomy?.order || "",
        family: entry.taxonomy?.family || "",
      },
      note: entry.note,
    });
  }, [entry]);

  const handleSave = () => {
    updateGuideEntry(entry.id, {
      title: editValues.title,
      scientificName: editValues.scientificName,
      observedAt: editValues.observedAt,
      note: editValues.note,
      taxonomy: entry.taxonomy
        ? {
            ...entry.taxonomy,
            kingdom: editValues.taxonomy.kingdom || null,
            phylum: editValues.taxonomy.phylum || null,
            class: editValues.taxonomy.class || null,
            order: editValues.taxonomy.order || null,
            family: editValues.taxonomy.family || null,
            genus: entry.taxonomy.genus,
            species: entry.taxonomy.species,
          }
        : undefined,
    });
    setIsEditMode(false);
    onEntryUpdated();
    Alert.alert(t("saveComplete"), t("saveCompleteMessage"), [], { cancelable: true });
  };

  const handleCancel = () => {
    setEditValues({
      title: entry.title,
      scientificName: entry.scientificName,
      observedAt: entry.observedAt,
      taxonomy: {
        kingdom: entry.taxonomy?.kingdom || "",
        phylum: entry.taxonomy?.phylum || "",
        class: entry.taxonomy?.class || "",
        order: entry.taxonomy?.order || "",
        family: entry.taxonomy?.family || "",
      },
      note: entry.note,
    });
    setIsEditMode(false);
  };

  const handleReset = () => {
    Alert.alert(
      t("resetConfirm"),
      t("resetConfirmMessage"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("reset"),
          style: "destructive",
        onPress: () => {
          // 候補を選んで保存された瞬間の元のデータに戻す
          const base = entry.original || entry;
          setEditValues({
            title: base.title,
            scientificName: base.scientificName,
            observedAt: entry.observedAt,
            taxonomy: {
              kingdom: base.taxonomy?.kingdom || "",
              phylum: base.taxonomy?.phylum || "",
              class: base.taxonomy?.class || "",
              order: base.taxonomy?.order || "",
              family: base.taxonomy?.family || "",
            },
            note: entry.note,
          });
        },
        },
      ],
      { cancelable: true },
    );
  };

  const updateTaxonomy = (field: string, value: string) => {
    setEditValues((prev) => ({
      ...prev,
      taxonomy: {
        ...prev.taxonomy,
        [field]: value,
      },
    }));
  };

  return (
    <>
      <Animated.View
        style={[styles.container, { paddingBottom: keyboardOffsetAnim }]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <TouchableWithoutFeedback
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View style={styles.touchableInnerContainer}>
              <View style={styles.topRow}>
                <TouchableOpacity
                  style={styles.backToListButton}
                  onPress={onBackToList}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backToListText}>← {t("backToList")}</Text>
                </TouchableOpacity>

                {!isEditMode ? (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => setIsEditMode(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.editButtonText}>✎ {t("edit")}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.editActionsRow}>
                    <TouchableOpacity
                      style={styles.resetIconButton}
                      onPress={handleReset}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resetIconText}>↺</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancel}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelButtonText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={handleSave}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.saveButtonText}>{t("save")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.detailContainer}>
                <Animated.View
                  style={[
                    styles.mainCard,
                    {
                      opacity: animMainCard,
                      transform: [
                        {
                          translateY: animMainCard.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-40, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.mainCardNailLeft} />
                  <View style={styles.mainCardNailRight} />
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setIsImageFullscreen(true)}
                  >
                    <Image
                      source={{ uri: entry.imageUrl }}
                      style={styles.detailImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>

                  <View style={styles.detailHeader}>
                    <Text style={styles.entryNumber}>No.{entryNumber}</Text>
                    {isEditMode ? (
                      <TextInput
                        style={styles.editTitleInput}
                        value={editValues.title}
                        onChangeText={(value) =>
                          setEditValues((prev) => ({ ...prev, title: value }))
                        }
                      />
                    ) : (
                      <Text style={styles.detailTitle}>{entry.title}</Text>
                    )}

                    {isEditMode ? (
                      <TextInput
                        style={styles.editScientificInput}
                        value={editValues.scientificName}
                        onChangeText={(value) =>
                          setEditValues((prev) => ({
                            ...prev,
                            scientificName: value,
                          }))
                        }
                      />
                    ) : (
                      <Text style={styles.detailScientific}>
                        {entry.scientificName}
                      </Text>
                    )}

                    {isEditMode ? (
                      <TextInput
                        style={styles.editDateInput}
                        value={editValues.observedAt}
                        onChangeText={(value) =>
                          setEditValues((prev) => ({
                            ...prev,
                            observedAt: value,
                          }))
                        }
                      />
                    ) : (
                      <Text style={styles.detailMeta}>
                        {entry.category === "flower"
                          ? `🌸 ${t("category.flower")}`
                          : entry.category === "fungus"
                            ? `🍄 ${t("category.fungus")}`
                            : entry.category === "bird"
                              ? `🐦 ${t("category.bird")}`
                              : entry.category === "insect"
                                ? `🦋 ${t("category.insect")}`
                                : ""}{" "}
                        | {entry.observedAt}
                      </Text>
                    )}
                  </View>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.section,
                    {
                      opacity: animSection1,
                      transform: [
                        {
                          translateY: animSection1.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-40, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.sectionStringLeft} />
                  <View style={styles.sectionStringRight} />
                  <View style={styles.sectionNailLeft} />
                  <View style={styles.sectionNailRight} />
                  <Text style={styles.sectionTitle}>{t("taxonomy")}</Text>
                  <View style={styles.taxonomyGrid}>
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>
                        {t("taxonomy.kingdom")}
                      </Text>
                      {isEditMode ? (
                        <TextInput
                          style={styles.taxonomyEditInput}
                          value={editValues.taxonomy.kingdom}
                          onChangeText={(value) =>
                            updateTaxonomy("kingdom", value)
                          }
                        />
                      ) : (
                        <Text style={styles.taxonomyValue}>
                          {entry.taxonomy?.kingdom || "-"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>
                        {t("taxonomy.phylum")}
                      </Text>
                      {isEditMode ? (
                        <TextInput
                          style={styles.taxonomyEditInput}
                          value={editValues.taxonomy.phylum}
                          onChangeText={(value) =>
                            updateTaxonomy("phylum", value)
                          }
                        />
                      ) : (
                        <Text style={styles.taxonomyValue}>
                          {entry.taxonomy?.phylum || "-"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>
                        {t("taxonomy.class")}
                      </Text>
                      {isEditMode ? (
                        <TextInput
                          style={styles.taxonomyEditInput}
                          value={editValues.taxonomy.class}
                          onChangeText={(value) =>
                            updateTaxonomy("class", value)
                          }
                        />
                      ) : (
                        <Text style={styles.taxonomyValue}>
                          {entry.taxonomy?.class || "-"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>
                        {t("taxonomy.order")}
                      </Text>
                      {isEditMode ? (
                        <TextInput
                          style={styles.taxonomyEditInput}
                          value={editValues.taxonomy.order}
                          onChangeText={(value) =>
                            updateTaxonomy("order", value)
                          }
                        />
                      ) : (
                        <Text style={styles.taxonomyValue}>
                          {entry.taxonomy?.order || "-"}
                        </Text>
                      )}
                    </View>
                    <View style={styles.taxonomyRow}>
                      <Text style={styles.taxonomyLabel}>
                        {t("taxonomy.family")}
                      </Text>
                      {isEditMode ? (
                        <TextInput
                          style={styles.taxonomyEditInput}
                          value={editValues.taxonomy.family}
                          onChangeText={(value) =>
                            updateTaxonomy("family", value)
                          }
                        />
                      ) : (
                        <Text style={styles.taxonomyValue}>
                          {entry.taxonomy?.family || "-"}
                        </Text>
                      )}
                    </View>
                  </View>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.section,
                    {
                      opacity: animSection2,
                      transform: [
                        {
                          translateY: animSection2.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-40, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View style={styles.sectionStringLeft} />
                  <View style={styles.sectionStringRight} />
                  <View style={styles.sectionNailLeft} />
                  <View style={styles.sectionNailRight} />
                  <Text style={styles.sectionTitle}>{t("note")}</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={editValues.note}
                    onChangeText={(value) =>
                      setEditValues((prev) => ({ ...prev, note: value }))
                    }
                    multiline
                    placeholder={t("notePlaceholder")}
                    onBlur={() => {
                      if (editValues.note !== entry.note) {
                        updateGuideEntry(entry.id, { note: editValues.note });
                        onEntryUpdated();
                      }
                    }}
                  />
                </Animated.View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </Animated.View>

      {/* フルスクリーン画像モーダル */}
      <Modal
        visible={isImageFullscreen}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setIsImageFullscreen(false)}
      >
        <TouchableOpacity
          style={styles.fullscreenModalOverlay}
          activeOpacity={1}
          onPress={() => setIsImageFullscreen(false)}
        >
          <Image
            source={{ uri: entry.imageUrl }}
            style={styles.fullscreenImage}
            contentFit="contain"
          />
          <Text style={styles.fullscreenCloseHint}>タップで閉じる</Text>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  touchableInnerContainer: {
    flex: 1,
    minHeight: "100%",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backToListButton: {},
  backToListText: {
    fontSize: 15,
    color: "#2D6A4F",
    fontWeight: "600",
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eefeeb",
    borderWidth: 1,
    borderColor: "#DCE5DC",
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2D6A4F",
  },
  editActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  resetIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF3CD",
    borderWidth: 1,
    borderColor: "#FFEEBA",
    alignItems: "center",
    justifyContent: "center",
  },
  resetIconText: {
    fontSize: 18,
    color: "#856404",
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666666",
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#2D6A4F",
    borderWidth: 1,
    borderColor: "#2D6A4F",
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 0,
  },
  detailContainer: {
    gap: 5.5,
  },
  mainCard: {
    backgroundColor: "#F5EDE0",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#D4C4A8",
    padding: 12,
    gap: 12,
    shadowColor: "#987B58",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 9,
    elevation: 5,
    position: "relative",
  },
  mainCardNailLeft: {
    position: "absolute",
    bottom: 10,
    left: 16,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#6B543A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  mainCardNailRight: {
    position: "absolute",
    bottom: 10,
    right: 16,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#6B543A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  detailImage: {
    width: "100%",
    height: 240,
    borderRadius: 16,
  },
  detailHeader: {
    gap: 4,
  },
  entryNumber: {
    fontSize: 11,
    color: "#8B7765",
    fontWeight: "600",
    letterSpacing: 1,
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17351F",
  },
  editTitleInput: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17351F",
    borderBottomWidth: 1,
    borderBottomColor: "#DCE5DC",
    paddingVertical: 4,
  },
  detailScientific: {
    fontSize: 14,
    color: "#5E7766",
    fontStyle: "italic",
  },
  editScientificInput: {
    fontSize: 14,
    color: "#5E7766",
    fontStyle: "italic",
    borderBottomWidth: 1,
    borderBottomColor: "#DCE5DC",
    paddingVertical: 2,
  },
  detailMeta: {
    fontSize: 13,
    color: "#627A6B",
    marginTop: 4,
    textAlign: "center",
  },
  editDateInput: {
    fontSize: 13,
    color: "#627A6B",
    marginTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#DCE5DC",
    paddingVertical: 2,
  },
  detailNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E3ECE3",
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5DC",
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D6A4F",
  },
  navPosition: {
    fontSize: 14,
    color: "#5C7465",
    fontWeight: "500",
  },
  section: {
    backgroundColor: "#F5EDE0",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderWidth: 1.5,
    borderColor: "#D4C4A8",
    padding: 14,
    paddingTop: 22,
    gap: 10,
    position: "relative",
    marginTop: 18,
    shadowColor: "#987B58",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  sectionNailLeft: {
    position: "absolute",
    top: 6,
    left: 16,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#6B543A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  sectionNailRight: {
    position: "absolute",
    top: 6,
    right: 16,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#6B543A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  sectionStringLeft: {
    position: "absolute",
    top: -26,
    left: 18,
    width: 2,
    height: 26,
    backgroundColor: "rgba(120, 100, 70, 0.55)",
    zIndex: -1,
  },
  sectionStringRight: {
    position: "absolute",
    top: -26,
    right: 18,
    width: 2,
    height: 26,
    backgroundColor: "rgba(120, 100, 70, 0.55)",
    zIndex: -1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F3D29",
    marginBottom: 4,
  },
  taxonomyGrid: {
    flexDirection: "column",
    gap: 8,
  },
  taxonomyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  taxonomyLabel: {
    width: 70,
    fontSize: 13,
    color: "#627A6B",
    fontWeight: "500",
  },
  taxonomyValue: {
    flex: 1,
    fontSize: 13,
    color: "#2D6A4F",
    fontWeight: "600",
  },
  taxonomyEditInput: {
    flex: 1,
    fontSize: 13,
    color: "#2D6A4F",
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomColor: "#DCE5DC",
    paddingVertical: 2,
  },
  noteInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE5DC",
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  fullscreenModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  fullscreenImage: {
    width: Dimensions.get("window").width - 32,
    height: Dimensions.get("window").height - 120,
    borderRadius: 8,
  },
  fullscreenCloseHint: {
    position: "absolute",
    bottom: 40,
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
});
