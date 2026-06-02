import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { fireHaptic } from './haptics';
import { JuiceOverlay } from './JuiceOverlay';
import type { JuiceVerdict } from './juice.types';

export interface Burst {
  id: number;
  verdict: JuiceVerdict;
}

interface JuiceApi {
  /**
   * Trigger the celebration for a verdict. Synchronous, never throws, NEVER awaited on the logging
   * path (spec §6.4). Visuals run on the UI thread; haptics fire-and-forget.
   */
  fire: (verdict: JuiceVerdict) => void;
}

const JuiceContext = createContext<JuiceApi | null>(null);

export function JuiceProvider({ children }: { children: React.ReactNode }) {
  const [burst, setBurst] = useState<Burst | null>(null);
  const idRef = useRef(0);
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);

  const fire = useCallback(
    (verdict: JuiceVerdict) => {
      // 'minimal' = no on-screen visuals (gym/silent), but keep haptics so logging still "lands".
      if (juiceIntensity !== 'minimal') {
        idRef.current += 1;
        setBurst({ id: idRef.current, verdict });
      }
      void fireHaptic(verdict.tier);
      // Sound (expo-audio pool, gated by settings.soundOn) is wired in a later pass.
    },
    [juiceIntensity],
  );

  return (
    <JuiceContext.Provider value={{ fire }}>
      {children}
      <JuiceOverlay burst={burst} onDone={() => setBurst(null)} />
    </JuiceContext.Provider>
  );
}

export function useJuice(): JuiceApi {
  const ctx = useContext(JuiceContext);
  if (!ctx) throw new Error('useJuice must be used within <JuiceProvider>');
  return ctx;
}
