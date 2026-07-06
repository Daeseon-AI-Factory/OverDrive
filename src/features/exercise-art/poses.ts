// ORIGINAL exercise pose-art — 2-keyframe skeleton poses per movement family.
//
// Each family gets a start pose (a) and an end pose (b) of one rep, authored as normalized
// skeleton coordinates in a 0..1 square (x → right, y → down). <ExercisePose/> draws them as
// thick round-capped strokes and crossfade-lerps a→b→a for the looping "GIF" feel.
//
// Design intent (readability first):
//   · side view for most lifts — a lying figure + bar over the chest is instantly "bench";
//     a standing figure folding at the knees is instantly "squat".
//   · front view where the movement lives in the frontal plane (pull-up, lateral raise, fly).
//   · segment lengths are kept roughly consistent between a and b so the lerp doesn't look
//     rubbery, and pose a/b are built with IDENTICAL structure (same joints, same prop count)
//     so the two Skia paths are interpolatable.
// Original IP only (spec §5): every coordinate below is hand-authored.

import type { Family } from './families';

export interface Point {
  x: number;
  y: number;
}

/** A prop stroke: barbell / dumbbell / cable-handle line. */
export type Seg = readonly [Point, Point];

export interface Pose {
  head: Point; // head center (drawn as a filled dot)
  shoulderL: Point;
  shoulderR: Point;
  elbowL: Point;
  elbowR: Point;
  wristL: Point;
  wristR: Point;
  hipL: Point;
  hipR: Point;
  kneeL: Point;
  kneeR: Point;
  ankleL: Point;
  ankleR: Point;
  props: readonly Seg[]; // 0..2 segments; a/b of a family MUST have the same count
}

export const JOINT_KEYS = [
  'head',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'wristL',
  'wristR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'ankleL',
  'ankleR',
] as const;
export type JointKey = (typeof JOINT_KEYS)[number];

export interface FamilyPoses {
  view: 'side' | 'front';
  a: Pose; // rep start
  b: Pose; // rep end
}

// ---- helpers -----------------------------------------------------------------------------------

const P = (x: number, y: number): Point => ({ x, y });

/** Small x-offset for the far-side limb in side view — gives the silhouette a hint of depth. */
const DEPTH = 0.018;

interface SideSpec {
  head: Point;
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  hip: Point;
  knee: Point;
  ankle: Point;
  props?: readonly Seg[];
}

/** Expand a single-limb side-view spec into a full L/R pose (far limb offset slightly left). */
function side(s: SideSpec): Pose {
  const far = (p: Point): Point => ({ x: p.x - DEPTH, y: p.y });
  return {
    head: s.head,
    shoulderL: far(s.shoulder),
    shoulderR: s.shoulder,
    elbowL: far(s.elbow),
    elbowR: s.elbow,
    wristL: far(s.wrist),
    wristR: s.wrist,
    hipL: far(s.hip),
    hipR: s.hip,
    kneeL: far(s.knee),
    kneeR: s.knee,
    ankleL: far(s.ankle),
    ankleR: s.ankle,
    props: s.props ?? [],
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Point, b: Point, t: number): Point => P(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

/** Joint-wise linear interpolation between two structurally identical poses (t: 0=a → 1=b). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    head: lerpPt(a.head, b.head, t),
    shoulderL: lerpPt(a.shoulderL, b.shoulderL, t),
    shoulderR: lerpPt(a.shoulderR, b.shoulderR, t),
    elbowL: lerpPt(a.elbowL, b.elbowL, t),
    elbowR: lerpPt(a.elbowR, b.elbowR, t),
    wristL: lerpPt(a.wristL, b.wristL, t),
    wristR: lerpPt(a.wristR, b.wristR, t),
    hipL: lerpPt(a.hipL, b.hipL, t),
    hipR: lerpPt(a.hipR, b.hipR, t),
    kneeL: lerpPt(a.kneeL, b.kneeL, t),
    kneeR: lerpPt(a.kneeR, b.kneeR, t),
    ankleL: lerpPt(a.ankleL, b.ankleL, t),
    ankleR: lerpPt(a.ankleR, b.ankleR, t),
    props: a.props.map((s, i) => {
      const e = b.props[i] ?? s;
      return [lerpPt(s[0], e[0], t), lerpPt(s[1], e[1], t)] as const;
    }),
  };
}

// ---- pose data ---------------------------------------------------------------------------------

export const POSES: Record<Family, FamilyPoses> = {
  // Lying on a bench (head left, knees up, feet down) — bar presses chest → lockout.
  pressHorizontal: {
    view: 'side',
    a: side({
      head: P(0.16, 0.7),
      shoulder: P(0.28, 0.72),
      elbow: P(0.33, 0.82),
      wrist: P(0.32, 0.66),
      hip: P(0.52, 0.73),
      knee: P(0.63, 0.62),
      ankle: P(0.69, 0.84),
      props: [[P(0.2, 0.66), P(0.44, 0.66)]], // bar at the chest
    }),
    b: side({
      head: P(0.16, 0.7),
      shoulder: P(0.28, 0.72),
      elbow: P(0.31, 0.6),
      wrist: P(0.32, 0.48),
      hip: P(0.52, 0.73),
      knee: P(0.63, 0.62),
      ankle: P(0.69, 0.84),
      props: [[P(0.2, 0.48), P(0.44, 0.48)]], // bar locked out over the chest
    }),
  },

  // Standing, bar racked at the clavicle → pressed overhead.
  pressVertical: {
    view: 'side',
    a: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.55, 0.44),
      wrist: P(0.55, 0.33),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.43, 0.33), P(0.67, 0.33)]], // bar at shoulder height
    }),
    b: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.51, 0.24),
      wrist: P(0.52, 0.13),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.4, 0.13), P(0.64, 0.13)]], // bar locked out overhead
    }),
  },

  // Standing tall with a high bar → deep knee bend, hips back, bar tracks down.
  squat: {
    view: 'side',
    a: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.56, 0.44),
      wrist: P(0.55, 0.34),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.36, 0.34), P(0.6, 0.34)]], // bar on the shoulders
    }),
    b: side({
      head: P(0.42, 0.42),
      shoulder: P(0.43, 0.53),
      elbow: P(0.51, 0.62),
      wrist: P(0.5, 0.52),
      hip: P(0.37, 0.7),
      knee: P(0.55, 0.72),
      ankle: P(0.51, 0.9),
      props: [[P(0.31, 0.52), P(0.55, 0.52)]], // bar rides down with the torso
    }),
  },

  // Hip hinge: folded over bar at the shins → standing lockout, arms stay long.
  hinge: {
    view: 'side',
    a: side({
      head: P(0.62, 0.38),
      shoulder: P(0.56, 0.46),
      elbow: P(0.56, 0.58),
      wrist: P(0.56, 0.7),
      hip: P(0.42, 0.58),
      knee: P(0.51, 0.73),
      ankle: P(0.5, 0.9),
      props: [[P(0.44, 0.7), P(0.68, 0.7)]], // bar below the knees
    }),
    b: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.5, 0.47),
      wrist: P(0.51, 0.58),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.39, 0.58), P(0.63, 0.58)]], // bar at the hips (lockout)
    }),
  },

  // Bent-over row: torso fixed at ~45°, bar hangs → pulled to the torso, elbow drives back.
  rowHorizontal: {
    view: 'side',
    a: side({
      head: P(0.62, 0.38),
      shoulder: P(0.56, 0.45),
      elbow: P(0.57, 0.57),
      wrist: P(0.58, 0.69),
      hip: P(0.43, 0.58),
      knee: P(0.5, 0.73),
      ankle: P(0.49, 0.9),
      props: [[P(0.46, 0.69), P(0.7, 0.69)]], // bar hanging at arm's length
    }),
    b: side({
      head: P(0.62, 0.38),
      shoulder: P(0.56, 0.45),
      elbow: P(0.5, 0.53),
      wrist: P(0.6, 0.55),
      hip: P(0.43, 0.58),
      knee: P(0.5, 0.73),
      ankle: P(0.49, 0.9),
      props: [[P(0.48, 0.55), P(0.72, 0.55)]], // bar rowed to the lower chest
    }),
  },

  // Pull-up, front view: fixed bar, dead hang → chin over the bar, knees tuck.
  pullVertical: {
    view: 'front',
    a: {
      head: P(0.5, 0.3),
      shoulderL: P(0.42, 0.4),
      shoulderR: P(0.58, 0.4),
      elbowL: P(0.39, 0.27),
      elbowR: P(0.61, 0.27),
      wristL: P(0.36, 0.15),
      wristR: P(0.64, 0.15),
      hipL: P(0.46, 0.6),
      hipR: P(0.54, 0.6),
      kneeL: P(0.455, 0.75),
      kneeR: P(0.545, 0.75),
      ankleL: P(0.45, 0.89),
      ankleR: P(0.55, 0.89),
      props: [[P(0.24, 0.13), P(0.76, 0.13)]], // fixed pull-up bar
    },
    b: {
      head: P(0.5, 0.12),
      shoulderL: P(0.41, 0.22),
      shoulderR: P(0.59, 0.22),
      elbowL: P(0.3, 0.21),
      elbowR: P(0.7, 0.21),
      wristL: P(0.36, 0.15),
      wristR: P(0.64, 0.15),
      hipL: P(0.46, 0.44),
      hipR: P(0.54, 0.44),
      kneeL: P(0.46, 0.57),
      kneeR: P(0.54, 0.57),
      ankleL: P(0.43, 0.67),
      ankleR: P(0.57, 0.67),
      props: [[P(0.24, 0.13), P(0.76, 0.13)]], // bar doesn't move — the body does
    },
  },

  // Standing dumbbell curl: upper arm pinned, forearm swings hang → full flexion.
  curl: {
    view: 'side',
    a: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.51, 0.47),
      wrist: P(0.53, 0.59),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.48, 0.6), P(0.58, 0.58)]], // dumbbell across the hanging fist
    }),
    b: side({
      head: P(0.47, 0.24),
      shoulder: P(0.48, 0.35),
      elbow: P(0.51, 0.47),
      wrist: P(0.6, 0.39),
      hip: P(0.49, 0.57),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.57, 0.35), P(0.63, 0.43)]], // dumbbell curled up
    }),
  },

  // Cable pushdown: slight forward lean, elbow pinned, handle chest height → pressed to the thigh.
  extensionTriceps: {
    view: 'side',
    a: side({
      head: P(0.45, 0.25),
      shoulder: P(0.47, 0.36),
      elbow: P(0.53, 0.47),
      wrist: P(0.61, 0.38),
      hip: P(0.5, 0.58),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.57, 0.35), P(0.65, 0.41)]], // handle up
    }),
    b: side({
      head: P(0.45, 0.25),
      shoulder: P(0.47, 0.36),
      elbow: P(0.53, 0.47),
      wrist: P(0.6, 0.58),
      hip: P(0.5, 0.58),
      knee: P(0.5, 0.74),
      ankle: P(0.51, 0.9),
      props: [[P(0.56, 0.61), P(0.64, 0.55)]], // handle pressed down
    }),
  },

  // Lateral raise, front view: dumbbells at the sides → arms out to a T.
  raiseLateral: {
    view: 'front',
    a: {
      head: P(0.5, 0.21),
      shoulderL: P(0.42, 0.32),
      shoulderR: P(0.58, 0.32),
      elbowL: P(0.39, 0.43),
      elbowR: P(0.61, 0.43),
      wristL: P(0.37, 0.54),
      wristR: P(0.63, 0.54),
      hipL: P(0.455, 0.56),
      hipR: P(0.545, 0.56),
      kneeL: P(0.45, 0.73),
      kneeR: P(0.55, 0.73),
      ankleL: P(0.445, 0.9),
      ankleR: P(0.555, 0.9),
      props: [
        [P(0.33, 0.54), P(0.41, 0.54)], // left dumbbell at the side
        [P(0.59, 0.54), P(0.67, 0.54)], // right dumbbell at the side
      ],
    },
    b: {
      head: P(0.5, 0.21),
      shoulderL: P(0.42, 0.32),
      shoulderR: P(0.58, 0.32),
      elbowL: P(0.3, 0.3),
      elbowR: P(0.7, 0.3),
      wristL: P(0.19, 0.29),
      wristR: P(0.81, 0.29),
      hipL: P(0.455, 0.56),
      hipR: P(0.545, 0.56),
      kneeL: P(0.45, 0.73),
      kneeR: P(0.55, 0.73),
      ankleL: P(0.445, 0.9),
      ankleR: P(0.555, 0.9),
      props: [
        [P(0.19, 0.25), P(0.19, 0.33)], // left dumbbell raised (seen end-on)
        [P(0.81, 0.25), P(0.81, 0.33)], // right dumbbell raised
      ],
    },
  },

  // Cable fly, front view: arms open wide → hands sweep together in front of the chest.
  fly: {
    view: 'front',
    a: {
      head: P(0.5, 0.21),
      shoulderL: P(0.42, 0.32),
      shoulderR: P(0.58, 0.32),
      elbowL: P(0.3, 0.36),
      elbowR: P(0.7, 0.36),
      wristL: P(0.21, 0.42),
      wristR: P(0.79, 0.42),
      hipL: P(0.455, 0.56),
      hipR: P(0.545, 0.56),
      kneeL: P(0.45, 0.73),
      kneeR: P(0.55, 0.73),
      ankleL: P(0.445, 0.9),
      ankleR: P(0.555, 0.9),
      props: [
        [P(0.18, 0.45), P(0.24, 0.39)], // left handle, arc open
        [P(0.76, 0.39), P(0.82, 0.45)], // right handle, arc open
      ],
    },
    b: {
      head: P(0.5, 0.21),
      shoulderL: P(0.42, 0.32),
      shoulderR: P(0.58, 0.32),
      elbowL: P(0.37, 0.42),
      elbowR: P(0.63, 0.42),
      wristL: P(0.47, 0.44),
      wristR: P(0.53, 0.44),
      hipL: P(0.455, 0.56),
      hipR: P(0.545, 0.56),
      kneeL: P(0.45, 0.73),
      kneeR: P(0.55, 0.73),
      ankleL: P(0.445, 0.9),
      ankleR: P(0.555, 0.9),
      props: [
        [P(0.47, 0.4), P(0.47, 0.48)], // handles squeezed together
        [P(0.53, 0.4), P(0.53, 0.48)],
      ],
    },
  },

  // Plank hold: rigid line from shoulders to ankles, forearms down; hips pulse subtly (the hold).
  core: {
    view: 'side',
    a: side({
      head: P(0.2, 0.56),
      shoulder: P(0.27, 0.6),
      elbow: P(0.27, 0.73),
      wrist: P(0.37, 0.74),
      hip: P(0.48, 0.66),
      knee: P(0.62, 0.7),
      ankle: P(0.76, 0.74),
    }),
    b: side({
      head: P(0.2, 0.56),
      shoulder: P(0.27, 0.6),
      elbow: P(0.27, 0.73),
      wrist: P(0.37, 0.74),
      hip: P(0.48, 0.61), // hips lift into a tighter line
      knee: P(0.62, 0.67),
      ankle: P(0.76, 0.74),
    }),
  },

  // Running, side view: two mirrored stride frames (arms and legs swap) with a slight bob.
  cardio: {
    view: 'side',
    a: {
      head: P(0.51, 0.22),
      shoulderL: P(0.49, 0.33),
      shoulderR: P(0.49, 0.33),
      elbowL: P(0.57, 0.4), // left arm swings forward…
      elbowR: P(0.41, 0.4), // …right arm back
      wristL: P(0.63, 0.34),
      wristR: P(0.36, 0.47),
      hipL: P(0.45, 0.54),
      hipR: P(0.47, 0.54),
      kneeL: P(0.37, 0.64), // left leg trails, heel kicking up…
      kneeR: P(0.58, 0.65), // …right leg drives forward
      ankleL: P(0.29, 0.7),
      ankleR: P(0.63, 0.8),
      props: [],
    },
    b: {
      head: P(0.51, 0.24),
      shoulderL: P(0.49, 0.35),
      shoulderR: P(0.49, 0.35),
      elbowL: P(0.41, 0.42), // stride mirrored
      elbowR: P(0.57, 0.42),
      wristL: P(0.36, 0.49),
      wristR: P(0.63, 0.36),
      hipL: P(0.45, 0.56),
      hipR: P(0.47, 0.56),
      kneeL: P(0.56, 0.67),
      kneeR: P(0.35, 0.66),
      ankleL: P(0.61, 0.82),
      ankleR: P(0.27, 0.72),
      props: [],
    },
  },
};
