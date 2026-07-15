import { EXERCISE_SEED } from '@/db/seed';
import type { ExerciseRow } from '@/db/types';
import { CARDIO_EXERCISE_IDS, REGIONS } from '@/features/character/regions';
import {
  buildExerciseDiscoveryItems,
  discoverExercises,
  type RecentExerciseSet,
} from './discovery';
import { exerciseFixture } from './catalog/testFixture';
import type { CatalogExercise } from './catalog/types';

const rows: ExerciseRow[] = EXERCISE_SEED.map((exercise) => ({
  ...exercise,
  is_bodyweight: exercise.is_bodyweight ? 1 : 0,
  created_at: '2026-07-09T00:00:00.000Z',
}));

const build = (catalog: readonly ExerciseRow[] = rows, recents: readonly RecentExerciseSet[] = []) =>
  buildExerciseDiscoveryItems(catalog, (exercise) => exercise.name, recents);

describe('exercise discovery', () => {
  it('keeps an explicit region as the empty state and moves its recent lifts first', () => {
    const items = build(rows, [
      { exerciseId: 'cable_fly', weight: 20, reps: 12, rir: 2 },
      { exerciseId: 'leg_press', weight: 100, reps: 10, rir: 1 },
    ]);

    const result = discoverExercises(items, {
      query: '',
      explicitIds: REGIONS.chest.exerciseIds,
    });

    expect(result.map((item) => item.exercise.id)).toEqual([
      'cable_fly',
      'barbell_bench_press',
      'incline_db_press',
      'dips',
    ]);
  });

  it('searches outside the initial region while preserving its inferred strength boundary', () => {
    const items = build();
    expect(
      discoverExercises(items, { query: 'hip thrust', explicitIds: REGIONS.chest.exerciseIds }).map(
        (item) => item.exercise.id,
      ),
    ).toContain('hip_thrust');
    expect(
      discoverExercises(items, { query: 'cycling', explicitIds: REGIONS.chest.exerciseIds }),
    ).toHaveLength(0);
  });

  it('finds English id tokens and partial Korean DB names', () => {
    const items = build();
    expect(discoverExercises(items, { query: 'bench', type: 'strength' })[0]?.exercise.id).toBe(
      'barbell_bench_press',
    );
    expect(discoverExercises(items, { query: '벤치', type: 'strength' })[0]?.exercise.id).toBe(
      'barbell_bench_press',
    );
  });

  it('finds exercises from a localized body-region alias', () => {
    const items = buildExerciseDiscoveryItems(
      rows,
      (exercise) => exercise.name,
      [],
      (exercise) => (exercise.muscle_group === 'chest' ? ['가슴'] : []),
    );

    expect(
      discoverExercises(items, { query: '가슴', type: 'strength' }).map((item) => item.exercise.id),
    ).toEqual(expect.arrayContaining(['barbell_bench_press', 'cable_fly']));
  });

  it('finds an ad-hoc DB exercise by localized name, stored name, and muscle group', () => {
    const adHoc: ExerciseRow = {
      id: 'farmers_carry',
      name: '파머스 캐리',
      muscle_group: 'other',
      type: 'strength',
      default_sets: 3,
      rep_low: 8,
      rep_high: 12,
      is_bodyweight: 0,
      created_at: '2026-07-09T00:00:00.000Z',
    };
    const items = buildExerciseDiscoveryItems([...rows, adHoc], (exercise) =>
      exercise.id === adHoc.id ? "Farmer's Carry" : exercise.name,
    [],
    );

    expect(discoverExercises(items, { query: 'farmer', type: 'strength' })[0]?.exercise.id).toBe(adHoc.id);
    expect(discoverExercises(items, { query: '파머스', type: 'strength' })[0]?.exercise.id).toBe(adHoc.id);
    expect(discoverExercises(items, { query: 'other', type: 'strength' })[0]?.exercise.id).toBe(adHoc.id);
  });

  it('shows the full requested type when no explicit list is supplied', () => {
    const result = discoverExercises(build(), { query: '', type: 'cardio' });
    expect(result).toHaveLength(EXERCISE_SEED.filter((exercise) => exercise.type === 'cardio').length);
    expect(result.every((item) => item.exercise.type === 'cardio')).toBe(true);
  });

  it('keeps every seed entry reachable from a region/cardio lane and directly searchable', () => {
    const mapped = new Set([
      ...Object.values(REGIONS).flatMap((region) => region.exerciseIds),
      ...CARDIO_EXERCISE_IDS,
    ]);
    const items = build();

    for (const exercise of EXERCISE_SEED) {
      expect(mapped.has(exercise.id)).toBe(true);
      expect(
        discoverExercises(items, { query: exercise.id, type: exercise.type }).some(
          (item) => item.exercise.id === exercise.id,
        ),
      ).toBe(true);
    }
  });

  it('applies the frozen typo vectors only to complete display/alias/id terms', () => {
    const bench = rows[0];
    const run = rows.find((exercise) => exercise.id === 'outdoor_run')!;
    const metadata = new Map<string, CatalogExercise>([
      [bench.id, {
        ...exerciseFixture(bench.id, 1),
        localizations: {
          ...exerciseFixture(bench.id, 1).localizations,
          en: { displayName: 'Bench', aliases: ['Bench Press'] },
        },
      }],
      [run.id, {
        ...exerciseFixture(run.id, 25, 'cardio'),
        localizations: {
          ...exerciseFixture(run.id, 25, 'cardio').localizations,
          en: { displayName: 'Run', aliases: ['Outdoor Run'] },
        },
      }],
    ]);
    const items = buildExerciseDiscoveryItems(
      [bench, run],
      (exercise) => metadata.get(exercise.id)!.localizations.en.displayName,
      [],
      () => [],
      (exercise) => metadata.get(exercise.id) ?? null,
    );

    expect(discoverExercises(items, { query: 'benc' }).map((item) => item.exercise.id)).toEqual([bench.id]);
    expect(discoverExercises(items, { query: 'benhc' })).toHaveLength(0);
    expect(discoverExercises(items, { query: 'benchprzs' }).map((item) => item.exercise.id)).toEqual([bench.id]);
    expect(discoverExercises(items, { query: 'rnu' })).toHaveLength(0);
  });

  it('searches canonical aliases, equipment, movement, and primary/secondary regions', () => {
    const exercise = rows[0];
    const metadata: CatalogExercise = {
      ...exerciseFixture(exercise.id, 1),
      equipment: { required: ['barbell'], optional: ['bench'] },
      movementPattern: 'horizontal_push',
      primaryBodyRegions: ['chest'],
      secondaryBodyRegions: ['shoulders', 'triceps'],
      localizations: {
        ...exerciseFixture(exercise.id, 1).localizations,
        en: { displayName: 'Barbell Bench Press', aliases: ['Flat Bench'] },
      },
    };
    const items = buildExerciseDiscoveryItems(
      [exercise],
      () => metadata.localizations.en.displayName,
      [],
      () => ['가슴'],
      () => metadata,
    );

    for (const query of ['flat bench', 'barbell', 'horizontal push', 'chest', 'shoulders', '가슴']) {
      expect(discoverExercises(items, { query })[0]?.exercise.id).toBe(exercise.id);
    }
  });

  it('searches English canonical aliases while the picker displays Korean', () => {
    const exercise = rows[0];
    const metadata: CatalogExercise = {
      ...exerciseFixture(exercise.id, 1),
      localizations: {
        ...exerciseFixture(exercise.id, 1).localizations,
        ko: { displayName: '바벨 벤치프레스', aliases: ['바벨 벤치'] },
        en: { displayName: 'Barbell Bench Press', aliases: ['Flat Bench'] },
      },
    };
    const items = buildExerciseDiscoveryItems(
      [exercise],
      () => metadata.localizations.ko.displayName,
      [],
      () => [],
      () => metadata,
      'ko',
    );

    expect(discoverExercises(items, { query: 'flat bench' })[0]?.exercise.id).toBe(exercise.id);
  });

  it('searches canonical ID tokens instead of the opaque local bridge ID', () => {
    const opaque: ExerciseRow = {
      ...rows[0],
      id: 'catalog_00000000000040008000000000000001',
    };
    const metadata = exerciseFixture('single_leg_romanian_deadlift', 33);
    const items = buildExerciseDiscoveryItems(
      [opaque],
      () => metadata.localizations.en.displayName,
      [],
      () => [],
      () => metadata,
    );

    expect(discoverExercises(items, { query: 'single' })[0]?.exercise.id).toBe(opaque.id);
    expect(discoverExercises(items, { query: 'romanian' })[0]?.exercise.id).toBe(opaque.id);
  });

  it('uses current program, then recent use, then displayOrder for search ties', () => {
    const candidates = rows.slice(0, 3);
    const metadata = new Map<string, CatalogExercise>(candidates.map((exercise, index) => [
      exercise.id,
      {
        ...exerciseFixture(exercise.id, index + 1),
        primaryBodyRegions: ['chest'],
      },
    ] as [string, CatalogExercise]));
    const items = buildExerciseDiscoveryItems(
      candidates,
      () => 'Chest movement',
      [{ exerciseId: candidates[1].id, weight: 20, reps: 8, rir: 2 }],
      () => [],
      (exercise) => metadata.get(exercise.id) ?? null,
    );

    expect(discoverExercises(items, {
      query: 'chest',
      programExerciseIds: [candidates[2].id],
    }).map((item) => item.exercise.id)).toEqual([
      candidates[2].id,
      candidates[1].id,
      candidates[0].id,
    ]);
  });
});
