import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenWithLeaves } from "../components/screen-with-leaves";

import {
  addGuideEntry,
  deleteGuideEntry,
  analyzeNaturePhoto,
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
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null); // 保存済みエントリーID

  // 各セクションのアニメーション実行済みフラグ（一度実行したら永久に維持）
  const [animatedSections, setAnimatedSections] = useState<Set<string>>(
    new Set(),
  );
  const scrollViewRef = useRef<ScrollView>(null);
  const decisionSectionRef = useRef<View>(null);
  const [decisionVisible, setDecisionVisible] = useState(false);

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
      Alert.alert("権限が必要です", "カメラへのアクセスを許可してください。");
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
      Alert.alert("エラー", "画像の読み込みに失敗しました。");
      setImageUri(null);
      setAnalysisStatus("idle");
    }
  }

  async function handlePickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "権限が必要です",
        "写真ライブラリへのアクセスを許可してください。",
      );
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

    // Build data URL from base64 if available, otherwise convert from URI
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
      Alert.alert("エラー", "画像の読み込みに失敗しました。");
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
        "ja",
      );
      setCandidates(response.results);
      setAnalysisStatus("success");

      if (response.results.length === 0) {
        setAnalysisMessage(
          "候補が見つかりませんでした。別カテゴリや別の写真で試してみてください。",
        );
      }
    } catch (error) {
      setAnalysisStatus("error");

      if (
        error instanceof Error &&
        error.message.includes("Error scoring image")
      ) {
        setAnalysisMessage(
          "アップロードされた画像のファイル形式に対応していません。JPG, PNG 形式の画像でお試しください。",
        );
      } else {
        setAnalysisMessage(
          error instanceof Error
            ? error.message
            : "解析中にエラーが発生しました。",
        );
      }
    }
  }

  function handleConfirmCandidate(candidate: Candidate) {
    setConfirmedCandidateId(candidate.id);
    setCurrentDecision("confirmed");

    // 既に保存済みのエントリーがあれば先に削除
    if (savedEntryId) {
      deleteGuideEntry(savedEntryId);
    }

    // 図鑑に保存（新規または差し替え）
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

    // 保存したエントリーIDを記録
    setSavedEntryId(newEntry.id);
  }

  function handleRejectAll() {
    setConfirmedCandidateId(null);
    setCurrentDecision("rejected");

    // 既に保存済みのエントリーがあれば先に削除
    if (savedEntryId) {
      deleteGuideEntry(savedEntryId);
    }

    // 図鑑に保留として保存（新規または差し替え）
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

    // 保存したエントリーIDを記録
    setSavedEntryId(newEntry.id);
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

  // スクロール位置監視 - 決定セクションが画面内に入ったらアニメーション
  function handleScroll(event: any) {
    if (!currentDecision || decisionVisible) return;

    const scrollY = event.nativeEvent.contentOffset.y;
    const screenHeight = event.nativeEvent.layoutMeasurement.height;
    const contentHeight = event.nativeEvent.contentSize.height;

    // スクロールが下端に近づいたら自動的に表示
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

  // アニメーション付きセクションラッパー（メモ化済みで画像のちらつき防止）
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
        // 既にアニメーション済みのセクションは何もしない
        if (animatedSections.has(id)) {
          opacity.setValue(1);
          translateY.setValue(0);
          return;
        }

        // 初回表示時のみアニメーション実行
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
          // アニメーション完了後、永久に実行済みとしてマーク
          setAnimatedSections((prev) => new Set([...prev, id]));
        });
      }, [id]);

      return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
          {children}
        </Animated.View>
      );
    };
  }, [animatedSections]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <ScreenWithLeaves
      scrollViewProps={{
        ref: scrollViewRef,
        contentContainerStyle: styles.content,
        onScroll: handleScroll,
        scrollEventThrottle: 16,
      }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
      </View>

      {/* ── Step 1: Category Selection ── */}
      <View style={styles.section}>
        <View style={styles.sectionStringLeft} />
        <View style={styles.sectionStringRight} />
        <View style={styles.sectionNailLeft} />
        <View style={styles.sectionNailRight} />
        <Text style={styles.sectionTitle}>何と出会った？</Text>
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
                {cat.name}
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
            <Text style={styles.sectionTitle}>写真をアップロード</Text>

            {imageUri && (
              <TouchableOpacity
                style={styles.previewFrame}
                activeOpacity={0.8}
                onPress={() => {
                  Alert.alert("写真を変更", "選択してください", [
                    { text: "📷 カメラで撮影", onPress: handleTakePhoto },
                    { text: "📂 ライブラリから選ぶ", onPress: handlePickImage },
                    { text: "キャンセル", style: "cancel" },
                  ]);
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
                    📂 写真ライブラリから選ぶ
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.uploadButton}
                  activeOpacity={0.8}
                  onPress={handleTakePhoto}
                >
                  <Text style={styles.uploadButtonText}>
                    📸 カメラで撮影する
                  </Text>
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
                  <Text style={styles.analyzeButtonText}>
                    iNaturalist へ問い合わせ中…
                  </Text>
                </View>
              ) : (
                <Text style={styles.analyzeButtonText}>
                  {!imageDataUrl
                    ? "画像を選ぶと解析できます"
                    : `${selectedCategoryMeta?.name ?? ""}として候補を出す`}
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
            <Text style={styles.statusText}>
              画像を送信し、推論結果を取得しています…
            </Text>
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
            <Text style={styles.sectionTitle}>候補</Text>

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

                        {/* 和名 */}
                        <Text style={styles.candidateName}>
                          {candidate.name}
                        </Text>

                        {/* 学術名 */}
                        {candidate.scientificName &&
                          candidate.scientificName !== candidate.name && (
                            <Text style={styles.candidateScientific}>
                              {candidate.scientificName}
                            </Text>
                          )}

                        {/* 詳細へのリンク */}
                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={() =>
                            Linking.openURL(candidate.referenceUrl)
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={styles.linkButtonText}>
                            詳細を見る →
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Reject all button */}
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
                    ? "あなたに、よりよい自然の出会いを 🌿"
                    : "すみません…私に新たな発見をありがとう！"}
                </Text>

                <View style={styles.decisionActions}>
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    activeOpacity={0.85}
                    onPress={() => router.push("/zukan")}
                  >
                    <Text style={styles.primaryActionText}>図鑑を開く</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    activeOpacity={0.85}
                    onPress={handleReset}
                  >
                    <Text style={styles.secondaryActionText}>
                      別の解析を行う
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    activeOpacity={0.85}
                    onPress={() => router.back()}
                  >
                    <Text style={styles.secondaryActionText}>ホームに戻る</Text>
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

  // Header
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

  // Section
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

  // Category grid
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

  // Upload
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

  // Status panels
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

  // Empty state
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

  // Candidate list
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

  // Reject button
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

  // Decision panel
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
});
