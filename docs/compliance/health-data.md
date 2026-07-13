# Health-data integration & platform compliance

> **Status:** Launch-blocking reference. iOS v1 scope reconciled 2026-07-12.
> **Scope:** Apple HealthKit (iOS) + future Android Health Connect. The iOS v1 list below is the
> exact release permission surface; broader ideas remain future work and must not be requested.
> **Caveat:** Apple's developer-doc pages are JavaScript-rendered and could not be machine-fetched in full; identifier names below are confirmed against Apple's per-identifier doc pages and the canonical `HKQuantityTypeIdentifier` reference (URLs cited). Re-verify exact spelling against the live Apple docs in Xcode autocomplete before shipping.

---

## 0. OVERDRIVE data philosophy (drives every choice below)

Per CLAUDE.md non-negotiable §4 and Apple/Google policy:
- **Read-mostly.** Phase 1 is on-device; OVERDRIVE primarily **reads** existing health data to compute Combat Power. It should write back **only** the workouts the user actually performs and logs in-app (e.g., a strength session), and **never** write false/inaccurate or derived "game" numbers (Combat Power is a fun metric, not a health metric — keep it out of HealthKit/Health Connect).
- **Request the minimum.** Only request the types tied to a real, user-facing feature. Broad requests get rejected (Apple 5.1.1; Google "request only what your features need").
- **No iCloud for HealthKit data; no advertising/data-mining/sale of health data** (spec §4; Apple 5.1.3).

---

## 1. Apple HealthKit (iOS)

### 1.1 V1 data types to READ (exact minimum)

| OVERDRIVE concept | HealthKit type | Identifier | Apple doc |
|---|---|---|---|
| Workouts (sessions, activity type, duration) | `HKWorkoutType` | `HKObjectType.workoutType()` | [HKWorkoutType](https://developer.apple.com/documentation/healthkit/hkworkouttype), [HKWorkoutActivityType](https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype) |
| VO2 max (cardio fitness) | `HKQuantityType` | `vo2Max` | [vo2Max](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/vo2max) |
| Body mass (weight) | `HKQuantityType` | `bodyMass` | [bodyMass](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodymass) |
| Body fat % | `HKQuantityType` | `bodyFatPercentage` | [bodyFatPercentage](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodyfatpercentage) |

> Identifier names verified against Apple's per-identifier pages where individually cited; the rest against the canonical [`HKQuantityTypeIdentifier`](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier) list and [Data types](https://developer.apple.com/documentation/healthkit/data-types). `Verified by:` individual Apple doc pages above. Confirm exact casing in Xcode before shipping.

### 1.2 Data types to WRITE (share/write authorization)

Write **only** real values logged or entered in-app:
- `HKWorkoutType` — a strength session the user actually completed.
- `bodyMass` — body weight the user entered.
- `bodyFatPercentage` — body-fat value the user entered.
- **Never write:** Combat Power, "aura level," or any gamified/derived number. Writing fabricated data violates Apple 5.1.3 ("must not write false or inaccurate data into HealthKit").

### 1.3 Required Info.plist usage strings
- `NSHealthShareUsageDescription` — “Reploom reads workouts, VO2 max, body weight, and body fat to show your fitness progress and calculate the for-fun Combat Power score.”
- `NSHealthUpdateUsageDescription` — “Reploom saves only workouts, body weight, and body fat that you log or enter so they can appear in Apple Health.”
These are mandatory or the app crashes on the authorization call; they are also surfaced to App Review.

### 1.4 App Store health-app review checklist (must pass)

From the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), §5.1.1, §5.1.2, §5.1.3:

- [ ] **Privacy policy is required and linked** (App Store Connect metadata + in-app). Apps that use HealthKit, include login, or collect user data **must** have a privacy policy and obtain consent. (5.1.1 / 5.1.2)
- [ ] **Explicit user consent** for data collection, and a simple way to **withdraw** consent. Paid features must not depend on or gate access to this data. (5.1.2)
- [x] **No iCloud storage of HealthKit data in the release design.** A tracked Expo config plugin creates `Documents/SQLite`, sets complete file protection, and excludes the entire directory (database/WAL/SHM) from backup. Runtime verification remains required for each release archive.
- [ ] **No advertising / data-mining / sale.** Quoted intent: apps *"may not use or disclose to third parties data gathered in the health, fitness, and medical research context — including from the HealthKit API … for advertising or other use-based data mining purposes other than improving health management."* (5.1.3(i)) Matches spec §4: no ads, marketing, data-mining, or sale (incl. third parties).
- [x] **No third-party sharing without explicit permission**, including third-party AI. HealthKit records never leave device; optional user-entered logging content uses a separate versioned Remote AI consent that defaults off.
- [ ] **Minimum necessary data** — only request types tied to a real feature (5.1.1).
- [ ] **No writing false/derived data** (Combat Power stays in-app). (5.1.3)

Sources: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Protecting user privacy (HealthKit)](https://developer.apple.com/documentation/healthkit/protecting-user-privacy), [User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/).

> **Engineering note:** HealthKit behavior still requires a signed native build and physical-device
> validation. `expo-dev-client` is intentionally absent from the App Store Release archive.

---

## 2. Android Health Connect

Health Connect is the Android successor to Google Fit APIs. It supports 50+ health/fitness data types and gates each behind a per-type read/write permission declared in `AndroidManifest.xml` and matched in Play Console.

### 2.1 READ + WRITE data types to declare

| OVERDRIVE concept | Record class | READ permission | WRITE permission |
|---|---|---|---|
| Workout session | `ExerciseSessionRecord` | `android.permission.health.READ_EXERCISE` | `android.permission.health.WRITE_EXERCISE` |
| Total calories burned | `TotalCaloriesBurnedRecord` | `android.permission.health.READ_TOTAL_CALORIES_BURNED` | `android.permission.health.WRITE_TOTAL_CALORIES_BURNED` |
| Active calories burned | `ActiveCaloriesBurnedRecord` | `android.permission.health.READ_ACTIVE_CALORIES_BURNED` | `android.permission.health.WRITE_ACTIVE_CALORIES_BURNED` |
| Heart rate | `HeartRateRecord` | `android.permission.health.READ_HEART_RATE` | `android.permission.health.WRITE_HEART_RATE` |
| Resting heart rate | `RestingHeartRateRecord` | `android.permission.health.READ_RESTING_HEART_RATE` | `android.permission.health.WRITE_RESTING_HEART_RATE` |
| VO2 max | `Vo2MaxRecord` | `android.permission.health.READ_VO2_MAX` | `android.permission.health.WRITE_VO2_MAX` |
| Weight / body mass | `WeightRecord` | `android.permission.health.READ_WEIGHT` | `android.permission.health.WRITE_WEIGHT` |
| Body fat % | `BodyFatRecord` | `android.permission.health.READ_BODY_FAT` | `android.permission.health.WRITE_BODY_FAT` |
| Steps | `StepsRecord` | `android.permission.health.READ_STEPS` | `android.permission.health.WRITE_STEPS` |
| Distance | `DistanceRecord` | `android.permission.health.READ_DISTANCE` | `android.permission.health.WRITE_DISTANCE` |
| Power (cycling/etc.) | `PowerRecord` | `android.permission.health.READ_POWER` | `android.permission.health.WRITE_POWER` |
| Speed | `SpeedRecord` | `android.permission.health.READ_SPEED` | `android.permission.health.WRITE_SPEED` |

> Record classes + permission strings `Verified by:` [Health Connect data types](https://developer.android.com/health-and-fitness/health-connect/data-types) (fetched). Exercise routes need the extra `READ_EXERCISE_ROUTE` / `WRITE_EXERCISE_ROUTE`. Write only real, user-performed activity — same rule as HealthKit.

**Declaration scope for OVERDRIVE Phase 1 (recommended minimum):**
- **READ:** EXERCISE, ACTIVE_CALORIES_BURNED, TOTAL_CALORIES_BURNED, HEART_RATE, RESTING_HEART_RATE, VO2_MAX, WEIGHT, BODY_FAT, STEPS, DISTANCE. (Add POWER/SPEED only if a feature uses them.)
- **WRITE:** EXERCISE (the strength sessions the user logs in-app). Add WEIGHT/BODY_FAT write only if OVERDRIVE becomes the user's logging surface for those.

> **Critical Google rule:** every permission you declare must map to a real user-facing feature. Declaring read access you don't use → Play rejection ("Inappropriate Health Connect Access Requested"). For `READ_HEALTH_DATA_IN_RECORDS`-class sensitive data you must prove it's essential to the app's core function.

### 2.2 Contextual permission rationale strings

Health Connect requires an Activity that displays the app's privacy policy and a rationale for each permission. Suggested copy (each ties the permission to the visible Combat Power feature):

- **Exercise / workouts:** "OVERDRIVE reads your workouts to turn each session into Combat Power, and saves the strength sessions you log so they appear in Health Connect."
- **Calories (active/total):** "We read the energy you burn to score the intensity of your training."
- **Heart rate / resting heart rate:** "We read heart-rate data to gauge effort and recovery for your Combat Power."
- **VO2 max:** "We read your cardio-fitness (VO2 max) as one input to your Combat Power."
- **Weight / body fat:** "We read body metrics to track strength-to-weight and body-composition progress — framed as health and improvement, never to shame."
- **Steps / distance:** "We read steps and distance to credit everyday movement toward your daily score."
- **Privacy-policy rationale (shown in the permissions screen):** "OVERDRIVE keeps your health data on your device, calculates your Combat Power locally, and never sells, mines, or shares it for advertising."

### 2.3 Google Play health-app checklist (must pass)

From [Android Health Permissions guidance](https://support.google.com/googleplay/android-developer/answer/12991134) and [Plan compliance with privacy policies](https://developer.android.com/health-and-fitness/guides/health-connect/plan/user-privacy):

- [ ] **Complete the "Health apps declaration"** form in Play Console (App content page), indicating which health features map to the Health Connect types you access.
- [ ] **Privacy policy is required**, accessible from both the app and the Play listing, stating what health/fitness data is collected, how it's used/stored/shared, and retention + deletion.
- [ ] **Manifest Activity that shows the privacy policy** (the permission rationale screen).
- [ ] **Request only necessary permissions**; no broader access than the features need.
- [ ] **Health Connect data is "personal & sensitive user data"** under the User Data policy — describe security measures (on-device storage, access control) in the policy.
- [ ] **No advertising / data-mining / sale of health data** (matches spec §4 and Google's Health content & User Data policies).
- [ ] **Declare every read AND write type publicly** (spec §4: Android requires full public declaration of all types read and written).

Sources: [Health Connect get started](https://developer.android.com/health-and-fitness/health-connect/get-started), [Publish your health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish), [Health content & services policy](https://support.google.com/googleplay/android-developer/answer/16679511), [Android Health Permissions FAQs](https://support.google.com/googleplay/android-developer/answer/12991134).

> **Engineering note:** Health Connect needs a real device + Expo dev client (e.g. via `react-native-health-connect`). `Background read` beyond the default 30-day window needs `PERMISSION_READ_HEALTH_DATA_HISTORY`.

---

## 3. Cross-platform compliance summary (both stores)

1. **Privacy policy: mandatory** on both, linked in-app and in store listings. (See `privacy-policy.md`.)
2. **Explicit consent + easy withdrawal/deletion.**
3. **Minimum-necessary data only.**
4. **No iCloud for HealthKit data** (Apple); on-device-first overall (Phase 1).
5. **No ads, no data-mining, no sale, no third-party sharing** of health data without explicit permission (incl. third-party AI).
6. **Never write false/derived data** — Combat Power and game state stay in app storage, out of HealthKit/Health Connect.
7. **Public declaration** of all read+write health types (esp. Android Play Console form).
