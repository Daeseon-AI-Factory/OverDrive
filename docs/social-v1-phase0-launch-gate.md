# Reploom Social v1 / Phase 0 출시 게이트 결정 기록

Status: **DOCUMENTATION INPUT INTEGRATED — implementation remains gated**

Decision owner: **user documentation approval recorded; implementation requires
separate phase and packet approval**

Prepared: `2026-07-15`

Preparation baseline ref: `codex/social-v1-phase0-gate`

Preparation baseline commit: `6480f2dd9e857ebc62268c0a81dc61be0c97c465`

Current contract authority at integration:
`docs/social-v1-contract.md` version `1.1.0`, contract commit
`5e11d4e286d0ba1f6a036e9f2feb1ec35d11c0a5`

This document began as an approval packet and is retained as the decision input
for the `1.1.0` contract amendment. It changes no feature code, dependency,
migration, deployment, binary, store submission, or live capability. The
adjudication below records what the amendment adopted, modified, or left
unresolved. `docs/social-v1-contract.md` remains normative if wording conflicts.

## 0. Integration adjudication

The user approved proceeding with the documentation amendment and later directed
that the unmerged documentation be integrated. That approval covers the
documentation unit only. It is not phase authority and does not approve feature
code, dependencies, migrations, deployment, TestFlight, payment work, or App
Store review changes.

| Proposal area | Integration disposition |
| --- | --- |
| Vendor-neutral authentication and complete separation of Social identity, local dataset identity, and subscription actor keys | **Adopted as a contract boundary.** Exact issuer, audience, provider, and transport topology remain blocking inputs. |
| Explicit local-dataset claim, no heuristic merge, and exactly one selected competitive dataset | **Adopted in contract `1.1.0`.** Other claimed datasets remain dormant for v1 competition. |
| Session/program revision, tombstone, rebaseline, checkpoint, and metric-conformance direction | **Direction retained; transport DTOs, bounds, retention, and conformance fixtures remain `TBD`.** |
| Independent real-person competition kill boundary | **Adopted with modification.** The canonical key is `socialCompetition`, not this proposal's narrower `duels` name. |
| Independent NestJS/PostgreSQL/TypeORM package | **Not yet a scaffold approval.** Package topology, exact dependencies/versions, PostgreSQL major, scripts, and lockfile remain for `FOUNDATION-DECISION-01B`. |
| Proposed retention periods, deletion SLOs, moderation bounds, and staffing SLOs | **Not binding.** They remain proposals until legal, privacy, safety, and operating owners approve a classified contract amendment. |
| Canonical phase order and release identity | **Unchanged.** Documentation readiness does not prove Phase 1 acceptance, Phase 2 entry, Phase 4 entry, or settle Reploom versus OVERDRIVE release identity. |

Until the applicable canonical phase and release gates are evidenced, every
public Social capability remains false or absent.

## 1. Judgment

**Current verdict: NO-GO for public Social v1 and real-person Duel.**

At the preparation baseline the repository had a strong Social v1 domain
contract, but it did not have a Social server, configured authentication,
local-to-account binding, conflict-safe workout sync, finite Social retention,
staffed moderation operations, or an independent real-person competition kill
switch. That four-capability baseline also opened Duel through `socialCore` while
separately requiring workout sync before a Duel result. Contract `1.1.0` repaired
the capability split but did not create the missing implementation or operating
evidence.

The recommended Phase 0 outcome is therefore a **readiness contract**, not a
feature release:

1. keep the local SQLite user and local logging independent from Social identity;
2. use a vendor-neutral authentication adapter that produces one typed verified
   principal;
3. attach an explicitly consented local dataset to at most one Social account and
   designate only one competitive dataset per account;
4. sync only the minimum completed-workout facts and seven-bit program schedule
   needed for the frozen metric, with gap-free server-time checkpoints;
5. create an independent strict-TypeScript NestJS/PostgreSQL package;
6. use additive migrations and capability-first rollback;
7. approve finite retention, deletion SLOs, and named moderation operations; and
8. amend the contract with an independent real-person competition capability and
   default-off account preference before enabling real-person Duel. The proposal
   called that capability `duels`; the canonical amendment chose
   `socialCompetition`.

## 2. Scope and naming boundary

### 2.1 Source versus intent

- **Source:** `docs/social-v1-contract.md` is canonical and authorizes
  documentation only (`:3-20`). Its unresolved values block the affected launch
  path rather than delegating a guess to an implementer (`:11-15`, `:834-864`).
- **Intent:** this document preserves the proposal, its evidence, and its
  integration disposition. It does not amend the canonical contract by itself;
  section 0 and `docs/social-v1-contract.md` record the later adjudication.
- **Unknown:** production issuer/audience literals, the chosen identity provider,
  exact server dependency/PostgreSQL versions and infrastructure target,
  moderation staffing, approved release identity, live store state, and legal
  sufficiency of the proposed retention periods are not present in the
  repository.

### 2.2 “Phase 0” naming conflict

The canonical product roadmap already calls its PWA aura-card hook test “Phase
0,” places backend/account/sync in Phase 2, and places Social/Duel in Phase 4
(`docs/overdrive-spec.md:193-200`). This proposal therefore uses the qualified
name **“Social v1 / Phase 0 (readiness)”**. It does not renumber the product
roadmap.

### 2.3 Canonical authority, brand, and phase-order conflict

The repository constitution says the canonical product is **OVERDRIVE**, is
currently in local-only Phase 1, and must be built in phase order
(`CLAUDE.md:1-7,79-94`). The canonical roadmap places account/sync in Phase 2 and
Social/Duel in Phase 4 (`docs/overdrive-spec.md:193-200`). In contrast, the
installed app identity and this Social contract use **Reploom** (`app.json:3-6`,
`docs/social-v1-contract.md:1-10`). This proposal follows the Social contract's
name only to identify the document under review. It does **not** decide that the
canonical product was renamed or authorize a public Reploom/OVERDRIVE identity.

Documentation readiness may be reviewed now. Scaffold, dependency, local sync,
or Social implementation may start only after one of these separately evidenced
paths is approved:

1. Phase 1 acceptance is recorded, Phase 2 account/sync is accepted, and the
   Phase 4 entry gate is reached in the canonical order; or
2. the canonical roadmap is explicitly amended, with the reason and replacement
   acceptance order recorded under the repository's change process.

Approval of this packet is neither path. Before any policy, store, binary, or
public release change, the release owner must also resolve the canonical brand
and product identity in the spec, app metadata, policies, and store sources as
one reviewed unit.

## 3. Verified repository evidence

| Evidence | Consequence |
| --- | --- |
| Local identity is `LOCAL_USER_ID = 'local'`; `UserRow` has no auth or Social binding (`src/db/types.ts:5,16-24`). | A Social UUID cannot replace the local FK without a separate migration and account-switching contract. |
| Session, set, and cardio rows have unique `client_uuid` values (`src/db/schema.ts:33-75`). | There is a usable idempotency seed, but it is not a complete sync protocol. |
| Set edits have no revision/`updated_at`; set and cardio deletes are hard deletes (`src/db/repos/setLogRepo.ts:254-329`, `src/db/repos/cardioRepo.ts:40-48`). | Offline edits and deletes cannot be reliably replayed from current rows alone. |
| Weekly program state is current JSON in local settings and has no historical snapshot (`src/features/program/types.ts:1-33`, `src/lib/settings.ts:73-95`). | Duel start cannot freeze planned training units from a server-authoritative history yet. |
| The existing PR function uses Epley for weighted sets, reps for bodyweight, and does not count a first-ever set as a PR (`src/features/logging/detectPr.ts:1-38`). | A Social metric implementation needs a separately versioned server conformance contract; client `is_pr`/`score` is insufficient. |
| HealthKit records currently stay on device (`docs/compliance/privacy-policy.md:36-49`). | Social workout sync must not silently upload HealthKit records or the cached health snapshot. |
| `server/` is planned but absent; Social must not be added to the JavaScript subscription Worker (`docs/social-v1-contract.md:645-673`). | The correct implementation boundary is a new package and service. |
| The canonical spec asks the builder to confirm the backend choice (`docs/overdrive-spec.md:215-226`), while the repository constitution fixes strict TypeScript, NestJS, and PostgreSQL (`CLAUDE.md:79-98`). | This approval must explicitly adopt the constitution/contract path for Social; the conflict must not be resolved silently by an implementer. |
| Root TypeScript includes every `**/*.ts(x)` and excludes only `worker` (`tsconfig.json:14-24`). | A future `server/` needs its own strict configs and a root exclusion to avoid Expo/server type collisions. |
| The current public policy says there is no account and the store source says chat/UGC are false (`docs/compliance/privacy-policy.md:11-18`, `store.config.json:36-38`). | Public Social cannot precede policy and store-declaration changes and readback. |
| Social retention and deletion SLOs are `TBD` and block all public Social (`docs/social-v1-contract.md:430-444,819-864`). | Existing AI or billing retention cannot be copied into Social as evidence. |
| At preparation commit `6480f2d`, the capability set had four keys and `socialCore` included Duel, while Duel results required workout sync. | Contract `1.1.0` resolved the split with `socialCompetition`; this proposal's narrower `duels` key was not adopted. |
| The product spec requires competition opt-out (`docs/overdrive-spec.md:157-179`), but the Social entity model has no account-level Duel preference (`docs/social-v1-contract.md:201-215`). | Per-Duel accept alone does not satisfy the broader competition opt-out boundary. |
| `updateSettings` writes only the current settings JSON and `updated_at` (`src/db/repos/userRepo.ts:15-24`); the weekly program is current-only JSON (`src/features/program/types.ts:1-33`). | Program edits need their own revision/outbox transaction and minimal server snapshot before a Duel can freeze a plan. |
| The canonical spec/constitution name the product OVERDRIVE while `app.json` and the Social contract name Reploom (`CLAUDE.md:1-7`, `docs/overdrive-spec.md:1-5`, `app.json:3-6`, `docs/social-v1-contract.md:1-10`). | A Social document cannot silently settle release identity or bypass canonical phase order. |

## 4. Authentication issuer, audience, and claims

### 4.1 Alternatives

| Alternative | Benefit | Failure mode | Decision |
| --- | --- | --- | --- |
| Validate the configured external access token in a global Nest auth guard and pass a typed principal in-process. | One verification boundary, no second token/key lifecycle, easiest clean-install scaffold. | Every public controller must be impossible to register without the guard. | **Recommended for the initial single-process server.** |
| Validate at a separate edge gateway and mint a short-lived, asymmetrically signed internal assertion for the Social service. | Strong network/service separation when a real gateway topology exists. | Adds signing-key rotation, internal issuer/audience, replay, mTLS, and outage surface before the repository has that topology. | Required only if the gateway and Social API become separate processes. |
| Trust ordinary headers, bind to a provider SDK inside the domain, or reuse StoreKit/`actor_key`. | Superficially fewer components. | Header spoofing, provider coupling, or payment/person identity conflation. | **Rejected.** |

### 4.2 Recommended external-token contract

The provider is replaceable. The domain depends only on an `AuthVerifier` port and
an immutable result. Production startup fails closed when any required
environment value is absent or still a placeholder.

The initial configured transport mode is `in_process`: a global guard verifies
the credential and passes the typed value directly to the domain. Every
`/social/v1` route is covered by that global guard with no public opt-out
decorator. `signed_internal_jwt` is the only permitted later cross-process mode;
an unsigned trusted-header mode does not exist.

Required non-secret per-environment configuration:

- exact issuer allow-list;
- exactly one Social API audience for each accepted issuer;
- issuer-to-JWKS URI mapping obtained from trusted configuration/discovery, never
  from an unverified token claim;
- asymmetric algorithm allow-list; and
- accepted access-token profile/JOSE `typ` rule, maximum credential lifetime,
  key-cache, and clock-skew policy.

The literal production issuer and audience are **not in the repository**. They
remain a blocking deployment input, not a value this proposal fabricates.

| Token field | Rule |
| --- | --- |
| `iss` | Required; byte-for-byte match to one configured issuer. No case folding, wildcard, or implicit trailing-slash normalization. |
| `aud` | Required; the token must be issued only for the configured Social API audience. A token for the subscription Worker or another API is rejected. |
| `sub` | Required, non-empty, exact, case-sensitive inside the issuer namespace. It is never displayed or client-editable. |
| `exp` | Required and enforced. Expired credentials fail with the stable Social auth error. |
| `nbf` | Enforced when present. |
| `iat` | May bound token age, but never proves recent reauthentication by itself. |
| `auth_time` or provider reauth receipt | Required only for recent-auth operations and accepted only after provider verification. |
| `email`, `phone_number`, `name`, provider role/group claims | Ignored for binding, merge, and Social domain authorization. |

The guard returns only:

```ts
type VerifiedAuthContext = Readonly<{
  authIssuer: string;
  authSubject: string;
  matchedAudience: string;
  credentialExpiresAt: string;
  authenticatedAt: string | null;
  requestId: string;
}>;
```

The raw token and unverified claims never enter the domain service. Request body,
query, `X-User-Id`, `X-Auth-Subject`, email, device ID, purchase, entitlement
token, `LOCAL_USER_ID`, and `client_uuid` can never nominate the actor.

For account deletion or binding changes, the proposed recent-auth window is
**MAX 5 minutes from a verified reauthentication event**. This is a proposed
security/product value, not a verified legal requirement. If the chosen provider
cannot produce trustworthy recent-auth evidence, those operations remain closed.

If a separate gateway is later introduced, the same typed fields travel in a
short-lived signed internal assertion with its own exact internal `iss`, exact
Social-service `aud`, `exp`, `nbf`, and `jti`. The service re-verifies that
assertion and rejects direct external-provider tokens and ordinary identity
headers. Network restriction is defense in depth, not the only guard.

“Provider replacement” is limited to changing verifier implementation while the
same exact issuer/subject namespace remains authoritative. Changing issuer or
subject semantics for existing accounts is account linking/migration, not an
adapter swap. V1 does not do it: the old issuer must remain accepted for existing
bindings, while a new issuer may provision only new accounts. Before retiring an
old issuer, a separate contract must require recent authentication of both old
and new bindings, atomically add/revoke `AuthBinding` rows, provide recovery for
an unavailable old provider, and prove rollback. Email/name/purchase matching and
silent subject copying remain forbidden.

The internal safety API outside `/social/v1` uses its own configured operator/
service issuer, audience, and verified role adapter. A normal Social user token,
crew role, email, or ordinary header cannot become a safety principal; negative
tests cover cross-audience and user-to-operator escalation.

### 4.3 Authentication gate evidence

- valid configured issuer/audience succeeds;
- wrong issuer, audience, signature, algorithm, key, expiry, missing subject, and
  not-before fail;
- subject case changes do not alias;
- subscription/StoreKit tokens fail;
- an ID token or other configured-wrong token class fails even when signed by an
  accepted issuer;
- ordinary identity headers fail with and without a valid bearer token;
- concurrent provisioning produces one active `(auth_issuer, auth_subject)`;
- recent-auth operations reject token `iat` without verified reauthentication;
- verifier replacement inside the same issuer/subject namespace passes the same
  adapter suite without domain/schema changes;
- issuer-namespace change cannot reach existing accounts without the separately
  approved dual-reauth binding-migration contract; and
- user tokens cannot reach the internal safety audience or roles.

## 5. Local-to-Social account binding

### 5.1 Alternatives

| Alternative | Failure mode | Decision |
| --- | --- | --- |
| Rewrite local `user.id` to `social_user_id`. | Rewrites every local FK and couples sign-out/Social deletion to offline logging. | Rejected. |
| Automatically upload the device history to the first signed-in account. | Shared-device and account-switching data misattribution; no meaningful consent. | Rejected. |
| Keep `user.id = 'local'`, create a random dataset identity, and require explicit claim/import consent. | Adds a binding state machine and conflict UX. | **Recommended.** |
| Merge every claimed device into one competitive stream using time/content similarity. | Can include multi-device workouts, but false merge/split changes a winner and no shared workout identity exists. | Rejected for Phase 0; requires a separate correlation/dedup contract. |
| Select one competitive dataset and keep other claims dormant. | Prevents double count deterministically but excludes workouts logged on other devices. | **Recommended only as an explicit single-competitive-device Phase 0 limitation.** |

### 5.2 Recommended state model

1. `user.id = 'local'` remains the permanent on-device FK. It is never replaced
   by, copied into, or hashed into `social_user_id`.
2. An installation creates an opaque random `local_dataset_id`. It is not derived
   from hardware, Apple/Google identity, purchase state, auth claims, or a local
   row ID.
3. `POST /social/v1/account` alone creates `SocialAccount`, private `Profile`,
   and `AuthBinding` in one idempotent transaction. It does not upload history.
4. A separate proposed account-scoped dataset-claim operation presents the
   target account, data categories, and local history count, then requires an
   explicit user confirmation.
5. One dataset can be claimed by at most one active Social account. A different
   account receives `409 social_local_dataset_conflict`; the server never merges
   or silently reassigns it.
6. One Social account may explicitly claim multiple datasets, such as two user
   devices. Each dataset keeps its own revision namespace; aggregation happens
   in a server projection, not by rewriting client row IDs.
7. Exactly one claimed dataset may be designated the account's
   `competitive_dataset_id`. Only that dataset may upload facts used by the
   Social metric or Duel; other claimed datasets remain dormant for workout
   transport in Phase 0. The server does not deduplicate workouts across datasets
   by timestamp, exercise, or payload similarity.
8. Changing the competitive dataset is forbidden while a Duel is pending or
   active. The old dataset must reach an acknowledged checkpoint, the new dataset
   must complete a full baseline/program sync, and metric readiness returns false
   until that rebaseline passes. This prevents the same workout recorded on two
   devices from being counted twice without inventing a lossy merge heuristic.
9. Sign-out leaves local rows intact and stops Social transport. A user may keep
   the local dataset local-only.
10. Social account deletion leaves local workout rows and subscription state
   unchanged, clears the remote binding, and records a local `do_not_resync`
   marker so re-registration cannot silently upload the old history.
11. Local handle/display name may be offered as an editable profile draft only.
   It does not identify or merge an account and still passes bounds, uniqueness,
   and moderation.

This is deliberately **not account-wide multi-device workout sync**. Before
challenge creation and acceptance, the UI must name the selected competitive
device/dataset and state that workouts logged on another installation do not
count. Quality/Product verification must include a two-device user recognizing
that limitation and either choosing one device or declining Duel. If the product
owner requires every claimed device to contribute, `socialCompetition=false`
remains the recommendation until a server-issued workout-correlation and deterministic
merge/dedup contract replaces this limitation.

### 5.3 Required conflict tests

- same claim/idempotency key replay;
- concurrent claims by two accounts;
- sign-out/sign-in to a different account with an existing local dataset;
- two claimed devices containing the same apparent workout and a competitive-
  dataset switch with pending/active Duel rejection;
- deleted Social account followed by re-registration;
- local-only choice and consent withdrawal;
- Social deletion changes neither local SQLite rows nor subscription D1 rows.

## 6. Workout sync and Social metric input

### 6.1 Alternatives

| Alternative | Benefit | Failure mode | Decision |
| --- | --- | --- | --- |
| Upload a client-computed winner/PR/aggregate. | Small payload. | Violates the server-derived metric contract and is trivial to tamper with. | Rejected. |
| Mirror SQLite/settings/Health data to PostgreSQL. | Easy conceptual backup. | Over-collects meals, body, health, settings, and couples remote schema to the local app. | Rejected. |
| Upload a versioned full snapshot of each completed session plus the minimum strength facts, then recompute server-side. | Idempotent replacement handles child edits/deletes and preserves the local-first write path. | Requires local revision/outbox migration and server conformance tests. | **Recommended.** |

### 6.2 Local durability seam required before sync

The current `client_uuid` values are retained. A later approved local migration
must also provide, in the same SQLite transaction as a workout or program
mutation:

- a monotonic session sync revision;
- a monotonic dataset sequence across every sync-relevant workout, tombstone,
  checkpoint precursor, and program change;
- the server-authorized active dataset generation used by a complete rebaseline;
- a separate monotonic `program_revision` when the effective weekly program
  changes;
- `updated_at` for the sync aggregate;
- an outbox entry containing entity kind, `client_uuid`, revision, operation,
  dataset sequence, payload hash, and timestamp; and
- a tombstone for deleting a whole synced session or dataset claim.

Set/cardio child changes increment the parent session revision. Network work is
never awaited by the local logging transaction. Background/reconnect sync drains
the outbox; local save succeeds while the Social backend is unavailable. The
future program editor must replace today's single-statement `updateSettings`
write with one local transaction that commits settings JSON, program revision,
and its outbox row together; a generic settings change that does not alter the
effective program does not increment `program_revision`.

### 6.3 Server sync unit

The proposed server key is `(workout_dataset_id, dataset_generation,
session_client_uuid)`. Dataset ownership and the active generation are derived
from the authenticated claim and server state, never accepted as authority from
a caller-supplied `social_user_id` or arbitrary generation.

A completed-session `PUT` carries a full snapshot plus source revision and hash:

- session/client UUID, start/completion UTC timestamps, source revision, and
  canonical exercise-catalog version;
- strength facts: set/client UUID, canonical exercise ID, weight in kilograms,
  reps, and logged time; and
- a bounded indication that the completed session contained a supported cardio
  item, for consistency only.

It excludes HealthKit/Health Connect records and cached health values, body
composition, food, free-text exercise names, full settings, Combat Power,
`verifiedRatio`, client `is_pr`, client `score`, winner, and rank. `source =
imported` and ad-hoc exercises are excluded from improvement until a separate
versioned provenance/catalog contract is approved.

Replay rules:

- same revision and same hash returns the original result;
- same revision with a different hash is a conflict;
- stale revision is rejected;
- a higher revision atomically replaces the session's child facts; and
- a dataset/session tombstone is monotonic and cannot be undone by a stale
  upload.

Only the designated `competitive_dataset_id` is accepted by the metric ingest
route. Session keys remain dataset-scoped; content/time similarity never merges
two datasets automatically.

Initial import and downgrade recovery use a generation-scoped full rebaseline,
not a best-effort list diff. The server opens one staging generation; the client
uploads every current completed-session snapshot, tombstone knowledge, and
program snapshot, then finalizes with an ordered manifest count/hash and highest
dataset sequence. A partial batch can neither delete an absent server row nor
become metric-ready. Only a matching complete manifest atomically makes the new
generation active and retires the old projection; later uploads to the retired
generation fail. This is how a compatible build reconciles a session that an N-1
app hard-deleted without an outbox record. Retired full facts are purged within
**MAX 30 days**; account deletion remains the narrower section 9 path.

### 6.4 Gap-free checkpoint and no-event watermark

Session uploads alone cannot distinguish “no workout happened” from “the device
has not synced.” The proposed account-scoped
`POST /social/v1/workout-datasets/{datasetId}/sync-checkpoints` operation closes
that gap. It carries the highest contiguous dataset sequence after every earlier
outbox item has a server acknowledgement, plus the active generation. The server
accepts it only when there is no lower sequence gap, unresolved conflict, or
pending tombstone, and returns an immutable receipt containing that sequence and
server `receivedAt`.

Creating a checkpoint is itself a tiny local transaction/outbox item that takes
the next dataset sequence even when no workout or program changed. Retrying that
checkpoint reuses its sequence; a later no-event checkpoint takes a new one.
The client timestamp is diagnostic only. A successful receipt advances
`coveredThrough` to server `receivedAt`; replay of the same sequence is
idempotent, and a lower sequence cannot move the watermark backward. A device
with zero workouts still sends this checkpoint, so inactivity can be proven
without fabricating a workout. To finalize a Duel, each competitive dataset must
obtain such a gap-free receipt at or after the exact window end and within the
proposed grace period. Any later in-window correction is accepted as personal
data but cannot silently rewrite a published result; the required provenance/
dispute amendment must define withdrawal or correction before Duel is enabled.

### 6.5 Minimal program-schedule sync

The current full `WeeklyProgram` is not uploaded. The future local transaction
derives a privacy-minimal `ProgramScheduleSnapshot`:

- `schemaVersion` and monotonic `programRevision`;
- a seven-bit Sunday-through-Saturday planned-day bitmap, where a day is planned
  only when its effective program has at least one slot;
- `plannedUnits`, which must equal the bitmap population count; and
- a canonical payload hash.

Labels, exercise IDs, set/rep targets, Health data, and the rest of settings are
excluded. The proposed account-scoped
`PUT /social/v1/workout-datasets/{datasetId}/program-schedule` uses the same
revision/hash replay rules as a completed session and returns an acknowledged
program revision. The current snapshot is authoritative for the next Duel only
when its outbox item and a following gap-free checkpoint are acknowledged. Duel
acceptance requires that checkpoint to come from a supported sync-contract
version and be received within **MAX 5 minutes** before acceptance; an old
readiness receipt is never a permanent lease.

At Duel acceptance, the server freezes the exact dataset ID, program revision,
bitmap, `plannedUnits`, metric versions, `startsAt`, and `endsAt`. Later program
edits affect only later Duels. If either side has `plannedUnits = 0`, the server
rejects acceptance with the proposed stable `social_duel_not_ranked` error;
neither user is treated as losing. This preserves the canonical `not_ranked`
rule without creating a seven-day no-winner comparison.

The current schedule is retained while the dataset is claimed. A superseded
snapshot is purged within **MAX 30 days** unless a pending/active/retained Duel
references it; a referenced snapshot expires with that Duel's frozen-result
record. Account deletion uses the **MAX 7-day** primary purge in section 9.

### 6.6 Metric conformance

Before Duel, a separate `performance_score_v1` conformance fixture must freeze
the server formula. The recommended starting point is the verified local rule:

- weighted strength score = `weightKg * (1 + reps / 30)`;
- bodyweight score = non-negative reps;
- first-ever comparable performance is a baseline, not an improvement; and
- a tie is not an improvement.

The server recomputes this from raw allowed facts and a versioned catalog flag.
The client result is never authoritative. Cardio contributes to the completed
consistency unit only; it has no Phase 0 personal-improvement formula.

Each consistency bucket is anchored at `Duel.starts_at` and spans an exact
consecutive 24 hours. The frozen bitmap explains the denominator, while the
canonical metric uses its frozen `plannedUnits` count and at most one completion
per bucket; client locale or wall-clock/DST shifts do not resize a bucket.

Proposed finalization rule: after exact `7 * 24 hours`, the server allows **MAX
24 hours** for both participants' acknowledged sync watermarks to cover the
window end. If either watermark is still incomplete, the Duel becomes
`cancelled` with no winner. Alternatives considered were no grace (penalizes
ordinary offline use) and 72 hours (keeps a competitive result stale too long).

### 6.7 Proposed workout-data retention

- completed session facts: rolling **MAX 90 days** while the account is active;
- one minimal per-dataset/per-exercise pre-window best fact/version: retained
  until superseded or account deletion, because the metric needs a prior
  baseline;
- a correction/deletion touching that retained best marks the dataset/exercise
  baseline unready until a higher-revision raw replacement/rebase is recomputed
  by the server; no affected Duel starts or publishes a winner while unready;
- full sync acknowledgement/checkpoint history: **MAX 30 days**, while only the
  latest gap-free dataset checkpoint remains active;
- full tombstone payload: **MAX 30 days** after acknowledgement. A compact
  dataset-scoped `(session key, deleted revision)` anti-resurrection marker is
  retained while the dataset claim is active and for **MAX 90 days** after the
  claim ends; account deletion applies section 9 instead; and
- terminal Duel result, frozen metric input, and referenced program snapshot:
  **MAX 30 days** after terminal state unless attached to an open safety case;
- account deletion: the primary-data SLO in section 9 overrides active-account
  retention.

These are proposed product/operations values. Legal sufficiency and production
storage cost remain unverified until review.

## 7. Strict-TypeScript backend scaffold and dependencies

### 7.1 Package-boundary alternatives

| Alternative | Failure mode | Decision |
| --- | --- | --- |
| Add Social to `worker/src/index.js`. | Violates the frozen service boundary and mixes Social/PostgreSQL with the subscription JavaScript/D1 failure domain. | Rejected. |
| Add Nest/server dependencies to the root Expo package. | Couples mobile install, lockfile, typecheck, and release churn to the server. | Rejected. |
| Convert the repository to a root npm workspace now. | Can centralize scripts, but expands root install/lockfile structure before a server exists. | Deferred; requires a separate structural approval. |
| Independent `server/` package and lockfile. | Duplicates some scripts/config but keeps install, compiler, deploy, and rollback boundaries explicit. | **Recommended.** |

### 7.2 Recommended package boundary

Use an independent `server/` npm package with its own `package.json`, exact
lockfile, strict `tsconfig` family, test configuration, and build output. This
matches the existing separate `worker/` boundary and avoids coupling Expo
dependencies and server deployment.

The server compiler baseline sets `strict: true`,
`noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`,
`useUnknownInCatchVariables: true`, `noImplicitOverride: true`, and
`noFallthroughCasesInSwitch: true`. Any exception is a reviewed, local exception;
the scaffold does not weaken the whole package to accommodate one dependency.

The future implementation must also exclude `server` from the root Expo
`tsconfig.json`; root scripts may delegate with `npm --prefix server run ...`.
No production script may require `/bin/*`, bash environment-assignment syntax,
a global CLI, a personal path, or the development repository layout.

Node `24.18.0` is the proposed runtime pin because it was the current official
Node 24 LTS release checked on `2026-07-15`; Nest's official prerequisites require
Node 20 or newer. Package compatibility is still an implementation gate rather
than assumed from that fact.

The PostgreSQL major and all npm package versions remain blocking implementation
inputs because neither a Social infrastructure target nor a compatible lockfile
exists at the baseline. Approval of package names is not approval of unverified
versions.

### 7.3 Direct dependency proposal

Exact package versions are intentionally not invented here. They must be pinned
and committed in `server/package-lock.json` after approval, then proven by clean
install on Windows and macOS.

| Purpose | Proposed direct packages | Boundary |
| --- | --- | --- |
| Nest runtime | `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `reflect-metadata`, `rxjs` | No Social code in `worker/src/index.js`. |
| Strict DTO | `class-validator`, `class-transformer` | Global `ValidationPipe` with whitelist plus rejection of unknown fields; stable error mapping remains explicit. |
| PostgreSQL | `@nestjs/typeorm`, `typeorm`, `pg` | Data Mapper/repository use; `synchronize: false` in every environment. |
| Authentication | `jose` | Configured issuer/audience/JWKS verification behind `AuthVerifier`; no provider SDK in the domain. |
| API contract | `@nestjs/swagger` | Generated contract is checked against the normative REST/error model. |
| Nest build/test tooling | `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `typescript`, `ts-loader`, `ts-node`, `tsconfig-paths`, `source-map-support` | All tools local to the package; no global `nest`, `tsc`, or `typeorm`. |
| Types | `@types/node`, `@types/express`, `@types/pg`, `@types/jest`, `@types/supertest` | Directly declared because strict compilation/tests use their public types. |
| Lint/format | `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, `eslint-config-prettier`, `eslint-plugin-prettier`, `prettier` | Flat config; lint is non-mutating and fails on warnings in verification. |
| Test | `jest`, `ts-jest`, `supertest` | Unit and PostgreSQL integration configs are separate; E2E uses the compiled/booted Nest boundary. |

Serious alternatives:

- Prisma has strong generated types but adds code generation/native artifacts and
  still needs reviewed SQL for the contract's complex PostgreSQL constraints.
- `pg` plus hand-written SQL gives maximum constraint visibility but creates more
  mapping and type boilerplate.
- TypeORM is recommended for its official Nest integration and migration/
  transaction support, while complex pair, partial-unique, outbox, and safety
  constraints remain explicit reviewed migrations rather than schema sync.

The scaffold approval must freeze exact portable npm scripts before dependency
installation. Required script behavior is:

- `build`: local `nest build`;
- `typecheck`: `tsc --noEmit` against the server config;
- `lint`: local ESLint over server source/tests with `--max-warnings 0` and no
  `--fix`;
- `test` and `test:integration`: separate Jest configs, with integration tests
  targeting a disposable PostgreSQL database;
- `migration:show` and `migration:run`: the local TypeORM CLI against the compiled
  JavaScript DataSource after `build`; production never executes TypeScript via
  `ts-node`; and
- `migration:revert:test`: available only for a disposable test database and
  never called by the production rollback script.

The cross-platform clean receipt runs, as separate commands, `npm ci`,
`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, and
`npm run build` on Windows and macOS. Exact manifest versions, PostgreSQL major,
DataSource output path, script strings, Node/npm `engines`/`packageManager`, and
the generated lockfile remain a **separate blocking scaffold approval**. This
packet approves the boundary and complete package-name set, not a reproducible
version set that has not yet been resolved and installed.

Official references checked for this proposal:

- [Nest first steps](https://docs.nestjs.com/first-steps)
- [Nest validation](https://docs.nestjs.com/techniques/validation)
- [Nest configuration](https://docs.nestjs.com/techniques/configuration)
- [Nest database integration](https://docs.nestjs.com/techniques/database)
- [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [TypeORM migration setup](https://typeorm.io/docs/migrations/setup/)
- [TypeORM migration execution](https://typeorm.io/docs/migrations/executing/)
- [TypeORM PostgreSQL driver](https://typeorm.io/docs/drivers/postgres/)
- [`jose` JWT verification API](https://jsr.io/@panva/jose/doc/jwt/verify)
- [Node release status](https://nodejs.org/en/about/previous-releases)
- [Official Nest TypeScript starter](https://github.com/nestjs/typescript-starter/blob/master/package.json)

## 8. Migration and rollback

### 8.1 Alternatives

| Alternative | Failure mode | Decision |
| --- | --- | --- |
| ORM `synchronize` on boot. | Unreviewed schema drift or destructive change. | Rejected. |
| Routine production `down` migrations. | Rollback can destroy user/safety evidence while old code is already degraded. | Rejected. |
| Additive expand-first migration plus capability/binary rollback and later contract. | Requires N-1 compatibility and deliberate cleanup. | **Recommended.** |

### 8.2 PostgreSQL required procedure

1. A single migration executor takes a PostgreSQL advisory lock.
2. It verifies the ordered migration name and committed checksum before running.
3. `synchronize` and automatic production migration-on-app-start remain false.
4. Every change is rehearsed on an empty database and an N-1 upgrade fixture,
   including FK, canonical-pair, owner, block, idempotency, and deletion cases.
5. Disposable test databases run `up -> down -> up`; production rollback does
   not automatically execute `down`.
6. Production deploy expands schema first, runs a compatibility read/write smoke,
   then enables no capability until the new binary and gates are healthy.
7. Incident rollback sets the affected capability false, verifies routes fail
   closed while rights-preserving routes remain available, and returns to the
   previous binary.
8. Data correction uses a forward migration. Column/table removal is a separately
   approved later contract after retention expiry and backup evidence.

Migration rows record name, checksum, execution time, and release identifier.
Report/evidence/deletion rows must not disappear through a convenient account FK
cascade. `SocialAccount.status = deleting` provides immediate read suppression;
the cleanup job is retry-safe and observable.

### 8.3 Local SQLite required procedure

The client sync seam is a separate migration boundary; PostgreSQL rehearsal does
not prove it. Its migration is additive: it creates dataset/sync-state, outbox,
tombstone, and program-revision storage without rewriting `user.id = 'local'` or
deleting/rekeying any existing session, set, cardio, settings, meal, body, or
subscription data.

The local upgrade must run in one SQLite transaction before Social transport is
eligible. On any statement, validation, or disk failure, that transaction rolls
back, Social remains disabled, and the prior local schema must still open
TODAY/TRAIN/+LOG and save a workout. A successful migration has no destructive
`down`; an older app binary must ignore the additive objects and continue local
logging.

An N-1 app cannot maintain the new outbox contract. The server therefore never
treats readiness as permanent: acceptance requires the fresh supported-contract
checkpoint in section 6.5 and finalization requires a post-window checkpoint.
An older build cannot produce either. Returning to a compatible build requires a
full local rescan/rebaseline, tombstone reconciliation, program snapshot, and
gap-free checkpoint before Social metric readiness can return. No Duel starts or
finalizes across that downgrade gap.

Fixtures cover a clean install, the current baseline with representative edited
and deleted sessions, forced mid-migration failure, low-disk/error rollback,
N-1 open/write followed by re-upgrade/rebaseline, and idempotent reopen. Client
verification is required separately on iOS and Android; Windows and macOS clean
host installs remain required for the server/tooling path.

### 8.4 Migration evidence gate

- PostgreSQL: empty DB up, N-1 fixture up with preserved rows/constraints,
  disposable down/up, concurrent executor serialization, checksum mismatch
  rejection, N-1 binary compatibility, and capability/binary rollback;
- SQLite: baseline upgrade, transaction failure rollback, local logging after
  failure, N-1 downgrade write, re-upgrade/full rebaseline, and iOS/Android
  reopen; and
- recovery: backup restore followed by the independently authoritative deletion
  manifest procedure in section 9 before reads are served.

## 9. Retention and deletion SLO proposal

### 9.1 Alternatives

| Posture | Primary purge | Backup expiry | Closed safety evidence | Main cost |
| --- | ---: | ---: | ---: | --- |
| Privacy-first | MAX 24 hours | MAX 7 days | MAX 30 days | Too little time for appeal and repeated-abuse investigation. |
| Balanced | MAX 7 days | MAX 30 days | MAX 180 days | More security burden than the privacy-first posture. |
| Safety-first | MAX 30 days | MAX 90 days | MAX 365 days | Highest minimization and breach-impact cost. |

**Recommendation: balanced posture.** These are proposed finite limits, not legal
requirements inferred from the current AI or billing policy.

| Data class | Active retention | On delete / terminal state |
| --- | --- | --- |
| `SocialAccount`, active `AuthBinding`, `PolicyAcceptance`, profile, friendship, crew/membership, discoverability, active invite | While the account/relationship needs it | Immediately suppressed; ordinary primary rows and the active binding are purged within **MAX 7 days**, replaced only by the minimized receipts/controls below. |
| Social session/cache and server-held credential material | Only for the configured session/credential lifetime | Revoked before the delete response; secret material/cache is purged within **MAX 24 hours**. The exact maximum accepted external-token lifetime remains part of the real auth-configuration gate. |
| `DeletionJob` and authenticated deletion-status receipt | Job while running; minimized receipt after completion | Receipt is keyed by an irreversible auth-binding digest and purged within **MAX 30 days after completion**. It cannot auto-provision an account. |
| Independently replicated deletion-suppression manifest | Restore protection only | Purged within **MAX 90 days**, which exceeds the proposed 30-day backup lifetime; details below. |
| Terminal invite/relationship operation receipt | Operational dispute and replay handling only | Purged within **MAX 30 days**; evidence attached to an open report follows the safety-evidence row instead. |
| Search/cache/projection/ordinary outbox | Operationally bounded | Purged within **MAX 24 hours** after the deletion job reaches that stage. |
| Idempotency response ledger | Contractual **MIN 24 hours** | Cleanup completes by **MAX 7 days**; safety uniqueness constraints remain in the database. |
| Workout/program sync facts and active metric baseline | Section 6.7 | Primary facts purged within **MAX 7 days** of account deletion. |
| Terminal Duel/result/frozen inputs | **MAX 30 days** after terminal state | Purged with ordinary primary data within **MAX 7 days** after account deletion; an open safety case retains only its scoped evidence. |
| Open report evidence, active `SafetyAction`, appeal, and moderation audit | Until case/action/appeal close | Only case-scoped evidence survives account deletion; it is purged within **MAX 180 days after close** unless the separately bounded legal-hold exception applies. |
| Block-abuse and deleted-subject re-registration control | While active | Purged within **MAX 90 days**. Stored value must be minimized/non-public and cannot recreate the profile. |
| Encrypted backup | Point-in-time recovery only | Ages out within **MAX 30 days**. Restore must reapply deletion suppression before serving reads. |
| Profile media and chat | **Capability remains false; no Phase 0 collection.** | Separate approved retention amendment required before either capability opens. |

### 9.2 Authoritative deletion manifest and restore order

| Coordination alternative | Failure mode | Decision |
| --- | --- | --- |
| Commit `deleting` in PostgreSQL, then asynchronously write the external manifest. | A crash/restore between writes can resurrect a deletion that appeared accepted. | Rejected. |
| Cross-system distributed transaction/2PC. | The storage adapter may not support it and it couples availability/vendor semantics. | Rejected. |
| Idempotent manifest-first privacy-biased saga. | External manifest availability is on the delete path and a rare DB failure may leave a requested manifest awaiting reconciliation. | **Recommended.** |

A PostgreSQL row restored from the same backup cannot prove that a later delete
request happened. Deletion therefore uses an integrity-protected
`DeletionSuppressionManifest` in a vendor-neutral storage adapter whose replicas
and backup lifecycle are outside the Social database's restorable failure domain.
Using another table in the same PostgreSQL backup is forbidden.

The minimized record contains only schema version, deletion-job ID, opaque Social
account ID, a keyed irreversible digest of canonical issuer plus subject,
`requestedAt`, suppression state, primary purge deadline, expiry, sequence, and
checksum/signature. It stores no raw token, issuer/subject, profile, content, or
workout. The digest key and manifest integrity key are separately managed and
must remain available for the manifest's proposed **MAX 90-day** lifetime.

The exact saga is:

1. verify the current binding and recent reauthentication, resolve any existing
   active deletion by the binding digest, and allocate/reuse one deletion-job ID;
2. append and read-verify an idempotent `requested` manifest event first. A
   timeout/unknown result is retried with the same job ID and digest; no success
   response is returned until a durable receipt is observed;
3. in one PostgreSQL transaction, set the account to `deleting`, revoke sessions,
   suppress reads, create the deletion job, and persist the manifest receipt;
4. append later `primary_suppressed` and `completed` events idempotently as the
   cleanup advances; and
5. return the successful delete/job response only after step 3 commits. A retry
   at any crash point resolves the same job and never provisions an account.

If the manifest append succeeds but PostgreSQL commit fails or the process dies,
the response is not success and a reconciler consumes the manifest `requested`
event to finish suppression. Restore treats `requested` as sufficient authority
to suppress. If the manifest cannot be durably written/read, deletion remains a
visible retryable failure and `socialCore` is operationally unready; the service
must not fall back to DB-first acceptance. Crash-injection tests cover every
boundary before this gate opens.

A restore is isolated with every public capability false. Manifest appends use a
monotonic sequence plus a CAS-controlled writer generation; an old generation
cannot append after it is fenced. Before any restored read is served, the
operator must:

1. verify and import a manifest high-water mark that is newer than the restored
   backup cutoff;
2. enter cutover maintenance, stop successful delete responses on the old
   primary, drain its in-flight manifest appends, and CAS-fence its writer
   generation. A request in this interval receives a retryable non-success and
   cannot be represented as an accepted deletion;
3. read the now-terminal sequence for that fenced generation and replay every
   event through it into the restored primary. A stale old writer append must be
   rejected by the manifest store;
4. suppress each matching account/binding and invalidate sessions;
5. replay or resume every incomplete deletion job and wait for the primary purge
   deadline checks; and
6. prove no sequence/checksum gap through the terminal sequence, atomically move
   traffic and the next writer generation to the restored primary, then reopen
   ordinary reads.

Missing, stale, or unverifiable manifest state is fail-closed and blocks restore
promotion. The minimized deletion-status receipt supports authenticated
`GET /account/deletion` after the active binding is removed; it expires after the
proposed 30-day status period and never recreates the account.

The recovery gate injects deletes immediately before, during, and after fencing;
an old-writer append after fencing; a lost client response; and a routing switch
failure. Every accepted request must appear at or before the replayed terminal
sequence or in the new writer generation, and no restored read may expose it.

Deletion status semantics:

- before the delete response: account becomes `deleting`, sessions are revoked,
  and profile/discovery/chat reads are suppressed;
- primary cleanup target: **MAX 7 days**;
- backup aging target: **MAX 30 days**;
- retained safety exceptions list purpose, data class, expiry, and appeal/support
  path without revealing reporter identity; and
- ordinary closed safety evidence has the stated **MAX 180-day** limit;
- a case-scoped legal hold is a separately classified exception with named owner,
  reason, affected fields, user/legal notice basis, and expiry. One approval may
  last **MAX 90 days**, and total retention may not exceed **MAX 365 days** without
  a separately approved contract/policy amendment. It cannot silently retain an
  entire account or exist without `expires_at`.

Apple currently requires an in-app initiation path for apps with account creation
and associated user content deletion; Google Play requires an in-app path plus a
functional web deletion resource. Neither platform supplies the proposed 7/30/
180-day values. Legal review is required before those values become public
policy.

Official policy references checked:

- [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

## 10. Moderation operations

### 10.1 Alternatives

| Alternative | Failure mode | Decision |
| --- | --- | --- |
| Automated provider decision only. | Provider coupling, false positives, no accountable appeal. | Rejected. |
| Human pre-review of every action with no automation. | Queue stalls and no abuse/rate defense. | Rejected. |
| Bounded validation/rate controls plus human decisions behind a vendor-neutral moderation adapter. | Requires a real queue, coverage, audit, and appeal operation. | **Recommended.** |

### 10.2 Minimum Social-core operation

`SocialAccount.status` remains only `active | deleting | deleted`; moderation
must not overload account-deletion state. The proposed contract `1.1.0`
amendment adds:

- `PolicyAcceptance(policyKey, policyVersion, socialUserId, acceptedAt)`, with an
  active exact Terms/community-rules version required before authored text or a
  new relationship/challenge write;
- `SafetyAction(actionId, subjectUserId, targetType/Id/version, kind, state,
  reasonCode, operatorPrincipal, startsAt, expiresAt, reversedBy/At, audit
  timestamps)`, where kind is exactly `hide_content`,
  `restrict_social_writes`, or `suspend_social_access`, and state is
  `active | expired | reversed`; and
- `Appeal(appealId, actionId, appellantId, state, submittedAt, acknowledgedAt,
  decisionDueAt, extensionDueAt, decision/reason/audit fields)`, with at most one
  active appeal per action and states `submitted | acknowledged | under_review |
  upheld | modified | reversed`.

The effects are explicit: `hide_content` suppresses only the named content
revision; `restrict_social_writes` blocks new profile/crew publication, Invite,
Interest, and Duel creation/acceptance but preserves reads and protective
remove/decline/cancel/block/report/delete/appeal actions;
`suspend_social_access` revokes Social sessions and suppresses ordinary Social
reads/writes while preserving the same rights/safety lane. `restore` is an
audited reversal event, not an account status. Expiry or appeal never recreates a
deleted relationship/content version automatically.

- A named safety owner and named backup are recorded before `socialCore=true`.
- Terms/community rules are accepted before a user can publish profile or crew
  text.
- New or changed discoverable profile/crew text enters `pending`. If an approved
  prior version exists, it remains visible until the new version is approved.
- Block takes effect before the response and never waits for the moderation queue.
- Report submission returns an opaque receipt; reporter identity, category,
  details, and internal status remain hidden from the subject.
- Internal safety roles are separate from crew roles and every
  hide/restrict/suspend/dismiss/restore/appeal action records actor, reason code,
  target version, time, and expiry/review time.
- Report count alone never creates a permanent penalty.
- Appeals use an authenticated in-app intake or a support case that can prove the
  account binding. An email address alone is not accepted as account identity.
- The kill state preserves account deletion/status, block, report receipt, stale
  evidence reporting, appeal intake, and the internal safety queue even when
  ordinary Social reads/writes are disabled.

Proposed operations SLOs:

- imminent threat, suspected underage use, sexual exploitation, or exposed
  private information: triage within **MAX 24 hours**;
- other reports: triage within **MAX 72 hours**;
- appeal acknowledgement: **MAX 72 hours**;
- ordinary appeal decision: **MAX 14 days** from receipt; and
- at most one documented extension, notified to the user before day 14, with a
  hard final decision deadline of **MAX 30 days** from receipt.

These SLOs are proposed operating promises. If named coverage cannot sustain
them, `socialCore` remains false rather than publishing an unstaffed promise.

Apple's UGC guideline requires filtering, reporting, blocking, timely response,
and published contact information. Google Play requires ongoing UGC moderation,
terms, in-app reporting/blocking, and action. Those policies support the
operation categories, not the proposed response-time numbers.

Official policy references checked:

- [Apple App Review Guidelines, section 1.2](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)

### 10.3 Proposed text and abuse bounds

A single generic rate limit is rejected because it can disable block/report with
ordinary discovery traffic. Unlimited text/routes are also rejected. The
recommended initial private-cohort limits are server-authoritative, adjustable
only downward during an incident, and require a contract amendment to increase:

| Input/operation | Proposed bound |
| --- | --- |
| Handle | **MIN 3 / MAX 30** lowercase ASCII letters, digits, or underscore after exact normalization; no fuzzy search. |
| Display name | **MIN 1 / MAX 50** Unicode grapheme clusters after normalization. |
| Bio | **MAX 160** Unicode grapheme clusters. |
| Private crew name | **MIN 1 / MAX 50** Unicode grapheme clusters. |
| Report details | **MAX 1,000** Unicode grapheme clusters; category remains bounded separately. |
| Profile/crew text mutations | **MAX 10 per 60 minutes** per account. |
| Friend/crew invite creates | **MAX 20 per 24 hours** and **MAX 5 per 10 minutes** per account; crew also has its own bucket. |
| Duel challenge creates | **MAX 10 per 24 hours** and **MAX 2 per 10 minutes** per account. |
| Exact-handle lookup | **MAX 30 per 60 seconds** per account. |
| Report creates | **MAX 20 per 24 hours** per account after idempotent duplicate collapse; a throttled user receives the support/escalation path. |

The server applies NFKC before validating text. It lowercases handles before the
ASCII allow-list check and counts other user-visible strings as extended grapheme
clusters under the pinned runtime/ICU receipt; client counts are advisory. Tests
freeze combining-mark, emoji, confusable-handle, control-character, and byte-size
cases so a runtime upgrade cannot silently change accepted bounds.

Block, authenticated deletion/status, and appeal receipt are isolated from those
buckets and remain available. Defense may also use a short-lived keyed source
digest, never raw IP or a derived area, with **MAX 24-hour** retention. Before
approval these values are product/security proposals, not observed capacity; the
gate requires load/abuse fixtures and an operator runbook proving stable
`Retry-After`, no cross-route bucket collision, and rights-preserving behavior.

`profileMedia`, `partnerDiscovery`, and `socialChat` remain false in Social v1 /
Phase 0. They require their own provider, content, cohort, rate, store, and
retention amendments; the text-only Social-core operation does not authorize
them.

## 11. Duel activation boundary (historical proposal)

This section preserves the alternatives and proposed `duels` schema reviewed
before contract `1.1.0`. It is non-normative. The canonical amendment selected
`socialCompetition` as the fifth capability because friend and Crew comparison
share the same sync/metric readiness; implementation must use the canonical
name, predicates, and effective-capability rules.

### 11.1 Contract defect and alternatives

| Alternative | Benefit | Failure mode | Decision |
| --- | --- | --- | --- |
| Keep `socialCore=false` until workout sync and Duel are ready. | No contract version change. | Delays account/friend/private crew even when only competition is unready. | Safe fallback, not preferred product boundary. |
| Add an explicit `duels` capability and account-level opt-in. | Independent rollout, kill switch, UI truth, and test evidence. | Requires contract/API/client amendment. | **Recommended.** |
| Leave `socialCore=true` and return hidden dependency 404s for Duel. | Small document change. | Dead/ambiguous client actions and no independent rollout receipt. | Rejected. |

The proposed contract amendment is version `1.1.0` and changes the typed
capabilities to add:

```ts
interface SocialCapabilities {
  socialCore: boolean;
  duels: boolean;
  partnerDiscovery: boolean;
  profileMedia: boolean;
  socialChat: boolean;
}
```

It also adds a default-false, revocable `duelChallengesEnabled` account
preference. Per-Duel acceptance is a second, challenge-specific consent; it does
not replace the account-level competition opt-in.

The common capability envelope is:

```text
duelCapabilityReady =
  clientBuildSupportsDuels
  AND validatedServerCapabilities.duels
  AND effectiveSocialCore
  AND metricVersion == consistency_improvement_v1
  AND performanceFormulaVersion == performance_score_v1
  AND safetyOperationsReady
  AND provenanceAndBiasGateApproved
```

Predicates differ by transition and cannot be collapsed into one client boolean:

| Operation | Server-required predicates |
| --- | --- |
| Create pending challenge | Common envelope; both accounts currently opted in; active Friendship; no Block; challenger has one ready competitive dataset. The opponent may still be program/sync-unready. |
| Accept and start | Recheck create authorization; both accounts have exactly one selected competitive dataset and a complete active generation; both acknowledged program snapshots have `plannedUnits > 0`; both supported-contract pre-accept checkpoints were received within **MAX 5 minutes**; no unresolved sync conflict/baseline. Freeze every input atomically. |
| Finalize | Recheck capability, active accounts, opt-in, Friendship, and no Block; both gap-free post-window checkpoints cover `endsAt` within **MAX 24 hours**; frozen versions remain supported; no disputed/corrected input. Otherwise cancel with no winner. |
| Read result | Named authenticated participant only; capability remains valid; no Block/deletion suppression; read only the immutable server result. A client never supplies or recomputes it. Crew/friend comparison endpoints have their own authorization and never expose a Duel projection. |

The server alone freezes inputs and writes results. The exact comparison window
remains `7 * 24 hours`; only acceptance starts it. A pending challenge expires
after **MAX 7 days** if it cannot reach accept readiness, then becomes
`cancelled` without a winner.

`plannedUnits = 0` is `not_ranked`, never a loss. Challenge creation may remain
pending while a user fixes a program, but acceptance is rejected until both
acknowledged program snapshots have a nonzero count. The accepted snapshot and
competitive dataset are then immutable for that Duel; switching a dataset or
editing a program affects only future eligibility.

Operational behavior:

- missing/invalid/expired capability data resolves `duels=false` on client and
  server;
- `duels=false` blocks create, accept, and result publication but preserves
  block, report, deletion, appeal, and internal safety access;
- user competition opt-out, block, account deletion, or a deliberate Duel kill
  action cancels pending/active Duels with no winner;
- a stale/offline client cannot publish a local winner; and
- Combat Power, `verifiedRatio`, Health connection, client `is_pr`/`score`, body
  values, and appearance never enter the result or tie-break.

The repository's competition rule also requires trust-tiering, while the current
`verifiedRatio` is explicitly invalid for this purpose. A separate versioned
workout-provenance/anti-cheat contract and bias review is therefore a Duel gate,
not an invitation to reuse `verifiedRatio`. Until that contract is approved and
conformance-tested, real-person Duel remains false; only labeled development
fixtures may show the graph.

Contract `1.1.0` is now canonical. It uses `socialCompetition=false`, not
`duels=false`, so account/private profile/friends/private crews may be evaluated
independently from every real-person comparison. They are not automatically
approved by this document.

## 12. Release-gate ledger

`CLOSED` means the baseline lacks the evidence. It is not a test failure claim
about code that does not exist.

| Gate | Required evidence | Baseline state |
| --- | --- | --- |
| P0-00 authority/order | Documentation only now; Phase 1 acceptance -> Phase 2 account/sync acceptance -> Phase 4 entry, or a separately approved canonical roadmap amendment. | **CLOSED for implementation:** constitution says current Phase 1. |
| P0-01 scope | Only this proposal file differs from the baseline; no feature/manifests/lockfiles. | **EVIDENCED for this proposal unit:** handoff verification shows only this untracked document. |
| P0-02 auth config | Real non-placeholder issuer/audience/JWKS/alg/token-lifetime config, user/safety audience isolation, same-namespace replacement tests, and any issuer migration contract. | **CLOSED:** literals/provider absent. |
| P0-03 identity separation | Contract tests reject StoreKit, `actor_key`, local/device/request actor nomination. | **CLOSED:** server absent. |
| P0-04 dataset claim | Explicit consent, one-account-per-dataset constraint, one competitive dataset, duplicate-device/switch/deletion/non-resync tests. | **CLOSED:** contract and code absent. |
| P0-05 workout/program sync | Session/program revision, dataset generation/sequence, full-manifest rebaseline, outbox/tombstone, minimal payload, no-event checkpoint, replay/conflict/delete/offline tests. | **CLOSED:** current local rows/settings lack the seam. |
| P0-06 metric | `performance_score_v1` and `consistency_improvement_v1` server conformance, nonzero acknowledged plan freeze, server-time watermark completion. | **CLOSED:** sync/server absent. |
| P0-07 backend | Independent locked strict package; approved exact package/version/script matrix and PostgreSQL major; startup/config/DTO/API contract. | **CLOSED:** `server/`, infrastructure target, exact matrix, and compatible lockfile absent. |
| P0-08 clean install | `npm ci`, typecheck, lint, tests, build on Windows and macOS from a clean clone. | **CLOSED:** Windows and server package unverified. |
| P0-09a server migration | PostgreSQL empty/N-1/down-up/checksum/serialization/N-1 binary rehearsal. | **CLOSED:** Social migrations absent. |
| P0-09b client migration | SQLite baseline/failure rollback/N-1 downgrade/rebaseline on iOS and Android while local logging survives. | **CLOSED:** client sync migration absent. |
| P0-10 retention/delete | Approved matrix, manifest-first crash-safe saga, writer-generation fence/terminal-sequence cutover, cleanup/lag evidence, independent manifest, 7/30/90-day restore rehearsal, public disclosure. | **CLOSED:** current contract says `TBD`; storage/operation absent. |
| P0-11 moderation | Contracted PolicyAcceptance/SafetyAction/Appeal model, named owner/backup, queue/audit, proposed exact text/rate bounds, coverage/SLO/load rehearsal, rights-preserving kill state. | **CLOSED:** model, staffing, and capacity are absent/unverified. |
| P0-12 policy/store | Privacy, terms, support, web deletion, Apple/Play account/UGC/safety declarations match implementation and are read back. | **CLOSED:** current sources describe no account/UGC. |
| P0-13 release identity | Canonical spec, app metadata, policy, support, domain, and store sources agree on approved product/brand identity. | **CLOSED:** repository says both OVERDRIVE and Reploom. |
| P0-14 Duel | Contract `1.1.0`, independent real-person competition capability, opt-in, operation-specific predicates, single-device limitation, program/checkpoint, metric/provenance/safety, bias, cancellation/kill tests. | **PARTIAL:** `socialCompetition` and selected-dataset boundaries are documented; sync/metric/provenance/retention/operations evidence remains closed. |

No public Social capability may be enabled while its applicable gate is closed.
Local TODAY/TRAIN/+LOG remains available regardless of every Social gate.

## 13. Documentation approval record

The original packet requested review of the following recommendations. The
recorded documentation approval produced the adjudication in section 0 and the
canonical `1.1.0` amendment; it did not convert every proposed package or number
below into a binding requirement and did not authorize implementation:

1. this documentation-readiness packet does not bypass canonical phase order or
   settle the Reploom/OVERDRIVE release identity;
2. single-process vendor-neutral auth adapter first; signed internal assertion
   only when a separate gateway topology exists; same-namespace verifier swaps
   only, with issuer migration and safety-operator auth separately contracted;
3. permanent local user, explicit one-account dataset claim, no auto-merge, and
   exactly one competitive dataset per account as a disclosed single-device
   limitation; account-wide multi-device scoring requires a later dedup contract;
4. minimal completed-session plus program-bitmap sync with local revision,
   dataset generation/sequence, complete-manifest rebaseline, outbox/tombstone,
   and gap-free no-event checkpoints;
5. independent NestJS/PostgreSQL/TypeORM package and the complete proposed
   package-name/script boundary, while exact versions/lockfile/PostgreSQL major
   remain a separately blocking scaffold approval;
6. additive PostgreSQL migration/capability rollback plus additive local SQLite
   migration, fail-safe local logging, and downgrade rebaseline;
7. the manifest-first idempotent deletion saga plus the proposed 5-minute recent-
   auth and acceptance-checkpoint windows, 24-hour Duel sync grace, 90-day
   workout, 7-day primary deletion, 30-day backup/status/Duel limits, 90-day
   manifest/abuse-control limits, 180-day ordinary safety-evidence limit, and
   separately bounded 90/365-day legal-hold exception;
8. the proposed PolicyAcceptance/SafetyAction/Appeal model, text/rate bounds,
   24/72-hour moderation triage, 14-day ordinary appeal decision, and one-
   extension 30-day final appeal SLO;
9. contract `1.1.0` amendment with `duels`, default-off competition opt-in,
   operation-specific predicates, 7-day pending expiry, nonzero-plan handling,
   and independently acknowledged workout/program inputs;
   and
10. every capability remains false until its Function, Quality, and
   Product/workflow evidence is separately reviewed.

The separate documentation amendment exists at commit `5e11d4e`. Scaffold,
dependency, sync, or feature code still requires the applicable P0-00 canonical
phase evidence and packet-specific approval. A later change must edit the
canonical contract or its classified follow-on packet rather than treating this
historical proposal as implementation authority.

## 14. Failure modes, flip criteria, and reversal

### 14.1 Pre-mortem

1. **Wrong-account upload:** automatic history claim or stale device state sends
   a private workout to a different account. Defense: explicit dataset claim,
   one-account unique constraint, conflict UI, and `do_not_resync` after delete.
2. **Wrong Duel winner:** hard-deleted/edited local sets or stale program state do
   not reach the server, or zero activity never advances a watermark. Defense:
   parent/dataset revision, full-session replacement, tombstone, acknowledged
   minimal program snapshot, no-event server-time checkpoint, and no-winner
   cancellation.
3. **Kill switch removes user rights:** an incident disables deletion/report with
   ordinary Social. Defense: rights-preserving safe-degraded routes and a
   separate `socialCompetition` capability.
4. **Moderation promise is fictional:** queue grows while only one unstaffed
   operator exists. Defense: named primary/backup, measured coverage, limited
   cohort, and all high-risk capabilities false.
5. **Deletion is only a UI state:** backup restore or failed cleanup resurrects
   data. Defense: independently replicated suppression manifest, expiry fields,
   cleanup-lag evidence, and fail-closed restore rehearsal before reads.
6. **Server contaminates the local hot path:** sync/auth failure blocks a set
   save. Defense: SQLite transaction commits first; outbox transport is
   asynchronous; outage tests log throughout.
7. **App downgrade creates an invisible sync hole:** N-1 keeps logging without the
   journal and a later Duel treats silence as sync. Defense: readiness revocation,
   full rebaseline, and a new gap-free checkpoint after returning to a compatible
   build.
8. **Multi-device result is double-counted or incomplete:** two datasets contain
   the same session, or a valid workout exists only on a dormant device. Defense:
   the explicit single-competitive-device limitation, no heuristic merge, no
   switch during a pending/active Duel, and `socialCompetition=false` if
   account-wide device coverage is a product requirement.
9. **Delete succeeds only in PostgreSQL:** a crash before the external manifest
   allows restore resurrection. Defense: manifest-first durable receipt, idempotent
   job saga, crash injection at every boundary, and no DB-first fallback.

### 14.2 Criteria to change the recommendation

- If a real independent gateway is approved before the Social server, choose the
  signed internal assertion option immediately rather than duplicating external
  token validation.
- If Windows/macOS clean install or strict compilation cannot be proven for the
  selected dependency set, revisit the persistence/auth adapter package choices;
  do not merge Social into the existing Worker.
- If moderation coverage cannot meet the proposed SLOs, narrow cohort/surfaces or
  keep `socialCore=false`; do not weaken the published SLO silently.
- If legal review requires different finite retention, amend the numeric table,
  cleanup tests, and public policy together before collection.
- If canonical Phase 2/4 entry or release identity is not approved, keep this as
  documentation only; approval of the packet is not permission to implement.
- If the team rejects a fifth capability, the only safe fallback is
  `socialCore=false` until workout sync and Duel are fully ready.

### 14.3 Reversal

This proposal is reverted by deleting this one file. After implementation,
runtime reversal is capability-first and rights-preserving; database schema stays
additive until a separately approved retention-aware contraction. No rollback
drops user or safety data automatically.

## 15. Verification plan

### 15.1 This documentation unit

- baseline and upstream commit equality;
- changed-path allow-list contains only this document;
- no manifest, lockfile, source, migration, policy, or store file changed;
- required sections and all requested domains are present;
- no trailing whitespace or malformed diff; and
- links and cited line ranges are manually reviewed against the baseline.

### 15.2 Later implementation — not executed by this proposal

Function verification:

- server clean startup and fail-closed invalid config;
- auth negative/IDOR/idempotency/concurrency, user/safety audience isolation, and
  same-namespace/issuer-migration boundary suites;
- dataset claim, competitive-dataset switch, complete-generation/partial-manifest
  rebaseline, N-1 hard-delete reconciliation, session/program sync, no-event
  checkpoint, replay/edit/delete/offline suites;
- PostgreSQL migration/binary rollback and SQLite upgrade/failure/downgrade/
  rebaseline rehearsal;
- manifest-first deletion crash matrix and isolated backup restore with verified
  writer fencing, terminal-sequence replay, and atomic traffic cutover;
- PolicyAcceptance/SafetyAction/Appeal transitions and rights-preserving effects;
  and
- operation-specific Duel predicates, pending expiry, sync grace, cancellation,
  and rights-preserving kill flows.

Quality verification:

- strict TypeScript, zero-warning lint, unit/integration/API tests;
- forbidden identifier/content scans;
- clean `npm ci`, build, and scripts on Windows and macOS;
- privacy/safety review and store-source readback; and
- cleanup-lag, manifest-gap/backup restore, rate-limit isolation, and moderation
  queue/appeal evidence; and
- exact dependency/version/script/lockfile receipt on both clean hosts.

Product/workflow verification:

- consenting users complete account creation, explicit history claim, friend/
  crew flows, opt-out/block/report/delete, offline local logging, and eligible
  Duel end-to-end on a release candidate;
- a two-device user correctly understands that only the selected competitive
  dataset counts, or Duel remains disabled if that limitation is unacceptable;
- measured steps, elapsed time, errors, cohort, and outcome meet separately
  approved targets; and
- a passing unit test or HTTP 200 is not treated as product success.
