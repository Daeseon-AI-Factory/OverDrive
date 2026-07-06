// HUD SKIN types — the contract every skin batch codes against. Do NOT reshape this interface;
// 12 parallel skin definitions + SkinContext + HudPanel + primitives all depend on it verbatim.

export type SkinId = 'reactor'|'foundry'|'arena'|'kiburst'|'primal'|'ironcult'|'murim'|'darkkeep'|'blackops'|'colosseum'|'redline'|'dojo';
export interface HudSkin {
  id: SkinId; nameKo: string; nameEn: string; tagline: string; // original copy, no franchise names
  palette: { bg0: string; bg1: string; surface1: string; surface2: string; line: string; lineStrong: string; edgeHi: string; text: string; text2: string; text3: string; accent: string; accentHi?: string; danger: string; positive: string; warning: string; };
  panel: { shape: 'chamfer'|'slab'|'skew'|'jagged'|'rect'; chamferPx?: number; skewDeg?: number; borderW: number; cornerMarks: 'bracket'|'rivet'|'none'; glowEdge: 'top'|'bottom'|'none'; texture: 'scanline'|'knurl'|'ink'|'speedline'|'stars'|'none'; surfaceGradient?: [string, string]; }
  hero: { numberGradient?: string[]; glowRadius: number; labelTreatment: 'orbitron-wide'|'anton'|'system-black'; }
  bar: { style: 'solid'|'segment'|'skew-segment'|'dual'; heightPx: number; }
  cta: { logWord: string; shape: 'chamfer'|'slab'|'skew'|'rect'; gradient?: [string, string]; textColor: string; }
  tab: { activeGlow: boolean; }
  motion: { ambient: 'flicker'|'heat'|'shine'|'pulse'|'none'; }
}
