# Reploom Social v1 Implementation Contract

Status: **Canonical for Social v1 implementation**

Contract version: `1.1.0`

Repository baseline: `1b5ce1ab43f0e3ef6ee1db168d0ed79fd0736612`

Frozen: `2026-07-16`

This document is the normative boundary for Reploom Social v1. `MUST`, `MUST
NOT`, `SHOULD`, and `MAY` are requirements. A statement marked `[baseline]`
describes source observed at the repository baseline; it is not a claim about a
later build or a live service. `TBD` is deliberately unresolved and blocks the
affected launch path; an implementer must not silently choose a value.

Social v1 means the first generation of Reploom social features. It does **not**
mean App Store marketing version `1.0`. This contract authorizes documentation
only. It does not authorize feature code, dependency changes, deployment,
TestFlight upload, payment work, or an App Store review-state change.

Version `1.1.0` adds only documentation-level implementation boundaries. It
separates all real-person comparison behind `socialCompetition`, fixes an
explicit one-selected-dataset competition rule, formalizes safety support
entities, separates report-context and report-creation receipts, and limits v1
notifications to an in-app pull inbox. It still does not authorize implementation.

## 1. Evidence boundary, outcome, and non-goals

### 1.1 Baseline facts used by this contract

- `[baseline]` The current tab source is `Today / Explore / Log / History /
  Settings` in `src/app/(tabs)/_layout.tsx`; the target menu in this document is
  not implemented.
- `[baseline]` The local database has one on-device user identified by
  `LOCAL_USER_ID = 'local'`; it has no `auth_subject` or `social_user_id`
  binding (`src/db/types.ts`, `src/db/schema.ts`).
- `[baseline]` the subscription Worker derives `actor_key` by HMAC from a
  verified StoreKit `appAccountToken` and uses it for entitlement, quota,
  request, and deletion-tombstone rows (`worker/src/index.js`,
  `worker/migrations/0001_ai_subscription_quota.sql`).
- `[baseline]` current policy and listing sources say that v1 has no online
  account, public leaderboard, chat, or remote photo-avatar generation
  (`docs/compliance/privacy-policy.md`,
  `docs/launch/app-store-listing.md`). `store.config.json` currently records
  `messagingAndChat: false` and `userGeneratedContent: false`.
- `[baseline]` `verifiedRatio` is the share of locally logged sessions
  corroborated by a health-platform workout and directly increases the local,
  for-fun Combat Power multiplier (`src/db/repos/combatPowerRepo.ts`,
  `src/features/combat-power/computeCombatPower.ts`). It is not proof that a
  profile is a real person and is not a social anti-cheat verdict.
- `[baseline]` the repository handoff records Version 1.0 as
  `PREPARE_FOR_SUBMISSION` with no replacement submission. This document does
  not read live App Store Connect, so any current live review state is
  `[unverified]`.

### 1.2 Ordered outcome

1. Add a clear Social home without slowing or coupling the local workout log.
2. Give every social action an authenticated, domain-authorized identity.
3. Make privacy, block, report, deletion, media provenance, and adult opt-in
   structural invariants rather than client-only copy.
4. Compare consenting people by consistency and their own improvement, not by
   appearance, body shape, absolute strength, or the current `verifiedRatio`.
5. Permit staged rollout and immediate fail-closed shutdown by independent
   feature capabilities.

### 1.3 Non-goals

- No Hot-or-Not flow, attractiveness number, appearance rank, swipe score, or
  photo-engagement rank.
- No public/global leaderboard, monetary prize, betting, or pay-to-rank.
- No exact GPS, coordinates, geohash, live presence, route, home inference, or
  IP-derived location.
- No health-record, body-composition, raw workout, message, report, or photo
  content in analytics.
- No social authentication through Apple purchase state or the subscription
  entitlement Bearer token.
- No automatic account merge by email, phone number, purchase, device, or
  legacy rank token.
- No social route in `worker/src/index.js`; the subscription/AI Worker remains
  a separate service and failure boundary.
- No promise that 18+ self-attestation verifies identity or legal age.

## 2. Release boundary and navigation

### 2.1 Current 1.0 versus the next social release

| Surface | Current Version 1.0 release/review track | Next social-capable release |
| --- | --- | --- |
| Social account | Absent; current policy says no online account | Explicit account creation after authenticated bootstrap |
| Menu | Preserve the current shipped/reviewed behavior | `TODAY / TRAIN / +LOG / SOCIAL / ME` |
| Social flags | Effective false or capability absent | Staged independently; missing/invalid remains false |
| Profile media, UGC, chat | Not added by this contract change | Gated by policy, store metadata, moderation, and feature flags |
| Partner discovery | Not present and must remain disabled | 18+ self-attestation plus explicit, revocable opt-in |
| Store/review action | No edit, upload, submission, or deployment | Separate release approval after every gate in section 14 |

The marketing version number of the next release is `TBD`. No source or UI may
call it `1.1`, `2.0`, or another number until release ownership fixes that value.

### 2.2 Target primary menu

The social-capable client MUST render these five primary destinations in this
order and with these labels:

1. `TODAY` — existing daily decision and active-workout surface, plus at most
   one recent personal-achievement summary that deep-links to TRAIN.
2. `TRAIN` — `Plan`, `Explore`, and `Growth`. `Growth` is the stable default and
   owns personal PR, consistency, for-fun personal Combat Power, History, and
   Solo Challenge detail. The existing History capability is moved behind TRAIN,
   not removed.
3. `+LOG` — the raised center action for workout and meal logging.
4. `SOCIAL` — the Social v1 home, present only when `socialCore` is effective.
5. `ME` — profile, settings, subscription, privacy, safety, and account controls.

The client MAY preserve existing route filenames during migration, but the
visible information architecture above is fixed. A disabled social capability
must not leave a dead tab or reorder logging controls unexpectedly.

### 2.3 SOCIAL internal navigation

SOCIAL contains exactly three first-level surfaces:

- `친구` — accepted friends, incoming/outgoing friend invitations, and duels;
- `주변` — adult, opt-in partner discovery using the user's current manual area
  or venue selection only; and
- `크루` — private, invite-only crews and their consistency/improvement views.

The nearby screen MUST explain that it is based on a manually selected area or
venue and is not current-position or distance tracking. When
`partnerDiscovery` is unavailable, the screen shows the eligibility/settings
path without exposing candidate data.

### 2.4 Logging isolation

Social bootstrap, refresh, media, chat, flag, or backend failure MUST NOT delay,
disable, roll back, or require the network for TODAY, TRAIN, or +LOG local saves.
Social requests run outside the local logging transaction. Social JUICE is
allowed only after the underlying social write is durable; it remains
asynchronous and skippable. New UI uses the active skin's existing tokens and
primitives only; hard-coded colors, franchise styling, or a second visual token
system are forbidden.

### 2.5 Personal achievement versus social competition

Personal achievements are self-comparison and belong to `TRAIN/Growth`.
`TODAY` may show only the compact summary described above. Real-person friend,
crew, and Duel comparison belongs only to `SOCIAL` and requires effective
`socialCompetition` plus account opt-in and dataset readiness. No screen may
turn personal Combat Power, `verifiedRatio`, body values, or absolute strength
into a real-person rank.

## 3. Identity and subscription separation

### 3.1 Social account and authentication binding

The social domain owns two supporting records:

| Record | Required fields | Invariants |
| --- | --- | --- |
| `SocialAccount` | `social_user_id`, `status`, `created_at`, `updated_at`, `deleted_at` | `status` is `active`, `deleting`, or `deleted`. `social_user_id` is a server-generated, opaque random UUID and is immutable. It is never derived from user content, a device, auth claims, or payment data. |
| `AuthBinding` | `auth_binding_id`, `social_user_id`, `auth_issuer`, `auth_subject`, `created_at`, `revoked_at` | Active `(auth_issuer, auth_subject)` is unique. Subject comparison is exact and case-sensitive inside its issuer namespace. `auth_subject` is never public or client-editable. |

The authentication provider, issuer allow-list, audience, and gateway claim
transport are per-environment configuration, not hard-coded to one vendor. The
gateway must verify issuer, audience, signature, expiry, and subject. The social
service must reject direct bypass and must derive the acting account only from
the verified server-side claim. A request body, query, or ordinary client header
cannot nominate `auth_subject` or `social_user_id` as the actor.

Account provisioning is explicit through `POST /social/v1/account`. A read
request does not silently recreate a deleted account. V1 has no account-linking
or merge UI. A later linking flow requires reauthentication of every binding and
a new contract; matching email text is never sufficient.

### 3.2 Hard separation from `actor_key`

`actor_key` is a subscription/AI-quota principal, not a person or login. The
following rules are absolute:

- `social_user_id`, `auth_subject`, and `auth_issuer` MUST NOT be derived from,
  copied from, encrypted from, or hashed from `actor_key`, `appAccountToken`, an
  Apple transaction, `LOCAL_USER_ID`, `client_uuid`, or legacy `rankDeviceId`.
- Social tables, indexes, caches, URLs, tokens, analytics, and logs MUST NOT have
  an `actor_key` column or lookup path.
- The social service MUST NOT accept the subscription entitlement Bearer token
  as social authentication. The AI/subscription Worker MUST NOT accept a social
  token in place of its entitlement token.
- No database foreign key or join may connect the social schema to the
  subscription quota schema. If a future paid capability is needed, billing may
  return a coarse capability to the authenticated gateway; raw identifiers
  remain inside billing.
- Social account deletion, subscription-ledger deletion, Apple subscription
  cancellation, legacy-rank deletion, and local SQLite deletion are independent
  user actions. None automatically cascades into another.

This boundary also means that a purchaser, a restored purchase, or a family
payment relationship is never assumed to be one social person.

## 4. Normative entity model

### 4.1 Common database rules

- PostgreSQL is authoritative for online social state. Every primary ID is an
  opaque server-generated UUID; every time is UTC; every mutable aggregate has
  an integer `version` for optimistic concurrency.
- Database columns use `snake_case`; REST JSON uses `camelCase` through strict
  DTO mapping. Unknown request fields are rejected, not ignored.
- All relationship constraints, block precedence, and state transitions are
  enforced in the domain service and database transaction. Hiding a client
  button is not authorization.
- Uniqueness involving an unordered pair uses canonical `user_low_id` and
  `user_high_id`, rejects a self-pair, and is enforced by a unique constraint.
- User-authored content has a moderation state and cannot become discoverable
  while pending or rejected.
- Deleting an account immediately suppresses it from reads before asynchronous
  cleanup begins.

### 4.2 Required entities

| Entity | Required fields | Frozen invariant / lifecycle |
| --- | --- | --- |
| `Profile` | `social_user_id`, `handle`, `display_name`, `bio`, `visibility`, `primary_media_id`, `moderation_state`, `version`, timestamps | One per account. A normalized handle is unique; exact handle/display/bio bounds are `TBD`. Default `visibility = private`. `private` permits only self; `friends` permits self and accepted friends. A discovery card is a separate, minimal projection requiring surface opt-in. |
| `Friendship` | `friendship_id`, canonical user pair, `created_at` | Contains accepted friendships only; pending authority lives in `Invite`. One active row per pair. Either participant may remove it. |
| `Invite` | `invite_id`, `kind`, `inviter_id`, `invitee_id`, `crew_id`, `token_digest`, `state`, `expires_at`, timestamps | `kind` is `friend` or `crew`. A target-bound invite can be accepted only by that target. An external token is stored only as a digest, is one-time, and reveals no profile before authentication. States: `pending -> accepted\|declined\|revoked\|expired`. Duel authority does not share this state machine. |
| `Duel` | `duel_id`, `challenger_id`, `opponent_id`, `state`, `metric_version`, `starts_at`, `ends_at`, both selected dataset IDs/generations, frozen metric inputs, server result, timestamps | Requires an active friendship and no block. States: `pending -> active -> completed`; `pending -> declined\|cancelled`; `active -> cancelled` without a winner. Acceptance starts an EXACT 7-day window and freezes both selected datasets/generations. Only the server writes results. |
| `Crew` | `crew_id`, `owner_id`, `name`, `state`, `visibility`, `moderation_state`, `version`, timestamps | V1 is `private` and invite-only. One active owner. `active -> archived` only. It has no public directory or arbitrary join. |
| `Membership` | `membership_id`, `crew_id`, `social_user_id`, `role`, `joined_at` | One active membership per crew/user. Roles: `owner`, `moderator`, `member`. The owner alone transfers ownership or archives. Owner leave requires transfer; account deletion is never blocked and archives any still-owned crew. |
| `Discoverability` | `social_user_id`, `friend_search_enabled`, `crew_invites_enabled`, `partner_discovery_enabled`, `partner_scope`, `area_code`, `venue_id`, `adult_attestation_version`, `adult_attested_at`, `partner_opted_in_at`, `version`, `updated_at` | One row per account; every opt-in defaults false. `partner_scope` is `off`, `area`, or `venue` and requires its matching current selection. Only the current manual area/venue choice is stored. Replacing or clearing it does not create application history. Partner eligibility requires current 18+ self-attestation and partner opt-in. |
| `Interest` | `interest_id`, `from_user_id`, `to_user_id`, `state`, timestamps | Partner-only, directed, and private. One active direction per pair. States: `active -> withdrawn`. A one-way interest and its withdrawal are never revealed to the target. |
| `Match` | `match_id`, canonical user pair, `state`, `matched_at`, `closed_at`, `version` | The server alone creates one row inside the transaction that observes reciprocal active Interests. States: `active -> unmatched\|blocked\|closed`. It is not a friendship and does not restore after unblock. |
| `Block` | `block_id`, `blocker_id`, `blocked_id`, `created_at` | Directional storage, symmetric product effect. One row per direction. It takes precedence over profile, discovery, invite, friendship, duel, crew projection/notification, interest, match, and chat reads/writes. Unblock never restores old relationships. |
| `Report` | `report_id`, `reporter_id`, `subject_user_id`, `target_type`, `target_id`, `category`, `details`, `status`, `created_at`, internal timestamps | Reporter identity and internal status are never exposed to the subject. A stale resource receipt can be reported after block. Public creation returns a receipt only; moderation read/write is an internal safety API. |

`Profile.moderation_state`, `Crew.moderation_state`, and their text/name revision
states are `pending`, `approved`, `rejected`, or `hidden`.
`Report.status` is internal-only `received`, `triaged`, `actioned`, or
`dismissed`. `Report.category` is a bounded original vocabulary covering spam, harassment,
impersonation, threat, hate, sexual content, suspected underage use, privacy,
unsafe conduct, and other. Category labels are product routing labels, not legal
findings.

### 4.3 Supporting entities

`ProfileMedia` is required when `profileMedia` is enabled:

- fields: `media_id`, `owner_id`, `kind`, `source_media_id`,
  `moderation_state`, storage reference, dimensions, checksum, timestamps;
- `kind` is exactly `user_photo` or `ai_stylized`;
- `user_photo` means a user-declared photographic upload. It is **not** proof of
  identity, age, recency, or absence of editing;
- product-generated or product-transformed media is always `ai_stylized` and
  references its source when one exists;
- every rendition, cache record, API projection, accessibility label, and share
  surface inherits `kind`. An `ai_stylized` image always displays a visible
  `AI 스타일` badge; `user_photo` displays the non-verification label
  `업로드 사진`. Cropping or thumbnail generation cannot remove either kind;
- uploads are re-encoded, metadata including EXIF/location is removed, and
  pending media is self-only. The exact media transport, bounds, storage, and
  moderation provider remain `TBD` and block `profileMedia` rollout;
- deleting media removes every rendition and cache reference subject to the
  disclosed backup/safety retention policy.

`SocialMetricSnapshot` is a server-authored projection used by duels and crew
or friend comparison. It contains the metric version, window, frozen planned
training-day unit count, completed consistency units, personal-improvement event
count, and selected dataset/generation provenance. It contains no body
measurements, raw health records, `verifiedRatio`, or attractiveness value.

The following supporting records are normative in `1.1.0`. They do not expand
the eleven relationship/safety entities in section 4.2 and they never create a
public directory or safety-console authority.

| Supporting record | Required fields | Invariant / lifecycle |
| --- | --- | --- |
| `ProfileTextRevision` | owner, candidate revision, bounded fields, moderation state, created/decided timestamps | Initial input and edits are `pending`; only the latest approved revision may reach friend/discovery projections. `rejected` and `hidden` candidate content is self-only. |
| `CrewNameRevision` | crew, candidate revision, bounded name, moderation state, created/decided timestamps | New crews and name edits are owner-only while pending. An approved name is required before invite/member projection; a previous approved name may remain during edit review. |
| `WorkoutDatasetClaim` | opaque random dataset ID, owner, consent version, state, generation, claimed/revoked timestamps | A dataset is bound to at most one active Social account. It is never derived from device, auth, payment, `LOCAL_USER_ID`, or workout row IDs. |
| `CompetitionPreference` | owner, `competition_enabled`, `competitive_dataset_id`, version, updated timestamp | Defaults false. Eligibility requires exactly one active selected dataset; unselected claimed datasets are dormant for v1 competition transport. |
| `PolicyAcceptance` | acceptance ID, owner, policy key/version, accepted timestamp | `(owner, policy key, policy version)` is immutable and unique. A Safety/release-owned registry identifies the current version. Current acceptance is required before authored Social text or a new relationship/competition write; reads and protective rights remain available after a version bump. It is not identity, age attestation, partner opt-in, or dataset consent. |
| `SafetyAction` | subject, target type/ID/version, kind, state, reason code, decision source, internal operator/service principal, public receipt digest, start/expiry/reversal fields, timestamps | Kinds are `hide_content`, `restrict_social_writes`, or `suspend_social_access`; states transition only `active -> expired\|reversed`. Protective block/report/delete/appeal/private-or-opt-out/deletion-status routes remain available. Expiry or reversal never restores deleted relationships/content or republishes a revision automatically. |
| `Appeal` | action/version, appellant, state, submitted/acknowledged/decision timestamps, bounded statement/decision metadata | At most one active appeal per action/version. `submitted -> acknowledged -> under_review -> upheld\|modified\|reversed`; the first three states are active and the last three terminal. Reporter/operator identity and unrelated evidence remain hidden. |
| `ReportContextReceipt` | digest, reporter, internal target type/ID/version, issued/expiry timestamps | Public value is opaque; only an already-authorized reportable read may issue it. It proves target context after Block but never authorizes a new resource read. Token bounds, expiry, reuse/rate, and retention remain `TBD` rollout gates. |
| `SocialNotification` | recipient, bounded kind, internal source-event reference, state, dedupe key, created/read/expiry timestamps, version | Authenticated in-app pull only. Public items contain generic copy and no target ID, handle, content, location, workout, or score. State supports `unread`, `read`, `suppressed`, and `expired`; exact kind allow-list, retention, and badge semantics remain `TBD`. |

`POST /reports` returns a separate opaque `reportReceipt` only after durable
creation. It is not `ReportContextReceipt`, grants no read authority, has no
GET/list/history route, and is replayed only by the same idempotency key and
fingerprint while the generic ledger is retained.

### 4.4 SafetyAction effects and appeal authority

An initial or edited Profile/Crew text or profile-media moderation rejection, a
Safety hide, a write restriction, or an account suspension MUST materialize one
version-bound, appealable `SafetyAction`. Applying the moderation/action decision, suppressing
the authoritative projection, creating the action, invalidating cache, and
writing its outbox/subject notice happen in one transaction or one atomic outbox
boundary. A provider callback alone is never the public authority.

| Kind | Effect while active | Reversal rule |
| --- | --- | --- |
| `hide_content` | Suppress the exact target revision from every non-self projection. Pending/rejected content stays self-only. | Reversal asks the target aggregate owner to review an explicit restore command; it never republishes automatically. |
| `restrict_social_writes` | Deny authored Profile/Crew publication, Profile visibility expansion, discoverability enable/new scope, profile-media upload, Invite, Interest, chat send, competition enable/fact transport, and Duel create/accept. Existing authorized reads and strictly narrowing protective transitions, including private/all-off, media deletion, and competition opt-out/dataset revocation, remain. | Reversal permits future writes only; it restores no old relationship or content. |
| `suspend_social_access` | Revoke ordinary Social sessions and suppress ordinary Social reads/writes. | A verified owner may still obtain a rights-scoped path; reversal requires a new ordinary session and restores no old state. |

`GET /me` has a typed `ordinary` or `rights_only` projection. An ordinarily
authorized owner receives the account/profile/settings projection plus policy
currentness and active SafetyAction notices. When `socialCore` is killed or the
account is suspended, a verified owner receives only `rights_only`: policy
currentness, generalized active-action notices, and links/state needed for the
protective controls in section 7.3. Each notice contains an opaque
`actionReceipt`, kind, generalized reason/copy, appeal availability, and expiry
when one exists. Neither projection returns an internal action ID,
operator/service principal, reporter, evidence, or raw moderated content.
`POST /appeals` accepts the receipt, not a caller-supplied action ID.

The first appeal creation wins the database uniqueness constraint. Same
idempotency key/fingerprint replays it; concurrent or later active creation
returns `social_appeal_conflict`. `modified` atomically reverses the old action
and creates a separately versioned replacement; it does not mutate history.
A terminal appeal is not reopened. A new appeal requires an appealable replacement
action. Statement/decision bounds, retention, reviewer assignment, and response
SLO remain `TBD` release gates.

When `socialChat` is enabled, `ChatThread` is one-to-one with an active Match and
`ChatMessage` is text-only in v1 and carries an internal moderation state.
Attachments, image messages, disappearing
messages, read receipts, live location, precise place sharing, and user-typed
links are outside this contract. Message retention and moderation operations are
`TBD` release blockers; enabling a route before those values are approved is
forbidden.

## 5. Privacy, media, appearance, and comparison rules

### 5.1 No appearance scoring

Profile photos are identity-expression content, never a scoring input. The
product MUST NOT calculate, display, infer, purchase, or rank:

- attractiveness, hotness, body-shape desirability, facial quality, or a
  Hot-or-Not number;
- a candidate order based on photo taps, dwell time, likes, inferred appearance,
  or media type; or
- a comparison that rewards lower body fat, larger muscles, higher absolute
  weight, or another person's absolute strength.

The partner flow is `candidate card -> private Interest -> reciprocal Interest
-> Match -> chat when enabled`. There is no public like count. A unilateral
Interest produces no target notification and no rejection signal.

App-generated style names, media, badges, callouts, sounds, and graphics MUST be
original Reploom IP. A style implementation is configurable and must not hard-
code one AI vendor, model, or CLI as the product's only agent. User media remains
subject to rights, safety, and report handling; calling it user content does not
make third-party IP an app-owned asset.

### 5.2 Consistency and personal-improvement metric

The frozen v1 social metric identifier is
`consistency_improvement_v1`. It is intentionally separate from Combat Power.

For each 7-day comparison window:

1. Freeze the user's number of planned training-day units at window start. A
   calendar day contributes at most one planned unit even if the program has
   multiple sessions.
2. Count at most one completed consistency unit in each consecutive 24-hour
   bucket. Extra sessions in the same bucket do not increase consistency.
3. `consistency_rate_bps = floor(10000 * min(completed_units,
   planned_units) / planned_units)`. A user with zero planned units is
   `not_ranked`, not last.
4. Recompute personal improvement on the server against that same user's
   pre-window best. Count at most one improvement per exercise in the window.
   A client-supplied `is_pr`, rank, winner, or aggregate is not authoritative.
5. Comparison order is: higher consistency rate, then more completed planned
   units, then more distinct personal improvements. Equal tuples are a tie; the
   server does not invent a winner.

The UI displays the underlying numerator/denominator and improvement count, not
a universal body or person score. Unscheduled extra training does not improve
the consistency component. No global/public board or valuable reward uses this
metric in v1.

The selected-dataset rule is fixed in section 5.3. The metric still requires a
server-authoritative, idempotent workout-sync summary that does not exist at the
repository baseline. Its payload, revision/barrier/rebaseline, correction,
retention, and conformance contract is `TBD` and blocks Duel results and social
comparison. Until that dependency exists, clients may show social graph fixtures
only in an explicitly labeled development environment and must not publish a
winner.

`verifiedRatio`, its trust multiplier, Combat Power, grade, body weight, body
fat, photo kind, and health-platform connection state are excluded from the
formula, tie-breaks, candidate order, and real-person rank. A future provenance
or anti-cheat system requires a separate versioned contract and bias review.

### 5.3 Explicit workout-dataset binding

`LOCAL_USER_ID = 'local'` remains the permanent on-device workout owner and is
never rewritten to `social_user_id`. A client creates an opaque random
`local_dataset_id` only as part of an explicit, versioned record-connection
consent. Account creation, sign-in, or Social navigation never uploads history.

- One dataset may be claimed by at most one active Social account. A conflicting
  claim returns `409 social_local_dataset_conflict`; the server does not merge or
  silently reassign it.
- One account may explicitly claim multiple datasets, but Social v1 competition
  requires exactly one selected `competitive_dataset_id`. Only that selected
  dataset may upload workout/program facts used by comparison or Duel; every
  other claim is dormant for competition transport.
- The selected-device limitation must be shown before enabling competition and
  before Duel create/accept. Workouts logged on another installation do not count.
- The selection cannot change while a Duel is pending or active. A later change
  requires the old dataset checkpoint, a complete selected-dataset rebaseline,
  and `competitionEnabled=false` until readiness is re-established.
- Competition opt-out and consent withdrawal are protective transitions, not a
  selection change. They remain available during capability kill, stale policy,
  write restriction, or suspension. Disabling competition or revoking the
  selected claim atomically stops transport, cancels every pending/active Duel
  without a winner, hides comparison projections, and resets readiness. Local
  rows remain intact; remote purge follows the approved finite policy.
- Content/time similarity never auto-merges workouts across datasets. Account-wide
  multi-device scoring requires a later deterministic correlation/dedup contract.
- Sign-out pauses transport but preserves local rows. Social deletion leaves
  local workouts and subscription state untouched and creates a local
  `do_not_resync` state so re-registration cannot silently upload old history.

The minimum sync payload bounds, revision/barrier protocol, correction policy,
finite retention, and server conformance fixtures remain `TBD`; therefore
`socialCompetition` remains false until those separate gates are approved.

## 6. Nearby and partner-discovery privacy

### 6.1 Adult eligibility

Partner discovery is available only when all are true:

1. `socialCore` and `partnerDiscovery` are effective on both client and server;
2. the user explicitly attests that they are at least 18 under the current
   attestation text/version;
3. the user separately turns partner discovery on; and
4. a current manual `area_code` or `venue_id` is selected.

Self-attestation is not age verification and the UI MUST NOT label the person
`age verified`. Date of birth is not required or stored by this contract. The
server rechecks both users' current eligibility, opt-in, and block state at
candidate read, Interest creation, reciprocal Match creation, and chat
authorization. Revoking opt-in immediately removes the user from discovery,
withdraws unmatched Interests, and stops new chat reads/writes. Existing
Matches remain visible read-only until explicit unmatch or block; the opt-out UI
must explain that consequence.

### 6.2 Manual location only

- `area_code` is a server-curated coarse area identifier selected by the user.
  It is not a postal address or free-form home location.
- `venue_id` is a server-curated public training-venue identifier selected by
  the user. It never means that the user is currently present.
- Nearby queries accept only `scope=area|venue` and use the caller's stored
  selection. They reject arbitrary coordinates, radius, distance, area code, or
  venue impersonation in the query.
- V1 candidate ordering is a rotating, non-appearance order inside the selected
  exact scope. It never uses distance, last-seen time, media engagement, Combat
  Power, or `verifiedRatio`.
- Candidate responses do not expose GPS, distance, live status, movement, home,
  prior selections, or cohort counts. Sparse-cohort suppression requires an
  approved minimum cohort value; that value is `TBD` and blocks
  `partnerDiscovery` rollout.

V1 does not need or request OS location permission. If a reused or later client
arrives from a denied, restricted, unavailable, or skipped location-permission
state, it MUST show the same manual area/venue selector and keep non-location
social features usable.

The client, social API, database, logs, analytics, traces, media metadata, and
backups MUST NOT store or derive exact latitude/longitude, accuracy, GPS fixes,
geohashes, background location, real-time presence, travel routes, visit
history, home location, or IP-derived area. Changing a manual selection
overwrites the current application value; application audit records contain
only that a selection changed, never the old or new `area_code`/`venue_id`.
Encrypted backups may temporarily contain the value that was current when a
backup was taken only under the approved finite backup-retention policy. That
period is `TBD`, must be disclosed, and blocks partner rollout; backups cannot
be queried as a location-history product.

## 7. Relationship and safety behavior

### 7.1 Friends, duels, and crews

- Friend request acceptance creates Friendship and consumes the Invite in one
  transaction. Decline/revoke/expiry creates no Friendship.
- Duel creation produces a pending Duel, not a generic Invite. Only the named
  opponent accepts or declines. Block or account deletion cancels and hides an
  active Duel without declaring a winner.
- Competition opt-out or selected-dataset consent withdrawal likewise cancels
  every pending/active Duel without a winner. Switching to another selected
  dataset remains forbidden until those Duels are terminal.
- Crew membership is granted only by accepting a crew Invite. Moderators may
  invite and remove members but cannot transfer ownership, promote another
  owner, or read private safety reports.
- An owner cannot normally leave before transfer. Account deletion remains an
  unconditional right: any still-owned crew is archived transactionally before
  that owner is removed. The UI warns and offers transfer first.
- Blocked users may remain members of the same crew so blocking cannot be used
  to evict an owner or moderator. They are removed from each other's member
  projection, direct notification, duel, profile, and interaction surfaces;
  safety staff retain a separate internal moderation view.

### 7.2 Interest, Match, and chat

- Interest can target only a currently eligible candidate returned by the
  caller's partner-discovery scope.
- Reciprocal Interest creation and the unique Match insert happen atomically.
  Concurrent reciprocal requests create one Match and no duplicate
  notification.
- Match creation is server-only. Either participant may unmatch. Blocking has
  priority and closes the Match and chat authorization.
- `socialChat` requires an active Match, two currently authorized participants,
  no block, and effective server capability. Turning the kill switch off blocks
  new reads/writes without deleting evidence or claiming deletion.
- Unmatching or blocking prevents new messages immediately. Unblock never
  restores Match, Interest, Friendship, Invite, Duel, or chat state.

### 7.3 User rights

ME > Privacy & Safety MUST provide:

- block, unblock, and a private block list;
- report from profile, Invite, Duel, Crew member, Match, and message context;
- social account deletion independent of Pro status;
- profile `private` control;
- separate friend-search, nearby/partner, and crew-invite discoverability
  opt-outs; and
- media deletion plus a clear `AI 스타일` explanation when media is enabled.

Block authorization takes effect before the response returns. It cancels
pending direct Invites, active Interests, Friendship, Duel, Match, and unsent
direct notifications in one transaction or through an outbox committed
atomically with the block. A notification already delivered cannot be recalled.
Every downstream consumer rechecks block state; a stale search index or queued
notification cannot authorize new access.

Account deletion requires recent reauthentication from the configured auth
service. The exact freshness window is `TBD`. A valid delete request immediately
sets `SocialAccount.status = deleting`, revokes social sessions, suppresses the
profile, clears discoverability, stops chat, and queues removal of graph rows,
memberships, media, and authored content. Retry returns the same deletion job;
GET cannot auto-provision the account. `GET /account/deletion` returns the
authenticated caller's deletion status without requiring an active
subscription.

Safety report evidence, block abuse-prevention records, chat evidence, backups,
and deleted-auth-subject re-registration controls may be retained only for an
approved, disclosed, finite policy. Exact periods and deletion SLO are `TBD`.
Indefinite retention and unconditional deletion of active safety evidence are
both forbidden until that policy is approved. These unresolved values block all
public social rollout, not local logging.

## 8. REST API contract

Base path: `/social/v1`

All public routes, including bootstrap, require the configured authenticated
gateway. JSON is UTF-8. Server timestamps and IDs are
authoritative. Collection responses use opaque cursors; clients do not infer
counts from cursor shape. Every request gets a non-secret `requestId` response
field/header for support correlation.

### 8.1 Account, profile, media, and discovery

| Method and path | Purpose | Capability / authority |
| --- | --- | --- |
| `GET /bootstrap` | Effective capabilities plus account-exists state | Verified auth; no auto-provision |
| `POST /account` | Explicitly create SocialAccount/Profile/AuthBinding | Verified auth without active account; idempotency required |
| `GET /me` | Typed `ordinary` account/profile/settings or kill/suspension-safe `rights_only` projection | Self; response mode follows guard state; no internal operator/reporter/evidence fields |
| `PATCH /me/profile` | Change bounded profile fields | State-dependent: ordinary authored/media/visibility-expanding changes require `socialCore`, current policy, and Safety write eligibility; rights-first is allowed only for `visibility=private` with no other field; mixed payload is rejected; `If-Match` required |
| `PUT /me/discoverability` | Replace all discoverability/attestation selections | State-dependent: rights-first only when every discoverability boolean is false, partner scope is `off`, and area/venue is cleared; any enable, attestation, or new scope/selection is ordinary and guarded; mixed narrowing/expanding payload is not treated as protective; naturally idempotent |
| `PUT /me/policy-acceptances/{policyKey}` | Accept one exact current Social policy version | Self; naturally idempotent; version mismatch requires fresh acceptance |
| `POST /me/workout-datasets` | Explicitly claim one consented local dataset | Self + advertised `socialCompetition` + current policy + Safety write eligibility; idempotency required; never automatic |
| `GET /me/workout-datasets` | Read own claim/readiness projections | Self; opaque IDs only |
| `DELETE /me/workout-datasets/{datasetId}` | Revoke own claim and begin remote purge | Owner protective transition; retry-safe under kill/policy/action state; selected revoke disables competition and cancels pending/active Duels without a winner; local rows unchanged |
| `PUT /me/competition-preferences` | Replace competition opt-in and selected dataset | State-dependent: enable/select/switch requires advertised `socialCompetition`, current policy, Safety write eligibility, and one active claim; false/clear is rights-first and cancels pending/active Duels without a winner; switch remains forbidden while either Duel state exists |
| `POST /me/media` | Create a declared profile-media upload | Self + `profileMedia`; idempotency required |
| `DELETE /me/media/{mediaId}` | Remove owned media and renditions | Owner; repeated call is success |
| `GET /profiles/{socialUserId}` | Authorized profile projection | Self/friend or explicit minimal discovery projection; block first |
| `GET /discover/friend?q={exactHandle}` | Exact-handle friend lookup | Target opted into friend search; no fuzzy/global browse |
| `GET /discover/nearby?scope=area\|venue` | Partner candidates in caller's stored manual scope | `partnerDiscovery`, adult opt-in, sparse-cohort gate, block first |
| `DELETE /account` | Start social account deletion | Self + recent auth; retry-safe and subscription-independent |
| `GET /account/deletion` | Read own deletion-job state | Same verified auth binding; no auto-provision |

`PATCH /me/profile` cannot change identity binding, account status, media kind,
adult state, or another user's data. `PUT /me/discoverability` rejects latitude,
longitude, radius, live-presence, address, and history fields.

Rights-first classification uses the validated resulting command, never the
route name alone. A Profile request is protective only when its sole mutation is
`visibility=private`. A Discoverability request is protective only when the
entire replacement is all-off/cleared. An authored-field change, visibility
expansion, any true opt-in, new attestation/scope/selection, or mixed payload is
ordinary; under a kill/stale policy/restriction/suspension it fails without
partially applying the narrowing fields.

Contract `1.1.0` does not yet freeze the session/program/barrier transport DTOs
or paths. A later API-contract amendment may add them only with effective
`socialCompetition`, current PolicyAcceptance, Safety write eligibility, and
selected dataset/generation guards. Correction tombstones and purge remain
protective even when ordinary transport is closed.

### 8.2 Friends, Invites, Duels, Crews, and Memberships

| Method and path | Purpose | Capability / authority |
| --- | --- | --- |
| `GET /friends` | Accepted friendships | Self |
| `DELETE /friends/{friendshipId}` | Remove own friendship | Either participant; retry-safe |
| `GET /invites?box=incoming\|outgoing` | Own active Invite projections | Named participant only |
| `POST /invites` | Create friend or crew Invite | Friend: inviter; Crew: owner/moderator; idempotency required |
| `POST /invites/redeem` | Redeem one external token without putting it in a URL | Authenticated target; token redacted; idempotency required |
| `POST /invites/{inviteId}/accept` | Accept pending target-bound Invite | Invitee only; idempotency required |
| `POST /invites/{inviteId}/decline` | Decline pending Invite | Invitee only; idempotency required |
| `DELETE /invites/{inviteId}` | Revoke outgoing pending Invite | Inviter or authorized crew role; retry-safe |
| `GET /duels` / `GET /duels/{duelId}` | Participant Duel projections | Named participants + `socialCompetition`; both preferences and current visibility/readiness |
| `POST /duels` | Create pending 7-day Duel | Challenger + `socialCompetition`; both opted in and dataset/sync/metric ready; active friend; idempotency required |
| `POST /duels/{duelId}/accept` | Start Duel and freeze metric inputs | Opponent + `socialCompetition`; recheck both preferences/readiness; idempotency required |
| `POST /duels/{duelId}/decline` | Decline pending Duel | Opponent only; protective decline remains available after competition kill |
| `DELETE /duels/{duelId}` | Cancel pending/active Duel with no winner | Participant according to state; protective cancel remains retry-safe after competition kill |
| `GET /friends/{friendshipId}/comparison` | Two-person consistency/improvement projection | Either participant + `socialCompetition`; both preferences and dataset/sync/metric readiness |
| `GET /crews` / `GET /crews/{crewId}` | Own crew list/detail | Active member only |
| `POST /crews` | Create private crew and owner membership | Self; idempotency required |
| `PATCH /crews/{crewId}` | Change bounded crew fields | Owner; `If-Match` required |
| `DELETE /crews/{crewId}` | Archive crew | Owner; retry-safe |
| `GET /crews/{crewId}/members` | Authorized member projection | Active member; block-filtered |
| `GET /crews/{crewId}/comparison` | Crew consistency/improvement projection | Active member + `socialCompetition`; own preference/readiness and approved member-projection policy |
| `PATCH /crews/{crewId}/members/{membershipId}` | Change moderator/member role or transfer owner | Owner only; `If-Match` required |
| `DELETE /crews/{crewId}/members/{membershipId}` | Leave or remove member | Self leaves; owner/moderator removes within role limits |

### 8.3 Interest, Match, chat, Block, and Report

| Method and path | Purpose | Capability / authority |
| --- | --- | --- |
| `PUT /interests/{targetSocialUserId}` | Create/retain private Interest | Eligible opted-in candidate; naturally idempotent |
| `DELETE /interests/{targetSocialUserId}` | Withdraw own Interest | Sender; retry-safe |
| `GET /matches` / `GET /matches/{matchId}` | Own Match projections | Participant only |
| `DELETE /matches/{matchId}` | Unmatch | Either participant; retry-safe |
| `GET /matches/{matchId}/messages` | Read Match thread | Active participants + `socialChat`; block first |
| `POST /matches/{matchId}/messages` | Send v1 text message | Active participants + `socialChat`; idempotency required |
| `DELETE /matches/{matchId}/messages/{messageId}` | Remove own message from normal participant view | Author; safety retention may remain per disclosed policy |
| `GET /blocks` | Own private block list | Blocker only |
| `PUT /blocks/{targetSocialUserId}` | Block and trigger precedence effects | Blocker; naturally idempotent |
| `DELETE /blocks/{targetSocialUserId}` | Unblock without restoration | Blocker; retry-safe |
| `POST /reports` | Create safety report from `reportContextReceipt` and return `reportReceipt` | Authenticated reporter; idempotency required; target body ID is not authority |
| `POST /appeals` | Create one appeal from an opaque own `actionReceipt` | Authenticated subject; idempotency required; action ID is not caller authority |
| `GET /appeals/{appealId}` | Read own generalized appeal state | Appellant only; no reporter/operator/evidence disclosure |
| `GET /me/notifications` | Read own generic in-app inbox page | Recipient only; current suppression filter |
| `GET /me/notifications/{notificationId}` | Resolve a currently authorized safe destination | Recipient only; current Block/privacy/membership/capability recheck; generic 404 |
| `PATCH /me/notifications/{notificationId}` | Change own notification read state | Recipient only; `If-Match` required; retry-safe |

Every authorized Profile, Invite, Duel, Crew-member, Match, and message projection
includes an opaque `reportContextReceipt`. Block removes resource read authority
but does not invalidate the receipt's report-only purpose. Exact token bounds,
expiry, reuse/rate, and client handoff retention remain rollout blockers. Neither
receipt may appear in URLs, ordinary logs, analytics, or notifications.

There is no public report GET/list/history route. Internal report triage,
evidence, SafetyAction decision, and audit routes are not exposed under the
public base path. Crew roles do not grant safety-console access. Public appeal
routes expose only the appellant's generalized appeal state.

Notification list/detail responses contain only opaque notification ID, bounded
kind, generic copy key, created/read state, and a server-approved destination.
They contain no source target ID or content. Opening an item never substitutes
for the destination route's authorization. V1 has no OS push-token,
permission-registration, or remote-push endpoint.

### 8.4 Error envelope and stable codes

Errors use:

```json
{
  "error": {
    "code": "social_resource_not_found",
    "message": "The requested social resource is unavailable.",
    "requestId": "<opaque-support-id>"
  }
}
```

`message` is safe display copy, not an authorization oracle. Optional `details`
contains only field names or retry metadata; it never contains `auth_subject`,
`actor_key`, raw invite token, handle, report/message text, media URL,
`area_code`, `venue_id`, or the target's eligibility/block state.

| HTTP | Stable code | Meaning |
| ---: | --- | --- |
| 400 | `social_invalid_request`, `social_invalid_area`, `social_invalid_media_kind` | Malformed or disallowed fields; strict DTO rejection |
| 401 | `social_auth_required`, `social_auth_invalid`, `social_auth_expired` | Missing/invalid configured authentication |
| 403 | `social_permission_denied`, `social_adult_opt_in_required`, `social_recent_auth_required`, `social_competition_disabled` | Self-scoped denial that does not reveal another person's state |
| 404 | `social_resource_not_found`, `social_feature_disabled` | Missing, blocked, private, ineligible, or disabled target is masked |
| 409 | `social_state_conflict`, `social_handle_taken`, `social_version_conflict`, `social_idempotency_conflict`, `social_request_in_progress`, `social_owner_resolution_required`, `social_local_dataset_conflict`, `social_competition_not_ready`, `social_appeal_conflict` | Current state cannot accept the transition |
| 410 | `social_invite_expired`, `social_invite_revoked`, `social_account_deleted` | Known caller-owned resource is no longer actionable |
| 413 | `social_payload_too_large` | Bounded content/media size exceeded |
| 415 | `social_content_type_unsupported` | Unsupported media type |
| 422 | `social_moderation_rejected`, `social_policy_acceptance_required` | Valid request cannot proceed until moderation or current-policy precondition is satisfied |
| 429 | `social_rate_limited` | Abuse/cost limit; includes `Retry-After` |
| 503 | `social_unavailable` | Safe server failure; local logging remains usable |

Target privacy, block, opt-out, moderation, or underage suspicion always maps to
the generic 404 projection for other users. The API never confirms which guard
failed.

### 8.5 Authentication and authorization matrix

| Resource/action | Allowed actor | Required guards |
| --- | --- | --- |
| Create account | Verified auth binding with no active account | Issuer/audience/subject verified; deletion/re-registration policy |
| Profile authored/visibility-expanding write | Self | `socialCore`; exact current PolicyAcceptance; Safety write eligibility; content moderation; version authority |
| Profile private-only transition | Self | Rights-first only for sole `visibility=private`; no authored/media/mixed field; version authority |
| Discoverability enable/new selection | Self | `socialCore`; exact current PolicyAcceptance; Safety write eligibility; current catalog/attestation authority |
| Discoverability all-off/clear | Self | Rights-first only when every flag is false, scope is off, area/venue cleared; no mixed expansion |
| Own Media/account delete | Self | Media upload uses ordinary guards; media/account delete is protective; recent auth for account deletion |
| Authored Crew/media/chat write | Self/authorized Crew role | Exact current PolicyAcceptance; Safety write eligibility; content moderation; target/version authority |
| Other Profile read | Accepted friend, or minimal explicit discovery projection | Profile/surface visibility, moderation, Block first |
| Friendship remove | Either participant | Active pair |
| Invite create/revoke | Inviter; owner/moderator for crew | Current PolicyAcceptance to create; target visibility, role, rate limit, no Block; protective revoke remains available |
| Invite accept/decline | Named invitee or authenticated token redeemer | Current PolicyAcceptance to accept; pending, unexpired, one-time, target match; protective decline remains available |
| Duel create | Challenger | Current PolicyAcceptance; `socialCompetition`; both preferences and dataset/sync/metric readiness; active Friendship; no Block |
| Duel accept/result read | Named opponent / either participant | Current PolicyAcceptance to accept; `socialCompetition`; rechecked preferences/readiness/state; result server-only |
| Duel decline/cancel | Named participant | Protective transition remains available when competition is killed; no winner |
| Crew read | Active member | Block-filtered projection |
| Crew role/ownership/archive | Owner | Current PolicyAcceptance for new role/transfer; version check; exactly one owner; protective archive remains available |
| Crew invite/remove | Owner/moderator within role limits | Current PolicyAcceptance to invite; active membership and no privilege escalation; protective remove/leave remains available |
| Interest create/withdraw | Sender | Current PolicyAcceptance to create; both adult/opted-in/current-scope eligible; no Block; protective withdraw remains available |
| Match create | Server transaction only | Reciprocal active Interests and unique pair |
| Match read/unmatch | Participant | Active/visible state and Block first |
| Chat read/write | Active Match participant | `socialChat`, both authorized, no Block |
| Claim dataset | Self | Advertised `socialCompetition`; exact current policy; Safety write eligibility; explicit consent; unique active owner |
| Read dataset/sync status | Self | Owner projection; generic masking; available to explain and exercise protective choices |
| Upload session/program/barrier facts | Self | Effective `socialCompetition`; exact current policy; Safety write eligibility; selected dataset/generation; revision/hash/bounds |
| Revoke dataset/purge | Self | Rights-first protective transition; selected revoke disables competition, cancels pending/active Duels without a winner, and leaves local rows intact |
| Enable/select/switch competition | Self | Advertised `socialCompetition`; exact current policy; Safety write eligibility; exactly one selected active dataset; switch guard/rebaseline |
| Disable/clear competition | Self | Rights-first protective transition independent of capability/policy/action state; stop transport, cancel pending/active Duels without a winner, hide comparisons, reset readiness |
| Block/unblock/list | Blocker | Target cannot be self; list is private |
| Report create | Authenticated reporter | Bound, unexpired `reportContextReceipt`; allowed after block; raw target ID is not authority |
| Appeal create/read | SafetyAction subject/appellant | Own appealable action; one active appeal; generalized state only |
| Notification list/read-state | Recipient | `socialCore`; current suppression and recipient ownership |
| Notification destination resolve | Recipient | Current source authorization and Block/privacy/capability recheck |
| Report triage/action | Internal safety role only | Separate service role and audit; never crew moderator |

Every row is enforced at the controller, domain-service, and repository query
boundary. Tests must attempt horizontal and vertical IDOR, not only hide UI.
PolicyAcceptance, adult attestation, partner opt-in, dataset consent, and
competition opt-in are independent records and never substitute for one another.
A policy version bump preserves reads and protective block/report/delete/appeal/
private-or-opt-out/deletion-status writes while returning
`social_policy_acceptance_required` for newly gated writes.

### 8.6 Idempotency and concurrency

- Every state-changing `POST` above requires `Idempotency-Key`. The key is an
  opaque client-generated value and is scoped to authenticated identity (or
  `social_user_id` after provisioning), HTTP method, canonical path, and key.
- The server stores a request fingerprint and complete status/response in the
  same transaction or atomic outbox boundary as the domain write for a MINIMUM
  of 24 hours.
- Same key plus same fingerprint replays the original status/body with no new
  notification or write. Same key plus different fingerprint returns
  `409 social_idempotency_conflict`. A concurrent duplicate produces one effect
  and then replay, or `409 social_request_in_progress` with retry guidance.
- Clients reuse the same key after timeout, connection loss, 408, 429, or 5xx.
  They do not rotate keys to force a second effect.
- `PUT` and `DELETE` are state-idempotent. Repetition returns the current state
  or success and does not duplicate outbox notifications.
- `PATCH` requires `If-Match`/entity version. A stale version returns
  `409 social_version_conflict`; last-write-wins is forbidden for profile,
  crew, role, and privacy controls.
- Pair uniqueness, one owner, one Match, one active Interest direction, and
  one-time token redemption remain database constraints even after the
  idempotency ledger expires.
- Social idempotency storage is separate from the subscription Worker's
  `actor_key`/request ledger and does not reuse its code, key, or deletion path.

## 9. Feature capability contract

The typed, vendor-neutral capability keys are exactly:

```ts
interface SocialCapabilities {
  socialCore: boolean;
  socialCompetition: boolean;
  partnerDiscovery: boolean;
  profileMedia: boolean;
  socialChat: boolean;
}
```

Effective capability is the intersection of build support and a validated
server response. Missing config, unknown schema version, parse failure, expired
bootstrap, offline first launch, or server error resolves false. A cached true
cannot outlive its signed/validated expiry. Client capability controls rendering;
the server independently enforces the same capability on every route.

Dependencies:

- `socialCore` is the master gate for account, text profile, friends, private
  crews, and the generic pull inbox. Protective rights UI/API is a separate
  authenticated rights plane and is not gated by `socialCore`.
- An advertised `socialCompetition=true` requires `socialCore` plus approved
  sync/metric/safety infrastructure. Per-account competition becomes effective
  only with `competitionEnabled=true`, exactly one active selected competitive
  dataset, current policy, Safety write eligibility, supported sync/metric
  versions, and readiness. Effective competition gates Duel create/accept/result,
  friend comparison, crew comparison, and active workout transport together.
  Setup claim/enable uses the advertised key without circularly requiring an
  already-selected dataset. Disable/clear, dataset revoke/purge, correction
  tombstones, and Duel decline/cancel are protective transitions outside it.
- `profileMedia` requires `socialCore`.
- `partnerDiscovery` requires `socialCore`, current 18+ self-attestation,
  explicit opt-in, manual scope, and every safety release gate.
- `socialChat` requires `socialCore`, `partnerDiscovery`, an active Match, and
  approved chat retention/moderation operations.

For the current Version 1.0 release/review track, all five effective values MUST
remain false or absent. In a later release, `socialCore` may open friends/crews
while competition, partner discovery, media, and chat remain false. Turning any
capability off never disables local logging or authenticated owner access to
block, report, appeal, profile-private/discoverability-off, media deletion,
competition disable/dataset revoke, account deletion, or deletion-status
controls. Missing/invalid/expired `socialCompetition` always fails closed for
setup and active competition writes; there is no separate `duels` capability.

Guard order is fixed: verify external authentication; resolve the account and
Block/deleting/suspended state; allow an authenticated owner to enter an
applicable protective rights route; then apply capability, PolicyAcceptance,
SafetyAction, relationship, and resource guards to ordinary routes. A capability
or active suspension cannot intercept the protective rights lane first.

## 10. File and lane ownership

The backend paths below are **planned ownership paths**; `server/` does not
exist at the baseline. Creating its strict-TypeScript NestJS/PostgreSQL scaffold
or adding dependencies is separate implementation work and is not authorized by
this document commit. Social code must not be placed in the JavaScript
subscription Worker as a shortcut.

| Lane | Exclusive paths / responsibility | Shared integration files |
| --- | --- | --- |
| Client | `src/app/(tabs)/social.tsx`; `src/features/social/**`; Social API DTO/client/cache; skin-token UI; manual area/venue picker; accessibility | One integration owner edits `src/app/(tabs)/_layout.tsx`, TRAIN/History entry wiring, `settings.tsx`, and `src/i18n/locales/*.json` |
| Backend core | planned `server/src/social/core/**`, `server/src/social/http/**`, `server/src/social/persistence/**`, `server/test/social/core/**`, and core social migrations | One backend integrator owns module registration, auth adapter, transaction/outbox boundary, and generated API contract |
| Safety/release | planned `server/src/social/safety/**`, `server/test/social/safety/**`, client block/report/delete/media-provenance controls, moderation operations, privacy/terms/data/support sources | Safety owns the runtime PolicyRegistry/action adapters and composite `GET /me`; one release owner alone edits the manifest-fixed policy-registry config, `app.json`, `store.config.json`, store listing/checklist, and public policy for the next release |

Additional rules:

- `worker/src/index.js`, `worker/migrations/0001_ai_subscription_quota.sql`,
  `src/features/subscription/**`, and native StoreKit identity code are outside
  all social lanes.
- `docs/social-v1-contract.md` remains the cross-lane source of truth. A schema
  or API change requires a contract-version change and dual-write rationale.
- Shared files have one integrator at a time. Parallel lanes do not each patch
  tab layout, locale JSON, root app config, or module registration.
- The Sync lane is the sole command owner for `WorkoutDatasetClaim` and
  `CompetitionPreference`; Competition consumes a read-only readiness port and
  cannot write either aggregate. Identity supplies its `/me` query fragment but
  does not bind the route; the Safety HTTP adapter composes the only public
  `GET /me`.
- All TypeScript is strict. Product and tooling paths work from clean installs
  on Windows and macOS; no `/bin/*`, personal file, developer-repo-relative
  dependency, or bash-only production script is accepted without paired
  platform support.
- This contract adds no package dependency. A later dependency proposal must
  name its clean-install and Windows/macOS route and receive separate approval.

## 11. Analytics events and product metrics

### 11.1 Collection boundary

Current public sources promise no third-party analytics SDK. Social v1 therefore
uses no third-party analytics dependency. Domain lifecycle metrics are computed
from first-party server state; optional client UX events require updated,
approved privacy/store disclosure before collection and default off when config
is absent.

Allowed event envelope fields are event name/version, UTC time, app/build
version, platform, effective capability cohort, surface enum, outcome enum,
HTTP status class/error code, and a bounded latency bucket. The following are
forbidden in event payloads and event names:

- `auth_subject`, `auth_issuer`, `actor_key`, raw `social_user_id`, target pairs,
  handle, display name, bio, search text, invite token, or media URL;
- `area_code`, `venue_id`, coordinate, distance, IP-derived area, or previous
  manual selection;
- photo/media bytes, media checksum, message/report text, category free text,
  health/workout/body values, Combat Power, or `verifiedRatio`.

### 11.2 Frozen event vocabulary

| Event | Allowed dimensions |
| --- | --- |
| `social_surface_viewed` | `surface = friends\|nearby\|crew`, capability cohort |
| `social_profile_completed` | outcome only |
| `social_friend_invite_created`, `social_friendship_accepted` | channel enum, outcome |
| `social_duel_started`, `social_duel_completed` | metric version, outcome/tie; no score values |
| `social_crew_created`, `social_crew_joined`, `social_crew_left` | outcome only |
| `social_discoverability_changed` | surface enum, enabled boolean; no location value |
| `social_interest_created`, `social_match_created`, `social_chat_started` | outcome and capability cohort only |
| `social_block_created`, `social_report_submitted` | surface enum and outcome; no target/category/details |
| `social_policy_accepted`, `social_appeal_submitted`, `social_appeal_completed` | policy-key enum or outcome only; no action/reason/evidence |
| `social_account_delete_requested`, `social_account_delete_completed` | outcome and latency bucket |
| `social_api_result` | route template, method, status class, stable error code, latency bucket |

Events are emitted after the durable domain transition, never before. Retry and
replay do not emit a second lifecycle event.

### 11.3 Metric definitions

Targets are `TBD`; no success threshold is fabricated before a baseline. The
formulas are fixed so later targets are comparable:

- **Profile activation rate:** new active social accounts that complete Profile
  and one friend/crew action within 7 days / all new active social accounts in
  the same eligible cohort.
- **Friend acceptance rate:** accepted friend Invites / delivered, non-revoked
  friend Invites whose acceptance window ended in the measurement period.
- **Crew join rate:** accepted crew Invites / delivered, non-revoked crew
  Invites whose acceptance window ended in the period.
- **Partner mutual-interest rate:** Matches created / accounts that created at
  least one Interest, measured only where `partnerDiscovery` was effective.
- **Match-to-chat rate:** Matches with at least one authorized message / active
  Matches, measured only where both `partnerDiscovery` and `socialChat` were
  effective.
- **Safety action rate:** blocks, reports, and Appeals per active Match and per active
  social account. These are guardrails and investigation signals, not a goal to
  maximize or minimize without qualitative review.
- **Privacy-control completion:** successful privacy/opt-out/block/delete state
  transitions / valid user attempts, with error code and latency distribution.
- **Reliability:** API result count by status class, route template, capability
  cohort, and latency bucket; social failures are paired with a local-log
  regression check.
- **Workflow efficiency:** observed steps, elapsed time, abandonment point, and
  error count for friend invite/accept, crew create/join, manual nearby setup,
  Interest-to-Match-to-chat, block/report, and account delete.

An operational dashboard must display denominator, window, flag cohort, and
schema/metric version. A count without those fields is not product evidence.

## 12. Verification contract

### 12.1 Function verification

Implementation is function-verified only when all applicable checks execute:

- strict DTO/schema tests for every entity, enum, forbidden location field, and
  error envelope;
- migration up/down or forward/rollback rehearsal on a clean database and an
  upgrade fixture, including foreign keys and unique pair constraints;
- every state transition and illegal transition for Invite, Duel, Crew,
  Membership, Interest, Match, Block, Report, PolicyAcceptance, SafetyAction,
  Appeal, notification, media, and deletion;
- the complete authorization matrix, including horizontal/vertical IDOR and
  generic 404 masking;
- Profile private-only and Discoverability all-off command classification at
  controller/domain/repository boundaries; authored/enable/mixed payloads never
  borrow the rights lane or partially apply under kill/policy/action denial;
- idempotency same-body replay, different-body conflict, concurrent duplicate,
  notification dedupe, and ledger-expiry invariant tests;
- reciprocal Interest race creates exactly one Match;
- dataset claim conflict, explicit consent, exactly-one selected competition
  dataset, concurrent selection, own-but-dormant upload rejection, account
  switch, pending/active Duel switch rejection, kill/stale-policy/restrict/
  suspend upload rejection, rights-first disable/revoke cancellation,
  rebaseline, purge, and no-auto-upload behavior;
- `reportContextReceipt` viewer/target/type/version swap, tamper, expiry,
  cross-account, block-then-report, and separation from `reportReceipt`;
- notification retry/dedupe, unilateral Interest zero-item, recipient IDOR,
  current-authz open, Block/private/delete suppression, and OS-push-call zero;
- policy registry/current/superseded version, immutable acceptance uniqueness,
  independent adult/dataset/partner consent, and protective-rights exemption;
- SafetyAction target/version/effect and atomic suppression, subject/operator/
  reporter IDOR, opaque action receipt, one-active-Appeal race/idempotency,
  modified replacement, terminal no-reopen, and reversal no-auto-restore;
- block precedence reaches profile, search, nearby, Invite, Friendship, Duel,
  Crew projection/notification, Match, and chat;
- all capability dependencies and missing/invalid/offline fail-closed cases on
  both client and server;
- partner eligibility is rechecked at discovery, Interest, Match, and chat;
- denied/unavailable location permission reaches the manual selector without a
  GPS request or local-log failure;
- account delete suppresses immediately, retries safely, does not auto-recreate,
  and does not change subscription quota or local workout rows; and
- social backend unavailable while TODAY/TRAIN/+LOG still save locally.

### 12.2 Quality verification

Quality is verified separately from function execution:

- TypeScript strict, lint, unit, integration, API-contract, and migration checks
  pass with no new unapproved dependency;
- auth/log/analytics scans find zero forbidden identifiers or content fields;
- media fixtures prove metadata removal and `ai_stylized` label propagation
  through upload, thumbnail, cache, accessibility, share, and delete;
- block/report/delete negative-path and abuse/rate-limit tests pass;
- every visible string is localized and every action is screen-reader and
  keyboard reachable where the platform supports it;
- SOCIAL and ME render only through existing skin tokens/primitives, and Release
  screenshots are visually inspected across supported skins and text sizes;
- clean install, scripts, tests, and server startup are exercised on both
  Windows and macOS; an untested platform is named, never implied verified;
- iOS and Android client behavior is checked separately; and
- a privacy/safety review resolves the finite retention, sparse cohort, auth,
  media, chat, and store-declaration gates before the corresponding capability
  is enabled.

Passing tests alone proves neither visual quality nor product usefulness.

### 12.3 Product/workflow verification

Product/workflow verification requires consenting test users to complete, on a
release candidate connected to the intended backend:

1. account creation, private profile, exact-handle friend invite, and acceptance;
2. private crew creation, invite, join, role boundary, leave, and owner handling;
3. explicit workout-dataset claim, selected-device disclosure, default-off
   competition opt-in, comparison/Duel readiness, second-device exclusion,
   pending/active Duel switch rejection, kill-state opt-out/selected revoke with
   no-winner cancellation, and post-switch rebaseline;
4. manual area/venue selection from denied/skipped permission state;
5. 18+ self-attestation and partner opt-in, private Interest, reciprocal Match,
   and chat when both flags are on;
6. unmatch, block, report, appeal, private-profile change, discoverability
   opt-out, media deletion, and social account deletion; and
7. policy-version bump, generalized SafetyAction notice, Appeal creation/status/
   outcome, active suspension, and rights access without internal disclosure or
   automatic content/relationship restoration; and
8. local workout/meal logging throughout social network failure and feature
   kill-switch changes.

Record steps, elapsed time, errors, capability cohort, and task outcome without
recording sensitive content or location identifiers. Product success is not
claimed until the observed metrics have approved targets and the real flows meet
them. A fixture, simulator-only flow, unit test, or server 200 alone is not
product/workflow verification.

## 13. Numeric classifications

| Number | Classification | Binding meaning |
| --- | --- | --- |
| `18+` | `MIN` | Minimum self-attested age for partner discovery; not identity/age verification |
| `7 days` | `EXACT` | Duel and metric comparison window (`7 * 24 hours`) |
| `24-hour bucket` | `EXACT` | Maximum one consistency unit per consecutive bucket in a comparison window |
| `10,000 basis points` | `EXACT` | Full scale of `consistency_rate_bps` |
| `24 hours` | `MIN` | Minimum replay retention for a social idempotency record |
| `7 days` in profile activation | `EXACT` | Measurement window for that metric only |
| `5 capability keys` | `EXACT` | The four original keys plus `socialCompetition` in contract `1.1.0` |
| `1 selected competitive dataset` | `EXACT` | Required per competition-enabled account; other claimed datasets are dormant for v1 competition |
| `1 active appeal per SafetyAction` | `MAX` | Prevents duplicate concurrent appeal state |
| `0 OS notification permission/push registrations` | `EXACT` | V1 notification transport is authenticated in-app pull only |
| JSON placeholders such as `<opaque-support-id>` | `PLACEHOLDER` | Shape only; never a production value |

No other unresolved limit, retention, rate, SLA, cohort, or target is binding.
It remains `TBD` until a contract amendment classifies it.

## 14. Release gates, unresolved decisions, and reversal

### 14.1 Gates before `socialCore`

- configured auth issuer/audience and gateway-to-domain claim contract;
- explicit local `user.id = 'local'` to social-account sync/migration contract;
- PolicyAcceptance, SafetyAction, Appeal, Profile/Crew text-revision, report
  receipt, and pull-notification schemas with accountable operations;
- strict-TypeScript backend scaffold and migration/rollback path;
- account creation/deletion policy and finite retention values;
- block/report moderation ownership, escalation path, and support operations;
- privacy, terms, support, and data-deletion sources updated and reviewed;
- App Store/Play declarations for account, linked user ID, UGC, and safety
  controls reviewed for the actual implementation; and
- current Version 1.0 source/review track remains unchanged unless separately
  approved.

### 14.2 Additional gates by capability

- `profileMedia`: upload/storage bounds, EXIF removal, moderation, original-IP
  style policy, deletion/backups, photo permission copy, and store disclosure.
- `partnerDiscovery`: sparse-cohort minimum, 18+ policy approval, manual venue
  catalog governance, abuse controls, and store age-rating/privacy review.
- `socialChat`: finite retention, text moderation, report evidence, operations,
  rate limits, block/unmatch behavior, and messaging/UGC store declarations.
- `socialCompetition`: the selected-dataset rule is fixed, but minimum workout
  payload bounds, revision/barrier/rebaseline protocol, finite retention,
  corrections/no-contest, provenance/bias review, and server-derived
  `consistency_improvement_v1` conformance tests remain required.

The exact authentication provider, claim transport, next marketing version,
media/storage/moderation implementation, chat transport/retention, safety and
backup retention periods, deletion SLO, sparse-cohort minimum, rate/content
limits, store questionnaire answers, and product metric targets are unresolved.
They are not delegated to individual feature implementers.

### 14.3 Reversal

Before public release, rollback is capability-first: turn the affected server
capability false, verify routes fail closed, and verify TODAY/TRAIN/+LOG remain
usable. Database migrations are additive; rollback hides new paths rather than
dropping user or safety data. Destructive schema rollback requires a separately
approved retention/deletion plan.

This documentation-only change is reverted with its implementation-contract
commit and corresponding log commit. It changes no live service, binary,
payment, TestFlight build, or App Store state.

## 15. Required-scope traceability

| # | Required contract item | Normative section |
| ---: | --- | --- |
| 1 | `TODAY / TRAIN / +LOG / SOCIAL / ME` | 2.2 |
| 2 | `친구 / 주변 / 크루` | 2.3 |
| 3 | `social_user_id` and `auth_subject` | 3.1 |
| 4 | Complete separation from subscription `actor_key` | 3.2 |
| 5 | Profile, Friendship, Invite, Duel, Crew, Membership, Discoverability, Interest, Match, Block, Report | 4.2 |
| 6 | User photo versus AI-stylized photo | 4.3, 5.1 |
| 7 | No appearance score/Hot-or-Not; Interest to Match to chat | 5.1, 7.2 |
| 8 | Partner discovery is 18+ opt-in | 6.1 |
| 9 | Manual `area_code`/`venue_id` only | 6.2 |
| 10 | No exact GPS/live route/home storage | 6.2 |
| 11 | Manual selection after location denial | 6.2 |
| 12 | Block/report/delete/private/opt-out rights | 7.3 |
| 13 | Consistency/personal improvement comparison | 5.2 |
| 14 | Current `verifiedRatio` excluded from real-person rank | 5.2 |
| 15 | REST/errors/authz/idempotency | 8 |
| 16 | Four original feature flags plus the `socialCompetition` amendment | 9 |
| 17 | Current Version 1.0 versus next release | 2.1, 14 |
| 18 | Backend/client/safety ownership | 10 |
| 19 | Analytics events and product metrics | 11 |
| 20 | Function/Quality/Product-workflow verification | 12 |
| 21 | Personal achievement in TRAIN/Growth; real-person comparison in SOCIAL | 2.5 |
| 22 | `socialCompetition` plus default-off account preference | 9 |
| 23 | Exactly one selected competitive dataset; no automatic multi-device merge | 4.3, 5.3, 8 |
| 24 | PolicyAcceptance, SafetyAction, and Appeal support model | 4.3–4.4, 8 |
| 25 | Report-context receipt separated from report-creation receipt | 4.3, 8.3 |
| 26 | Profile/Crew candidate revisions and fail-closed moderation | 4.3–4.4 |
| 27 | Generic pull-only in-app notification; no OS push | 4.3, 8.3 |
| 28 | Advertised competition setup versus effective transport; rights-first disable/revoke/tombstone | 5.3, 7.1, 8, 9 |
| 29 | Sync-owned preference, Safety-owned policy/action runtime, composite typed `GET /me` | 4.4, 9, 10 |
| 30 | Result-state classifier for Profile private-only and Discoverability all-off rights commands | 7.3, 8.1, 8.5, 12.1 |
