import {
  deleteGuideEntries,
  getGuideEntries,
  waitForStorageLoad,
  type GuideEntry,
} from "@/lib/api";
import { ScreenWithLeaves } from "@/components/screen-with-leaves";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PanResponder,
  Animated,
  Easing,
} from "react-native";

import { GuideEntryCard } from "@/components/zukan/GuideEntryCard";
import { GuideEntryDetail } from "@/components/zukan/GuideEntryDetail";

const categoryLabel: Record<string, string> = {
  flower: "🌸 花",
  fungus: "🍄 菌類",
  bird: "🐦 鳥",
  insect: "🦋 昆虫",
};

const categoryColor: Record<string, string> = {
  all: "#D4C4A8",
  flower: "#E8D4C4",
  fungus: "#D4D4C4",
  bird: "#C4D4D8",
  insect: "#D4E8C4",
};

const categoryColorActive: Record<string, string> = {
  all: "#E8DDC4",
  flower: "#F3E5DB",
  fungus: "#E5E5D9",
  bird: "#D9E5E8",
  insect: "#E5F3D9",
};

type ViewMode = "list" | "detail";
type CategoryFilter = "all" | "flower" | "fungus" | "bird" | "insect";

export default function ZukanScreen() {
  const router = useRouter();

  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedEntry, setSelectedEntry] = useState<GuideEntry | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    new Set(),
  );
  const [chatInput, setChatInput] = useState("");
  const [entries, setEntries] = useState<GuideEntry[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6; // 2列 × 3行
  const pageFlipAnim = useRef(new Animated.Value(0)).current;

  // ページめくりアニメーション
  const triggerPageFlip = () => {
    pageFlipAnim.setValue(0);
    Animated.timing(pageFlipAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease)
    }).start();
  }

  // ページ変更時にアニメーションを実行
  useEffect(() => {
    triggerPageFlip();
  }, [currentPage]);

  // スワイプでページめくり
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      // 水平方向のスワイプだけを検知
      return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.vx) > 0.3;
    },
    onPanResponderRelease: (_, gestureState) => {
      if (viewMode !== "list") return;

      if (gestureState.dx < -50) {
        // 左スワイプ → 次のページ
        setCurrentPage((p) => Math.min(totalPages, p + 1));
      } else if (gestureState.dx > 50) {
        // 右スワイプ → 前のページ
        setCurrentPage((p) => Math.max(1, p - 1));
      }
    },
  });

  // 画面表示時にデータを読み込み
  useEffect(() => {
    async function init() {
      await waitForStorageLoad();
      loadEntries();
    }
    init();
  }, []);

  // 画面に戻ってきた時に再読み込み（ナビゲーションイベント）
  useEffect(() => {
    // 初回読み込み
    loadEntries();
    // 画面表示のたびに更新
    const interval = setInterval(() => {
      loadEntries();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function loadEntries() {
    // 新しいもの順（ID降順）で並び替え
    const sorted = getGuideEntries().sort((a, b) => {
      // IDがタイムスタンプ形式なので数値に変換して比較
      return (
        parseInt(b.id.replace("entry-", "")) -
        parseInt(a.id.replace("entry-", ""))
      );
    });
    setEntries(sorted);
  }

  const filteredEntries =
    selectedCategory === "all"
      ? entries
      : entries.filter((e) => e.category === selectedCategory);

  // カテゴリが変わったら1ページ目に戻す
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEntries.length / ITEMS_PER_PAGE),
  );
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageEndIndex = pageStartIndex + ITEMS_PER_PAGE;
  const pageEntries = filteredEntries.slice(pageStartIndex, pageEndIndex);

  const currentEntryIndex = selectedEntry
    ? filteredEntries.findIndex((e) => e.id === selectedEntry.id)
    : -1;

  const hasPrevEntry = currentEntryIndex > 0;
  const hasNextEntry = currentEntryIndex < filteredEntries.length - 1;

  const handlePrevEntry = () => {
    if (hasPrevEntry) {
      setSelectedEntry(filteredEntries[currentEntryIndex - 1]);
    }
  };

  const handleNextEntry = () => {
    if (hasNextEntry) {
      setSelectedEntry(filteredEntries[currentEntryIndex + 1]);
    }
  };

  const handleEntryClick = (entry: GuideEntry) => {
    if (isEditMode) {
      handleToggleSelectEntry(entry.id);
    } else {
      setSelectedEntry(entry);
      setViewMode("detail");
    }
  };

  const handleBackToList = () => {
    setViewMode("list");
    setSelectedEntry(null);
  };

  const handleToggleEditMode = () => {
    setIsEditMode(!isEditMode);
    setSelectedEntryIds(new Set());
  };

  const handleToggleSelectEntry = (entryId: string) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedEntryIds.size === filteredEntries.length) {
      setSelectedEntryIds(new Set());
    } else {
      setSelectedEntryIds(new Set(filteredEntries.map((e) => e.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedEntryIds.size === 0) return;

    Alert.alert(
      "削除の確認",
      `選択した ${selectedEntryIds.size} 件のデータを完全に削除しますか？\nこの操作は取り消すことができません。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: () => {
            const deleteCount = deleteGuideEntries(
              Array.from(selectedEntryIds),
            );
            setSelectedEntryIds(new Set());
            setIsEditMode(false);
            loadEntries();
            Alert.alert("完了", `${deleteCount} 件の記録を削除しました`);
          },
        },
      ],
    );
  };

  return (
    <ScreenWithLeaves noScroll={true}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 本ののりしろは一覧モードのみ表示 */}
      {viewMode === "list" && <View style={styles.bookBinding} />}
      {/* ヘッダー: 戻るボタン + アクションボタン */}
      <View style={[styles.topHeaderRow, viewMode === 'detail' && styles.topHeaderRowDetail]}>
        {viewMode === "list" && (
          <View style={styles.backButtonContainer}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.backText}>← 戻る</Text>
            </TouchableOpacity>
          </View>
        )}

        {viewMode === "list" && (
        <View style={styles.actionButtonsRight}>
          {!isEditMode ? (
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleToggleEditMode}
              activeOpacity={0.7}
            >
              <Text style={styles.editButtonText}>✎ 編集</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleSelectAll}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>
                  {selectedEntryIds.size === filteredEntries.length
                    ? "選択解除"
                    : "全て選択"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.editButton}
                onPress={handleToggleEditMode}
                activeOpacity={0.7}
              >
                <Text style={styles.editButtonText}>✓ 完了</Text>
              </TouchableOpacity>

              {selectedEntryIds.size > 0 && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  activeOpacity={0.7}
                  onPress={handleDeleteSelected}
                >
                  <Text
                    style={[styles.actionButtonText, styles.deleteButtonText]}
                  >
                    削除 ({selectedEntryIds.size})
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        )}
      </View>

      {viewMode === "list" ? (
        <View {...panResponder.panHandlers}>
          {/* カテゴリタブ */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
          >
            <TouchableOpacity
              style={[
                styles.tabButton,
                {
                  backgroundColor:
                    selectedCategory === "all"
                      ? categoryColorActive["all"]
                      : categoryColor["all"],
                },
                selectedCategory === "all" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedCategory("all")}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  selectedCategory === "all" && styles.tabTextActive,
                ]}
              >
                全て
              </Text>
            </TouchableOpacity>

            {Object.entries(categoryLabel).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor:
                      selectedCategory === key
                        ? categoryColorActive[key]
                        : categoryColor[key],
                  },
                  selectedCategory === key && styles.tabButtonActive,
                ]}
                onPress={() => setSelectedCategory(key as CategoryFilter)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    selectedCategory === key && styles.tabTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Entry List */}
          <Animated.View style={[styles.grid, {
            opacity: pageFlipAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 0.8, 1]
            }),
            transform: [{
              translateX: pageFlipAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 15, 0]
              })
            }]
          }]}>
            {pageEntries.map((entry, index) => {
              // 全体での番号（古いものから連番）
              const totalIndex = entries.findIndex((e) => e.id === entry.id);
              const number = entries.length - totalIndex;

              return (
                <View key={entry.id} style={styles.gridItem}>
                  <GuideEntryCard
                    entry={entry}
                    entryNumber={number}
                    isSelected={selectedEntryIds.has(entry.id)}
                    isEditMode={isEditMode}
                    onPress={() => handleEntryClick(entry)}
                  />
                </View>
              );
            })}
          </Animated.View>

          {/* ページネーション */}
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[
                styles.pageButton,
                currentPage === 1 && styles.pageButtonDisabled,
              ]}
              onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              activeOpacity={0.7}
            >
              <Text style={styles.pageButtonText}>← 前へ</Text>
            </TouchableOpacity>

            <View style={styles.pageCenterColumn}>
              <Text style={styles.pageNumberText}>
                {currentPage} / {totalPages}
              </Text>
              <Text style={styles.swipeHintText}>スワイプでもページ移動可</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.pageButton,
                currentPage === totalPages && styles.pageButtonDisabled,
              ]}
              onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              activeOpacity={0.7}
            >
              <Text style={styles.pageButtonText}>次へ →</Text>
            </TouchableOpacity>
          </View>
        </View>
       ) : (
         selectedEntry && (
           <GuideEntryDetail
             entry={selectedEntry}
             entryNumber={entries.length - entries.findIndex((e) => e.id === selectedEntry.id)}
             hasPrevEntry={hasPrevEntry}
             hasNextEntry={hasNextEntry}
             currentPositionText={`${currentEntryIndex + 1} / ${filteredEntries.length}`}
             onPrevEntry={handlePrevEntry}
             onNextEntry={handleNextEntry}
             onBackToList={handleBackToList}
             onEntryUpdated={loadEntries}
           />
         )
       )}
    </ScrollView>
    </ScreenWithLeaves>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 0,
  },
  topHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  topHeaderRowDetail: {
    marginTop: 16,
    marginBottom: 4,
    justifyContent: "flex-end",
  },
  actionButtonsRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  backButtonContainer: {},
  backText: {
    fontSize: 15,
    color: "#2D6A4F",
    fontWeight: "600",
    marginBottom: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 0,
    marginHorizontal: 0,
    marginBottom: -1,
    marginTop: 0,
    paddingTop: 7,
    paddingHorizontal: 8,
    zIndex: 10,
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
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#D4C4A8",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    marginRight: 2,
    transform: [{ skewX: "-5deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 0,
  },
  tabButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
    paddingVertical: 10,
    marginTop: -4,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5C4A32",
    transform: [{ skewX: "5deg" }],
  },
  tabTextActive: {
    color: "#2D6A4F",
    fontWeight: "700",
  },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5DC",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2D6A4F",
  },
  deleteButton: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  deleteButtonText: {
    color: "#DC2626",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    backgroundColor: "#F8F3E6",
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E8E0CE",
    minHeight: 645,
  },
  // 3列表示: 100% を (3 + 隙間2つ)で割る
  gridItem: {
    width: "47%",
  },
  bookBinding: {
    position: "absolute",
    left: 0,
    top: 113,
    bottom: 68,
    width: 22,
    backgroundColor: "rgba(157, 97, 44, 0.79)",
    borderRightWidth: 4,
    borderRightColor: "rgb(112, 96, 83)",
    zIndex: -1,
  },

  bookPageLine: {
    position: "absolute",
    left: -20,
    top: 0,
    bottom: 0,
    width: 52,
    backgroundColor: "transparent",
    borderRightWidth: 1,
    borderRightColor: "rgba(139, 119, 101, 0.15)",
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 8,
  },
  pageCenterColumn: {
    alignItems: "center",
    gap: 2,
  },
  swipeHintText: {
    fontSize: 10,
    color: "#8B7765",
    opacity: 0.7,
  },
  pageButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5DC",
  },
  pageButtonDisabled: {
    opacity: 0.4,
  },
  pageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2D6A4F",
  },
  pageNumberText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D6A4F",
  },

});
