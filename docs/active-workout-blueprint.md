# Active Workout Blueprint

Date: 2026-06-12

## Product Direction

OverDrive should not make the user type every workout entry. The primary daily loop is:

1. Open Today.
2. See today's programmed workout.
3. Tap one large button to complete the current set.
4. Let the app auto-start rest and advance after the target sets.
5. Adjust weight/reps/RIR only when needed with tap controls.
6. For cardio days, tap a preset or repeat the last cardio session.

QuickLog remains useful, but it is a fallback for ad-hoc logging, not the main workout flow.

## Implemented Product Slice

- `src/features/workout/ActiveWorkoutCard.tsx`
  - Loads `todayProgram()` and resolves the programmed exercise rows from SQLite.
  - Prefills each strength exercise from `getLastSetForExercise`.
  - Logs the current set through `useLogSet`, preserving Combat Power recompute, Juice, and rest timer behavior.
  - Auto-advances to the next exercise after `default_sets`.
  - Supports inline +/- adjustment for weight, reps, and RIR.
  - Supports undo for the most recently logged Active Workout set.
  - Restores today's workout progress from `set_log` and `cardio_log`.
  - Supports one-tap cardio presets and "repeat last cardio".
  - Keeps the existing cardio sheet as a details/edit fallback.
  - Shows a clear finish workout action when the programmed work is complete.

- `src/features/workout/progress.ts`
  - Keeps merge/first-incomplete progress logic testable outside the UI.

- `src/app/(tabs)/index.tsx`
  - Promotes Active Workout to the top Today experience.
  - Moves `QuickLogBar` into the manual card-deck page.

- `src/features/logging/useLogSet.ts`
  - Now returns `setId` so Active Workout can undo the latest set.

- `src/features/logging/useLogCardio.ts`
  - Now returns `cardioId` so Active Workout can undo one-tap cardio.

- `src/features/forge/sessionStore.ts`
  - Adds `undoSet` so Forge completion summaries stay aligned after undo.
  - Adds `resume` so an open session can be recovered after app restart.

- `src/features/forge/useForge.ts`
  - Reuses today's open session instead of creating a duplicate session.
  - Can finish today's open session even after the in-memory store was reset.

- `src/db/repos/setLogRepo.ts`, `src/db/repos/cardioRepo.ts`, `src/db/repos/sessionRepo.ts`
  - Add focused query helpers for progress restore, last cardio, undo cardio, and open-session resume.

- `src/features/quicklog/QuickLogBar.tsx`
  - Ensures typed submit always clears `busy` with `try/finally`.

## Next Highest-Value Work

1. Add program customization.
   - Let the user choose training days, exercises, target sets, and rep ranges.
   - Store custom program data instead of relying only on `defaultProgram.ts`.

2. Add broader tests around the new flow.
   - Component test: render Active Workout, tap complete, verify `useLogSet` path and UI progression.
   - Repository/integration test: undo deletes the set and recomputes Combat Power.

3. Improve Active Cardio over time.
   - Add distance-aware repeat for running/cycling.
   - Add interval structure beyond a single `rounds` integer.

4. Add onboarding/settings for training split and protein target.
   - This should happen before any production beta.

## UX Rules For Future Work

- One common set should take one tap.
- One common cardio session should take one tap.
- Typing is allowed only as an escape hatch.
- The current exercise and primary action must be visually dominant.
- Editing is secondary and should use tap/hold controls, chips, or voice.
- Every destructive or accidental action needs a fast undo.
- Do not put QuickLog back above Active Workout unless user testing proves it is faster.

## Suggested Claude Code Parallelization

Parallel work is practical if file ownership is split.

Safe split:

- Codex owns:
  - `src/features/workout/ActiveWorkoutCard.tsx`
  - `src/app/(tabs)/index.tsx`
  - active workout i18n keys

- Claude Code can own:
  - program customization screens/settings
  - tests for repository and UI behavior
  - onboarding/settings for training split and protein target

Avoid simultaneous edits to:

- `src/app/(tabs)/index.tsx`
- `src/i18n/locales/*.json`
- `src/features/logging/useLogSet.ts`
- `src/features/forge/sessionStore.ts`

If both agents need the same files, make one agent land changes first, then have the other re-read the files and continue.
