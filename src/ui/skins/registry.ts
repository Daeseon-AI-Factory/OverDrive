// HUD SKIN registry — 12 selectable full-chrome skins (skins own CHROME: panel geometry,
// material, glow, bar style, CTA. Personas in features/theme/themes.ts stay orthogonal and own
// JUICE callouts/tier colors). All copy is ORIGINAL IP (§5) — no franchise names/phrases.
//
// Structure contract: each skin is its OWN named const above the single exported SKINS object so
// 11 parallel skin-batch edits replace disjoint consts and never collide on shared lines.

import type { HudSkin, SkinId } from './types';

// ── A. REACTOR — translated from the REACTOR mockup CSS ─────────────────────────────────────────
// Cold fusion-core HUD: scanline overlay, chamfer-cut cyan panels with bracket corner marks,
// flat glowing hero digits (no gradient — .num is solid #BFF4FF + 26px glow), chamfered solid-
// accent CTA, glowing active tab, CRT power-on flicker (rxboot).
const reactor: HudSkin = {
  id: 'reactor',
  nameKo: '리액터',
  nameEn: 'REACTOR',
  tagline: '코어가 네 출력을 읽는다 — 기록할 때마다 게이지가 차오른다.',
  palette: {
    bg0: '#050A0F', // .rx background
    bg1: '#060D13', // .rx-tabs background
    surface1: '#0A141D', // .rx-panel gradient top stop
    surface2: '#0E1B26', // elevated step derived from the panel ladder (chips / nested blocks)
    line: '#14323C', // .rx-panel border
    lineStrong: '#14535F', // .grade border
    edgeHi: 'rgba(191,244,255,0.06)',
    text: '#D9F6FF', // .rx color
    text2: '#7FB4C0', // .rx-vs .who
    text3: '#3F7280', // .rx-top / hero .lbl
    accent: '#22E6FF',
    accentHi: '#BFF4FF', // hero .num fill
    danger: '#F4586A',
    positive: '#35D08E',
    warning: '#E8B84B',
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 14, // clip-path polygon(14px 0, … ) — TL/BR cut
    borderW: 1,
    cornerMarks: 'bracket', // .brkt tl/br — 11px accent L-strokes
    glowEdge: 'none',
    texture: 'scanline', // .rx::after repeating-linear-gradient scanlines
    surfaceGradient: ['#0A141D', '#081019'],
  },
  hero: {
    glowRadius: 26, // text-shadow 0 0 26px rgba(34,230,255,.55) — flat digits, no gradient
    labelTreatment: 'orbitron-wide', // Orbitron 700, letter-spacing .42em
  },
  bar: { style: 'solid', heightPx: 8 }, // .rx-vs .bar
  cta: {
    logWord: '주입', // original copy — inject the set into the core
    shape: 'chamfer', // .rx-log .go clip-path, solid accent fill (no gradient)
    textColor: '#031014',
  },
  tab: { activeGlow: true },
  motion: { ambient: 'flicker' }, // rxboot CRT power-on flicker
};

// ── Placeholders — each skin batch replaces exactly ONE const below with the real definition ────

// ── B. FOUNDRY — translated from the FOUNDRY mockup CSS ──────────────────────────────────────────
// Blast-furnace forge HUD: soot-brown slab panels with four corner rivets and a blurred molten
// heat strip breathing along the bottom edge (fdheat), ember-gradient hero digits
// (#FFF3DC→#FFC873→#FF7A1F→#B33D08), molten solid bars, ember-gradient slab CTA, glowing active tab.
const foundry: HudSkin = {
  id: 'foundry',
  nameKo: '파운드리',
  nameEn: 'FOUNDRY',
  tagline: '용광로는 식지 않는다 — 세트 하나하나가 담금질이다.',
  palette: {
    bg0: '#0B0806', // .fd background gradient top stop
    bg1: '#0D0907', // .fd background gradient bottom stop
    surface1: '#181109', // .fd-slab gradient top stop
    surface2: '#20170C', // elevated step derived from the slab ladder (chips / nested blocks)
    line: '#2A1D12', // .fd-slab / .tr / .bar / .in border
    lineStrong: '#3A2A1A', // .fd-slab border-top-color (lit top edge)
    edgeHi: 'rgba(255,200,115,0.08)',
    text: '#F2E9DF', // .fd color
    text2: '#B99B7E', // .fd-vs .who
    text3: '#6E5844', // .fd-top / hero .lbl / gauge .cap / tabs
    accent: '#FF6B1A', // heat strip, gauge/bar gradients, CTA, active tab
    accentHi: '#FFC873', // ember highlight — bar tip, CTA gradient top
    danger: '#F4586A',
    positive: '#35D08E',
    warning: '#E8B84B',
  },
  panel: {
    shape: 'slab', // .fd-slab — 3px radius plate, no clip-path/skew
    borderW: 1,
    cornerMarks: 'rivet', // .rv a/b/c/d — 5px radial-gradient rivets in all four corners
    glowEdge: 'bottom', // .fd-slab::after — molten strip (transparent→#FF6B1A→transparent, blur .4px)
    texture: 'none',
    surfaceGradient: ['#181109', '#1A1009'], // .fd-slab 180deg gradient (top → bottom stop)
  },
  hero: {
    numberGradient: ['#FFF3DC', '#FFC873', '#FF7A1F', '#B33D08'], // .num background-clip stops 8/40/78/100%
    glowRadius: 22, // drop-shadow(0 0 22px rgba(255,107,26,.45))
    labelTreatment: 'orbitron-wide', // .lbl Orbitron 700, letter-spacing .42em
  },
  bar: { style: 'solid', heightPx: 9 }, // .fd-vs .bar — solid molten-gradient fill
  cta: {
    logWord: '단조', // original copy — hammer the set into metal
    shape: 'slab', // .fd-log .go — 3px radius, gradient fill
    gradient: ['#FFC873', '#FF6B1A'], // linear-gradient(180deg,#FFC873,#FF6B1A)
    textColor: '#1A0D04',
  },
  tab: { activeGlow: true }, // .on text-shadow 0 0 12px rgba(255,107,26,.7) + 2px accent border-top
  motion: { ambient: 'heat' }, // fdheat 3.2s ease-in-out opacity breathing on heat strip + gauge
};

// ── C. ARENA — translated from the ARENA mockup CSS ─────────────────────────────────────────────
// Fight-night broadcast HUD: skewed violet banner panels with a hot-pink left spine and a sweeping
// specular shine (arshine), chrome-metal italic hero digits drop-shadowed in pink, hard-skewed
// segmented KO bar, skewed gradient CTA, glowing active tab, 112° pink speedlines on the stage.
const arena: HudSkin = {
  id: 'arena',
  nameKo: '아레나',
  nameEn: 'ARENA',
  tagline: '조명이 켜지고 관중이 일어선다 — 한 세트가 곧 한 판이다.',
  palette: {
    bg0: '#08060B', // .ar background
    bg1: '#0B0810', // .ar-tabs background
    surface1: '#151020', // .ar-ban gradient top stop
    surface2: '#1B152A', // elevated step derived from the banner ladder (chips / nested blocks)
    line: '#2E2140', // .ar-ban / .ar-kob .tr / .ar-log .in border
    lineStrong: '#453260', // stronger rule derived from the single #2E2140 border tone
    edgeHi: 'rgba(255,255,255,0.10)', // arshine sweep highlight band
    text: '#F5EFF7', // .ar color
    text2: '#8A6F96', // .ar-hero .lbl
    text3: '#6E5876', // .ar-top / .ar-kob .cap / .ar-tabs
    accent: '#FF1E5E',
    accentHi: '#FF4E7E', // .ar-log .go gradient top stop
    danger: '#FF5A3C', // derived status colors — mockup CSS defines no status hues
    positive: '#3EE08F',
    warning: '#FFC94A',
  },
  panel: {
    shape: 'skew',
    skewDeg: -7, // .ar-ban transform: skewX(-7deg); content counter-skewed +7deg
    borderW: 1, // plus a 4px accent left spine (border-left: 4px solid #FF1E5E)
    cornerMarks: 'none',
    glowEdge: 'none',
    texture: 'speedline', // .ar-stage::before repeating 112deg rgba(255,30,94,.05) speedlines
    surfaceGradient: ['#151020', '#0F0A16'],
  },
  hero: {
    numberGradient: ['#FFFFFF', '#D8CBE8', '#8E7BA6', '#F4EBFB', '#6E5880'], // chrome-metal stops 12/34/50/56/88%
    glowRadius: 24, // drop-shadow(0 0 24px rgba(255,30,94,.35)) under a hard #FF1E5E offset
    labelTreatment: 'anton', // .ar-hero .lbl — Anton, letter-spacing .4em, uppercase
  },
  bar: { style: 'skew-segment', heightPx: 12 }, // .ar-kob .tr skewX(-14deg), 14px on / 2px gap fill
  cta: {
    logWord: '피니시', // original copy — land the round's finishing blow
    shape: 'skew', // .ar-log .go skewX(-7deg)
    gradient: ['#FF4E7E', '#D80F4B'], // linear-gradient(180deg,#FF4E7E,#D80F4B)
    textColor: '#FFFFFF',
  },
  tab: { activeGlow: true }, // .on text-shadow 0 0 12px rgba(255,30,94,.7) + 2px accent border-top
  motion: { ambient: 'shine' }, // arshine — specular sweep across the banner every 4.6s
};

// ── D. KI BURST — translated from the KI BURST mockup CSS (.ki-*) ───────────────────────────────
// Golden ki-aura power surge over a starfield night sky: deep-navy space bg with star specks
// (.ki- radial dots over the #16234f→#0a1129→#040611 ellipse), chamfer-cut navy panels with gold
// hairline borders (.ki-cell/.ki-rival/.ki-stage clip-paths), cyan scanner brackets framing the
// hero (.ki-hero::before/::after), white→gold→orange gradient hero digits (.ki-num) with a 16px
// gold glow, skewed segmented rival bar (.ki-bar skewX(-16deg) + 14/2px segment mask), cream→
// gold→orange chamfered CTA, glowing active tab, smooth aura-flame breathe (ki-flick/ki-pulse).
const kiburst: HudSkin = {
  id: 'kiburst',
  nameKo: '기 버스트',
  nameEn: 'KI BURST',
  tagline: '기록하는 순간 측정기가 다시 읽는다 — 황금 오라가 숫자를 뚫고 치솟는다.',
  palette: {
    bg0: '#0A1129', // .ki- bg ellipse dominant 55% stop (top glow #16234f / depth #040611 live in the ambient layer)
    bg1: '#081026', // .ki-bar track background — inset input/track wells
    surface1: '#0C1435', // .ki-stage gradient top stop — main panel material
    surface2: '#121C42', // rgba(18,28,66) — .ki-rival / .ki-cell card gradient top (elevated step)
    line: 'rgba(255,211,77,0.16)', // .ki-cell border — gold hairline
    lineStrong: 'rgba(255,211,77,0.35)', // .ki-stage / .ki-off border — strong gold frame
    edgeHi: 'rgba(255,236,170,0.07)', // derived from .ki-inp inset gold sheen rgba(255,211,77,.05)
    text: '#E8ECFF', // .ki- color
    text2: '#C9D4FF', // .ki-rname
    text3: '#4D5A8A', // .ki-note / .ki-olabel / .ki-ck / inactive tabs
    accent: '#FFD34D', // gold ki — hero label, orbs, feed tick, active tab
    accentHi: '#FFE9A3', // .ki-cv cell values / orb mid stop
    danger: '#FF5A6B', // derived — mockup CSS has no red; warm red tuned to the gold/navy chrome
    positive: '#7FE9FF', // scanner cyan — .ki-status / .ki-rk / floor glow ("오라 안정" done-state)
    warning: '#FF9D2E', // hero gradient base / .ki-fill hot end
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 12, // .ki-rival clip-path — 12px TL/BR cut (stage 16px, cells 8px; 12 is the card norm)
    borderW: 1,
    cornerMarks: 'bracket', // .ki-hero::before/::after — 2px cyan scanner L-brackets (20×58px)
    glowEdge: 'bottom', // .ki-stage::after — cyan floor ellipse glow under the figure
    texture: 'stars', // .ki- radial-gradient star specks (1–1.5px white/ice dots)
    surfaceGradient: ['#121C42', '#080C20'], // .ki-cell 180deg rgba(18,28,66)→rgba(8,12,32)
  },
  hero: {
    numberGradient: ['#FFFFFF', '#FFEAA8', '#FFD34D', '#FF9D2E'], // .ki-num 180deg stops 12/42/62/100%
    glowRadius: 16, // drop-shadow(0 0 16px rgba(255,196,64,.55))
    labelTreatment: 'system-black', // .ki-hlabel — system 900, letter-spacing .55em (Korean label)
  },
  bar: { style: 'skew-segment', heightPx: 11 }, // .ki-bar skewX(-16deg) + 14px on / 2px gap mask
  cta: {
    logWord: '방출', // original copy — release the stored ki as the set is logged (.ki-cta "방출!")
    shape: 'chamfer', // .ki-cta clip-path — single BR 12px cut
    gradient: ['#FFF2C4', '#FF9D2E'], // .ki-cta 180deg #fff2c4→(#ffd34d 45%)→#ff9d2e
    textColor: '#241000',
  },
  tab: { activeGlow: true }, // .ki-on gold text glow + glowing top notch
  motion: { ambient: 'pulse' }, // ki-flick/ki-pulse — smooth ease-in-out aura breathe, not stepped flicker
};

// ── E. PRIMAL — translated from the PRIMAL mockup CSS (.pr-*) ───────────────────────────────────
// Predator-hunt HUD in the dark: near-black hide panels with torn/ripped polygon edges, faint
// diagonal claw-striation texture, blood-red (#E5303E) slashes and glows, flat ivory hero digits
// carved by 2-pass shadow (solid #EDE6D6, no gradient — 24px red aura), single torn bar,
// ripped-corner blood-gradient CTA, glowing red tab dot, pulsing "bleed" glow (pr-bleed).
const primal: HudSkin = {
  id: 'primal',
  nameKo: '프라이멀',
  nameEn: 'PRIMAL',
  tagline: '기록은 사냥이다 — 한 세트마다 검은 가죽 위에 발톱 자국을 새긴다.',
  palette: {
    bg0: '#0b0809', // .pr- base linear-gradient top stop
    bg1: '#060404', // .pr- base linear-gradient 55% stop (darkest belly of the screen)
    surface1: '#181013', // .pr-hero 160deg gradient top stop
    surface2: '#130c0e', // .pr-rival gradient top stop (quicklog input sits at #0f0a0c)
    line: 'rgba(237,230,213,0.06)', // .pr-hero inset 1px ring
    lineStrong: 'rgba(237,230,213,0.12)', // .pr-in border
    edgeHi: 'rgba(255,255,255,0.16)', // .pr-cp top rim-light shadow stop
    text: '#EDE6D6', // .pr- color — bone ivory
    text2: '#b3a68f', // .pr-lbl
    text3: '#6f6558', // .pr-note / .pr-tag / placeholder (moon label sits at #8d8375)
    accent: '#E5303E', // blood red — slashes, predator eyes, rank, tally strike
    accentHi: '#ff6a72', // bright rim stop of slash/fill/CTA gradients
    danger: '#E5303E', // the mockup's only alarm color IS the blood accent
    positive: '#35D08E', // not in mockup — functional default
    warning: '#E8B84B', // not in mockup — functional default
  },
  panel: {
    shape: 'jagged', // .pr-hero/.pr-stage/.pr-rival torn clip-path polygons (ripped hide edges)
    chamferPx: 10, // max tear depth of the ripped-edge polygon (0 10px … 95% 100% …)
    borderW: 1, // inset 0 0 0 1px ring
    cornerMarks: 'none', // no brackets/rivets — corners carry tiny tag text instead
    glowEdge: 'none', // bottom is a dark vignette (inset 0 -18px 30px black), not an accent glow
    texture: 'speedline', // repeating-linear-gradient(24deg, rgba(0,0,0,.25) 0 1px, transparent 1px 7px) — claw striations
    surfaceGradient: ['#181013', '#0e090a'], // .pr-hero linear-gradient(160deg, …) first two stops
  },
  hero: {
    glowRadius: 24, // .pr-cp text-shadow 0 0 24px rgba(229,48,62,.3) — flat ivory digits, no gradient
    labelTreatment: 'system-black', // .pr-lbl system stack 900, letter-spacing .5em (Korean label; Anton is Latin-only)
  },
  bar: { style: 'solid', heightPx: 13 }, // .pr-bar single torn fill (#6d0d13 → #E5303E 65% → #ff6a72)
  cta: {
    logWord: '사냥', // original copy — log the set as a kill (.pr-cta)
    shape: 'chamfer', // .pr-cta ripped-corner clip-path (10px/12px/14px cuts)
    gradient: ['#ff6a72', '#8f141d'], // linear-gradient(165deg, #ff6a72, #E5303E 45%, #8f141d)
    textColor: '#0c0607',
  },
  tab: { activeGlow: true }, // .pr-on red text-glow + glowing 5px blood dot below
  motion: { ambient: 'pulse' }, // pr-bleed — slash glow breathes 3.4s ease-in-out
};

// ── F. IRON CULT — translated from the IRON CULT mockup CSS ─────────────────────────────────────
// Brutalist powerlifting-meet scoreboard: octagonal 10px-cut steel panels (all four corners
// chamfered) with knurl crosshatch strips + rivet bolts, bone-white mono digits (flat #f4f1e8,
// 22px chalk glow), red-glow floor edge, skewed segmented plate bar (13px red segments), and a
// bottom-chamfered red-gradient CTA. Judge lights pulse white (ir-judge keyframes).
const ironcult: HudSkin = {
  id: 'ironcult',
  nameKo: '아이언 컬트',
  nameEn: 'IRON CULT',
  tagline: '오늘의 세트는 시합이다 — 저지 라이트 세 개가 켜지면 기록이 공인된다.',
  palette: {
    bg0: '#15181d', // .ir- background gradient start (180deg)
    bg1: '#0c0e11', // .ir- background gradient 55% stop (darkest band)
    surface1: '#22262c', // .ir-rival gradient top stop — default panel steel
    surface2: '#2a2f36', // .ir-hero gradient top stop — elevated plate steel
    line: '#2c3138', // .ir-input border
    lineStrong: '#3a4048', // .ir-rank border
    edgeHi: 'rgba(255,255,255,0.07)', // .ir-hero inset 0 1px 0 top-edge machined highlight
    text: '#e8e4da', // .ir- color — bone white
    text2: '#8b9199', // .ir-top / .ir-jtext
    text3: '#5c636c', // .ir-ticks / inactive tabs / .ir-pf
    accent: '#FF2B2B', // live dot, floor line, bar fill, rank letter
    accentHi: '#ff5a5a', // .ir-plate border — hot plate rim
    danger: '#FF4F42', // derived status colors — mockup CSS defines no status hues beyond red accent
    positive: '#4FD08A',
    warning: '#E5B54A',
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 10, // clip-path polygon(0 10px,10px 0,…) — all four corners cut
    borderW: 0, // panels are borderless steel — edges read via fill + inset highlight/shadow
    cornerMarks: 'rivet', // .ir-bolt / .ir-bolt2 — 5px radial steel bolts at panel top corners
    glowEdge: 'bottom', // .ir-floor — red top-border floor line, 0 -2px 12px rgba(255,43,43,.35)
    texture: 'knurl', // .ir-knurl — ±45deg repeating crosshatch (1px lines, 4px pitch, .13 alpha)
    surfaceGradient: ['#22262c', '#15181d'], // .ir-rival 165deg steel gradient
  },
  hero: {
    glowRadius: 22, // .ir-cpnum text-shadow 0 0 22px rgba(244,241,232,.22) — flat #f4f1e8 digits, no gradient
    labelTreatment: 'system-black', // .ir-cplabel — weight 900, .55em tracking, industrial mono (not Orbitron/Anton)
  },
  bar: { style: 'skew-segment', heightPx: 16 }, // .ir-track 4px skew clip + 13px/2px repeating red segments
  cta: {
    logWord: 'LIFT!', // .ir-cta copy — original meet callout
    shape: 'chamfer', // clip-path cuts 9px off the bottom-right corner
    gradient: ['#ff4040', '#c81f1f'], // .ir-cta 165deg red gradient
    textColor: '#FFFFFF',
  },
  tab: { activeGlow: true }, // .ir-ton i — 0 0 9px rgba(255,43,43,.65)
  motion: { ambient: 'pulse' }, // ir-judge — judge lights slow-pulse white bloom (2.6s, staggered)
};

// ── G. MURIM — translated from the MURIM mockup CSS (.wx-*) ─────────────────────────────────────
// Ink-and-jade night-scroll HUD: parchment-bordered panels with 9px blade-cut chamfers on midnight
// ink paper, torn ink-stroke divider (.wx-ink), ivory→jade hero digits, jade qi glow rising from
// panel bottoms, tilted cinnabar seal-stamp CTA, breathing qi aura (wxQi) + sword-gleam slashes.
const murim: HudSkin = {
  id: 'murim',
  nameKo: '무림',
  nameEn: 'MURIM',
  tagline: '먹지에 새기는 내공 — 한 획마다 옥빛 검기가 화면을 가른다.',
  palette: {
    bg0: '#151109', // .wx- base linear-gradient top stop
    bg1: '#0A0805', // .wx- base linear-gradient bottom stop (also .wx-tabs bottom)
    surface1: '#130F08', // .wx-stage gradient top stop
    surface2: '#1D1811', // elevated step derived — .wx-rival ivory wash rgba(232,224,204,.045) over surface1
    line: 'rgba(217,207,180,0.18)', // .wx-rival / .wx-tabs border — translucent parchment
    lineStrong: 'rgba(217,207,180,0.24)', // .wx-in border (.wx-stage sits between at .22)
    edgeHi: 'rgba(217,207,180,0.13)', // .wx-stage::before inner inset frame
    text: '#E8E0CC', // .wx- color — aged ivory
    text2: '#9A8F72', // .wx-cplabel (.wx-top #95896D is the same family)
    text3: '#6D6450', // .wx-micro / .wx-stageft
    accent: '#58C9A5', // jade sword-qi — slash core, aura, fills, active tab text
    accentHi: '#D8F5E9', // .wx-fill gradient tip — brightest jade
    danger: '#D64541', // cinnabar 朱砂 — .wx-top b, red slash, active tab mark
    positive: '#58C9A5', // .wx-adv "+12 우세" — gains read in jade
    warning: '#CFA349', // derived aged-gold — mockup CSS defines no warning hue
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 9, // .wx-rival BR 9px cut / .wx-in TL 9px cut — single blade-cut corner
    borderW: 1,
    cornerMarks: 'none', // stage frames with a full inner inset border, not corner marks
    glowEdge: 'bottom', // .wx-stage radial jade glow at 50% 102% (bg echoes it at 50% 112%)
    texture: 'ink', // .wx-ink torn-edge ink-stroke divider + 84deg paper-fiber repeating gradient
    surfaceGradient: ['#130F08', '#0C0906'], // .wx-stage 180deg gradient
  },
  hero: {
    numberGradient: ['#F5EDD6', '#BFEAD6', '#58C9A5'], // .wx-cp background-clip stops 18/55/92%
    glowRadius: 20, // drop-shadow(0 0 20px rgba(88,201,165,.3))
    labelTreatment: 'system-black', // .wx-cplabel — system 800, letter-spacing .46em (Korean+Hanja; Anton is Latin-only)
  },
  bar: { style: 'solid', heightPx: 8 }, // .wx-bar — single jade-gradient fill with 7px blade-tip clip
  cta: {
    logWord: '각인', // original copy — engrave the set into the record (mockup CTA text)
    shape: 'skew', // .wx-cta — rotate(-1.5deg) torn-edge cinnabar seal stamp
    gradient: ['#E25748', '#A92E24'], // linear-gradient(145deg,#E25748,#A92E24)
    textColor: '#F6EFDC',
  },
  tab: { activeGlow: true }, // .wx-on::before — cinnabar mark, box-shadow 0 0 9px rgba(214,69,65,.75)
  motion: { ambient: 'pulse' }, // wxQi 2.8s qi-aura breathing (opacity + scaleY) + wxGleam slash gleam
};

// ── H. DARK KEEP — translated from the DARK KEEP mockup CSS (.kn-*) ─────────────────────────────
// Soulslike gothic keep: ash-brown stone panels with all-corner chamfer cuts and filigree corner
// marks, serif hero digits in bone-white with ember-orange flicker glow (solid fill, no gradient),
// dual life/stamina bars (.kn-hp red / .kn-st green), ember-gradient chamfered CTA ("각인").
const darkkeep: HudSkin = {
  id: 'darkkeep',
  nameKo: '다크 킵',
  nameEn: 'DARK KEEP',
  tagline: '잿불 곁에서 쌓는 무력 — 오늘의 기록이 돌에 새겨진다.',
  palette: {
    bg0: '#181310', // .kn- radial bg gradient start (top)
    bg1: '#060505', // .kn- radial bg gradient end (bottom; mid stop #0D0B09)
    surface1: '#191510', // .kn-duel panel gradient top stop
    surface2: '#1E1912', // .kn-hero panel gradient top stop (elevated step)
    line: '#322A1A', // .kn-duel border (.kn-stage #2E2818 / .kn-in #2C2517 nearby)
    lineStrong: '#3A3120', // .kn-hero border (.kn-tabs border-top #3D3320)
    edgeHi: 'rgba(216,190,140,0.13)', // .kn-hero inset 0 1px 0 top highlight
    text: '#CFC3AA', // .kn- color
    text2: '#A49372', // .kn-rank
    text3: '#87795F', // .kn-top strip (inactive tab #6B6049)
    accent: '#FF8A2A', // ember orange — .kn-on .kn-tg, sword glow line, embers
    accentHi: '#FFB35C', // .kn-on tab text / .kn-cta border / brightest ember
    danger: '#E65A35', // .kn-hp fill gradient top stop (life bar)
    positive: '#95C163', // .kn-st fill gradient top stop (stamina bar)
    warning: '#FF9A3E', // .kn-adv / .kn-rank b gold-ember highlight
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 7, // .kn-duel clip-path — all four corners cut 7px (hero panel cuts 11px)
    borderW: 1,
    cornerMarks: 'bracket', // .kn-fl — gothic filigree L-scrolls in all four hero corners
    glowEdge: 'top', // inset 0 1px 0 warm top highlight on hero/duel/tabs
    texture: 'none', // no repeating texture — only static vignette (.kn-::after inset shadow)
    surfaceGradient: ['#191510', '#0F0D0A'], // .kn-duel linear-gradient(180deg, …)
  },
  hero: {
    glowRadius: 20, // .kn-cp text-shadow 0 0 20px rgba(255,118,22,.4) — solid #F4E8CD serif digits
    labelTreatment: 'system-black', // .kn-cplabel — system 900, letter-spacing .42em
  },
  bar: { style: 'dual', heightPx: 9 }, // .kn-bar life + stamina pair, angled 4px fill end cut
  cta: {
    logWord: '각인', // original copy — the set is engraved in stone
    shape: 'chamfer', // .kn-cta clip-path — TL/BR 6px cut
    gradient: ['#FFA14A', '#8A3006'], // .kn-cta ember gradient (mid stop #CF5A10 at 52%)
    textColor: '#1C0D03',
  },
  tab: { activeGlow: true }, // .kn-on text-shadow 0 0 10px rgba(255,130,35,.5)
  motion: { ambient: 'flicker' }, // kn-flick 3.4s bonfire glow flicker on the hero number
};

// ── I. BLACK OPS — translated from the BLACK OPS mockup CSS ─────────────────────────────────────
// Mil-spec sniper-console HUD: 24px olive tactical-grid overlay, 16px corner-cut khaki panels with
// stencil-bracket corner marks, hero digits with a stencil-slit gradient (dark cut band at ~53–57%),
// skewed tracer-stripe bars with a red tip, red mission CTA ("보고" — file the SITREP),
// red-glow active tab, sweeping red scan band (ts-scan).
const blackops: HudSkin = {
  id: 'blackops',
  nameKo: '블랙 옵스',
  nameEn: 'BLACK OPS',
  tagline: '운동은 오락이 아니라 작전이다 — 세트를 탄창처럼 소모하고 보고하라.',
  palette: {
    bg0: '#1A1D16', // .ts- background gradient start
    bg1: '#0F1108', // .ts- background gradient end / .ts-tabs bottom stop
    surface1: '#1D2016', // .ts-intel / .ts-rival panel gradient top stop
    surface2: '#20241A', // .ts-hero gradient top stop — elevated step
    line: 'rgba(122,132,80,0.45)', // .ts-stage / .ts-intel / .ts-rival olive borders (.4–.5)
    lineStrong: 'rgba(200,185,138,0.35)', // .ts-hero khaki border
    edgeHi: 'rgba(232,220,176,0.06)',
    text: '#E8DCB0', // .ts-hlbl b / .ts-intel b — bright stencil khaki
    text2: '#C8B98A', // .ts- base color — field khaki
    text3: '#7A8450', // .ts-top / labels — olive drab
    accent: '#7A8450', // olive drab — bar fill, grid, panel chrome
    accentHi: '#E8DCB0',
    danger: '#E03B2A', // ● ARMED / LOCK / scan line — mission red
    positive: '#93A05F', // .ts-fill bright stripe
    warning: '#D8CB9C', // .ts-grade badge brass top stop
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 16, // .ts-hero / .ts-stage clip-path polygon corner cuts (16px, opposing corners)
    borderW: 1,
    cornerMarks: 'bracket', // .ts-hero::before/::after — 11px khaki L-strokes (1.5px)
    glowEdge: 'none',
    texture: 'scanline', // .ts-::before 24px olive tactical grid + ts-scan red band
    surfaceGradient: ['#1D2016', '#14170E'], // .ts-intel 180deg gradient
  },
  hero: {
    // .ts-cp stencil-slit gradient — hard stops 0–30% / 30–53% / dark slit 53–57% / 57–100%
    numberGradient: ['#F4ECCB', '#DCCFA0', 'rgba(15,17,8,0.92)', '#C8B98A'],
    glowRadius: 14, // drop-shadow(0 0 14px rgba(200,185,138,.3))
    labelTreatment: 'orbitron-wide', // .ts-hlbl b — weight 900, 7px letter-spacing
  },
  bar: { style: 'skew-segment', heightPx: 10 }, // .ts-bar 3px-skew parallelogram, 135° 7/2px stripes + red tip
  cta: {
    logWord: '보고', // original copy — transmit the set like a field SITREP
    shape: 'chamfer', // .ts-cta clip-path — 9px TR corner cut
    gradient: ['#E8503C', '#C1301F'], // linear-gradient(180deg,#E8503C,#C1301F)
    textColor: '#14160F',
  },
  tab: { activeGlow: true }, // .ts-on::before — red top bar, 0 0 9px rgba(224,59,42,.85) glow
  motion: { ambient: 'shine' }, // ts-scan — red band sweeping the stage, 3.4s ease-in-out alternate
};

// ── J. COLOSSEUM — translated from the COLOSSEUM mockup CSS (.gl-*) ─────────────────────────────
// Bronze-relief gladiator arena: torch-lit radial glow over near-black (.gl), sand-dust dot field
// along the floor (.gl::before), slab plaques with 2px bronze-bevel gradient borders (stage/rival/
// input/tabs all share the #f2d38a→#7a5322 bevel), Anton hero digits in a 5-stop gilded gradient,
// tick-segmented gold rival bar, TL/BR-chamfered gilded CTA, crowd-roar opacity pulse (gl-roar /
// gl-gleam). No rivets/brackets — the bevel border IS the ornament.
const colosseum: HudSkin = {
  id: 'colosseum',
  nameKo: '콜로세움',
  nameEn: 'COLOSSEUM',
  tagline: '모래 위에 홀로 선다 — 오늘의 기록이 함성이 되고, 월계관에 새겨진다.',
  palette: {
    bg0: '#2c2113', // .gl radial bg gradient start — torch glow at top
    bg1: '#0f0a05', // .gl radial bg gradient end (mid stop #191108 at 52%)
    surface1: '#1c1409', // .gl-rival padding-box gradient top stop — standard card material
    surface2: '#241a0d', // .gl-stage upper wall band — elevated step
    line: '#3a2a12', // .gl-bar inset hairline — quiet dark bronze
    lineStrong: '#7a5322', // recurring bronze midtone of the bevel border gradients
    edgeHi: 'rgba(255,248,225,0.14)', // .gl-rank top rim-light (0 1px 0 rgba(255,248,225,.14))
    text: '#eadfc4', // .gl color
    text2: '#bdb096', // .gl-vs
    text3: '#94815c', // .gl-top muted brass
    accent: '#d9a441', // gold-bronze — rank/bar/tab-on/CTA core
    accentHi: '#f2d38a', // bright bevel stop (border gradients, gl-rays, laurel tip)
    danger: '#E25048', // derived status colors — mockup CSS defines no status hues
    positive: '#7FB069',
    warning: '#E08A3C',
  },
  panel: {
    shape: 'slab', // .gl-stage r6 / .gl-in r7 — rounded plaques, double-stroke bronze bevel border
    borderW: 2, // every bronze-bevel border in the mockup is 2px
    cornerMarks: 'none',
    glowEdge: 'none', // depth = inset top shadow + bottom sand radial, no glowing edge line
    texture: 'stars', // .gl::before — sand-dust dot field (warm grains, floor-weighted)
    surfaceGradient: ['#1c1409', '#130d06'], // .gl-rival linear-gradient panel material
  },
  hero: {
    numberGradient: ['#fdf6e0', '#f2d896', '#d9a441', '#8f5d1e', '#caa04e'], // .gl-cp 178deg stops 6/30/56/80/97%
    glowRadius: 22, // drop-shadow(0 0 22px rgba(217,164,65,.25)) — digits are Anton
    labelTreatment: 'system-black', // .gl-cplbl — system 900, letter-spacing .5em
  },
  bar: { style: 'segment', heightPx: 11 }, // .gl-bar i — dark tick every 10px over gold gradient
  cta: {
    logWord: '출전', // original copy — step onto the sand
    shape: 'chamfer', // .gl-cta clip-path — TL/BR 9px corner cuts
    gradient: ['#fbeec4', '#96661e'], // linear-gradient(168deg,#fbeec4,#d9a441 46%,#96661e 86%)
    textColor: '#241603',
  },
  tab: { activeGlow: true }, // .gl-on b — 0 0 9px gold glow + gradient underline
  motion: { ambient: 'pulse' }, // gl-roar crowd-ray / gl-gleam figure-glow opacity pulse
};

// ── K. REDLINE — translated from the REDLINE mockup CSS ─────────────────────────────────────────
// Racing-cockpit tachometer HUD: carbon-weave dark body, chamfer-cut stage panel (16px TR/BL cut)
// with animated horizontal speedlines, skew-cut striped telemetry bars, flat italic white hero
// digits trailing a red motion glow (.rl-cp text-shadow — no gradient fill), red-to-dark-red
// chamfered CTA with checkered underline, glowing red active-tab bar, pulsing redline arc.
const redline: HudSkin = {
  id: 'redline',
  nameKo: '레드라인',
  nameEn: 'REDLINE',
  tagline: '몸은 머신이다 — 오늘의 세트를 레드라인까지 밟는다.',
  palette: {
    bg0: '#14151A', // .rl- body gradient start (under the carbon-weave hatch)
    bg1: '#08090B', // .rl- body gradient end (60%)
    surface1: '#0E0F13', // .rl-rival / .rl-in panel background
    surface2: '#15161B', // .rl-rbar track — elevated step
    line: '#20242B', // .rl-stage / .rl-rival border
    lineStrong: '#262B33', // .rl-rbar border
    edgeHi: 'rgba(255,255,255,0.06)', // derived from the needle/edge whites (.rl-rbar i::after)
    text: '#EEF0F3', // .rl- color
    text2: '#B7BDC6', // .rl-cplab
    text3: '#5F6670', // .rl-mt / .rl-gcap muted labels
    accent: '#FF1A1A', // .rl-dot / redline arc / tab glow
    accentHi: '#FF5A4A', // .rl-mt b / MAX tick / active tab sublabel
    danger: '#FF3624', // .rl-rival em
    positive: '#35D08E',
    warning: '#E8B84B',
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 16, // .rl-stage clip-path polygon — TR/BL 16px cuts
    borderW: 1,
    cornerMarks: 'none', // corner text tags only in the mockup, no brackets/rivets
    glowEdge: 'bottom', // .rl-stage radial red glow at 50% 62% — lower-center bloom
    texture: 'speedline', // .rl-stage::before horizontal white/red streaks (rl-dash)
    surfaceGradient: ['#0D0E12', '#08090B'], // .rl-stage linear-gradient(180deg, …)
  },
  hero: {
    glowRadius: 24, // .rl-cp text-shadow -15px 0 24px rgba(255,26,26,.32) — flat #fff digits, no gradient
    labelTreatment: 'orbitron-wide', // .rl-cplab Orbitron 900, letter-spacing .34em
  },
  bar: { style: 'skew-segment', heightPx: 12 }, // .rl-rbar skew clip + diagonal red stripe fill
  cta: {
    logWord: 'REV!', // mockup CTA — rev the engine, original copy
    shape: 'chamfer', // .rl-cta clip-path — TL/BR 12px cuts
    gradient: ['#FF2B1B', '#920707'], // .rl-cta linear-gradient(180deg, …)
    textColor: '#FFFFFF',
  },
  tab: { activeGlow: true }, // .rl-tabs .rl-on::before red bar + 10px glow
  motion: { ambient: 'pulse' }, // rl-glow redline-arc opacity pulse (1.9s ease-in-out)
};

// ── L. DOJO — translated from the DOJO mockup CSS (.dj-*) ───────────────────────────────────────
// Midnight training-hall stillness: cool ink-blue panels with TL/BR 14px chamfer cuts, faint mint
// shoji/tatami grid lines, and a warm-wood hero slab stamped with a single 修 seal; thin solid
// #F2F8F4 hero digits whose mint glow breathes (dj-breathe), 6-step belt-rank segment bar
// (흰띠→검은띠), mint-gradient chamfered CTA ("단련"), incense-smoke restraint everywhere.
const dojo: HudSkin = {
  id: 'dojo',
  nameKo: '도장',
  nameEn: 'DOJO',
  tagline: '자정의 도장, 향 하나 — 말없는 반복이 흰띠를 검은띠로 물들인다.',
  palette: {
    bg0: '#0A1016', // .dj- 175deg background gradient start
    bg1: '#070B10', // .dj- gradient 55% stop — darkest belly (final stop #0A1119; tabs rgba(6,10,14,.97))
    surface1: '#101418', // .dj-rival / .dj-in gradient top stop — standard cool panel
    surface2: '#16130E', // .dj-hero gradient top stop — the warm wooden hero slab (elevated step)
    line: 'rgba(127,233,195,0.10)', // .dj-stage inset 1px ring (rival sits at .08, hero at .12)
    lineStrong: 'rgba(127,233,195,0.16)', // .dj-in inset ring — strongest panel ring in the mockup
    edgeHi: 'rgba(232,239,233,0.06)', // derived from .dj-hero shoji lines rgba(232,239,233,.025)
    text: '#E8EFE9', // .dj- color — rice-paper white
    text2: '#CFE0D6', // .dj-lbl / .dj-vs
    text3: '#54655D', // .dj-top / .dj-grade em / .dj-beltlbl (tabs & stage marks sit at #48584F)
    accent: '#7FE9C3', // incense mint — seal, belt marker, smoke ember, bar fill, active tab
    accentHi: '#93F4D2', // .dj-cta gradient top stop — brightest mint
    danger: '#F4586A', // not in mockup — functional default
    positive: '#7FE9C3', // the mockup's gain color IS the mint accent (.dj-adv '+12 우세', .dj-str)
    warning: '#E8B84B', // not in mockup — functional default
  },
  panel: {
    shape: 'chamfer',
    chamferPx: 14, // .dj-hero/.dj-stage clip-path — TL/BR cut 14px (rival 10px TL-only, input 8px)
    borderW: 1, // inset 0 0 0 1px mint rings on every panel
    cornerMarks: 'none', // no brackets/rivets — the hero carries one 22px 修 seal stamp instead
    glowEdge: 'none', // stillness — no molten/glow edge strips anywhere in the mockup
    texture: 'scanline', // shoji/tatami grid — repeating 1px mint lines (stage 38/34px, hero 27px) mapped to the scanline primitive
    surfaceGradient: ['#101418', '#0B0F13'], // .dj-rival / .dj-in linear-gradient(180deg, …)
  },
  hero: {
    glowRadius: 16, // .dj-cp text-shadow base 0 0 16px rgba(127,233,195,.15) — thin solid #F2F8F4 digits, no gradient
    labelTreatment: 'system-black', // .dj-lbl — system 900, letter-spacing .55em Korean label between mint hairlines
  },
  bar: { style: 'segment', heightPx: 9 }, // .dj-belts — 6 belt-rank segments 흰띠→검은띠, 4px gaps (.dj-vs bar: 6px skew-cut solid)
  cta: {
    logWord: '단련', // original copy — the set is tempered by silent repetition (.dj-cta)
    shape: 'chamfer', // .dj-cta clip-path — TL/BR 8px cut
    gradient: ['#93F4D2', '#63D7AB'], // linear-gradient(180deg, #93f4d2, #63d7ab)
    textColor: '#06110D',
  },
  tab: { activeGlow: true }, // .dj-on — mint text + 26px accent top tick with 0 0 8px glow
  motion: { ambient: 'pulse' }, // dj-breathe — hero glow breathes 16→34px over 5s (incense sway lives in the stage layer only)
};

export const SKINS: Record<SkinId, HudSkin> = {
  reactor,
  foundry,
  arena,
  kiburst,
  primal,
  ironcult,
  murim,
  darkkeep,
  blackops,
  colosseum,
  redline,
  dojo,
};

export const SKIN_IDS = Object.keys(SKINS) as SkinId[];
