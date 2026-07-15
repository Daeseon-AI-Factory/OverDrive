import type { ExerciseRow } from '@/db/types';
import { exerciseFixture } from '@/features/exercises/catalog/testFixture';
import type { CatalogExerciseView } from '@/features/exercises/catalog/types';
import { parseEntry } from './parseEntry';
import {
  buildQuickLogCandidates,
  MAX_QUICKLOG_CANDIDATES,
  MAX_QUICKLOG_NAMES,
  resolvedQuickLogWeightKg,
} from './catalogProjection';

describe('QuickLog catalog projection', () => {
  it('is deterministic/bounded, hides opaque ids from names, and excludes unsupported modes', () => {
    const views: CatalogExerciseView[] = Array.from({ length: 70 }, (_, index) => {
      const order = 33 + index;
      const catalog = exerciseFixture(`future_press_${order}`, order);
      catalog.localizations.en = {
        displayName: `Future Press ${order}`,
        aliases: [`Press ${order}`, `Lift ${order}`, `Movement ${order}`, `Extra ${order}`],
      };
      return {
        exercise: row(`catalog_${String(order).padStart(32, '0')}`),
        catalog,
      };
    });
    const plank = exerciseFixture('plank', 18);
    views.push({ exercise: row('plank'), catalog: plank });
    views.reverse();

    const candidates = buildQuickLogCandidates(views, 'en', ({ exercise }) => exercise.name);
    expect(candidates).toHaveLength(MAX_QUICKLOG_CANDIDATES);
    expect(candidates[0]).toMatchObject({ catalogId: 'future_press_33', name: 'Future Press 33' });
    expect(candidates.every((candidate) => [candidate.name, ...candidate.aliases].length <= MAX_QUICKLOG_NAMES)).toBe(true);
    expect(candidates.some((candidate) => candidate.catalogId === 'plank')).toBe(false);
    expect(candidates.some((candidate) => candidate.name.startsWith('catalog_'))).toBe(false);
  });

  it('feeds Spanish diacritics and zh-Hans names into the Unicode local parser', () => {
    const spanish = exerciseFixture('press_es', 33);
    spanish.localizations.es = { displayName: 'Press de tríceps', aliases: ['Extensión de tríceps'] };
    const chinese = exerciseFixture('press_zh', 34);
    chinese.localizations['zh-Hans'] = { displayName: '绳索下压', aliases: ['肱三头肌下压'] };
    const views = [
      { exercise: row('catalog_00000000000040008000000000000001'), catalog: spanish },
      { exercise: row('catalog_00000000000040008000000000000002'), catalog: chinese },
    ];

    const es = buildQuickLogCandidates(views, 'es', ({ exercise }) => exercise.name);
    const zh = buildQuickLogCandidates(views, 'zh-Hans', ({ exercise }) => exercise.name);
    expect(parseEntry('extensión de tríceps 20 10', es)).toMatchObject({
      ok: true,
      set: { exerciseId: views[0].exercise.id, reps: 10 },
    });
    expect(parseEntry('肱三头肌下压 20 10', zh)).toMatchObject({
      ok: true,
      set: { exerciseId: views[1].exercise.id, reps: 10 },
    });
  });

  it('keeps English display names and aliases usable under a non-English app locale', () => {
    const catalog = exerciseFixture('bulgarian_split_squat', 15);
    catalog.localizations.ko = { displayName: '불가리안 스플릿 스쿼트', aliases: ['불스스'] };
    catalog.localizations.en = {
      displayName: 'Bulgarian Split Squat',
      aliases: ['Rear-Foot-Elevated Split Squat'],
    };
    const views = [{ exercise: row('bulgarian_split_squat'), catalog }];

    const candidates = buildQuickLogCandidates(views, 'ko', ({ exercise }) => exercise.name);
    expect(parseEntry('rear foot elevated split squat 20 8', candidates)).toMatchObject({
      ok: true,
      set: { exerciseId: 'bulgarian_split_squat', reps: 8 },
    });
  });
});

describe('QuickLog catalog weight authority', () => {
  it('forces pure bodyweight to zero but preserves measured optional load', () => {
    expect(resolvedQuickLogWeightKg(
      { isBodyweight: true, allowsExternalLoad: false },
      undefined,
      20,
    )).toBe(0);
    expect(resolvedQuickLogWeightKg(
      { isBodyweight: true, allowsExternalLoad: true },
      undefined,
      20,
    )).toBe(20);
    expect(resolvedQuickLogWeightKg(
      { isBodyweight: false, allowsExternalLoad: false },
      undefined,
      20,
    )).toBe(20);
  });

  it('fails closed for an ad-hoc bodyweight hint without load semantics', () => {
    expect(resolvedQuickLogWeightKg(undefined, true, 20)).toBe(0);
  });
});

function row(id: string): ExerciseRow {
  return {
    id,
    name: id,
    muscle_group: 'chest',
    type: 'strength',
    default_sets: 3,
    rep_low: 8,
    rep_high: 12,
    is_bodyweight: 0,
    created_at: '2026-07-14T00:00:00Z',
  };
}
