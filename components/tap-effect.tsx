import { useRef, useCallback } from "react";
import { Animated, Easing, StyleSheet, View, TouchableWithoutFeedback, type GestureResponderEvent } from "react-native";

type TapEffectParticle = {
  id: number;
  x: number;
  y: number;
  anim: Animated.Value;
  angle: number;
  velocity: number;
  size: number;
  color: string;
  rotation: number;
};

type TapEffectProps = {
  children: React.ReactNode;
  enabled?: boolean;
};

export function TapEffect({ children, enabled = true }: TapEffectProps) {
  const particles = useRef<TapEffectParticle[]>([]);
  const idCounter = useRef(0);
  
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const ripplePos = useRef({ x: 0, y: 0 });

  const handleTap = useCallback((event: GestureResponderEvent) => {
    if (!enabled) return;
    
    const { locationX, locationY } = event.nativeEvent;
    const x = locationX;
    const y = locationY;
    
    // 🔵 緑の光のリップルエフェクト
    ripplePos.current = { x, y };
    rippleAnim.setValue(0);
    
    Animated.timing(rippleAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
    
    // 🍃 葉っぱパーティクル
    const particleCount = 7;
    const newParticles: TapEffectParticle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.6;
      const velocity = 80 + Math.random() * 120;
      const size = 10 + Math.random() * 14;
      
      const colors = ["#8BB06C", "#6B9B5B", "#5A8A4D", "#77A85F", "#9BC57D"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      newParticles.push({
        id: idCounter.current++,
        x,
        y,
        anim: new Animated.Value(0),
        angle,
        velocity,
        size,
        color,
        rotation: Math.random() * 360,
      });
    }
    
    particles.current = [...particles.current, ...newParticles];
    
    newParticles.forEach(particle => {
      Animated.timing(particle.anim, {
        toValue: 1,
        duration: 700 + Math.random() * 400,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        particles.current = particles.current.filter(p => p.id !== particle.id);
      });
    });
    
  }, [enabled, rippleAnim]);

  const getRippleStyle = () => {
    const scale = rippleAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.05, 3.5],
    });
    
    const opacity = rippleAnim.interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [0.65, 0.4, 0],
    });
    
    return {
      left: ripplePos.current.x - 40,
      top: ripplePos.current.y - 40,
      transform: [{ scale }],
      opacity,
    };
  };

  const getParticleStyle = (particle: TapEffectParticle) => {
    const progress = particle.anim;
    
    const moveDistance = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, particle.velocity],
    });
    
    const translateY = progress.interpolate({
      inputRange: [0, 0.35, 1],
      outputRange: [0, -25, 90],
    });
    
    const translateX = Animated.multiply(moveDistance, Math.cos(particle.angle));
    const rotate = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [`${particle.rotation}deg`, `${particle.rotation + 720}deg`],
    });
    
    const opacity = progress.interpolate({
      inputRange: [0, 0.7, 1],
      outputRange: [0.85, 0.7, 0],
    });
    
    return {
      position: 'absolute' as const,
      left: particle.x - particle.size / 2,
      top: particle.y - particle.size / 2,
      width: particle.size,
      height: particle.size,
      backgroundColor: particle.color,
      transform: [
        { translateX },
        { translateY },
        { rotate },
      ],
      opacity,
      borderTopStartRadius: 0,
      borderTopEndRadius: particle.size,
      borderBottomStartRadius: particle.size,
      borderBottomEndRadius: particle.size,
    };
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <TouchableWithoutFeedback
          onPress={handleTap}
        >
          <View style={styles.touchableArea} />
        </TouchableWithoutFeedback>
      </View>

      {children}
      
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* 光のリップル */}
        <Animated.View style={[styles.ripple, getRippleStyle()]} />
        
        {/* 葉っぱパーティクル */}
        {particles.current.map(particle => (
          <Animated.View
            key={particle.id}
            style={getParticleStyle(particle)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  touchableArea: {
    flex: 1,
  },
  ripple: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 176, 108, 0.5)',
  }
});