// Power-fantasy THEMES (spec §5 — ORIGINAL IP only; no trademarked franchise names/phrases/assets).
// A theme is one "who do you become when you log" persona. It swaps the JUICE callouts + tier colors,
// and selects the EVOLUTION persona (the worker maps themeId → an original character prompt server-side).
//
// 드래곤볼/실존 연예인 등은 §5로 불가 → 같은 "감성"을 오리지널로 재현한다:
//   aura   = 에너지 오라 전사 (드래곤볼 '감성'의 오리지널 버전)
//   mogul  = 끝판왕 사업가 (정장 파워, 골드/블랙)
//   pro    = 프로 운동선수 (스타디움, 클러치)
//   forged = 자기수양/스토익 (단련, 모노+제이드)

import type { Tier } from '@/features/juice/juice.types';
import { colors } from '@/ui/theme/tokens';
import { ORIGINAL_CALLOUTS } from '@/features/juice/constants';

export type ThemeId = 'aura' | 'mogul' | 'pro' | 'forged';

export interface JuiceTheme {
  id: ThemeId;
  /** i18n key suffix → t(`theme.${id}.name`) / t(`theme.${id}.tagline`). */
  i18nKey: ThemeId;
  /** Rotating T4 supernova callouts (original — never a trademarked phrase). */
  callouts: readonly string[];
  /** T3 OVERDRIVE headline word. */
  overdriveLabel: string;
  /** Flash + SkSL shader color per tier (escalates T1→T4). */
  tierColor: Record<Tier, string>;
  /** Signature color (theme picker pill, accents). */
  accent: string;
}

export const THEMES: Record<ThemeId, JuiceTheme> = {
  // 오라 전사 — the energy-warrior power fantasy (original). Keeps the existing default look/callouts.
  aura: {
    id: 'aura',
    i18nKey: 'aura',
    callouts: ORIGINAL_CALLOUTS,
    overdriveLabel: 'OVERDRIVE',
    tierColor: { 1: colors.cyan, 2: colors.magenta, 3: colors.energyHi, 4: colors.flash },
    accent: colors.cyan,
  },
  // 사업가 마초 — self-made mogul. Gold/black luxury power.
  mogul: {
    id: 'mogul',
    i18nKey: 'mogul',
    callouts: ['EMPIRE!', 'CLOSE IT!', 'CEO MODE!'],
    overdriveLabel: 'POWER MOVE',
    tierColor: { 1: '#E8C66B', 2: colors.energyLo, 3: '#FF9500', 4: colors.flash },
    accent: colors.energyLo,
  },
  // 운동선수 — elite pro athlete. Stadium / clutch energy.
  pro: {
    id: 'pro',
    i18nKey: 'pro',
    callouts: ['GAME TIME!', 'CLUTCH!', 'NEW PR!'],
    overdriveLabel: 'CLUTCH',
    tierColor: { 1: colors.success, 2: colors.cyan, 3: colors.energyLo, 4: colors.flash },
    accent: colors.success,
  },
  // 자기수양 — disciplined stoic. Forged-by-discipline, mono + jade.
  forged: {
    id: 'forged',
    i18nKey: 'forged',
    callouts: ['DISCIPLINE!', 'RELENTLESS!', 'FORGED!'],
    overdriveLabel: 'FORGED',
    tierColor: { 1: colors.textDim, 2: '#7FE9C3', 3: colors.success, 4: colors.flash },
    accent: '#7FE9C3',
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function normalizeThemeId(id: string | null | undefined): ThemeId {
  return id && THEMES[id as ThemeId] ? (id as ThemeId) : 'aura';
}

/** Resolve a theme by id, falling back to the default (aura) for unknown/legacy values. */
export function getTheme(id: string | null | undefined): JuiceTheme {
  return THEMES[normalizeThemeId(id)];
}

/** Rotating original callout for the T4 supernova. */
export function calloutAt(theme: JuiceTheme, index: number): string {
  const n = theme.callouts.length;
  const i = ((index % n) + n) % n;
  return theme.callouts[i] ?? theme.callouts[0];
}
