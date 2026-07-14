# Exercise Catalog v1 Adversarial Review

Status: release-blocking findings accepted

Reviewed implementation: `8f0e08cdb93b7fad90ae6bf0af9d197e2edf1987`

Recorded: `2026-07-14`

This report records the pre-fix state. It is evidence for why the catalog is
being amended; it is not evidence that any exercise row was medically,
scientifically, or human-editorially reviewed.

## Rubric

The review attacks four failure classes:

1. provenance claims that exceed the evidence actually held;
2. fields whose machine-readable meaning differs from the displayed exercise;
3. counting, laterality, and region metadata that can produce wrong logs/search;
4. names or aliases that are ambiguous, mistranslated, eponymous, or mark-like.

Release is blocked if a row can pass validation while still exhibiting one of
those failures.

## Verified findings

### R1 — Critical: row-specific source review is self-asserted

`scripts/catalog/catalog-source.mjs:32-54` creates one source-check evidence
object, and `scripts/catalog/catalog-source.mjs:451-460` copies its status,
role, evidence ID, timestamp, and general references into every row. The cited
ACSM/AHA/HHS documents are program/safety-level references; no committed
artifact shows an exercise-by-exercise review of each name, alias, equipment,
movement, difficulty, region, and default target. The validator then requires
that self-authored claim (`scripts/catalog/catalog-validation.mjs:223-232`), so
it proves internal consistency, not external review.

Required correction: mark current row metadata `original_editorial` and
`unreviewed`; use null reviewer/evidence fields and no row-specific source list.
Keep general references in a separate context artifact with
`exerciseSpecificReview: false`. Add contract/schema support rather than
inventing evidence.

### R2 — High: `optional` is used as an alternative-equipment operator

The frozen model has only conjunctive `required` plus supplemental `optional`
arrays (`docs/contracts/exercise-catalog-v1.schema.json:118-135`). It has no
`anyOf`. The current generic HIIT, goblet squat, and farmer carry rows use
optional equipment as mutually exclusive implementations
(`scripts/catalog/catalog-source.mjs:235-237`, `330-332`, `395-397`). A client
cannot distinguish “may add this” from “use this instead.”

Required correction: narrow displays/IDs to one implementation and make its
required set honest. Do not add an unimplemented `anyOf` shape in this wave.

### R3 — High: counting/laterality is not representable

`defaultPrescription` contains only sets, mode, and target
(`docs/contracts/exercise-catalog-v1.schema.json:203-216`). It cannot state
whether 10 reps means total or 10 per side. This affects frozen and new
unilateral rows including split squat, one-arm row, walking lunge, step-up,
side plank, anti-rotation press, and single-leg hinge.

Required correction: add a bounded `countingConvention` field with explicit
`total`, `per_side`, and `not_applicable` semantics. Persist it in D1, include it
in coverage, and make the validator reject known unilateral rows marked total.

### R4 — High: movement taxonomy has wrong mechanical labels

The current leg press is `knee_extension` and dips are `horizontal_push`
(`scripts/catalog/catalog-source.mjs:160-162`, `195-197`). Leg press is a squat
pattern; parallel-bar dips are a vertical push pattern. These labels affect
movement search/coverage and cannot be treated as harmless display copy.

Required correction: change them to `squat` and `vertical_push`. Preserve their
frozen IDs and display order.

### R5 — High: generic display and exact required equipment disagree

Examples include generic standing/seated calf raises tied to a calf machine,
generic hip thrust tied to barbell+bench, a bench standing in for a step
platform, and generic machine-fly labels coupled to pec-deck equipment. The
current equipment enum has no step platform
(`docs/contracts/exercise-catalog-v1.schema.json:82-116`).

Required correction: make display names implementation-specific and add only
the missing neutral `step_platform` equipment token. Required equipment remains
conjunctive; optional equipment is supplemental only.

### R6 — Medium: aliases include incorrect or weak translations

Observed examples include Spanish `Elevación colgado`, Chinese dips alias
`双杠下压`, and unnatural `Calf Raise Seated`. These pass normalization but do not
establish semantic quality.

Required correction: replace the known bad aliases and add validator assertions
for the corrected canonical terms. Full human locale review remains an unknown,
not a completion claim.

### R7 — Medium: secondary-region tagging lacks a target rubric

Several rows add `core`, `back`, `calves`, `biceps`, or `triceps` merely because
they stabilize or participate (`scripts/catalog/catalog-source.mjs:110-212` and
`295-397`). That inflates body-region search and makes nearly any compound
movement appear in unrelated lists.

Required correction: primary means intended target/prime mover. Secondary means
a direct, meaningful training target, not incidental stabilization. Cap
secondary regions at three and remove unsupported tags.

### R8 — Medium: non-frozen names retain avoidable eponyms/mark-like terms

Non-frozen rows include Arnold, Pallof, Russian, farmer, EZ, hack, and pec-deck
identifiers/names. Existing frozen IDs such as `bulgarian_split_squat` cannot be
renamed, but new IDs have no compatibility reason to preserve these labels.

Required correction: replace non-frozen rows/tokens with neutral terms while
keeping 64 meaningful rows and preserving the original 32 IDs/order exactly.

## Unknowns that remain after mechanical remediation

- No human reviewer has approved the four locale strings.
- Default sets/ranges are logging defaults, not individualized prescriptions;
  their real-world usefulness is unverified.
- The ten-region model is intentionally coarse and cannot express forearms,
  hip flexors, or adductors directly.
- App cache/search integration and actual gym workflow remain untested in this
  data-only branch.

## Acceptance tests for the remediation

- Every row is `original_editorial` + `unreviewed` with null review evidence and
  no row-specific source citations.
- General reference context explicitly says it is not exercise-specific review.
- Legacy IDs/order 1–32 remain byte-for-byte identical to the compatibility list.
- Required equipment is conjunctive and matches the implementation-specific name.
- Known unilateral rows are `per_side`; cardio/open modality rows are
  `not_applicable`; all others state `total`.
- Corrected movement/name/alias facts have explicit adversarial tests.
- All generated artifacts rebuild deterministically and the D1 draft applies
  with zero foreign-key errors and no channel update.
