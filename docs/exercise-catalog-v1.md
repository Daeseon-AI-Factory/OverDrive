# Exercise Catalog v1 Contract

Status: **Frozen for v1 implementation**

Contract version: `1.0.0`

Baseline: repository commit `d59f07904176c30b614676a72ba0964ca140c34f`

Frozen: `2026-07-14T19:37:51Z`

Pre-release amendment: `2026-07-14` — provenance now distinguishes genuinely
unreviewed rows from source-checked rows; equipment alternatives may not be
encoded as optional supplements; and prescriptions carry an explicit counting
convention. A second pre-release correction preserves frozen umbrella identities,
uses filterable equipment-capability tokens where a concrete product would be
too narrow, and separates the 64-row curated artifact from the 512-row snapshot
contract. No catalog v1 release had been published before these amendments, so
the schema and every initial row remain at revision `1`.

This document is the normative boundary shared by catalog curation, the catalog
Worker/D1 service, and app-side cache/search work. The JSON Schema at
[`docs/contracts/exercise-catalog-v1.schema.json`](contracts/exercise-catalog-v1.schema.json)
is normative for payload shape. The compatibility registry at
[`docs/contracts/exercise-catalog-v1-compatibility.json`](contracts/exercise-catalog-v1-compatibility.json)
is normative for the 32 identifiers already shipped by the app.

No app, Worker, D1, or production deployment change is authorized by this
contract commit.

## 1. Goals and non-goals

Goals, in order:

1. Keep exercise identity stable across releases, locales, caches, logs, and AI.
2. Make catalog publication deterministic, bounded, reversible, and independently deployable.
3. Preserve all existing logs/programs and locally created exercises.
4. Let independently authored factual metadata be source-checked without implying human approval or importing proprietary copy.
5. Keep search useful while collecting the minimum possible telemetry.

Non-goals for v1:

- exercise descriptions, coaching instructions, medical advice, images, video, or generated bodies;
- personalization, recommendation ranking learned from users, unbounded fuzzy/semantic/LLM search, or health inference;
- subscriptions, entitlement checks, AI quota, workout-log sync, or user identity;
- replacing the existing `exercise` or `set_log` tables in this change;
- publishing a completed factual dataset or fabricating seed/test rows as if they were user data;
- deploying either the catalog service or the existing `overdrive-quicklog` service.

## 2. Deployment boundary (frozen)

Catalog delivery **MUST** use a dedicated Worker service and dedicated D1
database. The intended service boundary is `overdrive-catalog`; its Wrangler
configuration, migrations, secrets, and deploy command must be separate from
`worker/wrangler.toml` and `overdrive-quicklog`.

The catalog service:

- exposes only read-only catalog routes plus an independently protected publish path if one is added later;
- does not import or register routes in `worker/src/index.js`;
- does not bind Apple entitlement, Groq, subscription, quota, photo, or user secrets;
- does not read or write AI/subscription tables; and
- can be deployed or rolled back without promoting the AI/subscription Worker.

This separation is mandatory because the current quick-log Worker owns AI and
subscription authorization and cannot be safely promoted for an unrelated
catalog change without its five Apple entitlement secrets. Sharing its Worker
or D1 is rejected for v1, even if table names are prefixed. The logical schema
below remains portable if infrastructure is split again later.

## 3. Canonical payload

`GET /catalog/v1` returns one complete snapshot. This example shows shape only;
it is not a publishable exercise row and is not user data.

```json
{
  "schemaVersion": "1.0.0",
  "catalogVersion": "1.0.0",
  "effectiveAt": "2026-07-14T00:00:00Z",
  "defaultLocale": "en",
  "supportedLocales": ["en", "ko", "es", "zh-Hans"],
  "searchNormalization": "search-v1",
  "exercises": [
    {
      "id": "<stable_original_id>",
      "recordRevision": 1,
      "status": "active",
      "effectiveFrom": "2026-07-14T00:00:00Z",
      "effectiveTo": null,
      "replacementId": null,
      "displayOrder": 1,
      "localizations": {
        "en": {"displayName": "<original name>", "aliases": ["<gym alias>"]},
        "ko": {"displayName": "<original name>", "aliases": ["<gym alias>"]},
        "es": {"displayName": "<original name>", "aliases": ["<gym alias>"]},
        "zh-Hans": {"displayName": "<original name>", "aliases": ["<gym alias>"]}
      },
      "exerciseType": "strength",
      "isBodyweight": false,
      "equipment": {"required": ["barbell"], "optional": ["bench"]},
      "movementPattern": "horizontal_push",
      "difficulty": "beginner",
      "primaryBodyRegions": ["chest"],
      "secondaryBodyRegions": ["triceps", "shoulders"],
      "defaultPrescription": {
        "sets": 3,
        "trackingMode": "reps",
        "countingConvention": "total",
        "target": {"unit": "reps", "low": 8, "high": 12}
      },
      "provenance": {
        "classification": "original_editorial",
        "reviewStatus": "unreviewed",
        "reviewMethod": "none",
        "reviewedByRole": null,
        "reviewEvidence": null,
        "reviewedAt": null,
        "containsThirdPartyCopy": false,
        "sources": []
      }
    }
  ]
}
```

The placeholder object above must never be ingested. A publishable snapshot must
validate against the machine-readable schema and every invariant in section 10.

### 3.1 Identity and lifecycle

- `id` is an original ASCII lowercase snake-case identifier, at most 64 characters.
- An ID is immutable, globally unique, never reassigned, and never reused after retirement.
- The 32 shipped IDs are frozen exactly by the compatibility registry. Renaming is display-only.
- `recordRevision` starts at `1` when an ID first appears in a published release.
  It counts published semantic row revisions, not draft commits. Because no v1
  catalog was published before the pre-release corrections, every initial row
  remains revision `1`. After first publication, a semantic change to an existing
  ID must increment the prior published revision.
- `status` is `active`, `deprecated`, or `retired`. Public snapshots never contain draft rows.
- A deprecated row remains resolvable for history/search and may name an active `replacementId`.
- A retired row remains resolvable for historic logs but is excluded from browse and new selection.
- `effectiveFrom` is inclusive. `effectiveTo` is exclusive and null for a current row.
- Neither status changes nor replacements rewrite historic workout logs.

### 3.2 Locale, alias, taxonomy, and prescription vocabularies

Every public row supplies independently authored `displayName` and gym-language
`aliases` for `en`, `ko`, `es`, and `zh-Hans`, and exposes its actual review
status. Aliases are ordered from most to least common. The app's current `zh`
resource maps to contract locale `zh-Hans`.

The frozen body-region vocabulary matches the tappable hit map:
`chest`, `shoulders`, `back`, `biceps`, `triceps`, `core`, `glutes`, `quads`,
`hamstrings`, and `calves`. Primary and secondary lists are ordered, unique, and
disjoint. Strength rows require at least one primary region; cardio rows may use
an empty primary list when a region claim would be misleading.

The full frozen equipment, movement-pattern, difficulty, exercise-type,
tracking-mode, and target-unit enums are in the JSON Schema. For new exact rows,
`isBodyweight` records the baseline logging property and is orthogonal to
`exerciseType`; it does not mean that support equipment is impossible (for
example, a pull-up bar can still be required). On the frozen 32 IDs, however,
the field is a legacy bridge-compatibility value copied exactly from the shipped
seed because the current app used it to choose workout-entry and weight
semantics, including for cardio equipment such as cycling and rowing. It is not
a reliable factual bodyweight or equipment-availability filter. App browse,
recommendation, and equipment filtering must use the explicit taxonomy and
equipment fields instead of inferring facts from this legacy boolean.

Every entry in `equipment.required` is conjunctive: all listed items are needed
for that canonical exercise identity. `equipment.optional` contains only
supplemental items that can be added without changing the identity (for example,
a mat or external load). It must never encode mutually exclusive substitutes
such as outdoor route versus treadmill, dumbbell versus kettlebell, or free bar
versus guided-bar machine. Those are distinct implementations and need distinct
canonical rows.

Equipment values are either concrete inventory classes or explicit, filterable
capabilities. `leg_curl_station` means a fixed-resistance station that supports
loaded knee flexion, across seated or lying station variants;
`dual_fly_machine` means a reversible fly station with a rear-delt path;
`rear_foot_support` resolves to a stable bench, box, or platform;
`upper_back_support` resolves to a stable bench, box, or padded station; and
`external_resistance` resolves to at least one available mass/load source whose
entered value can be represented truthfully in the app's kg/lb field, such as a
barbell, dumbbell, weight plate, or a reviewed machine load setting with a known
mass conversion. It explicitly excludes resistance bands, assistance amounts,
band colors/levels, and any tension estimate that cannot be entered honestly as
kg/lb. A detailed equipment filter must resolve every required capability
through a reviewed local inventory mapping and exclude the row when it cannot
prove both availability and kg/lb representability. Capability tokens are
requirements, not permission to treat mutually exclusive products as optional
substitutes.

`external_resistance` is the sole frozen-umbrella exception to the general ban
on substitute equipment: it is an explicit required capability satisfied by any
one reviewed, kg/lb-representable mass source in its mapping, not an `optional`
list and not a claim that all load sources are required. It may appear only on
the frozen compatibility rows that need to preserve the app's existing loaded-log
semantics. New rows must name concrete implementation equipment instead.

The v1 bodyweight logger cannot persist optional external mass independently
from the baseline movement. Therefore a new `isBodyweight: true` row must not
advertise an optional barbell, dumbbell, kettlebell, hex bar, angled bar, weight
plate, or `external_resistance` capability. A loaded implementation needs a new
exact ID until the logger has an explicit added-load model. Non-load supplements
such as a mat remain valid optional equipment.

The frozen 32 IDs are compatibility umbrellas where the shipped seed did not
encode an exact implementation. Their seed-level generic display identity is
preserved while metadata supplies the narrowest honest execution boundary:
`leg_curl` requires a `leg_curl_station`; `bulgarian_split_squat` requires
rear-foot support plus external resistance; `standing_calf_raise` requires
external resistance; and `hip_thrust` requires upper-back support plus external
resistance. Those loaded capability boundaries preserve the frozen seed's
`isBodyweight: false` logging behavior without choosing barbell versus dumbbell
versus another load source. `zone2_run`, `hiit_intervals`, and `incline_walk` retain
equipment-free/bodyweight-compatible defaults instead of pretending that one
route, machine, or interval modality defines the umbrella. A concrete alternate
implementation needs a new non-frozen ID; it must not silently narrow a frozen
display name. This exception is limited to the frozen compatibility set and does
not relax exact-implementation taxonomy for new rows.

Primary regions are the intended targets or prime movers. Secondary regions are
limited to direct, meaningful training targets, not incidental stabilization or
mere load transfer, and are capped at three. When uncertain, omit a secondary
tag rather than overstate it.

`defaultPrescription` is a neutral logging default, not a medical or personalized
recommendation. A target is required for `reps` and `intervals`, may be null for
open-ended cardio, and must have `low <= high` with a unit compatible with the
tracking mode.

`countingConvention` is mandatory. `total` means the target applies to the whole
set. `per_side` means the target applies separately to each side and the
set is complete only after both sides are recorded. `not_applicable` is reserved
for non-repetition modalities such as open-ended cardio. The catalog must not
publish a new strength duration/distance prescription until the app's strength
log can persist that measure honestly; the frozen legacy `plank` row remains the
only v1 exception.

The frozen generic dumbbell- and hammer-curl IDs use `total`. Their shipped
identity and historic logs do not establish whether a user performed simultaneous,
alternating, or one-arm repetitions, so v1 must not retroactively reinterpret
those counts as per-side. Seated trunk rotation uses `per_side`, so a set is not
complete after repetitions on only one side. Once an ID has been published,
`countingConvention` is immutable: historic
`set_log` rows do not store catalog revision, so changing it would reinterpret
old repetitions. A different counting convention requires a new canonical ID,
the old row's normal deprecation/replacement path, and no history rewrite.

## 4. Deterministic ordering and search

### 4.1 `search-v1` normalization

App, Worker projection, ingestion validation, and tests must implement the same
algorithm:

1. trim leading/trailing whitespace;
2. Unicode normalize with NFKC;
3. lowercase with locale-independent/default Unicode case behavior;
4. retain only Unicode letters (`\p{L}`) and decimal numbers (`\p{Nd}`);
5. preserve diacritics and do not stem, transliterate, or ask an LLM.

Conformance vectors:

| Input | Output |
| --- | --- |
| ` Bench-Press ` | `benchpress` |
| `ＢＥＮＣＨ　１００` | `bench100` |
| `벤치 프레스` | `벤치프레스` |
| `Zone 2` | `zone2` |

Each locale indexes its display name, ordered aliases, stable ID, ID split on
underscores, and body-region tokens. Exact match ranks before prefix, which ranks
before substring, which ranks before bounded typo tolerance.

Typo tolerance is deterministic Unicode-code-point Levenshtein distance
(insert/delete/substitute cost `1`; transposition is two edits). It compares the
complete normalized query to complete normalized display-name, alias, and ID
terms only. Queries shorter than four code points get no typo matching; lengths
4–6 allow distance `1`; lengths 7 or more allow distance `2`. Evaluation stops
once the threshold is exceeded. Typo matches rank by distance, then the normal
field/tie ordering, and never displace exact/prefix/substring matches.

Required typo conformance cases include: `benc` → `bench` (distance 1, allowed),
`benhc` → `bench` (distance 2 at length 5, rejected), `benchprzs` → `benchpress`
(distance 2 at length 9, allowed), and `rnu` → `run` (short query, rejected).

For a non-empty query, ties resolve by: match class, matched field priority
(display name, alias order, ID, region), current-program order, recent-use order,
`displayOrder`, normalized localized display name by Unicode code-point order,
then stable ID. For an empty region view: current program, recent use,
`displayOrder`, then stable ID. Current program and recent use are device-local
signals; they never change the snapshot's canonical order.

The `exercises` array is sorted by unique ascending `displayOrder`, then `id`.
Workers and clients must not rely on object-key serialization order.

## 5. HTTP contract

### 5.1 `GET /catalog/v1`

- No authentication, cookie, user context, request body, or telemetry side effect.
- `200` response: JSON snapshot with `Content-Type: application/json; charset=utf-8`.
- `ETag`: strong tag `"catalog-v1-<catalogVersion>-<first16ChecksumHex>"`.
- `X-Catalog-Version`: exact `catalogVersion`.
- `X-Catalog-Checksum`: `sha256:` plus lowercase SHA-256 of the exact response-body bytes.
- `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.
- Matching `If-None-Match` returns `304` with no body and the same version/cache headers.
- A release contains 32 to 512 exercises and at most 524,288 uncompressed UTF-8 bytes.
- v1 is an atomic, unpaginated snapshot. Crossing either bound requires a new reviewed contract, not silent truncation.
- Errors use `Cache-Control: no-store`; an unavailable new release must not replace the last valid one.

The publisher serializes the complete snapshot once as compact UTF-8 JSON: no
BOM or insignificant whitespace, top-level and exercise keys in schema order,
and arrays in their normative order. It stores those exact bytes as
`payload_json`; the Worker returns them unchanged. Checksum verification hashes
the raw response bytes before parsing and compares them with
`X-Catalog-Checksum`. A bundled snapshot has a build-time sidecar checksum; a
cached snapshot stores the raw bytes and checksum together. No client
re-serialization and no JSON-canonicalization dependency is required.

`catalogVersion` follows SemVer; any payload-byte change requires a new version
and checksum, and published versions are immutable.

The existing AI request projection remains independently bounded: at most 64
candidate exercises, at most four names per exercise, and at most 60 characters
per name. Projection is deterministic from the normalized search result; the
catalog endpoint must never be forwarded wholesale to the AI Worker.
The initial curated `1.0.0` artifact contains exactly 64 rows, but 64 is not a
snapshot-contract maximum; a larger valid snapshot is projected down to at most
64 AI candidates by the client/AI boundary.

## 6. Dedicated D1 schema proposal

The dedicated catalog D1 stores immutable snapshot rows so publication and
rollback are atomic. Timestamps are Unix milliseconds; JSON serialization emits
RFC 3339 UTC strings.

```sql
CREATE TABLE catalog_release (
  version TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  effective_at_ms INTEGER NOT NULL,
  checksum_hex TEXT NOT NULL UNIQUE,
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 32 AND 512),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes BETWEEN 1 AND 524288),
  payload_json BLOB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'published', 'withdrawn')),
  created_at_ms INTEGER NOT NULL,
  published_at_ms INTEGER
);

CREATE TABLE catalog_channel (
  channel TEXT PRIMARY KEY CHECK (channel = 'v1'),
  version TEXT NOT NULL REFERENCES catalog_release(version)
);

CREATE TABLE catalog_exercise (
  version TEXT NOT NULL REFERENCES catalog_release(version),
  id TEXT NOT NULL,
  record_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'deprecated', 'retired')),
  effective_from_ms INTEGER NOT NULL,
  effective_to_ms INTEGER,
  replacement_id TEXT,
  display_order INTEGER NOT NULL,
  exercise_type TEXT NOT NULL CHECK (exercise_type IN ('strength', 'cardio')),
  is_bodyweight INTEGER NOT NULL CHECK (is_bodyweight IN (0, 1)),
  movement_pattern TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  default_sets INTEGER NOT NULL,
  tracking_mode TEXT NOT NULL,
  counting_convention TEXT NOT NULL
    CHECK (counting_convention IN ('total', 'per_side', 'not_applicable')),
  target_unit TEXT,
  target_low REAL,
  target_high REAL,
  provenance_classification TEXT NOT NULL
    CHECK (provenance_classification IN ('original_editorial', 'public_facts', 'licensed')),
  review_status TEXT NOT NULL CHECK (review_status IN ('unreviewed', 'source_checked', 'human_reviewed')),
  review_method TEXT NOT NULL CHECK (review_method IN ('none', 'source_comparison', 'human_editorial_review')),
  reviewed_by_role TEXT,
  review_evidence TEXT,
  reviewed_at_ms INTEGER,
  contains_third_party_copy INTEGER NOT NULL CHECK (contains_third_party_copy = 0),
  CHECK (
    (review_status = 'unreviewed' AND review_method = 'none' AND
      reviewed_by_role IS NULL AND review_evidence IS NULL AND reviewed_at_ms IS NULL) OR
    (review_status = 'source_checked' AND review_method = 'source_comparison') OR
    (review_status = 'human_reviewed' AND review_method = 'human_editorial_review')
  ),
  CHECK (
    review_status = 'unreviewed' OR
    (reviewed_by_role IS NOT NULL AND review_evidence IS NOT NULL AND reviewed_at_ms IS NOT NULL)
  ),
  CHECK (provenance_classification <> 'licensed' OR review_status = 'human_reviewed'),
  PRIMARY KEY (version, id),
  UNIQUE (version, display_order)
);

CREATE TABLE catalog_localization (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  display_name TEXT NOT NULL,
  normalized_display_name TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, locale),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_alias (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  alias_order INTEGER NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, locale, alias_order),
  UNIQUE (version, exercise_id, locale, normalized_alias),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_equipment (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('required', 'optional')),
  equipment_order INTEGER NOT NULL,
  equipment_id TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, role, equipment_order),
  UNIQUE (version, exercise_id, role, equipment_id),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_region (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  region_order INTEGER NOT NULL,
  region_id TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, role, region_order),
  UNIQUE (version, exercise_id, role, region_id),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_source (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  source_order INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT,
  license TEXT,
  accessed_at_ms INTEGER,
  PRIMARY KEY (version, exercise_id, source_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE INDEX catalog_search_name
  ON catalog_localization(version, locale, normalized_display_name);
CREATE INDEX catalog_search_alias
  ON catalog_alias(version, locale, normalized_alias);
CREATE INDEX catalog_browse
  ON catalog_exercise(version, status, display_order);
```

Publication runs in one transaction: validate the complete draft, mark it
published, then update `catalog_channel('v1')`. Rows behind a published version
are immutable. Rollback changes only the channel pointer to the previous valid
version; it never mutates or deletes historic rows.

## 7. App snapshot, SQLite cache, and offline fallback

A future app implementation bundles a complete, validated
`assets/catalog/exercise-catalog-v1.json` and keeps a normalized SQLite catalog
cache separate from the current `exercise` table.

Fetch/activation sequence:

1. Read the active ETag and request `GET /catalog/v1` with `If-None-Match`.
2. On `304`, keep the current cache. On `200`, write into inactive cache tables.
3. Validate JSON Schema, checksum, all section 10 invariants, and payload bounds.
4. In one SQLite transaction, mark the new snapshot active and retain the previous valid snapshot.
5. On any network/parse/validation/activation failure, leave the active snapshot untouched.

Read fallback order is: newest valid active cache, retained previous valid cache
(including after channel-pointer rollback), bundled snapshot, then the existing
seeded `exercise` rows. A bad remote response can therefore reduce freshness but
cannot empty search or block logging.

The existing `exercise` table remains the foreign-key bridge for programs and
`set_log`. A separate cache mapping stores `catalog_id -> exercise.id`:

- the frozen 32 map to the identical existing ID;
- future canonical IDs use an opaque catalog bridge row and never overwrite a local row;
- historic mappings are retained while any program/log references them; and
- status/replacement changes never rewrite old `set_log.exercise_id` values.

Canonical search results and ad-hoc `exercise` rows are merged at read time.
Existing slug-derived ad-hoc IDs remain untouched. New app-created IDs should use
`local_<uuid>` and are never uploaded as catalog entries. If a future canonical
ID collides with a legacy local ID, the bridge gets a distinct opaque local key;
the app must not overwrite, auto-merge, or silently relabel the local exercise.

## 8. Provenance and original-IP policy

v1 stores factual taxonomy and independently written names/aliases only. It does
not copy third-party descriptions, instructions, programming text, images, or
videos. A citation is evidence for a classification; it is not permission to
copy expressive content.

Every exercise has an explicit `classification` and an honest review status.
An `unreviewed` row has exactly zero row-level source records. Only a row that
was actually compared against exercise-specific sources has one or more ordered
source records and evidence:

- `original_editorial`: internally authored factual classification/name/alias;
- `public_facts`: classifications checked against public scientific or official guidance; or
- `licensed`: imported factual fields with the exact per-row license recorded.

- `unreviewed` + `none` means no exercise-specific comparison or human editorial
  review has occurred. Reviewer, evidence, timestamp, and sources are all null or
  empty. This is the required state for the initial independently authored
  snapshot.
- `source_checked` + `source_comparison` means a named process/agent role compared
  neutral factual fields against the recorded sources. It does **not** mean a
  person reviewed, approved, or endorsed the row.
- `human_reviewed` + `human_editorial_review` requires an actual human editorial
  role and a `reviewEvidence` reference to the approval artifact.

Neutral names, aliases, taxonomy, equipment, and logging defaults may publish as
`unreviewed` when that status is exposed honestly, or as `source_checked` only
after an exercise-specific comparison. Every public row sets
`containsThirdPartyCopy: false`. Reviewed rows record `reviewedByRole`,
`reviewEvidence`, and `reviewedAt`; unreviewed rows keep those fields null.
Licensed rows require
`human_reviewed`, a non-null commercially compatible license, documented
field-level scope, and human approval evidence. Unknown, non-commercial,
share-alike-incompatible, or mixed per-entry licensing fails publication.

Instructional, medical, diagnostic, or higher-risk content remains outside v1.
Any future contract that adds it must require `human_reviewed`; source checking
alone is insufficient.

Specifically, v1 must not import OpenStax Anatomy & Physiology 2e content because
its CC BY-NC-SA terms are not a safe commercial-product default. It also must not
bulk-import wger rows: exercise records can have per-entry licenses and each row
would need individual compatibility review. ACSM resistance-training guidance,
the AHA 2023 scientific statement, and the HHS Physical Activity Guidelines may
be recorded only in the separate program-and-safety reference-context artifact
unless a row-specific comparison is performed. They are not per-exercise
citations, do not make a row `source_checked`, and their prose/figures are not
copied.

Names and gym colloquialisms must be written independently and carry their actual
`unreviewed`, `source_checked`, or `human_reviewed` status in each locale. Translating
proprietary wording does not make it original.

Non-frozen canonical IDs, display names, and aliases fail closed on the enforced
eponym/protected-name denylist, including `Arnold`, `CrossFit`, and `Tabata` after
search normalization. The exact English alias `Trap-Bar Deadlift` is the sole
`trapbar` token exception and is retained only as a familiar search bridge on
neutral canonical ID `hex_bar_deadlift` with equipment `hex_bar`; the row remains
explicitly `unreviewed`, and the exception is not review evidence or approval.
No ID, equipment value, display name, other locale, or other alias may contain a
`trapbar` token. The assisted pull-up aliases likewise preserve the overhand
pull-up grip and do not merge the distinct chin-up identity.

## 9. Privacy-minimal search telemetry

Telemetry is optional and off the catalog GET path. If enabled, only these
events/fields are allowed:

| Event | Allowed fields |
| --- | --- |
| `catalog_search_zero_result` | `catalogVersion`, `surface`, `locale`, `latencyBucket` |
| `catalog_search_selected` | the selected canonical `exerciseId`, `catalogVersion`, `surface`, `locale`, `latencyBucket` |

Allowed latency buckets are `lt50`, `50_149`, `150_499`, `500_1999`, and
`gte2000` milliseconds. Local/ad-hoc exercise selections emit no event. Prefer
on-device counters or daily aggregate ingestion; do not retain a raw event
stream when aggregates meet the product question.

Forbidden fields include the raw or normalized query, zero-result text, user,
device, advertising or session identifiers, IP-derived location, local exercise
ID/name, weights, reps, sets, photos, audio, body/health text, program contents,
workout history, and AI prompt/response. Search telemetry is never joined to
subscription, health, workout, photo, or AI tables.

## 10. Ingestion and release invariants

A release is rejected unless all checks pass:

1. JSON Schema validation and exact `schemaVersion: 1.0.0` pass.
2. `catalogVersion` is a new SemVer v1 version; a published version is immutable.
3. Stored compact payload bytes, checksum, ETag derivation, item count, and uncompressed byte count match.
4. All 32 compatibility IDs exist exactly once; no ID was renamed, reused, or removed.
5. IDs match the frozen pattern; display order is unique; the array has canonical order.
6. Revisions count published semantic row changes: initial unpublished and newly introduced IDs start at `1`; an unchanged published row keeps its revision; every post-publication semantic change increments exactly the prior revision plus one, with no stale value or jump; `effectiveFrom` is immutable.
7. Required locales exist; names/aliases meet length limits and normalize non-empty.
8. Names and aliases are unique within an exercise/locale after `search-v1` normalization.
9. Cross-exercise normalized-name collisions have an explicit ambiguity review; none is silently discarded.
10. Primary/secondary regions are unique and disjoint; strength rows have a primary region.
11. Equipment, movement, difficulty, type, tracking, target, and region values use frozen enums.
12. Prescription ranges are finite/non-negative, `low <= high`, and mode/unit compatible.
13. Replacement IDs exist, are not retired, do not self-reference, and form no cycle.
14. Every row has an honest status/method/role/evidence record; unreviewed rows have exactly zero row sources or review identity, reviewed rows have at least one ordered source, and source-checking never claims human approval.
15. Licensed imports have a compatible explicit license and `human_reviewed` evidence.
16. No description/media/proprietary copy or fabricated user/seed/test record is represented as factual production data.
17. The deterministic AI candidate projection stays within 64 rows, four names per row, and 60 characters per name.
18. Normalization and bounded-typo conformance vectors agree in ingestion, Worker, app, and tests.
19. Required equipment is conjunctive; optional equipment is supplemental and never a substitute implementation. Only frozen rows may use the explicit `external_resistance` any-of capability through a reviewed kg/lb-representable inventory mapping; band/assistance levels never satisfy it. New bodyweight rows do not advertise optional mass until the logger can persist added load honestly.
20. Counting convention is explicit; per-side targets are identified consistently, and the frozen generic curl IDs remain `total`. A published ID cannot change exercise type, the legacy bodyweight bridge, tracking mode, counting convention, or target unit; identity changes require a new replacement ID. Unsupported strength duration/distance rows are rejected.
21. Secondary regions follow the direct-training rubric and never exceed three.
22. All timestamps use exact UTC-second syntax `YYYY-MM-DDTHH:mm:ssZ` with no offset or fractional seconds and represent real calendar instants without date normalization.
23. Published IDs are never removed; lifecycle transitions only move `active` to `deprecated` to `retired`, retired IDs never reactivate, and new IDs become effective after the prior release and no later than the release that introduces them.

Release tooling must fail closed and print stable ID plus field path for every
error. Validation occurs before any channel-pointer update.

## 11. Alternatives, failure modes, and reversal

### Alternatives considered

1. **Do nothing; keep the 32 client seeds.** Lowest deployment cost, but cannot provide traceable updates, shared aliases, version visibility, or deterministic cache refresh.
2. **Add `/catalog/v1` to `overdrive-quicklog` and reuse its D1.** Fewer resources, but an unrelated catalog release could promote AI/subscription code, needs five Apple entitlement secrets, and expands the live incident blast radius. Rejected.
3. **Bundle/static-file only.** Safest immediate fallback and remains the offline baseline, but factual corrections require an app release and there is no atomic D1 publication trail.
4. **Dedicated catalog Worker plus dedicated D1.** Chosen: clean deploy/secret boundary, atomic versioning, independent rollback, and reversible client adoption.

### Pre-mortem

- **Bad taxonomy ships.** Signal: collision/region check failures or support reports. Mitigation: fail-closed ingestion, explicit evidence status, immutable releases, pointer rollback.
- **Remote catalog breaks logging/search.** Signal: checksum failures, empty-result spike, cache activation errors. Mitigation: inactive validation, previous-cache retention, bundled/seed fallback.
- **Catalog work disrupts subscriptions/AI.** Signal: quick-log deployment, secret request, or shared-table migration in a catalog change. Mitigation: dedicated Worker+D1 and CI rejection of cross-service paths.
- **Local exercises are overwritten.** Signal: bridge collision or changed historic labels. Mitigation: identity mapping for only the frozen 32, opaque bridge rows for new canonicals, no automatic merge.
- **Licensing contaminates the dataset.** Signal: missing per-row license or copied prose/media. Mitigation: metadata-only scope, source/license invariant, reject unknown/non-commercial/mixed-license imports.

Success for v1 means: the same valid fixture produces byte-identical checksum,
ordering, and normalized search keys in ingestion/Worker/app tests; all 32 shipped
IDs resolve; offline fallback remains usable after simulated network and invalid
payload failures; and catalog deployment touches neither quick-log service nor
its secrets/database.

Reversal is channel-pointer rollback plus client fallback. Withdraw the bad
release, point `v1` at the previous immutable version, and keep IDs/log mappings.
Use a patch/minor v1 version for corrected data. Any incompatible payload or
normalization change requires `/catalog/v2`; never redefine v1 in place.

### Flip criteria

- Stay bundled-only until the dedicated Worker and D1 pass isolation and fallback tests.
- Pause remote activation if validation failure exceeds 0.1% or fallback cannot be demonstrated on a clean install.
- Reconsider fuzzy/semantic search only after privacy-safe aggregate zero-result evidence shows deterministic alias search is insufficient.
- Add richer instructional content only under a separate IP/licensing contract and review pipeline.
