// Skin resolution — React context + useSkin(). Skins own CHROME (panel geometry / material /
// glow / bar / CTA); personas (features/theme/themes.ts) stay orthogonal and own JUICE
// callouts + tier colors.

import React, { createContext, useContext } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { SKINS } from './registry';
import type { HudSkin, SkinId } from './types';

export const DEFAULT_SKIN_ID: SkinId = 'reactor';

/** Tolerant id → SkinId. Unknown/legacy stored values fall back to the default skin. */
export function normalizeSkinId(id: string | null | undefined): SkinId {
  return id != null && Object.prototype.hasOwnProperty.call(SKINS, id) ? (id as SkinId) : DEFAULT_SKIN_ID;
}

/** Resolve a skin by id, falling back to the default ('reactor') for unknown values. */
export function getSkin(id: string | null | undefined): HudSkin {
  return SKINS[normalizeSkinId(id)];
}

const SkinContext = createContext<HudSkin | null>(null);

/**
 * Provides the active HudSkin to the tree. Explicit `skinId` wins; otherwise the id is read from
 * the settings store (`skinId` is persisted alongside aestheticPref — the settings batch adds the
 * typed field, and the tolerant read below picks it up the moment it lands, no edit needed here).
 */
export function SkinProvider({ skinId, children }: { skinId?: SkinId; children: React.ReactNode }) {
  // Forward-compat read: UserSettings doesn't declare `skinId` until the settings batch lands.
  const stored = useSettingsStore((s) => (s as unknown as { skinId?: string }).skinId);
  const skin = getSkin(skinId ?? stored);
  return <SkinContext.Provider value={skin}>{children}</SkinContext.Provider>;
}

/**
 * Active skin, or null when no SkinProvider is mounted. Primitives use this to fall back to the
 * legacy MONOLITH token rendering (tests render without a provider — must not crash or reskin).
 */
export function useSkinOrNull(): HudSkin | null {
  return useContext(SkinContext);
}

/** Active skin; without a provider resolves the default skin ('reactor'). Never throws. */
export function useSkin(): HudSkin {
  return useContext(SkinContext) ?? SKINS[DEFAULT_SKIN_ID];
}
