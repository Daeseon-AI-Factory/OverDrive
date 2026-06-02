// OVERDRIVE design tokens — B급 네온 미학 (original). Near-black canvas, hot neon energy.
// Single dark theme for Phase 1 (no light mode). Aesthetic variants (battle/glow/neon) tune
// the JUICE palette later via settings.aestheticPref.

export const colors = {
  bg: '#07070B',
  surface: '#0F0F18',
  surfaceAlt: '#171724',
  line: '#262636',
  text: '#F2F2FA',
  textDim: '#9A9AB0',

  cyan: '#22E6FF',
  magenta: '#FF1E8C',
  violet: '#8A5BFF',
  energyLo: '#FFC53D',
  energyHi: '#FF3B30',
  flash: '#FFFFFF',

  success: '#3DFFB0',
  danger: '#FF3355',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hero: 56, odometer: 72 } as const;

// Monospace stack for the combat-power odometer (tabular digits = clean slam animation).
export const monoFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";

// Aggressive display fonts (loaded in Boot). Anton = condensed black callouts/titles;
// Orbitron = techy digits for scores/steppers. The "폭발" typography.
export const displayFamily = 'Anton_400Regular';
export const numberFamily = 'Orbitron_900Black';

export type Colors = typeof colors;
