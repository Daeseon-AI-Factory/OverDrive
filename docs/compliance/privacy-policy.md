# Reploom — Privacy Policy Source

Last reconciled with the v1 code: 2026-07-12. The publishable HTML is
`website/privacy.html`; this Markdown file is the repository source-of-truth inventory used to
check App Store Connect answers.

> Publication gate: `support@reploom.app` has not been verified and the legal operator identity has
> not been supplied. Do not publish or submit the current placeholders as final contact details.

## Plain-language summary

Reploom has no user account, advertising, ad network, or third-party analytics SDK. Apple Health
records are processed on device and are not sent to Reploom's Worker or AI provider. Optional
Remote AI is off by default and requires an 18+ confirmation plus explicit, versioned consent.
Public leaderboards and remote photo-avatar generation are absent from v1.

## Data kept on device

The private app container can hold workout sessions, set/cardio logs, meal logs and nutrition
estimates, goals, programs, body-composition entries, settings, streaks, Combat Power history, and a
small Health-derived snapshot. Deleting the app—not merely offloading it—removes this local
container.

That Health-derived snapshot contains the seven-day workout count, latest VO₂ max, body mass,
body-fat percentage, and last-sync time. Reploom's in-app Disconnect action clears it and
recomputes Combat Power. Revoking permission only in iOS/Health stops future authorized reads but
does not itself erase Reploom's already-cached snapshot.

The tracked Expo config plugin creates the full `Documents/SQLite` directory before the database is
opened, applies complete file protection, and excludes the directory and its database/WAL/SHM files
from iCloud device backup.

## Apple Health / HealthKit

Connection is optional. V1 requests only:

| Operation | Types | Purpose |
|---|---|---|
| Read | Workouts, VO₂ max, body mass, body-fat percentage | On-device progress and Combat Power inputs |
| Write | Workouts, body mass, body-fat percentage | Records the user actually logged or entered |

HealthKit records are never sent to Cloudflare, Groq, advertising services, or data brokers.
Reploom never writes Combat Power, nutrition estimates, or fabricated data to Apple Health.
The in-app Disconnect action clears Reploom's cached Health snapshot and recalculates Combat Power.
Separately revoking iOS/Health permissions stops future access. Records already written to Apple
Health remain under Apple's controls.

## Optional Remote AI

Remote AI consent is `null` by default. A stored consent is accepted only if its disclosure version
matches the current app and has a valid acceptance timestamp. Turning the setting off prevents
future remote requests. The local common-format workout parser and saved-meal repeat remain usable.

After consent, only a deliberate feature action sends the following through Reploom's Cloudflare
Worker to Groq:

| Chosen action | Data sent | Result |
|---|---|---|
| Flexible typed workout parse | Workout text, display unit system, exercise catalog names/IDs | Structured sets |
| Voice log | Audio clip and language hint; if local matching cannot resolve it, transcript plus display unit and exercise catalog names/IDs | Transcript and, when needed, structured sets |
| Typed meal estimate | Meal description | Estimated items, calories, protein |
| Selected meal-photo estimate | Selected image | Estimated items, calories, protein |

The built-in sportswear body-map character uses no personal photo and performs no remote avatar
request. The Worker does not write AI request bodies or results to D1, KV, R2, or another Reploom
application store. The release-candidate Worker configuration disables observability/application
logs; this becomes an operational claim only after that exact version is deployed and verified.
Cloudflare still processes normal network/security metadata under its service policy.

Reploom deletes each temporary voice recording after transcription finishes, fails, times out, or
is cancelled. It deletes app-cache copies of selected meal photos and resized upload images after
their requests. If the app terminates before request-level cleanup, the next launch sweeps the
dedicated ExpoAudio, ImagePicker, and ImageManipulator cache directories. Pre-v1 TestFlight photo-
avatar originals/results and later branch-local body-avatar files are also removed idempotently on
every launch.

Groq documents that inference content is not retained by default, but inputs/outputs can be logged
for reliability or suspected abuse for up to 30 days, and longer if legally required. Reploom does
not claim that Groq Zero Data Retention is enabled. AI results can be wrong and are not medical or
dietary advice.

## Legacy TestFlight leaderboard

V1 does not expose a public leaderboard or submit new ranking data. `/rank/submit` and
`/rank/board` return `410 Gone`. An older TestFlight build may have stored a handle, random local
device ID, Combat Power, weekly gain, grade label, optional crew code, and update time in Cloudflare
D1. Raw HealthKit records and workout details were not sent.

When the old random ID remains in local settings, v1 shows a deletion action. It calls
`/rank/delete`; after server success, it clears the local handle, crew, and device ID. Users should
run that action before deleting the app, because Reploom has no account identity that can recover a
lost random ID.

## Apple App Privacy inventory

The conservative store declaration is App Functionality / Not Linked / Not Used for Tracking for:

- Fitness — workout text deliberately sent for remote parsing;
- Health — meal text and nutrition estimates;
- Photos or Videos — a selected meal photo;
- Audio Data — an on-demand voice clip; and
- Other User Content — free-form workout/meal input.

HealthKit records read only on device are not collected by Reploom. V1 does not create or submit a
ranking handle or identifier. A legacy TestFlight user may explicitly transmit the random deletion
token already stored on their device solely to delete the matching D1 row; the v1 Worker does not
retain a new copy of that request token. There are no ads, cross-app tracking, or data sales.

## Choices and deletion

- Leave Remote AI off or withdraw consent in Settings.
- Use Reploom's Disconnect Apple Health action to clear the local snapshot; separately revoke
  permissions in Apple Health/iOS Settings to stop future access.
- Delete a legacy TestFlight ranking row from Reploom Settings before deleting the app.
- Delete—not offload—the app to remove its local container.
- Remove any records Reploom wrote from within Apple Health if desired.

Reploom has no online account to close. The public deletion instructions live at `/data`.

## Children, security, and contact

Reploom is not directed to children under 13. Remote AI is gated by a user confirmation that they
are 18 or older. Transport uses HTTPS and provider API keys stay server-side, but no system is
perfectly secure; users should avoid unnecessary names, diagnoses, or other sensitive text.

The final policy must identify the verified operator and a working privacy/support contact. Until
the gate above is resolved, `support@reploom.app` is a placeholder rather than an operational
promise.
