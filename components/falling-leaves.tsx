import { useRef, useEffect } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

export type FallingLeafConfig = {
  count?: number;
  baseDuration?: number;
  randomDurationOffset?: number;
  color?: string;
  leafSize?: number;
  maxOpacity?: number;
};

export function FallingLeaves({
  count = 8,
  baseDuration = 10000,
  randomDurationOffset = 7000,
  color = "#8BB06C",
  leafSize = 24,
  maxOpacity = 0.3,
}: FallingLeafConfig) {
  const leafAnims = useRef(
    [...Array(count)].map(() => {
      const startPos = Math.random();
      return {
        anim: new Animated.Value(startPos),
        startPos,
        baseX: (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 40),
        yRange: -100 - Math.random() * 50,
        opacityMax: 0.1 + Math.random() * maxOpacity,
        fadeOutStart: 0.75 + Math.random() * 0.15,
        leftPos: 10 + Math.random() * 340,
      };
    })
  ).current;

  useEffect(() => {
    leafAnims.forEach(({ anim, startPos }) => {
      const duration = baseDuration + Math.random() * randomDurationOffset;

      const animate = () => {
        anim.setValue(startPos);
        Animated.timing(anim, {
          toValue: 1,
          duration: duration * (1 - startPos),
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => {
          anim.setValue(0);
          Animated.loop(
            Animated.timing(anim, {
              toValue: 1,
              duration,
              easing: Easing.linear,
              useNativeDriver: true,
            })
          ).start();
        });
      };

      animate();
    });
  }, []);

  const leafStyle = (leaf: typeof leafAnims[0]) => {
    if (!leaf || !leaf.anim) return {};

    const translateY = leaf.anim.interpolate({
      inputRange: [0, 1],
      outputRange: [leaf.yRange, 950],
    });
    const translateX = leaf.anim.interpolate({
      inputRange: [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1],
      outputRange: [
        0,
        leaf.baseX,
        leaf.baseX * 0.4,
        -leaf.baseX * 0.6,
        leaf.baseX * 0.8,
        -leaf.baseX * 0.3,
        leaf.baseX * 0.1,
      ],
    });
    const rotate = leaf.anim.interpolate({
      inputRange: [0, 1],
      outputRange: [`${Math.random() * 360}deg`, `${Math.random() * 360 + 720}deg`],
    });
    const opacity = leaf.anim.interpolate({
      inputRange: [0, 0.08, 0.7, leaf.fadeOutStart, 1],
      outputRange: [0, leaf.opacityMax, leaf.opacityMax, 0, 0],
    });

    return {
      transform: [{ translateY }, { translateX }, { rotate }],
      opacity,
      left: leaf.leftPos,
    };
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {leafAnims.map((leaf, i) => (
        <Animated.View
          key={i}
          style={[
            styles.leafBg,
            leafStyle(leaf),
            { width: leafSize, height: leafSize, backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  leafBg: {
    position: "absolute",
    top: -40,
    borderTopStartRadius: 0,
    borderTopEndRadius: 20,
    borderBottomStartRadius: 20,
    borderBottomEndRadius: 20,
    transform: [{ rotate: "30deg" }],
  },
});