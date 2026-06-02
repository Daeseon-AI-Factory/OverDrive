import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSettingsStore } from '../../stores/settingsStore';
import { fireHaptic } from './haptics';
import { JuiceOverlay } from './JuiceOverlay';
import type { JuiceVerdict } from './juice.types';

export interface Burst {
  id: number;
  verdict: JuiceVerdict;
}

interface JuiceApi {
  /** Trigger the celebration. Synchronous, never throws, NEVER awaited on the logging path (§6.4). */
  fire: (verdict: JuiceVerdict) => void;
}

const JuiceContext = createContext<JuiceApi | null>(null);

export function JuiceProvider({ children }: { children: React.ReactNode }) {
  const [burst, setBurst] = useState<Burst | null>(null);
  const idRef = useRef(0);
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }));

  const fire = useCallback(
    (verdict: JuiceVerdict) => {
      if (juiceIntensity !== 'minimal') {
        idRef.current += 1;
        setBurst({ id: idRef.current, verdict });

        // Screen shake — the whole app jolts. Bigger for higher tiers / effort.
        if (verdict.tier >= 2) {
          const amp = 3 + 12 * verdict.intensity01 + (verdict.tier - 2) * 5;
          const d = 45;
          // Reanimated shared-value mutation from a JS handler is the documented pattern; the new
          // react-hooks/immutability rule over-flags it here.
          // eslint-disable-next-line react-hooks/immutability
          shakeX.value = withSequence(
            withTiming(amp, { duration: d }),
            withTiming(-amp, { duration: d }),
            withTiming(amp * 0.6, { duration: d }),
            withTiming(-amp * 0.45, { duration: d }),
            withTiming(0, { duration: d }),
          );
          // eslint-disable-next-line react-hooks/immutability
          shakeY.value = withSequence(
            withTiming(-amp * 0.5, { duration: d }),
            withTiming(amp * 0.35, { duration: d }),
            withTiming(0, { duration: d * 2 }),
          );
        }
      }
      void fireHaptic(verdict.tier);
    },
    [juiceIntensity, shakeX, shakeY],
  );

  return (
    <JuiceContext.Provider value={{ fire }}>
      <Animated.View style={[styles.flex, shakeStyle]}>{children}</Animated.View>
      <JuiceOverlay burst={burst} onDone={() => setBurst(null)} />
    </JuiceContext.Provider>
  );
}

export function useJuice(): JuiceApi {
  const ctx = useContext(JuiceContext);
  if (!ctx) throw new Error('useJuice must be used within <JuiceProvider>');
  return ctx;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
