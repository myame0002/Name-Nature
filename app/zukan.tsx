import { ScreenWithLeaves } from "@/components/screen-with-leaves";
import {
  addCustomCategory,
  deleteCustomCategory,
  deleteGuideEntries,
  getCustomCategories,
  getGuideEntries,
  isPremiumUser,
  waitForStorageLoad,
  type GuideEntry
} from "@/lib/api";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { GuideEntryCard } from "@/components/zukan/GuideEntryCard";
import { GuideEntryDetail } from "@/components/zukan/GuideEntryDetail";
import { useLanguage } from "@/context/LanguageContext";

const categoryLabel: Record<string, string> = {
  flower: `🌸 ${"category.flower"}`,
  fungus: `🍄 ${"category.fungus"}`,
  bird: `🐦 ${"category.bird"}`,
  insect: `🦋 ${"category.insect"}`,
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
  const { t, language } = useLanguage();

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
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [isCategoryEditMode, setIsCategoryEditMode] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 6; // 2列 × 3行
  const pageFlipAnim = useRef(new Animated.Value(0)).current;

  // カテゴリ追加用の色パレット
  const categoryColorOptions = [
    "#E8D4C4",
    "#D4D4C4",
    "#C4D4D8",
    "#D4E8C4",
    "#E8C4D4",
    "#C4C4E8",
    "#E8E8C4",
    "#C4E8E8",
  ];

  // ページめくりアニメーション
  const triggerPageFlip = () => {
    pageFlipAnim.setValue(0);
    Animated.timing(pageFlipAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
  };

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

      // 言語に応じたカテゴリ名を設定
      categoryLabel["flower"] = `🌸 ${t("category.flower")}`;
      categoryLabel["fungus"] = `🍄 ${t("category.fungus")}`;
      categoryLabel["bird"] = `🐦 ${t("category.bird")}`;
      categoryLabel["insect"] = `🦋 ${t("category.insect")}`;

      // 保存されているカスタムカテゴリを読み込み
      const savedCategories = getCustomCategories();
      savedCategories.forEach((cat) => {
        categoryLabel[cat.id] = cat.name;
        categoryColor[cat.id] = cat.color;
        categoryColorActive[cat.id] = cat.colorActive;
      });

      // 画面を再描画
      setSelectedCategory(selectedCategory);
    }
    init();
  }, [language]);

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

    // 詳細表示中の場合は最新のデータでselectedEntryも更新する
    if (selectedEntry) {
      const updatedEntry = sorted.find(e => e.id === selectedEntry.id);
      if (updatedEntry) {
        setSelectedEntry(updatedEntry);
      }
    }
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
    if (isEditMode || isCategoryEditMode) {
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
      t("confirmDelete"),
      t("deleteSelectedConfirm", { count: String(selectedEntryIds.size) }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: () => {
            const deleteCount = deleteGuideEntries(
              Array.from(selectedEntryIds),
            );
            setSelectedEntryIds(new Set());
            setIsEditMode(false);
            loadEntries();
            Alert.alert(t('deleteComplete'), t('entriesDeleted', { count: String(deleteCount) }), [], {
              cancelable: true,
            });
          },
        },
      ],
      { cancelable: true },
    );
  };

  const startCategoryEditMode = (categoryId: string) => {
    setTargetCategoryId(categoryId);
    setSelectedCategory("all");
    setIsCategoryEditMode(true);

    // 最初からそのカテゴリに含まれている記録を選択状態にする
    const initialSelected = new Set<string>();
    entries.forEach((entry) => {
      if (entry.category === categoryId) {
        initialSelected.add(entry.id);
      }
    });
    setSelectedEntryIds(initialSelected);

    setShowAddCategoryModal(false);
    setShowEditCategoryModal(false);
  };

  const handleCompleteCategoryEdit = () => {
    if (selectedEntryIds.size === 0) {
      setIsCategoryEditMode(false);
      setTargetCategoryId(null);
      return;
    }

    // 選択した記録を一括でカテゴリ更新
    const entries = getGuideEntries();
    entries.forEach((entry) => {
      if (selectedEntryIds.has(entry.id)) {
        entry.category = targetCategoryId! as any;
      } else if (entry.category === targetCategoryId) {
        // チェックが外されたものはカテゴリから削除（allに戻す）
        entry.category = "all" as any;
      }
    });

    setIsCategoryEditMode(false);
    const categoryId = targetCategoryId!;
    setTargetCategoryId(null);
    setSelectedEntryIds(new Set());
    loadEntries();

    // 編集したカテゴリへ自動で移動
    setTimeout(() => {
      setSelectedCategory(categoryId as any);
    }, 100);

    Alert.alert(
      "完了",
      `${selectedEntryIds.size} 件の記録をカテゴリに追加しました！`,
      [],
      {
        cancelable: true,
      },
    );
  };

  return (
    <ScreenWithLeaves noScroll={true}>
      {/* カテゴリ追加モーダル (画面全体を覆うため最上位に配置) */}
      {showAddCategoryModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>新しいしおりを追加</Text>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalLabel}>カテゴリ名</Text>
              <TextInput
                style={styles.nameInputBox}
                placeholder="名前を入力してください"
                placeholderTextColor="#999999"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus={false}
              />
            </View>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalLabel}>色を選択</Text>
              <View style={styles.colorPalette}>
                {categoryColorOptions.map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColorIndex === index &&
                        styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedColorIndex(index)}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.selectEntriesButton}
              onPress={() => {
                const categoryId = editingCategoryId || `custom-${Date.now()}`;
                startCategoryEditMode(categoryId);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.selectEntriesButtonText}>
                このカテゴリに含める記録を選択
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowAddCategoryModal(false);
                  setNewCategoryName("");
                  setSelectedColorIndex(0);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelButtonText}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => {
                  if (!newCategoryName.trim()) {
                    Alert.alert("エラー", "カテゴリ名を入力してください");
                    return;
                  }

                  const newCategoryId = `custom-${Date.now()}`;
                  const selectedColor =
                    categoryColorOptions[selectedColorIndex];

                  // 明るいバージョンの色を自動生成
                  const r = parseInt(selectedColor.slice(1, 3), 16);
                  const g = parseInt(selectedColor.slice(3, 5), 16);
                  const b = parseInt(selectedColor.slice(5, 7), 16);
                  const lightColor = `#${Math.min(255, r + 10).toString(16)}${Math.min(255, g + 10).toString(16)}${Math.min(255, b + 10).toString(16)}`;

                  // カテゴリを追加
                  categoryLabel[newCategoryId] = newCategoryName;
                  categoryColor[newCategoryId] = selectedColor;
                  categoryColorActive[newCategoryId] = lightColor;

                  // ✅ 永続化保存
                  addCustomCategory({
                    name: newCategoryName,
                    color: selectedColor,
                    colorActive: lightColor,
                  });

                  setShowAddCategoryModal(false);
                  setNewCategoryName("");
                  setSelectedColorIndex(0);

                  Alert.alert(
                    "完了",
                    `「${newCategoryName}」カテゴリを追加しました`,
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalSaveButtonText}>追加する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* カテゴリ編集モーダル */}
      {showEditCategoryModal && editingCategoryId && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>しおりを編集</Text>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalLabel}>カテゴリ名</Text>
              <TextInput
                style={styles.nameInputBox}
                placeholder="名前を入力してください"
                placeholderTextColor="#999999"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus={false}
              />
            </View>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalLabel}>色を選択</Text>
              <View style={styles.colorPalette}>
                {categoryColorOptions.map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColorIndex === index &&
                        styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedColorIndex(index)}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.selectEntriesButton}
              onPress={() => {
                const categoryId = editingCategoryId || `custom-${Date.now()}`;
                startCategoryEditMode(categoryId);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.selectEntriesButtonText}>
                このカテゴリに含める記録を選択
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalDeleteButton]}
                onPress={() => {
                  Alert.alert(
                    "削除の確認",
                    `「${categoryLabel[editingCategoryId]}」カテゴリを削除しますか？`,
                    [
                      { text: "キャンセル", style: "cancel" },
                      {
                         text: "削除する",
                         style: "destructive",
                         onPress: () => {
                           delete categoryLabel[editingCategoryId];
                           delete categoryColor[editingCategoryId];
                           delete categoryColorActive[editingCategoryId];
                           
                           // ✅ 永続化ストレージからも削除
                           deleteCustomCategory(editingCategoryId);

                           if (selectedCategory === editingCategoryId) {
                             setSelectedCategory("all");
                           }

                           setShowEditCategoryModal(false);
                           setEditingCategoryId(null);
                           setNewCategoryName("");
                           setSelectedColorIndex(0);

                           Alert.alert("完了", "カテゴリを削除しました");
                         },
                      },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalDeleteButtonText}>削除</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowEditCategoryModal(false);
                  setEditingCategoryId(null);
                  setNewCategoryName("");
                  setSelectedColorIndex(0);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelButtonText}>キャンセル</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => {
                  if (!newCategoryName.trim()) {
                    Alert.alert("エラー", "カテゴリ名を入力してください");
                    return;
                  }

                  const selectedColor =
                    categoryColorOptions[selectedColorIndex];
                  const r = parseInt(selectedColor.slice(1, 3), 16);
                  const g = parseInt(selectedColor.slice(3, 5), 16);
                  const b = parseInt(selectedColor.slice(5, 7), 16);
                  const lightColor = `#${Math.min(255, r + 10).toString(16)}${Math.min(255, g + 10).toString(16)}${Math.min(255, b + 10).toString(16)}`;

                  categoryLabel[editingCategoryId] = newCategoryName;
                  categoryColor[editingCategoryId] = selectedColor;
                  categoryColorActive[editingCategoryId] = lightColor;

                  setShowEditCategoryModal(false);
                  setEditingCategoryId(null);
                  setNewCategoryName("");
                  setSelectedColorIndex(0);

                  Alert.alert("完了", "カテゴリを更新しました");
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalSaveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.container}>
        <View style={styles.content}>
          {/* 本ののりしろは一覧モードのみ表示 */}
          {viewMode === "list" && <View style={styles.bookBinding} />}
          {/* ヘッダー: 戻るボタン + アクションボタン */}
          <View
            style={[
              styles.topHeaderRow,
              viewMode === "detail" && styles.topHeaderRowDetail,
            ]}
          >
            {viewMode === "list" && (
              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={styles.backText}>← {t("back")}</Text>
              </TouchableOpacity>
            )}

            {viewMode === "list" && (
              <View style={styles.actionButtonsRight}>
                {isCategoryEditMode ? (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleCompleteCategoryEdit}
                    activeOpacity={0.7}
                  >
                  <Text style={styles.editButtonText}>✓ {t('done')}</Text>
                  </TouchableOpacity>
                ) : !isEditMode ? (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleToggleEditMode}
                    activeOpacity={0.7}
                  >
                  <Text style={styles.editButtonText}>✎ {t('edit')}</Text>
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
                        ? t('deselectAll')
                        : t('selectAll')}
                    </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={handleToggleEditMode}
                      activeOpacity={0.7}
                    >
                    <Text style={styles.editButtonText}>✓ {t('done')}</Text>
                    </TouchableOpacity>

                    {selectedEntryIds.size > 0 && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        activeOpacity={0.7}
                        onPress={handleDeleteSelected}
                      >
                        <Text
                          style={[
                            styles.actionButtonText,
                            styles.deleteButtonText,
                          ]}
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
              {selectedCategory.startsWith("custom-") && !isEditMode && (
                <View style={styles.editHintBar}>
                  <Text style={styles.editHintText}>
                    オリジナルしおりを長押しで編集
                  </Text>
                </View>
              )}

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
                    {t("all")}
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
                    onLongPress={() => {
                      // カスタムカテゴリのみ編集可能
                      if (key.startsWith("custom-")) {
                        setEditingCategoryId(key);
                        setNewCategoryName(label);
                        const colorIndex = categoryColorOptions.indexOf(
                          categoryColor[key],
                        );
                        setSelectedColorIndex(colorIndex >= 0 ? colorIndex : 0);
                        setShowEditCategoryModal(true);
                      }
                    }}
                    activeOpacity={0.7}
                    delayLongPress={300}
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

                {/* カテゴリ追加ボタン */}
                {isPremiumUser() ? (
                  <TouchableOpacity
                    style={[styles.tabButton, styles.addTabButton]}
                    onPress={() => setShowAddCategoryModal(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addTabText}>+</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.tabButton, styles.addTabButton]}
                    onPress={() => {
                      Alert.alert(
                        "完全版機能",
                        "オリジナルしおりの作成は完全版の機能となります。\n購入すると無制限に作成できます。\n\n完全版で追加される機能:\n- 図鑑を無制限に保存可能\n- オリジナルしおりの作成\n\n以後アップデートによる追加機能を予定しています！",
                        [
                          { text: "後で", style: "cancel" },
                          { text: "完全版にアップグレード" },
                        ],
                      );
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addTabText}>+ 🔒</Text>
                  </TouchableOpacity>
                )}

                {/* 右端余白 */}
                <View style={{ width: 10 }} />
              </ScrollView>

              {/* Entry List */}
              <Animated.View
                style={[
                  styles.grid,
                  {
                    opacity: pageFlipAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [1, 0.8, 1],
                    }),
                    transform: [
                      {
                        translateX: pageFlipAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0, 15, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {pageEntries.map((entry, index) => {
                  // 全体での番号（古いものから連番）
                  const totalIndex = entries.findIndex(
                    (e) => e.id === entry.id,
                  );
                  const number = entries.length - totalIndex;

                  return (
                    <View key={entry.id} style={styles.gridItem}>
                      <GuideEntryCard
                        entry={entry}
                        entryNumber={number}
                        isSelected={selectedEntryIds.has(entry.id)}
                        isEditMode={isEditMode || isCategoryEditMode}
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
                  <Text style={styles.pageButtonText}>{t('previous')}</Text>
                </TouchableOpacity>

                <View style={styles.pageCenterColumn}>
                  <Text style={styles.pageNumberText}>
                    {currentPage} / {totalPages}
                  </Text>
                  <Text style={styles.swipeHintText}>
                    {t('swipeHint')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.pageButton,
                    currentPage === totalPages && styles.pageButtonDisabled,
                  ]}
                  onPress={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pageButtonText}>{t('next')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            selectedEntry && (
              <GuideEntryDetail
                entry={selectedEntry}
                entryNumber={
                  entries.length -
                  entries.findIndex((e) => e.id === selectedEntry.id)
                }
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
        </View>
      </View>
    </ScreenWithLeaves>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    padding: 12,
    paddingTop: 24,
    paddingBottom: 50,
    gap: 0,
    flex: 1,
    justifyContent: 'space-between',
  },
  topHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
    height: 32,
  },
  topHeaderRowDetail: {
    height: 0,
    opacity: 0,
    margin: 0,
    padding: 0,
  },
  actionButtonsRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  backButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backText: {
    fontSize: 15,
    color: "#2D6A4F",
    fontWeight: "600",
    marginBottom: 4,
  },
  editHintBar: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 12,
    marginBottom: 4,
    marginTop: -33,
    alignSelf: "center",
  },
  editHintText: {
    fontSize: 11,
    color: "#666666",
    fontWeight: "500",
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
    paddingHorizontal: 14,
    paddingVertical: 5,
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
    color: "#927d63",
    transform: [{ skewX: "5deg" }],
  },
  tabTextActive: {
    color: "#2D6A4F",
    fontWeight: "700",
  },
  addTabButton: {
    backgroundColor: "#E8E8E8",
    opacity: 0.7,
  },
  addTabText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#888888",
    transform: [{ skewX: "5deg" }],
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
    rowGap: 6,
    backgroundColor: "#F8F3E6",
    borderRadius: 8,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E8E0CE",
    minHeight: 630,
  },
  // 3列表示: 100% を (3 + 隙間2つ)で割る
  gridItem: {
    width: "47%",
  },
  bookBinding: {
    position: "absolute",
    left: -10,
    top: 111,
    bottom: 93,
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
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    width: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2D6A4F",
    marginBottom: 20,
    textAlign: "center",
  },
  modalInputRow: {
    marginBottom: 20,
    gap: 8,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5C4A32",
  },
  nameInputBox: {
    borderWidth: 1,
    borderColor: "#DCE5DC",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#FAFAFA",
  },
  nameInputPlaceholder: {
    color: "#999999",
    fontSize: 14,
  },
  colorPalette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: "#2D6A4F",
    borderWidth: 3,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelButton: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#DDDDDD",
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666666",
  },
  modalSaveButton: {
    backgroundColor: "#2D6A4F",
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalDeleteButton: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  modalDeleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  selectEntriesButton: {
    width: "100%",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F5F8F5",
    borderWidth: 1,
    borderColor: "#C5D5C9",
    alignItems: "center",
    marginBottom: 16,
  },
  selectEntriesButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2D6A4F",
  },
});
