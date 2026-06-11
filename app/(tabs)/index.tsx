import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useRef, useEffect } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Linking,
} from "react-native";

import { ScreenWithLeaves } from "../../components/screen-with-leaves";
import { TokenInputModal } from '../../components/TokenInputModal';
import { TesterCodeModal } from '../../components/TesterCodeModal';
import { hasValidToken, setInaturalistToken, loadStoredToken, isPremiumUser } from '@/lib/api';
import { purchasePremium } from '@/lib/premium';
import { useLanguage } from '@/context/LanguageContext';

type Step = {
  title: string;
  desc: string;
};

type GuideEntry = {
  id: string;
  category: "flower" | "fungus" | "bird" | "insect";
  approval: "confirmed" | "rejected";
  title: string;
  scientificName: string;
  family?: string;
  observedAt: string;
  confidence?: number;
  imageUrl: string;
  note: string;
};

const steps: Step[] = [
  {
    title: "1. カテゴリを選ぶ",
    desc: "花・菌類・鳥・昆虫から観察対象を選びます。",
  },
  {
    title: "2. 写真をアップロード",
    desc: "撮影した自然写真を読み込んで解析準備。",
  },
  {
    title: "3. 候補を確認・記録",
    desc: "候補を選んで図鑑へ保存してコレクション化。",
  },
];

const mockGuideEntries: GuideEntry[] = [
  {
    id: "entry-1",
    category: "flower",
    approval: "confirmed",
    title: "オオイヌノフグリ",
    scientificName: "Veronica persica",
    family: "Plantaginaceae",
    observedAt: "2026-04-07",
    confidence: 0.93,
    imageUrl:
      "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=1200",
    note: "公園の芝生で観察。朝の光で花弁が鮮やか。",
  },
  {
    id: "entry-2",
    category: "bird",
    approval: "confirmed",
    title: "シマエナガ",
    scientificName: "Aegithalos caudatus",
    family: "Aegithalidae",
    observedAt: "2026-04-05",
    confidence: 0.88,
    imageUrl:
      "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=1200",
    note: "林縁で群れを確認。鳴き声が高く可愛い。",
  },
  {
    id: "entry-3",
    category: "insect",
    approval: "rejected",
    title: "判定保留（再観察）",
    scientificName: "",
    observedAt: "2026-04-03",
    imageUrl:
      "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1200",
    note: "ピントが甘く候補を確定できず。",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { t, language, setLanguage } = useLanguage();
  const [tokenStatus, setTokenStatus] = useState<'checking' | 'valid' | 'invalid' | 'expired'>('checking');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showTesterCode, setShowTesterCode] = useState(false);
  const [secretTapCount, setSecretTapCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  
  // 設定モーダル表示アニメーション
  const settingsModalAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showSettings) {
      // 下からスライドイン
      Animated.spring(settingsModalAnim, {
        toValue: 1,
        tension: 70,
        friction: 14,
        useNativeDriver: true,
      }).start();
    } else {
      // 下へスライドアウト
      Animated.timing(settingsModalAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showSettings]);

  // 設定画面を開いた時に状態を確認
  useEffect(() => {
    if (showSettings) {
      setIsPremium(isPremiumUser());
      if (hasValidToken()) {
        setTokenStatus('valid');
      } else {
        setTokenStatus('invalid');
      }
    }
  }, [showSettings]);

  return (
    <ScreenWithLeaves
      scrollViewProps={{ contentContainerStyle: styles.content }}
    >
        {/* 全体中央寄せコンテナ */}
        <View style={styles.centerContainer}>
        {/* タイトルセクション */}
        <View style={styles.titleSection}>
        <Animated.Text style={styles.appName}>Name Nature</Animated.Text>
        <Text style={styles.tagline}>{t('tagline')}</Text>
        </View>

        {/* メインアクションボタン */}
        <View style={styles.mainActions}>
        
          <View style={styles.buttonHangWrapper}>
            <View style={styles.hangStringLeft} />
            <View style={styles.hangStringRight} />
              <TouchableOpacity
              style={styles.mainPrimaryButton}
              activeOpacity={0.85}
              onPress={() => {
                if (!hasValidToken()) {
                  Alert.alert(
                    t('iNaturalistAlertTitle'),
                    t('iNaturalistAlertMessage'),
                    [
                      { text: t('readDetails'), onPress: () => router.push("/modal") },
                      { text: t('getToken'), onPress: () => Linking.openURL("https://www.inaturalist.org/users/api_token") },
                      { 
                        text: t('enterToken'), 
                        onPress: () => {
                          setShowTokenInput(true);
                        }
                      },
                      { text: t('later'), style: "cancel" }
                    ],
                    { cancelable: true }
                  );
                  return;
                }
                router.push("/kaiseki");
              }}
            >
              <View style={styles.nailLeft} />
              <View style={styles.nailRight} />
              <Text style={styles.mainPrimaryButtonText}>{t('startAnalysis')}</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.buttonHangWrapper}>
            <View style={styles.hangStringLeft} />
            <View style={styles.hangStringRight} />
            <TouchableOpacity
              style={styles.mainSecondaryButton}
              activeOpacity={0.85}
              onPress={() => router.push("/zukan")}
            >
              <View style={styles.nailLeft} />
              <View style={styles.nailRight} />
              <Text style={styles.mainSecondaryButtonText}>{t('viewGuide')}</Text>
            </TouchableOpacity>
          </View>

           <TouchableOpacity 
             style={styles.settingsButton} 
             activeOpacity={0.7}
             onPress={() => {
               // 隠し機能: 設定ボタンを10回タップするとテスターコード入力画面が開く
               const newCount = secretTapCount + 1;
               setSecretTapCount(newCount);
               
               if (newCount >= 10) {
                 setSecretTapCount(0);
                 setShowTesterCode(true);
               } else {
                 setShowSettings(true);
               }
             }}
             onLongPress={() => {
               // 長押しでも開く
               setShowTesterCode(true);
             }}
           >
             <Text style={styles.settingsButtonText}>{t('settings')}</Text>
           </TouchableOpacity>
        </View>
      </View>

      {/* 設定モーダル */}
      <Modal visible={showSettings} transparent animationType="none">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => {
            // 先に下へスライドアウトアニメーション実行
            Animated.timing(settingsModalAnim, {
              toValue: 0,
              duration: 280,
              useNativeDriver: true,
            }).start(() => {
              // アニメーション完了後にModalを非表示
              setShowSettings(false);
            });
          }}
        >
          <Animated.View style={[
            styles.settingsModal,
            {
               transform: [{
                 translateY: settingsModalAnim.interpolate({
                   inputRange: [0, 1],
                   outputRange: [850, 0],
                 }),
               }],
              opacity: settingsModalAnim,
            }
          ]}>
            <Text style={styles.settingsTitle}>{t('settingsTitle')}</Text>
            
            {/* 言語設定 */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('language')}</Text>
              <View style={styles.languageButtons}>
                <TouchableOpacity 
                  style={[styles.langButton, language === "ja" && styles.langButtonActive]}
                  onPress={() => setLanguage("ja")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langButtonText, language === "ja" && styles.langButtonTextActive]}>日本語</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.langButton, language === "en" && styles.langButtonActive]}
                  onPress={() => setLanguage("en")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.langButtonText, language === "en" && styles.langButtonTextActive]}>English</Text>
                </TouchableOpacity>
              </View>
            </View>

             {/* 🔑 APIトークン状態 */}
             <View style={styles.settingRow}>
               <Text style={styles.settingLabel}>{t('apiToken')}</Text>
               <View style={styles.tokenStatusContainer}>
                 <View style={[
                   styles.tokenStatusBadge,
                   tokenStatus === 'valid' && styles.tokenStatusValid,
                   tokenStatus === 'invalid' && styles.tokenStatusInvalid,
                   tokenStatus === 'expired' && styles.tokenStatusExpired,
                 ]}>
                   <Text style={[
                     styles.tokenStatusText,
                     tokenStatus === 'valid' && styles.tokenStatusTextValid,
                   ]}>
                     {tokenStatus === 'valid' ? t('tokenValid') :
                      tokenStatus === 'expired' ? t('tokenExpired') : t('tokenInvalid')}
                   </Text>
                 </View>
                 <TouchableOpacity 
                   style={[styles.toggleButton, { marginLeft: 8 }]}
                   onPress={() => setShowTokenInput(true)}
                   activeOpacity={0.8}
                 >
                   <Text style={styles.toggleButtonText}>
                     {t('enterToken')}
                   </Text>
                 </TouchableOpacity>
               </View>
             </View>

            <View style={styles.tokenDebugRow}>
              <TouchableOpacity
                style={styles.debugButton}
                onPress={() => setInaturalistToken(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.debugButtonText}>{t('deleteToken')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.debugButton}
                onPress={async () => {
                  await loadStoredToken();
                  hasValidToken() ? setTokenStatus('valid') : setTokenStatus('invalid');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.debugButtonText}>{t('refreshStatus')}</Text>
              </TouchableOpacity>
            </View>

          {/* 完全版ステータス */}
          {isPremium ? (
            <View style={styles.premiumStatus}>
              <Text style={styles.premiumStatusText}>{t('premiumUser')}</Text>
              <Text style={styles.premiumStatusSubtext}>{t('premiumUnlimited')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.mainSecondaryButton, { borderRadius: 16, marginTop: 8, marginBottom: 8 }]}
              activeOpacity={0.8}
              onPress={() => purchasePremium()}
            >
              <Text style={styles.mainSecondaryButtonText}>{t('upgradePremium')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.settingsCloseButton}
              onPress={() => {
                Animated.timing(settingsModalAnim, {
                  toValue: 0,
                  duration: 280,
                  useNativeDriver: true,
                }).start(() => {
                  setShowSettings(false);
                });
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.settingsCloseButtonText}>{t('close')}</Text>
            </TouchableOpacity>
           </Animated.View>
        </TouchableOpacity>
      </Modal>

       {/* 🔑 トークン入力モーダル */}
       <TokenInputModal
         visible={showTokenInput}
         onClose={() => setShowTokenInput(false)}
         onSuccess={() => {
           Alert.alert(t('setupComplete'), t('tokenSaved'), [], { cancelable: true });
         }}
       />

       {/* 🔑 テスターコード入力モーダル */}
       <TesterCodeModal
         visible={showTesterCode}
         onClose={() => setShowTesterCode(false)}
       />

     </ScreenWithLeaves>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
    gap: 32,
    position: "relative",
    zIndex: 10,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  settingsButton: {
    backgroundColor: "transparent",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  settingsButtonText: {
    fontSize: 16,
    color: "#5C7A62",
    fontWeight: "600",
  },
  mainActions: {
    gap: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  buttonHangWrapper: {
    position: "relative",
    alignItems: "center",
  },
  hangStringLeft: {
    position: "absolute",
    top: -26,
    left: 18,
    width: 2,
    height: 26,
    backgroundColor: "rgba(120, 100, 70, 0.55)",
    zIndex: -1,
  },
  hangStringRight: {
    position: "absolute",
    top: -26,
    right: 18,
    width: 2,
    height: 26,
    backgroundColor: "rgba(120, 100, 70, 0.55)",
    zIndex: -1,
  },
  mainPrimaryButton: {
    backgroundColor: "#C2A988",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#987B58",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    width: "100%",
    position: "relative",
  },
  mainPrimaryButtonText: {
    color: "#4A3A28",
    fontWeight: "700",
    fontSize: 18,
  },
  mainSecondaryButton: {
    backgroundColor: "#F5EDE0",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderWidth: 1.5,
    borderColor: "#D4C4A8",
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    shadowColor: "#987B58",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
    position: "relative",
  },
  mainSecondaryButtonText: {
    color: "#5A4833",
    fontWeight: "700",
    fontSize: 18,
  },
  nailLeft: {
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
  nailRight: {
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
  titleSection: {
    gap: 8,
    alignItems: "center",
  },
  appName: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#2D6A4F",
    textShadowColor: "rgba(45, 106, 79, 0.15)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  tagline: {
    fontSize: 15,
    color: "#3D5A45",
  },
  heroPanel: {
    backgroundColor: "#E7F0E7",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D0E1D1",
    overflow: "hidden",
  },
  heroCopy: {
    padding: 18,
    gap: 10,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#17351F",
  },
  heroLead: {
    fontSize: 14,
    lineHeight: 21,
    color: "#34503C",
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#BFD1BF",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#2A4A33",
    fontWeight: "700",
  },
  visualWrap: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: "row",
    gap: 10,
  },
  visualOne: {
    flex: 1,
    height: 120,
    borderRadius: 14,
  },
  visualTwo: {
    flex: 1,
    height: 120,
    borderRadius: 14,
  },
  sectionHeader: {
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5C7A62",
    letterSpacing: 1,
  },
  stepsGrid: {
    gap: 10,
  },
  stepCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E0E7DF",
    gap: 6,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C3B26",
  },
  stepDesc: {
    fontSize: 13,
    color: "#4A6652",
    lineHeight: 18,
  },
  guideSection: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE6DD",
    padding: 14,
    gap: 10,
  },
  guideTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C3B26",
  },
  guideSubTitle: {
    fontSize: 13,
    color: "#557060",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#F4F8F4",
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E3ECE3",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1F4C2D",
  },
  statLabel: {
    fontSize: 12,
    color: "#5C7465",
  },
  searchInput: {
    backgroundColor: "#F7FAF7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E4D9",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1C3B26",
  },
  guideList: {
    gap: 10,
  },
  guideCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FBFDFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4ECE4",
    padding: 8,
  },
  guideImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
  },
  guideCardBody: {
    flex: 1,
    gap: 2,
  },
  guideCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  guideCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1F3D29",
  },
  guideScientific: {
    fontSize: 12,
    color: "#5E7766",
    fontStyle: "italic",
  },
  guideMeta: {
    fontSize: 12,
    color: "#627A6B",
  },
  guideConfidence: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2C6B48",
  },
  statusConfirmed: {
    backgroundColor: "#DDF3E6",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusRejected: {
    backgroundColor: "#EFEFEF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#355340",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 6,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1D3F2B",
  },
  modalScientific: {
    fontSize: 13,
    color: "#64806D",
    fontStyle: "italic",
  },
  modalMeta: {
    fontSize: 13,
    color: "#536A5B",
  },
  modalNoteTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: "#274734",
  },
  modalNote: {
    fontSize: 14,
    lineHeight: 20,
    color: "#486254",
  },
  closeButton: {
    marginTop: 12,
    backgroundColor: "#2D6A4F",
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 11,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  // 設定モーダル
   settingsModal: {
     backgroundColor: "#FFFFFF",
     borderTopLeftRadius: 24,
     borderTopRightRadius: 24,
     padding: 24,
     paddingBottom: 80,
     gap: 20,
   },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1D3F2B",
    textAlign: "center",
    marginBottom: 8,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EEE8",
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2A4A33",
  },
  languageButtons: {
    flexDirection: "row",
    gap: 8,
  },
  langButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F5F8F4",
    borderWidth: 1,
    borderColor: "#D9E4D9",
  },
  langButtonActive: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  langButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5C7A62",
  },
  langButtonTextActive: {
    color: "#FFFFFF",
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F5F8F4",
    borderWidth: 1,
    borderColor: "#D9E4D9",
    minWidth: 90,
    alignItems: "center",
  },
  toggleButtonActive: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5C7A62",
  },
  toggleButtonTextActive: {
    color: "#FFFFFF",
  },
  settingsCloseButton: {
    marginTop: 12,
    backgroundColor: "#2D6A4F",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 14,
  },
  settingsCloseButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },

  // 完全版ステータス
  premiumStatus: {
    backgroundColor: "#DDF3E6",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#2D6A4F",
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    marginBottom: 8,
  },
  premiumStatusText: {
    color: "#1F4C2D",
    fontWeight: "700",
    fontSize: 16,
  },
  premiumStatusSubtext: {
    color: "#3D7A55",
    fontSize: 12,
  },

  // トークンステータス表示
  tokenStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  tokenStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  tokenStatusValid: {
    backgroundColor: "#DDF3E6",
    borderColor: "#2D6A4F",
  },
  tokenStatusInvalid: {
    backgroundColor: "#FFF5F5",
    borderColor: "#E07070",
  },
  tokenStatusExpired: {
    backgroundColor: "#FFF9E5",
    borderColor: "#E0B040",
  },
  tokenStatusText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666666",
  },
  tokenStatusTextValid: {
    color: "#1F4C2D",
  },
  tokenDebugRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  debugButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F5F8F4",
    borderWidth: 1,
    borderColor: "#D9E4D9",
    alignItems: "center",
  },
  debugButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5C7A62",
  },
  debugButtonWarn: {
    backgroundColor: "#FFF9E5",
    borderColor: "#E0B040",
  },
  debugButtonTextWarn: {
    color: "#8B6910",
  },

  // トークン入力モーダル
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
