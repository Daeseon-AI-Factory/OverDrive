import {
  BODY_HIT_AREAS,
  BODY_HIT_PRIORITY,
  BODY_HIT_REGIONS,
  hitTestBodyRegion,
  hitTestBodyRegionWithTolerance,
  isPointInPolygon,
  type BodyHitRegionId,
  type BodyHitView,
  type NormalizedPoint,
} from './bodyHitMap';

describe('isPointInPolygon', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ] as const;

  it('accepts interior points and rejects exterior points', () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false);
  });

  it.each([
    { x: 0.2, y: 0.2 },
    { x: 0.5, y: 0.2 },
    { x: 0.8, y: 0.5 },
    { x: 0.5, y: 0.8 },
  ])('treats boundary point $x,$y as inside', (point) => {
    expect(isPointInPolygon(point, square)).toBe(true);
  });

  it('handles concave polygons without filling the concavity', () => {
    const concave = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.9 },
    ] as const;

    expect(isPointInPolygon({ x: 0.75, y: 0.4 }, concave)).toBe(true);
    expect(isPointInPolygon({ x: 0.5, y: 0.75 }, concave)).toBe(false);
  });

  it('rejects invalid points and degenerate polygons', () => {
    expect(isPointInPolygon({ x: Number.NaN, y: 0.5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, square.slice(0, 2))).toBe(false);
  });
});

describe('body hit-map geometry', () => {
  const expectedByView: Readonly<Record<BodyHitView, readonly BodyHitRegionId[]>> = {
    front: ['shoulders', 'chest', 'biceps', 'core', 'quads', 'calves'],
    back: ['shoulders', 'back', 'triceps', 'glutes', 'hamstrings', 'calves'],
  };

  const representativePoints: Readonly<
    Record<BodyHitView, Readonly<Partial<Record<BodyHitRegionId, NormalizedPoint>>>>
  > = {
    front: {
      shoulders: { x: 0.25, y: 0.23 },
      chest: { x: 0.5, y: 0.28 },
      biceps: { x: 0.18, y: 0.4 },
      core: { x: 0.5, y: 0.42 },
      quads: { x: 0.38, y: 0.62 },
      calves: { x: 0.36, y: 0.8 },
    },
    back: {
      shoulders: { x: 0.25, y: 0.23 },
      back: { x: 0.5, y: 0.34 },
      triceps: { x: 0.18, y: 0.4 },
      glutes: { x: 0.38, y: 0.52 },
      hamstrings: { x: 0.38, y: 0.64 },
      calves: { x: 0.36, y: 0.8 },
    },
  };

  it.each(['front', 'back'] as const)('%s exposes exactly its gym-intuitive regions', (view) => {
    const regions = new Set(BODY_HIT_AREAS[view].map((area) => area.region));

    expect([...regions]).toEqual(expectedByView[view]);
    expect(BODY_HIT_PRIORITY[view]).toEqual(expectedByView[view]);
  });

  it('covers all ten regions across the two views', () => {
    const allRegions = new Set(
      (['front', 'back'] as const).flatMap((view) =>
        BODY_HIT_AREAS[view].map((area) => area.region),
      ),
    );

    expect(allRegions).toEqual(
      new Set<BodyHitRegionId>([
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
      ]),
    );
    expect(new Set(BODY_HIT_REGIONS)).toEqual(allRegions);
  });

  it.each(['front', 'back'] as const)('%s polygons are normalized and non-degenerate', (view) => {
    for (const area of BODY_HIT_AREAS[view]) {
      expect(area.polygon.length).toBeGreaterThanOrEqual(3);
      for (const point of area.polygon) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(['front', 'back'] as const)('%s paired polygons are exact horizontal mirrors', (view) => {
    const leftAreas = BODY_HIT_AREAS[view].filter((area) => area.side === 'left');

    for (const left of leftAreas) {
      const right = BODY_HIT_AREAS[view].find(
        (area) => area.region === left.region && area.side === 'right',
      );
      expect(right).toBeDefined();
      expect(right?.polygon).toEqual(
        left.polygon.map(({ x, y }) => ({ x: 1 - x, y })),
      );
    }
  });

  it.each(['front', 'back'] as const)('%s returns every visible region at a representative point', (view) => {
    for (const region of expectedByView[view]) {
      const point = representativePoints[view][region];
      expect(point).toBeDefined();
      expect(hitTestBodyRegion(view, point as NormalizedPoint)).toBe(region);
    }
  });

  it.each(['front', 'back'] as const)('%s returns symmetric hits for paired regions', (view) => {
    const pairedRegions = expectedByView[view].filter((region) =>
      BODY_HIT_AREAS[view].some(
        (area) => area.region === region && area.side === 'left',
      ),
    );

    for (const region of pairedRegions) {
      const leftPoint = representativePoints[view][region];
      expect(leftPoint).toBeDefined();
      const rightPoint = { x: 1 - (leftPoint as NormalizedPoint).x, y: (leftPoint as NormalizedPoint).y };

      expect(hitTestBodyRegion(view, leftPoint as NormalizedPoint)).toBe(region);
      expect(hitTestBodyRegion(view, rightPoint)).toBe(region);
    }
  });

  it('uses priority for intentional shoulder/chest and glute/hamstring overlaps', () => {
    expect(hitTestBodyRegion('front', { x: 0.34, y: 0.26 })).toBe('shoulders');
    expect(hitTestBodyRegion('back', { x: 0.35, y: 0.26 })).toBe('shoulders');
    expect(hitTestBodyRegion('back', { x: 0.4, y: 0.58 })).toBe('glutes');
  });

  it('uses priority on inclusive lower-body boundaries', () => {
    expect(hitTestBodyRegion('front', { x: 0.4, y: 0.7 })).toBe('calves');
    expect(hitTestBodyRegion('back', { x: 0.4, y: 0.58 })).toBe('glutes');
    expect(hitTestBodyRegion('back', { x: 0.4, y: 0.7 })).toBe('hamstrings');
  });

  it('keeps thigh, calf, glute, and hamstring anchors aligned to the bundled avatar pixels', () => {
    expect(hitTestBodyRegion('front', { x: 0.38, y: 0.64 })).toBe('quads');
    expect(hitTestBodyRegion('front', { x: 0.36, y: 0.78 })).toBe('calves');
    expect(hitTestBodyRegion('back', { x: 0.38, y: 0.52 })).toBe('glutes');
    expect(hitTestBodyRegion('back', { x: 0.38, y: 0.64 })).toBe('hamstrings');
  });

  it('adds a physical nearest-edge tolerance for narrow limbs without filling distant background', () => {
    const compactStage = { width: 180, height: 375, radius: 22 };
    expect(hitTestBodyRegion('front', { x: 0.04, y: 0.42 })).toBeNull();
    expect(hitTestBodyRegionWithTolerance('front', { x: 0.04, y: 0.42 }, compactStage)).toBe('biceps');
    expect(hitTestBodyRegionWithTolerance('back', { x: 0.04, y: 0.42 }, compactStage)).toBe('triceps');
    expect(hitTestBodyRegionWithTolerance('front', { x: 0.02, y: 0.66 }, compactStage)).toBeNull();
  });

  it('never exposes front-only regions from the back or back-only regions from the front', () => {
    expect(BODY_HIT_AREAS.front.some((area) => area.region === 'back')).toBe(false);
    expect(BODY_HIT_AREAS.front.some((area) => area.region === 'triceps')).toBe(false);
    expect(BODY_HIT_AREAS.front.some((area) => area.region === 'glutes')).toBe(false);
    expect(BODY_HIT_AREAS.front.some((area) => area.region === 'hamstrings')).toBe(false);
    expect(BODY_HIT_AREAS.back.some((area) => area.region === 'chest')).toBe(false);
    expect(BODY_HIT_AREAS.back.some((area) => area.region === 'biceps')).toBe(false);
    expect(BODY_HIT_AREAS.back.some((area) => area.region === 'core')).toBe(false);
    expect(BODY_HIT_AREAS.back.some((area) => area.region === 'quads')).toBe(false);
  });

  it.each([
    { x: -0.01, y: 0.5 },
    { x: 1.01, y: 0.5 },
    { x: 0.5, y: -0.01 },
    { x: 0.5, y: 1.01 },
    { x: Number.NaN, y: 0.5 },
    { x: 0.5, y: Number.POSITIVE_INFINITY },
  ])('rejects invalid normalized point $x,$y', (point) => {
    expect(hitTestBodyRegion('front', point)).toBeNull();
  });

  it('returns null in non-body space', () => {
    expect(hitTestBodyRegion('front', { x: 0.5, y: 0.1 })).toBeNull();
    expect(hitTestBodyRegion('back', { x: 0.05, y: 0.5 })).toBeNull();
  });
});
