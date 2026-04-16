import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { useLanguage } from '@/context/LanguageContext';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenWithLeaves } from "@/components/screen-with-leaves";

const guideImages = [
  require("@/assets/images/image1.jpg"),
  require("@/assets/images/image2.jpg"),
  require("@/assets/images/image3.jpg"),
  require("@/assets/images/image4.jpg"),
  require("@/assets/images/image5.jpg"),
  require("@/assets/images/image6.jpg"),
];


export default function ModalScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(0);
  const pageFlipAnim = useRef(new Animated.Value(0)).current;

  const guideTexts = [
    t('tokenGuideStep1'),
    t('tokenGuideStep2'),
    t('tokenGuideStep3'),
    t('tokenGuideStep4'),
    t('tokenGuideStep5'),
    t('tokenGuideStep6'),
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
  const useEffect = require("react").useEffect;
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
      if (gestureState.dx < -50) {
        // 左スワイプ → 次のページ
        setCurrentPage((p) => Math.min(guideImages.length - 1, p + 1));
      } else if (gestureState.dx > 50) {
        // 右スワイプ → 前のページ
        setCurrentPage((p) => Math.max(0, p - 1));
      }
    },
  });

  const goNext = () => {
    if (currentPage < guideImages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goPrev = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <ScreenWithLeaves
      scrollViewProps={{
        contentContainerStyle: styles.container,
      }}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.backText}>← {t('back')}</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{t('tokenGuideTitle')}</Text>
      </View>

      <View style={styles.guideContainer} {...panResponder.panHandlers}>
        <View style={styles.contentWrapper}>
        <Animated.View
          style={{
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
          }}
        >
          <Image
            source={guideImages[currentPage]}
            style={styles.guideImage}
            contentFit="contain"
          />
        </Animated.View>

        <View style={styles.textContent}>
          <Text style={styles.stepNumber}>
            Step {currentPage + 1} / {guideImages.length}
          </Text>
          <Text style={styles.description}>{guideTexts[currentPage]}</Text>
        </View>
        </View>

        <View style={styles.progressDots}>
          {guideImages.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === currentPage && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.navButton,
              currentPage === 0 && styles.navButtonDisabled,
            ]}
            onPress={goPrev}
            disabled={currentPage === 0}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.navButtonText,
                currentPage === 0 && styles.navButtonTextDisabled,
              ]}
            >
              {t('previous')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navButton,
              currentPage === guideImages.length - 1 && styles.navButtonPrimary,
            ]}
            onPress={
              currentPage === guideImages.length - 1
                ? () => router.back()
                : goNext
            }
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.navButtonText,
                currentPage === guideImages.length - 1 &&
                  styles.navButtonTextPrimary,
              ]}
            >
              {currentPage === guideImages.length - 1 ? t('done') : t('next')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWithLeaves>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 36,
    paddingBottom: 70,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  header: {
    gap: 12,
    marginBottom: 16,
  },
  backText: {
    fontSize: 15,
    color: "#2D6A4F",
    fontWeight: "600",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17351F",
  },
  guideContainer: {
    flex: 1,
    flexDirection: 'column',
  },

  contentWrapper: {
    flex: 1,
    gap: 20,
    justifyContent: "center",
  },
  guideImage: {
    width: "100%",
    height: 320,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  textContent: {
    gap: 8,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2D6A4F",
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    color: "#3D5A45",
    textAlign: "center",
    lineHeight: 22,
  },
  progressDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#C5D5C9",
  },
  dotActive: {
    backgroundColor: "#2D6A4F",
    width: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  navButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D0E1D1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonPrimary: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4A6652",
  },
  navButtonTextDisabled: {
    color: "#9AB09F",
  },
  navButtonTextPrimary: {
    color: "#FFFFFF",
  },
});