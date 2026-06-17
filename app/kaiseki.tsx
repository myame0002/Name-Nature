import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useLanguage } from "@/context/LanguageContext";
import { ScreenWithLeaves } from "../components/screen-with-leaves";

import {
  addGuideEntry,
  analyzeNaturePhoto,
  deleteGuideEntry,
  uriToDataUrl,
  type AnalysisStatus,
  type Candidate,
  type CategoryId,
} from "@/lib/api";

// ── Category definitions ───────────────────────────────────────────

type CategoryMeta = {
  id: CategoryId;
  emoji: string;
  name: string;
  description: string;
};

const categories: CategoryMeta[] = [
  {
    id: "flower",
    emoji: "🌸",
    name: "花",
    description: "Flowering Plants に絞って照合します",
  },
  {
    id: "fungus",
    emoji: "🍄",
    name: "キノコ",
    description: "Fungi に絞って照合します",
  },
  {
    id: "bird",
    emoji: "🐦",
    name: "鳥",
    description: "Aves に絞って照合します",
  },
  {
    id: "insect",
    emoji: "🦋",
    name: "昆虫",
    description: "Insecta に絞って照合します",
  },
];

// ── Component ──────────────────────────────────────────────────────

export default function KaisekiScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();

  // State
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(
    null,
  );
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirmedCandidateId, setConfirmedCandidateId] = useState<
    string | null
  >(null);
  const [currentDecision, setCurrentDecision] = useState<
    "confirmed" | "rejected" | null
  >(null);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);

  const [animatedSections, setAnimatedSections] = useState<Set<string>>(
    new Set(),
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const decisionSectionRef = useRef<View>(null);
  const [decisionVisible, setDecisionVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // ── Handlers ───────────────────────────────────────────────────

  function handleCategorySelect(categoryId: CategoryId) {
    setSelectedCategory(categoryId);
    setCandidates([]);
    setAnalysisStatus(imageUri ? "ready" : "idle");
    setAnalysisMessage(null);
    setConfirmedCandidateId(null);
    setCurrentDecision(null);
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("permissionRequired"), t("cameraPermissionRequired"), [], {
        cancelable: true,
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setCandidates([]);
    setAnalysisStatus("ready");
    setAnalysisMessage(null);
    setConfirmedCandidateId(null);
    setCurrentDecision(null);

    try {
      if (asset.base64) {
        const mimeType = asset.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${asset.base64}`;
        setImageDataUrl(dataUrl);
      } else {
        const dataUrl = await uriToDataUrl(asset.uri);
        setImageDataUrl(dataUrl);
      }
    } catch {
      Alert.alert(t("error"), t("imageLoadFailed"), [], {
        cancelable: true,
      });
      setImageUri(null);
      setAnalysisStatus("idle");
    }
  }

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("permissionRequired"), t("libraryPermissionRequired"), [], {
        cancelable: true,
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setCandidates([]);
    setAnalysisStatus("ready");
    setAnalysisMessage(null);
    setConfirmedCandidateId(null);
    setCurrentDecision(null);

    try {
      if (asset.base64) {
        const mimeType = asset.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${asset.base64}`;
        setImageDataUrl(dataUrl);
      } else {
        const dataUrl = await uriToDataUrl(asset.uri);
        setImageDataUrl(dataUrl);
      }
    } catch {
      Alert.alert(t("error"), t("imageLoadFailed"), [], {
        cancelable: true,
      });
      setImageUri(null);
      setAnalysisStatus("idle");
    }
  }

  async function handleAnalyze() {
    if (!selectedCategory || !imageDataUrl) return;

    setAnalysisStatus("loading");
    setAnalysisMessage(null);
    setCandidates([]);
    setConfirmedCandidateId(null);
    setCurrentDecision(null);

    try {
      const response = await analyzeNaturePhoto(
        selectedCategory,
        imageDataUrl,
        language,
      );
      setCandidates(response.results);
      setAnalysisStatus("success");

      if (response.results.length === 0) {
        setAnalysisMessage(t("noCandidatesFound"));
      }
    } catch (error) {
      setAnalysisStatus("error");
      setAnalysisMessage(
        error instanceof Error ? error.message : t("analysisError"),
      );
    }
  }

  function handleConfirmCandidate(candidate: Candidate) {
    setConfirmedCandidateId(candidate.id);
    setCurrentDecision("confirmed");

    if (savedEntryId) {
      deleteGuideEntry(savedEntryId);
    }

    const newEntry = addGuideEntry({
      category: selectedCategory!,
      approval: "confirmed",
      title: candidate.name,
      scientificName: candidate.scientificName,
      family: candidate.taxonomy?.family ?? undefined,
      confidence: candidate.confidence,
      imageUrl: imageUri ?? "",
      imageDataUrl: candidate.referenceImage ?? undefined,
      note: "",
      chatHistory: [],
      taxonomy: candidate.taxonomy,
    });

    if (newEntry === null) {
      Alert.alert(
        t("freeLimitAlertTitle"),
        t("freeLimitAlertMessage"),
        [{ text: t("later"), style: "cancel" }, { text: t("upgradePremium") }],
        { cancelable: true },
      );
      setCurrentDecision(null);
      setConfirmedCandidateId(null);
      return;
    }

    setSavedEntryId(newEntry.id);
    setToastMessage(t("recordSaved"));
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }

  function handleRejectAll() {
    setConfirmedCandidateId(null);
    setCurrentDecision("rejected");

    if (savedEntryId) {
      deleteGuideEntry(savedEntryId);
    }

    const newEntry = addGuideEntry({
      category: selectedCategory!,
      approval: "rejected",
      title: "判定保留（再観察）",
      scientificName: "",
      imageUrl: imageUri ?? "",
      imageDataUrl: "",
      note: "",
      chatHistory: [],
    });

    if (newEntry === null) {
      Alert.alert(
        t("freeLimitAlertTitle"),
        t("freeLimitAlertMessage"),
        [{ text: t("later"), style: "cancel" }, { text: t("upgradePremium") }],
        { cancelable: true },
      );
      setCurrentDecision(null);
      return;
    }

    setSavedEntryId(newEntry.id);
    setToastMessage(t("recordSaved"));
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }

  function handleReset() {
    setSelectedCategory(null);
    setImageUri(null);
    setImageDataUrl(null);
    setAnalysisStatus("idle");
    setAnalysisMessage(null);
    setCandidates([]);
    setConfirmedCandidateId(null);
    setCurrentDecision(null);
    setSavedEntryId(null);
    setDecisionVisible(false);
  }

  function handleScroll(event: any) {
    if (!currentDecision || decisionVisible) return;

    const scrollY = event.nativeEvent.contentOffset.y;
    const screenHeight = event.nativeEvent.layoutMeasurement.height;
    const contentHeight = event.nativeEvent.contentSize.height;
    const distanceFromBottom = contentHeight - (scrollY + screenHeight);

    if (distanceFromBottom < 1) {
      setDecisionVisible(true);
    }
  }

  // ── Derived ────────────────────────────────────────────────────

  const selectedCategoryMeta = categories.find(
    (c) => c.id === selectedCategory,
  );
  const canAnalyze =
    !!selectedCategory && !!imageDataUrl && analysisStatus !== "loading";

  // ── Animation section wrapper ──────────────────────────────────

  const AnimatedSection = useMemo(() => {
    return ({
      id,
      children,
      delay = 0,
    }: {
      id: string;
      children: React.ReactNode;
      delay?: number;
    }) => {
      const opacity = useRef(new Animated.Value(0)).current;
      const translateY = useRef(new Animated.Value(-15)).current;

      useEffect(() => {
        if (animatedSections.has(id)) {
          opacity.setValue(1);
          translateY.setValue(0);
          return;
        }

        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 380,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 380,
            delay,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setAnimatedSections((prev) => new Set([...prev, id]));
        });
      }, [id, delay]);

      return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
          {children}
        </Animated.View>
      );
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <ScreenWithLeaves
      scrollViewProps={{
        ref: scrollViewRef,
        contentContainerStyle: styles.content,
        onScroll: handleScroll,
        scrollEventThrottle: 16,
      }}
      fixedOverlay={
        toastVisible && (
          <Animated.View style={styles.toastContainer}>
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          </Animated.View>
        )
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← {t("back")}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Step 1: Category Selection ── */}
      <View style={styles.section}>
        <View style={styles.sectionStringLeft} />
        <View style={styles.sectionStringRight} />
        <View style={styles.sectionNailLeft} />
        <View style={styles.sectionNailRight} />
        <Text style={styles.sectionTitle}>{t("whatDidYouFind")}</Text>
        <View style={styles.categoryGrid}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryCard,
                selectedCategory === cat.id && styles.categoryCardSelected,
              ]}
              activeOpacity={0.8}
              onPress={() => handleCategorySelect(cat.id)}
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text
                style={[
                  styles.categoryName,
                  selectedCategory === cat.id && styles.categoryNameSelected,
                ]}
              >
                {t(`category.${cat.id}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Step 2: Image Upload ── */}
      {selectedCategory && (
        <AnimatedSection id="upload" delay={120}>
          <View style={styles.section}>
            <View style={styles.sectionStringLeft} />
            <View style={styles.sectionStringRight} />
            <View style={styles.sectionNailLeft} />
            <View style={styles.sectionNailRight} />
            <Text style={styles.sectionTitle}>{t("uploadPhoto")}</Text>

            {imageUri && (
              <TouchableOpacity
                style={styles.previewFrame}
                activeOpacity={0.8}
                onPress={() => {
                  Alert.alert(
                    t("changePhoto"),
                    t("selectOption"),
                    [
                      { text: t("takePhoto"), onPress: handleTakePhoto },
                      {
                        text: t("pickFromLibrary"),
                        onPress: handlePickImage,
                      },
                      { text: t("cancel"), style: "cancel" },
                    ],
                    { cancelable: true },
                  );
                }}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.previewImage}
                  contentFit="contain"
                />
              </TouchableOpacity>
            )}

            {!imageUri && (
              <>
                <TouchableOpacity
                  style={styles.uploadButton}
                  activeOpacity={0.8}
                  onPress={handlePickImage}
                >
                  <Text style={styles.uploadButtonText}>
                    {t("pickFromLibrary")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.uploadButton}
                  activeOpacity={0.8}
                  onPress={handleTakePhoto}
                >
                  <Text style={styles.uploadButtonText}>{t("takePhoto")}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[
                styles.analyzeButton,
                !canAnalyze && styles.analyzeButtonDisabled,
              ]}
              activeOpacity={0.85}
              onPress={handleAnalyze}
              disabled={!canAnalyze}
            >
              {analysisStatus === "loading" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.analyzeButtonText}>{t("analyzing")}</Text>
                </View>
              ) : (
                <Text style={styles.analyzeButtonText}>
                  {!imageDataUrl
                    ? t("selectImageToAnalyze")
                    : t("analyzeAs", {
                        category: t(`category.${selectedCategory}`),
                      })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </AnimatedSection>
      )}

      {/* ── Loading / Error Status ── */}
      {analysisStatus === "loading" && (
        <AnimatedSection id="loading" delay={180}>
          <View style={styles.statusPanel}>
            <ActivityIndicator color="#2D6A4F" size="large" />
            <Text style={styles.statusText}>{t("uploadingImage")}</Text>
          </View>
        </AnimatedSection>
      )}

      {analysisStatus === "error" && analysisMessage && (
        <AnimatedSection id="error" delay={180}>
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>⚠ {analysisMessage}</Text>
          </View>
        </AnimatedSection>
      )}

      {/* ── Step 3: Candidate Results ── */}
      {analysisStatus === "success" && (
        <AnimatedSection id="candidates" delay={220}>
          <View style={styles.section}>
            <View style={styles.sectionStringLeft} />
            <View style={styles.sectionStringRight} />
            <View style={styles.sectionNailLeft} />
            <View style={styles.sectionNailRight} />
            <Text style={styles.sectionTitle}>{t("candidates")}</Text>

            {candidates.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  候補が見つかりませんでした
                </Text>
                <Text style={styles.emptyDesc}>
                  {analysisMessage ??
                    "カテゴリが厳しすぎる可能性があります。別カテゴリでも試してください。"}
                </Text>
              </View>
            ) : (
              <View style={styles.candidateList}>
                {candidates.map((candidate) => {
                  const isConfirmed = candidate.id === confirmedCandidateId;
                  return (
                    <TouchableOpacity
                      key={candidate.id}
                      style={[
                        styles.candidateCard,
                        isConfirmed && styles.candidateCardConfirmed,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => handleConfirmCandidate(candidate)}
                    >
                      {candidate.referenceImage ? (
                        <Image
                          source={{ uri: candidate.referenceImage }}
                          style={styles.candidateImage}
                          contentFit="contain"
                        />
                      ) : (
                        <View style={styles.candidateImageFallback}>
                          <Text style={styles.candidateImageFallbackText}>
                            参考画像なし
                          </Text>
                        </View>
                      )}

                      <View style={styles.candidateBody}>
                        <View style={styles.candidateTopRow}>
                          <View style={styles.confidenceBadge}>
                            <Text style={styles.confidenceText}>
                              {Math.round((candidate.confidence || 0) * 100)}%
                            </Text>
                          </View>
                          {isConfirmed && (
                            <View style={styles.confirmedBadge}>
                              <Text style={styles.confirmedBadgeText}>
                                ✓ 選択中
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.candidateName}>
                          {candidate.name}
                        </Text>

                        {candidate.scientificName &&
                          candidate.scientificName !== candidate.name && (
                            <Text style={styles.candidateScientific}>
                              {candidate.scientificName}
                            </Text>
                          )}

                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={() => {
                            Alert.alert(
                              t("openInaturalist"),
                              t("externalLinkConfirm"),
                              [
                                { text: t("cancel"), style: "cancel" },
                                {
                                  text: t("openInaturalist"),
                                  onPress: () =>
                                    Linking.openURL(candidate.referenceUrl),
                                },
                              ],
                              { cancelable: true },
                            );
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.linkButtonText}>
                            {t("viewDetails")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity
                  style={[
                    styles.rejectButton,
                    currentDecision === "rejected" && styles.rejectButtonActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={handleRejectAll}
                >
                  <Text style={styles.rejectButtonText}>✕ どれも違いそう…</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </AnimatedSection>
      )}

      {/* ── Decision Summary ── */}
      {currentDecision && (
        <Animated.View ref={decisionSectionRef}>
          {decisionVisible && (
            <AnimatedSection id="decision" delay={0}>
              <View style={styles.decisionPanel}>
                <Text style={styles.decisionTitle}>
                  {currentDecision === "confirmed"
                    ? t("analysisCompleteMessage")
                    : t("analysisRejectedMessage")}
                </Text>

                <View style={styles.decisionActions}>
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    activeOpacity={0.85}
                    onPress={() => router.push("/zukan")}
                  >
                    <Text style={styles.primaryActionText}>
                      {t("openGuide")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    activeOpacity={0.85}
                    onPress={handleReset}
                  >
                    <Text style={styles.secondaryActionText}>
                      {t("startNewAnalysis")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    activeOpacity={0.85}
                    onPress={() => router.back()}
                  >
                    <Text style={styles.secondaryActionText}>
                      {t("goHome")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </AnimatedSection>
          )}
        </Animated.View>
      )}

      {/* Bottom spacer */}
      <View style={{ height: 60 }} />
    </ScreenWithLeaves>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingTop: 36,
    paddingBottom: 48,
    gap: 6,
  },

  header: {
    marginTop: 0,
    gap: 6,
  },
  backText: {
    fontSize: 15,
    color: "#2D6A4F",
    fontWeight: "600",
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#17351F",
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#3D5A45",
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
    fontSize: 18,
    fontWeight: "700",
    color: "#1C3B26",
  },

  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F4F8F4",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E3ECE3",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  categoryCardSelected: {
    borderColor: "#2D6A4F",
    backgroundColor: "#E0F0E4",
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3D5A45",
  },
  categoryNameSelected: {
    color: "#1A4D30",
  },
  categoryDesc: {
    fontSize: 13,
    color: "#5C7A62",
    textAlign: "center",
  },

  previewFrame: {
    overflow: "hidden",
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  previewImage: {
    width: "100%",
    height: 240,
  },
  uploadButton: {
    backgroundColor: "#F4F8F4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D0E1D1",
    paddingVertical: 14,
    alignItems: "center",
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2D6A4F",
  },
  analyzeButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  analyzeButtonDisabled: {
    backgroundColor: "#A3BFA8",
  },
  analyzeButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  statusPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DDE6DD",
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  statusText: {
    fontSize: 14,
    color: "#3D5A45",
    textAlign: "center",
  },
  loadingBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#E3ECE3",
    borderRadius: 2,
    overflow: "hidden",
  },
  loadingBarFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#2D6A4F",
    borderRadius: 2,
  },
  errorPanel: {
    backgroundColor: "#FFF5F5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0D0D0",
    padding: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#8B3A3A",
    lineHeight: 20,
  },

  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3D5A45",
  },
  emptyDesc: {
    fontSize: 13,
    color: "#5C7A62",
    textAlign: "center",
    lineHeight: 19,
  },

  candidateList: {
    gap: 12,
  },
  candidateCard: {
    backgroundColor: "#FBFDFC",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E4ECE4",
    overflow: "hidden",
  },
  candidateCardConfirmed: {
    borderColor: "#2D6A4F",
    backgroundColor: "#EDF7F0",
  },
  candidateImage: {
    width: "100%",
    height: 240,
  },
  candidateImageFallback: {
    width: "100%",
    height: 100,
    backgroundColor: "#F0F4F0",
    alignItems: "center",
    justifyContent: "center",
  },
  candidateImageFallbackText: {
    fontSize: 13,
    color: "#8A9F8E",
  },
  candidateBody: {
    padding: 14,
    gap: 4,
  },
  candidateTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  confidenceBadge: {
    backgroundColor: "#DDF3E6",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  confidenceText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1F4C2D",
  },
  confirmedBadge: {
    backgroundColor: "#2D6A4F",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  confirmedBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  candidateName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F3D29",
  },
  candidateScientific: {
    fontSize: 13,
    color: "#5E7766",
    fontStyle: "italic",
  },
  candidateSummary: {
    fontSize: 13,
    color: "#4A6652",
    lineHeight: 19,
    marginTop: 4,
  },
  checkpointList: {
    marginTop: 6,
    gap: 2,
  },
  checkpointText: {
    fontSize: 12,
    color: "#627A6B",
  },
  linkButton: {
    marginTop: 8,
  },
  linkButtonText: {
    fontSize: 13,
    color: "#2D6A4F",
    fontWeight: "600",
  },

  rejectButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingVertical: 14,
    alignItems: "center",
  },
  rejectButtonActive: {
    backgroundColor: "#EFEFEF",
    borderColor: "#999",
  },
  rejectButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#666",
  },

  decisionPanel: {
    backgroundColor: "#E7F0E7",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D0E1D1",
    padding: 18,
    gap: 14,
  },
  decisionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#17351F",
    textAlign: "center",
  },
  decisionActions: {
    gap: 10,
  },
  primaryActionButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryActionButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFD1BF",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryActionText: {
    color: "#2A4A33",
    fontWeight: "700",
    fontSize: 14,
  },

  toastContainer: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  toast: {
    backgroundColor: "rgba(59, 130, 246, 0.92)",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});