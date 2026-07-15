import type { ExerciseRow } from '@/db/types';
import {
  rankRegionRecommendations,
  regionsForMuscleGroup,
  type TrainingRegion,
} from './regionRecommendations';
import { exerciseFixture } from './catalog/testFixture';
import type { CatalogExercise } from './catalog/types';

const row = (id: string, name: string, muscleGroup: string): ExerciseRow => ({
  id,
  name,
  muscle_group: muscleGroup,
  type: 'strength',
  default_sets: 3,
  rep_low: 8,
  rep_high: 12,
  is_bodyweight: 0,
  created_at: '2026-07-09T00:00:00.000Z',
});

describe('region recommendation ranking', () => {
  it('orders program matches, then recents, then the alphabetical catalog', () => {
    const catalog = [
      row('catalog_z', 'Zulu Fly', 'chest'),
      row('recent_b', 'Beta Press', 'chest'),
      row('program_b', 'Program B', 'chest'),
      row('catalog_a', 'Alpha Fly', 'chest'),
      row('program_a', 'Program A', 'chest'),
      row('recent_a', 'Recent A', 'chest'),
    ];

    const result = rankRegionRecommendations({
      catalog,
      region: 'chest',
      recentSets: [{ exerciseId: 'recent_a' }, { exerciseId: 'recent_b' }],
      programExerciseIds: ['program_a', 'program_b'],
    });

    expect(result.map(({ exercise, reason }) => [exercise.id, reason])).toEqual([
      ['program_a', 'today'],
      ['program_b', 'today'],
      ['recent_a', 'recent'],
      ['recent_b', 'recent'],
      ['catalog_a', 'catalog'],
      ['catalog_z', 'catalog'],
    ]);
  });

  it('uses the highest-priority reason and never emits duplicate ids', () => {
    const shared = row('shared', 'Shared Press', 'chest');
    const result = rankRegionRecommendations({
      catalog: [shared, { ...shared, name: 'Duplicate DB Row' }],
      region: 'chest',
      recentSets: [{ exerciseId: 'shared' }, { exerciseId: 'shared' }],
      programExerciseIds: ['shared', 'shared'],
    });

    expect(result).toEqual([{ exercise: shared, reason: 'today' }]);
  });

  it('filters every reason to the selected body region', () => {
    const result = rankRegionRecommendations({
      catalog: [
        row('chest', 'Chest', 'chest'),
        row('back', 'Back', 'back'),
        row('cardio', 'Cardio', 'conditioning'),
      ],
      region: 'chest',
      recentSets: [{ exerciseId: 'back' }],
      programExerciseIds: ['cardio', 'back'],
    });

    expect(result.map(({ exercise }) => exercise.id)).toEqual(['chest']);
  });

  it('maps the catalog muscle groups onto the ten tappable regions', () => {
    const expected: Record<string, readonly TrainingRegion[]> = {
      chest: ['chest'],
      shoulders: ['shoulders'],
      back: ['back'],
      biceps: ['biceps'],
      triceps: ['triceps'],
      core: ['core'],
      glutes: ['glutes'],
      quads: ['quads'],
      hamstrings: ['hamstrings'],
      calves: ['calves'],
      posterior_chain: ['glutes', 'hamstrings'],
      conditioning: [],
      other: [],
    };

    for (const [muscleGroup, regions] of Object.entries(expected)) {
      expect(regionsForMuscleGroup(muscleGroup)).toEqual(regions);
    }
  });

  it('includes user-created catalog rows without a fixed exercise-id allowlist', () => {
    const custom = row('custom_ring_fly', '내 링 플라이', ' Pectorals ');
    const result = rankRegionRecommendations({
      catalog: [custom, row('unassigned_custom', '미분류 운동', 'other')],
      region: 'chest',
      recentSets: [{ exerciseId: custom.id, weight: 12, reps: 10 }],
    });

    expect(result).toEqual([{ exercise: custom, reason: 'recent' }]);
  });

  it('ranks canonical primary-region matches before secondary matches inside each reason', () => {
    const primaryToday = row('primary_today', 'Primary Today', 'other');
    const secondaryToday = row('secondary_today', 'Secondary Today', 'other');
    const primaryRecent = row('primary_recent', 'Primary Recent', 'other');
    const secondaryRecent = row('secondary_recent', 'Secondary Recent', 'other');
    const metadata = new Map<string, CatalogExercise>([
      [primaryToday.id, { ...exerciseFixture('primary_today', 36), primaryBodyRegions: ['chest'], secondaryBodyRegions: [] }],
      [secondaryToday.id, { ...exerciseFixture('secondary_today', 33), primaryBodyRegions: ['back'], secondaryBodyRegions: ['chest'] }],
      [primaryRecent.id, { ...exerciseFixture('primary_recent', 35), primaryBodyRegions: ['chest'], secondaryBodyRegions: [] }],
      [secondaryRecent.id, { ...exerciseFixture('secondary_recent', 34), primaryBodyRegions: ['back'], secondaryBodyRegions: ['chest'] }],
    ]);

    const result = rankRegionRecommendations({
      catalog: [secondaryToday, primaryToday, secondaryRecent, primaryRecent],
      region: 'chest',
      programExerciseIds: [secondaryToday.id, primaryToday.id],
      recentSets: [{ exerciseId: secondaryRecent.id }, { exerciseId: primaryRecent.id }],
      catalogFor: (exercise) => metadata.get(exercise.id) ?? null,
    });

    expect(result.map(({ exercise, reason }) => [exercise.id, reason])).toEqual([
      [primaryToday.id, 'today'],
      [secondaryToday.id, 'today'],
      [primaryRecent.id, 'recent'],
      [secondaryRecent.id, 'recent'],
    ]);
  });
});
