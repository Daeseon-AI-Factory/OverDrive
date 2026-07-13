# Privacy Policy — DRAFT (requires legal review)

> **SUPERSEDED DRAFT — DO NOT PUBLISH OR USE FOR APP STORE ANSWERS.** The reconciled v1 inventory is
> `docs/compliance/privacy-policy.md` and the publishable page is `website/privacy.html`. This file is
> retained only as historical drafting context and contains pre-v1 assumptions.
>
> **App-name note:** per `brand-availability.md`, "OverDrive" is **not** cleared as a public app name (live "Overdrive Fitness" collision + the well-known OverDrive, Inc. mark). This draft now uses the working launch candidate "Reploom"; run final trademark/privacy review before publishing.

---

**Last updated:** [DATE]
**Applies to:** the Reploom mobile application ("the App") on iOS and Android.
**Operator / data controller:** [LEGAL NAME], [ADDRESS], contact: [PRIVACY EMAIL].

---

## 1. Our privacy promise (plain language)

Reploom turns your real workout data into a game score called **Combat Power**. We built it privacy-first:

- **Your health data stays on your device.** In the current version, the App runs primarily **on-device**. We do not upload, transmit, or store your Apple Health data on our servers or in any cloud account controlled by us.
- **We never sell your data. Ever.** We do not sell, rent, or trade your personal or health information to anyone, including third parties.
- **No advertising. No data-mining.** We do not use your health, fitness, or activity data for advertising, marketing, ad targeting, or use-based data mining.
- **No third-party sharing of health data** without your explicit, separate consent.
- **You are in control.** You choose what the App may read, you can revoke access at any time in iOS Health / Android Health Connect settings, and you can delete all App data from your device at any time.

> **Combat Power is a fun, gamified score — not a medical, scientific, or fitness-assessment metric.** It is for motivation and entertainment only.

---

## 2. What data we access, and why

The App reads health and fitness data **from your device's health platform** — **Apple HealthKit** (iOS) or **Android Health Connect** — only after you grant permission, and only the types tied to a feature you use. We use it **solely** to calculate and display your Combat Power and progress, **on your device**.

| Data we access | Source | Why we use it |
|---|---|---|
| Workouts (type, duration, dates) | HealthKit `HKWorkoutType` / Health Connect `ExerciseSessionRecord` | Core input to Combat Power; show your session history. |
| Active & total energy burned | `activeEnergyBurned`, `basalEnergyBurned` / `ActiveCaloriesBurnedRecord`, `TotalCaloriesBurnedRecord` | Score training intensity. |
| Heart rate & resting heart rate | `heartRate`, `restingHeartRate` / `HeartRateRecord`, `RestingHeartRateRecord` | Gauge effort and recovery. |
| VO2 max (cardio fitness) | `vo2Max` / `Vo2MaxRecord` | One input to your fitness score. |
| Body mass (weight) | `bodyMass` / `WeightRecord` | Track strength-to-weight and progress. |
| Body fat % | `bodyFatPercentage` / `BodyFatRecord` | Track body-composition progress — framed as health/improvement, never to shame. |
| Lean body mass, height | `leanBodyMass`, `height` | Refine score and progress context (iOS). |
| Steps & distance | `stepCount`, `distanceWalkingRunning` / `StepsRecord`, `DistanceRecord` | Credit everyday movement. |

**Data you enter directly in the App** (e.g., strength sets/reps/weights, fitness-test results, body-composition entries): stored locally on your device to compute and display your score and history.

**Data the App may write back to your health platform:** only the **real workouts you log in the App** (e.g., a strength session). The App **never** writes false, inaccurate, or game-derived numbers (such as Combat Power) into HealthKit or Health Connect.

We request the **minimum** data needed for the features you use. You can grant or deny each type individually.

---

## 3. What we do NOT do

- We do **not** store your health data in iCloud or in any cloud account we control. (Apple App Store Guideline 5.1.3 prohibits storing HealthKit data in iCloud, and we comply.)
- We do **not** use health/fitness data for advertising or use-based data mining.
- We do **not** sell, rent, or share your health/personal data with third parties for their own purposes.
- We do **not** share data with third-party AI services without your explicit prior permission. (Phase 1 sends nothing off your device.)
- We do **not** write false or inaccurate data to your health platform.

---

## 4. Where your data lives & how long we keep it

- **On-device storage (Phase 1):** all App data — health data read for scoring, your in-App logs, and computed Combat Power — is stored locally on your device.
- **Retention:** data remains on your device until you delete it or uninstall the App. Uninstalling removes the App's local data store; data already saved to HealthKit/Health Connect is governed by those platforms and is not removed by uninstalling the App.
- We do not maintain server-side copies in Phase 1.

> **Forward-looking:** If a future version adds optional cloud features (e.g., leagues, sync, backend leaderboards — Phase 2+), this policy will be updated **before** any such feature ships, those features will be **opt-in**, and any off-device processing of health data will require fresh, explicit consent. Secrets/keys for any external service will be held server-side, never in the client. Health data will still never be used for ads, mining, or sale.

---

## 5. Permissions you control

- **iOS:** manage what the App can read/write in **Settings → Health → Data Access & Devices → Reploom**. You can revoke any permission at any time.
- **Android:** manage permissions in **Health Connect → App permissions → Reploom**. You can revoke any permission at any time.
- Revoking access stops new reads/writes; it does not delete data already computed and stored locally — use the in-App delete (below) for that.

---

## 6. Your rights & how to exercise them

You can, at any time:
- **Access / review** the data the App holds about you (visible in-App; source data is viewable in Apple Health / Health Connect).
- **Delete** your in-App data via **[Settings → Delete my data]** in the App, or by uninstalling the App.
- **Withdraw consent** by revoking health permissions (§5).
- **Contact us** at **[PRIVACY EMAIL]** with any privacy request or question.

Depending on your location, you may have additional rights under laws such as **GDPR** (EU/EEA), **CCPA/CPRA** (California), and Korea's **PIPA (개인정보 보호법)** — including rights to access, correction, deletion, and portability. We will honor applicable rights. `[Attorney: confirm jurisdiction-specific obligations, lawful basis, and any required disclosures.]`

---

## 7. Children

The App is **not directed to children under [13 / 14 — confirm per jurisdiction, e.g., Korea PIPA threshold]**, and we do not knowingly collect data from them. `[Attorney to finalize age and any parental-consent mechanics.]`

---

## 8. Security

Because Phase 1 keeps data on your device, the primary safeguards are your device's own protections (passcode, biometric lock, OS sandboxing) plus our use of the platform health stores (HealthKit / Health Connect) for sensitive data. We apply reasonable measures appropriate to on-device storage. No method of storage is 100% secure. `[Attorney/security review: confirm encryption-at-rest specifics for local store.]`

---

## 9. Changes to this policy

We will post any changes here and update the "Last updated" date. Material changes (especially anything expanding data use or adding off-device processing) will be communicated in-App **before** taking effect.

---

## 10. Contact

Questions or requests: **[PRIVACY EMAIL]** · [LEGAL NAME] · [ADDRESS].

---

### Compliance cross-reference (for internal use — remove before publishing)
- Apple Guideline 5.1.1 (data collection & storage / minimum necessary), 5.1.2 (privacy policy + consent + withdrawal + no undisclosed third-party/AI sharing), 5.1.3 (no iCloud for HealthKit, no ads/data-mining/sale, no false data). [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Google Play: Health apps declaration + privacy policy + minimum permissions + sensitive-data handling. [Android Health Permissions FAQs](https://support.google.com/googleplay/android-developer/answer/12991134), [Plan compliance with privacy policies](https://developer.android.com/health-and-fitness/guides/health-connect/plan/user-privacy)
- Reploom spec non-negotiables §3 (secrets server-side) and §4 (privacy policy, no ads/mining/sale, no iCloud for HealthKit, no false writes, declared types).
