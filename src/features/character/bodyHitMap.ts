export type BodyHitRegionId =
  | 'chest'
  | 'shoulders'
  | 'back'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

export type BodyHitView = 'front' | 'back';
export type BodyHitSide = 'center' | 'left' | 'right';

export const BODY_HIT_REGIONS = [
  'chest',
  'shoulders',
  'back',
  'biceps',
  'triceps',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
] as const satisfies readonly BodyHitRegionId[];

/** A point normalized to the avatar stage, where both axes run from 0 to 1. */
export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export type NormalizedPolygon = readonly NormalizedPoint[];

export interface BodyHitArea {
  readonly id: string;
  readonly region: BodyHitRegionId;
  readonly side: BodyHitSide;
  readonly polygon: NormalizedPolygon;
}

const FRONT_VISIBLE_REGIONS = [
  'shoulders',
  'chest',
  'biceps',
  'core',
  'quads',
  'calves',
] as const satisfies readonly BodyHitRegionId[];

const BACK_VISIBLE_REGIONS = [
  'shoulders',
  'back',
  'triceps',
  'glutes',
  'hamstrings',
  'calves',
] as const satisfies readonly BodyHitRegionId[];

/**
 * Visibility and overlap priority for each pose. Earlier regions win when two
 * inclusive polygons share a boundary or intentionally overlap near a joint.
 */
export const BODY_HIT_PRIORITY: Readonly<Record<BodyHitView, readonly BodyHitRegionId[]>> = {
  front: FRONT_VISIBLE_REGIONS,
  back: BACK_VISIBLE_REGIONS,
};

const mirrorPolygon = (polygon: NormalizedPolygon): NormalizedPolygon =>
  polygon.map(({ x, y }) => ({ x: 1 - x, y }));

const pairedAreas = (
  region: BodyHitRegionId,
  leftPolygon: NormalizedPolygon,
): readonly BodyHitArea[] => [
  { id: `${region}-left`, region, side: 'left', polygon: leftPolygon },
  { id: `${region}-right`, region, side: 'right', polygon: mirrorPolygon(leftPolygon) },
];

const centeredArea = (
  region: BodyHitRegionId,
  polygon: NormalizedPolygon,
): BodyHitArea => ({
  id: region,
  region,
  side: 'center',
  polygon,
});

// Calibrated against the bundled 512×1280 sportswear front/back assets. The shapes are deliberately
// generous around narrow limbs; BodyMap adds a 22pt nearest-edge tolerance so the effective target
// is usable with one hand without turning empty background into a body hit.
const FRONT_SHOULDERS = pairedAreas('shoulders', [
  { x: 0.12, y: 0.22 },
  { x: 0.22, y: 0.18 },
  { x: 0.39, y: 0.19 },
  { x: 0.4, y: 0.28 },
  { x: 0.32, y: 0.33 },
  { x: 0.18, y: 0.3 },
]);

const FRONT_CHEST = centeredArea('chest', [
  { x: 0.3, y: 0.21 },
  { x: 0.5, y: 0.2 },
  { x: 0.7, y: 0.21 },
  { x: 0.67, y: 0.34 },
  { x: 0.5, y: 0.36 },
  { x: 0.33, y: 0.34 },
]);

const FRONT_BICEPS = pairedAreas('biceps', [
  { x: 0.17, y: 0.24 },
  { x: 0.34, y: 0.24 },
  { x: 0.3, y: 0.38 },
  { x: 0.24, y: 0.53 },
  { x: 0.08, y: 0.58 },
  { x: 0.06, y: 0.51 },
  { x: 0.17, y: 0.35 },
]);

const FRONT_CORE = centeredArea('core', [
  { x: 0.32, y: 0.33 },
  { x: 0.68, y: 0.33 },
  { x: 0.67, y: 0.47 },
  { x: 0.5, y: 0.51 },
  { x: 0.33, y: 0.47 },
]);

const FRONT_QUADS = pairedAreas('quads', [
  { x: 0.25, y: 0.52 },
  { x: 0.5, y: 0.52 },
  { x: 0.49, y: 0.68 },
  { x: 0.43, y: 0.7 },
  { x: 0.27, y: 0.68 },
]);

const FRONT_CALVES = pairedAreas('calves', [
  { x: 0.24, y: 0.7 },
  { x: 0.47, y: 0.7 },
  { x: 0.44, y: 0.91 },
  { x: 0.37, y: 0.91 },
  { x: 0.26, y: 0.82 },
]);

const BACK_SHOULDERS = pairedAreas('shoulders', [
  { x: 0.12, y: 0.22 },
  { x: 0.22, y: 0.18 },
  { x: 0.39, y: 0.19 },
  { x: 0.4, y: 0.28 },
  { x: 0.32, y: 0.33 },
  { x: 0.18, y: 0.3 },
]);

const BACK_BACK = centeredArea('back', [
  { x: 0.29, y: 0.21 },
  { x: 0.5, y: 0.19 },
  { x: 0.71, y: 0.21 },
  { x: 0.66, y: 0.44 },
  { x: 0.5, y: 0.46 },
  { x: 0.34, y: 0.44 },
]);

const BACK_TRICEPS = pairedAreas('triceps', [
  { x: 0.17, y: 0.24 },
  { x: 0.34, y: 0.24 },
  { x: 0.3, y: 0.38 },
  { x: 0.24, y: 0.53 },
  { x: 0.08, y: 0.58 },
  { x: 0.06, y: 0.51 },
  { x: 0.17, y: 0.35 },
]);

const BACK_GLUTES = pairedAreas('glutes', [
  { x: 0.25, y: 0.44 },
  { x: 0.5, y: 0.44 },
  { x: 0.49, y: 0.58 },
  { x: 0.42, y: 0.6 },
  { x: 0.26, y: 0.57 },
]);

const BACK_HAMSTRINGS = pairedAreas('hamstrings', [
  { x: 0.25, y: 0.58 },
  { x: 0.49, y: 0.58 },
  { x: 0.47, y: 0.68 },
  { x: 0.4, y: 0.7 },
  { x: 0.25, y: 0.68 },
]);

const BACK_CALVES = pairedAreas('calves', [
  { x: 0.24, y: 0.7 },
  { x: 0.47, y: 0.7 },
  { x: 0.44, y: 0.91 },
  { x: 0.37, y: 0.91 },
  { x: 0.26, y: 0.82 },
]);

export const BODY_HIT_AREAS: Readonly<Record<BodyHitView, readonly BodyHitArea[]>> = {
  front: [
    ...FRONT_SHOULDERS,
    FRONT_CHEST,
    ...FRONT_BICEPS,
    FRONT_CORE,
    ...FRONT_QUADS,
    ...FRONT_CALVES,
  ],
  back: [
    ...BACK_SHOULDERS,
    BACK_BACK,
    ...BACK_TRICEPS,
    ...BACK_GLUTES,
    ...BACK_HAMSTRINGS,
    ...BACK_CALVES,
  ],
};

const EDGE_EPSILON = 1e-9;

const isPointOnSegment = (
  point: NormalizedPoint,
  start: NormalizedPoint,
  end: NormalizedPoint,
): boolean => {
  const cross =
    (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);

  if (Math.abs(cross) > EDGE_EPSILON) return false;

  const minX = Math.min(start.x, end.x) - EDGE_EPSILON;
  const maxX = Math.max(start.x, end.x) + EDGE_EPSILON;
  const minY = Math.min(start.y, end.y) - EDGE_EPSILON;
  const maxY = Math.max(start.y, end.y) + EDGE_EPSILON;

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
};

/** Inclusive point-in-polygon test: points on an edge or vertex count as hits. */
export function isPointInPolygon(
  point: NormalizedPoint,
  polygon: NormalizedPolygon,
): boolean {
  if (polygon.length < 3 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return false;
  }

  let inside = false;

  for (let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex];
    const previous = polygon[previousIndex];

    if (isPointOnSegment(point, previous, current)) return true;

    const crossesHorizontalRay =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (crossesHorizontalRay) inside = !inside;
  }

  return inside;
}

/** Returns the highest-priority visible region at a normalized point. */
export function hitTestBodyRegion(
  view: BodyHitView,
  point: NormalizedPoint,
): BodyHitRegionId | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  ) {
    return null;
  }

  const areas = BODY_HIT_AREAS[view];
  for (const region of BODY_HIT_PRIORITY[view]) {
    for (const area of areas) {
      if (area.region === region && isPointInPolygon(point, area.polygon)) {
        return region;
      }
    }
  }

  return null;
}

export interface BodyHitViewport {
  readonly width: number;
  readonly height: number;
  /** Physical tolerance around a polygon edge. 22pt gives a 44pt effective minimum target. */
  readonly radius: number;
}

function squaredDistanceToSegment(
  point: NormalizedPoint,
  start: NormalizedPoint,
  end: NormalizedPoint,
  viewport: BodyHitViewport,
): number {
  const px = point.x * viewport.width;
  const py = point.y * viewport.height;
  const sx = start.x * viewport.width;
  const sy = start.y * viewport.height;
  const ex = end.x * viewport.width;
  const ey = end.y * viewport.height;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  const nearestX = sx + projection * dx;
  const nearestY = sy + projection * dy;
  return (px - nearestX) ** 2 + (py - nearestY) ** 2;
}

function squaredDistanceToPolygon(
  point: NormalizedPoint,
  polygon: NormalizedPolygon,
  viewport: BodyHitViewport,
): number {
  if (isPointInPolygon(point, polygon)) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    nearest = Math.min(nearest, squaredDistanceToSegment(point, start, end, viewport));
  }
  return nearest;
}

/** Exact hit first, then the nearest visible polygon within a physical 22pt-style radius. */
export function hitTestBodyRegionWithTolerance(
  view: BodyHitView,
  point: NormalizedPoint,
  viewport: BodyHitViewport,
): BodyHitRegionId | null {
  const exact = hitTestBodyRegion(view, point);
  if (exact) return exact;
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    !Number.isFinite(viewport.radius) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    viewport.radius <= 0 ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  ) {
    return null;
  }

  const maxDistanceSquared = viewport.radius ** 2;
  let bestRegion: BodyHitRegionId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const region of BODY_HIT_PRIORITY[view]) {
    for (const area of BODY_HIT_AREAS[view]) {
      if (area.region !== region) continue;
      const distance = squaredDistanceToPolygon(point, area.polygon, viewport);
      if (distance <= maxDistanceSquared && distance < bestDistance) {
        bestDistance = distance;
        bestRegion = region;
      }
    }
  }
  return bestRegion;
}
