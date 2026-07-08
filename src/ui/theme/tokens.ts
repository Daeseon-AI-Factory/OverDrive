// MONOLITH design tokens — one light in a dark machine.
//
// The interface is a matte-black machined chassis; exactly ONE thing is powered on: the persona
// accent (settings.aestheticPref → getTheme().accent → makeAccent). Depth comes from four stacked
// monochrome surfaces, 1pt strokes, and a single top edge-highlight per card — never from color
// count or drop shadows. Color is a signal with strict meaning:
//   - accent  = what is ALIVE right now (current CP, active session, focused input, selected tab)
//   - semantic green/amber/red = small status text (+ progress-complete fill) ONLY
//   - everything else recedes into the monochrome ladder.
//
// Hard limits (허접-prevention law — see the overhaul spec):
//   1. ONE accent hue per rendered view.
//   2. Glow budget: 2 per screen (hero CP textShadow + one LiveDot/live stepper). shadowOpacity 0
//      and elevation 0 everywhere else.
//   3. Zero colored container borders except the 2pt live rail and the focused input.
//   4. Anton = hero grade word + JUICE callouts only (Latin/digits only — Hangul renders fallback).
//      Orbitron = digits only, never words.
//   5. System text uses exactly two weights: '400' and '600'.

import type { TextStyle } from 'react-native';

export const colors = {
  // ── Neutral ladder (blue-violet tinted grays; never pure #000/#FFF in chrome) ──────────────
  /** App canvas — Screen root, behind AmbientAura. */
  bg0: '#060609',
  /** Tab bar, sticky headers. */
  bg1: '#0A0A10',
  /** Inputs, progress tracks, wells — things that go DOWN. */
  recess: '#0B0B12',
  /** Card base. */
  surface1: '#10101A',
  /** Elevated: chips, ghost/icon buttons, nested blocks inside a Card. */
  surface2: '#161624',
  /** Pressed state of surface2 elements. */
  surface3: '#1C1C2C',
  /** Card/input borders (1pt) + hairline separators. */
  line: '#20202C',
  /** Sheet grabber, emphasized dividers. */
  lineStrong: '#2C2C3C',
  /** 1pt top edge-highlight inside cards/sheets (light falling on machined metal). */
  edgeHi: 'rgba(255,255,255,0.05)',
  /** Primary text. */
  text: '#EEEFF6',
  /** Secondary text. */
  text2: '#9EA0B2',
  /** Tertiary text — overlines, hints, disclaimers. */
  text3: '#62647A',
  textDisabled: '#3E4052',
  /** Sheet scrim. */
  backdrop: 'rgba(4,4,8,0.72)',

  // ── Semantic (≤13pt status text + progress-complete fill ONLY; never surfaces/borders/buttons,
  //    single exception: the recording-state IconSquare) ─────────────────────────────────────
  positive: '#35D08E',
  warning: '#E8B84B',
  danger: '#F4586A',
  /** JUICE flash layer only — never UI chrome. */
  flash: '#FFFFFF',

  // ── Legacy aliases (deprecated — migrate to the ladder names above) ────────────────────────
  /** @deprecated Use `bg0`. */
  bg: '#060609',
  /** @deprecated Use `surface1`. */
  surface: '#10101A',
  /** @deprecated Use `surface2`. */
  surfaceAlt: '#161624',
  /** @deprecated Use `text2`. */
  textDim: '#9EA0B2',

  // ── JUICE-quarantined hues (deprecated as UI tokens) ───────────────────────────────────────
  // These survive ONLY for themes.ts tierColor + src/features/juice/** shaders. Never reference
  // them in UI chrome — the persona accent (makeAccent) is the only colored UI value.
  /** @deprecated JUICE/themes only — never UI chrome. */
  cyan: '#22E6FF',
  /** @deprecated JUICE/themes only — never UI chrome. */
  magenta: '#FF1E8C',
  /** @deprecated JUICE/themes only — never UI chrome. */
  violet: '#8A5BFF',
  /** @deprecated JUICE/themes only — never UI chrome. */
  energyLo: '#FFC53D',
  /** @deprecated JUICE/themes only — never UI chrome. */
  energyHi: '#FF3B30',
  /** @deprecated JUICE/themes only (pro/forged tier colors). UI status text uses `positive`. */
  success: '#3DFFB0',
} as const;

// ── Accent ramp ───────────────────────────────────────────────────────────────────────────────
// The whole system takes ONE accent hex as input (persona accent from themes.ts) and derives
// every colored UI value from it via this fixed alpha ramp — persona-neutral but accent-aware by
// construction. Resolve ONCE per screen (see `useAccent()` in ui/primitives) and pass down.

export interface Accent {
  /** 100% — primary CTA fill, live numbers, active tab tint, grade word. */
  solid: string;
  /** 40% — accent rail companion, focused input border, active chip border. */
  border: string;
  /** 12% — active chip / secondary-button background. */
  fill: string;
  /** 18% — pressed state of `fill`, live-dot halo. */
  fillActive: string;
  /** 55% — textShadowColor for the hero CP number ONLY (glow slot 1). */
  glow: string;
  /** 45% — textShadowColor for the live sheet-stepper value ONLY (radius 12). */
  glowSoft: string;
  /** 8% — row highlight (e.g. active body-map region base). */
  faint: string;
}

/** Build the accent ramp from a #RRGGBB hex (RN #RRGGBBAA alpha suffixes — fixed stops, no drift). */
export function makeAccent(hex: string): Accent {
  return {
    solid: hex,
    border: `${hex}66`,
    fill: `${hex}1F`,
    fillActive: `${hex}2E`,
    glow: `${hex}8C`,
    glowSoft: `${hex}73`,
    faint: `${hex}14`,
  };
}

/** Glow slot 1 of 2: the hero CP number. Nothing else gets a text shadow this big. */
export function heroTextGlow(accent: Accent): TextStyle {
  return { textShadowColor: accent.glow, textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } };
}

/** Glow slot 2 (sheets): the currently-edited stepper value only. */
export function liveTextGlow(accent: Accent): TextStyle {
  return { textShadowColor: accent.glowSoft, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } };
}

// ── Spacing / radii / borders ────────────────────────────────────────────────────────────────
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

// Squarer than the old 22 = less bubbly, more machined. Cards lg(14), buttons/inputs/icon-squares
// md(10), chips chip(8), sheets sheet(20).
export const radius = { xs: 4, sm: 6, chip: 8, md: 10, lg: 14, sheet: 20, pill: 999 } as const;

/** Containers/inputs 1pt `line`; separators hairline `line`; live rail 2pt accent. NO 1.5pt. */
export const border = { thin: 1, rail: 2 } as const;

// ── Letter-spacing scale + Hangul rule ───────────────────────────────────────────────────────
// Wide tracking (1.6+) and uppercase apply to LATIN strings only. Korean text takes ≤0.5 —
// tracked-out Hangul reads as typographic cheapness, not discipline.
export const tracking = {
  none: 0,
  label: 0.2,
  cta: 0.5,
  /** Max letterSpacing for any Korean string. */
  hangulMax: 0.5,
  /** Latin overlines / unit micro-labels only. */
  overline: 1.6,
  /** Anton hero grade word only. */
  display: 4,
} as const;

// Hangul Jamo (U+1100–11FF) + Compatibility Jamo (U+3130–318F) + Syllables (U+AC00–D7AF).
const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏가-힯]/;

export function hasHangul(text: string): boolean {
  return HANGUL_RE.test(text);
}

/** Clamp a wide (Latin) tracking value down to the Hangul-safe max when the string is Korean. */
export function hangulSafeLetterSpacing(text: string, wide: number): number {
  return hasHangul(text) ? Math.min(wide, tracking.hangulMax) : wide;
}

// ── Type scale ───────────────────────────────────────────────────────────────────────────────
// System font (undefined fontFamily; SF/Roboto), TWO weights only: '400' and '600'.
export const typeScale: Record<'title' | 'body' | 'label' | 'caption' | 'overline', TextStyle> = {
  /** Card titles, sheet titles. */
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22, letterSpacing: 0 },
  /** Content, inputs. */
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21, letterSpacing: 0 },
  /** Buttons (compact), chips, row labels. */
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: 0.2 },
  /** Hints, Muted, meta. */
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16, letterSpacing: 0 },
  /**
   * SectionTitle, card eyebrows, unit micro-labels. letterSpacing 1.6 is the LATIN value —
   * pass Korean strings through hangulSafeLetterSpacing() (SectionTitle does this for you).
   */
  overline: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.text3,
  },
};

// Orbitron — DIGITS ONLY (CP, weights, reps, kcal, %, timers), never words. 700Bold everywhere:
// 900Black closes digit counters below ~16pt (Boot loads Anton_400Regular + Orbitron_700Bold +
// Orbitron_900Black; 500Medium is NOT loaded — do not reference it). tabular-nums keeps odometer
// slams and tickers from jittering.
export const numType: Record<'heroXL' | 'hero' | 'large' | 'mid' | 'small', TextStyle> = {
  /** Power tab shrine number. */
  heroXL: { fontFamily: 'Orbitron_700Bold', fontSize: 76, lineHeight: 84, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  /** Today header number. */
  hero: { fontFamily: 'Orbitron_700Bold', fontSize: 56, lineHeight: 64, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  /** Sheet steppers (weight/reps). */
  large: { fontFamily: 'Orbitron_700Bold', fontSize: 28, lineHeight: 34, letterSpacing: 0, fontVariant: ['tabular-nums'] },
  // mid/small use the system face: Orbitron's slashed zero reads as an error glyph (⊘) below ~20pt
  // (verified on-sim, build 10 audit). Orbitron stays display-only (large/hero/heroXL).
  /** Inline stats (protein g, set counts). */
  mid: { fontWeight: '700', fontSize: 17, lineHeight: 22, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  /** Bar percents, chip numbers. */
  small: { fontWeight: '700', fontSize: 13, lineHeight: 18, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
};

// Anton — hero grade word + JUICE callouts ONLY. Latin/digits only: Hangul renders tofu/fallback,
// so Korean grade words must fall back to the system font.
export const displayGrade: TextStyle = {
  fontFamily: 'Anton_400Regular',
  fontSize: 20,
  lineHeight: 26,
  letterSpacing: tracking.display,
  textTransform: 'uppercase',
};

// ── Font families ────────────────────────────────────────────────────────────────────────────
/** Anton — hero grade word + JUICE callouts ONLY (never section titles, buttons, labels). */
export const displayFamily = 'Anton_400Regular';
/** @deprecated Legacy Orbitron 900 — use `numType` (700Bold; 900 closes counters below ~16pt). */
export const numberFamily = 'Orbitron_900Black';
/** Orbitron 700 — the digit family behind `numType`. */
export const numberFamilyBold = 'Orbitron_700Bold';

// ── Legacy size scale (deprecated — migrate to typeScale/numType) ────────────────────────────
/** @deprecated Use `typeScale` (words) / `numType` (digits). Kept so unmigrated screens compile. */
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hero: 56, odometer: 72 } as const;

export type Colors = typeof colors;
