# Reploom — App Store Listing & Submission Pack

_Working doc for App Store Connect. Grounded in the actual codebase (HealthKit types, data flow).
Last updated: 2026-06-30._

> ⚠️ Open gates before submit: (1) finalize **Reploom** name clearance — USPTO came back *likely
> clear* (no exact mark; nearest neighbors `Replo` (SaaS), `RepRoom` (fitness) are distinguishable),
> but app-store-collision / domain / global checks did not complete and a direct USPTO tmsearch
> lookup is still recommended. (2) Register `reploom.app` (or chosen domain) + `support@reploom.app`.
> (3) Host the privacy policy at a public URL.

## App identity

- **Name:** Reploom
- **Bundle ID:** `ai.daeseon.reploom`
- **SKU:** `reploom-ios`
- **Primary category:** Health & Fitness
- **Secondary category:** (optional) Lifestyle
- **Age rating:** 4+ (no objectionable content; confirm questionnaire — no user-generated public content beyond opt-in handle)

## Name / subtitle / promo

- **App name (30 char max):** `Reploom`
- **Subtitle (30 char max):** `Train. Power up. Repeat.`
- **Promotional text (170 char):** `Every set you log detonates into Combat Power. Real workouts, real Apple Health data, arcade-grade feedback. Log it. Watch your power climb.`

## Keywords (100 char, comma-separated, no spaces)

`workout,gym,strength,combat power,fitness,lifting,log,apple health,reps,RPG,gamified,progress,tracker`

## Description

```
Reploom turns your real training into raw Combat Power.

Every set you log detonates — GPU-grade visual feedback, an odometer that slams upward, an
energy aura that grows as you do. It's the dumb-fun dopamine hit that makes you want to log the
next set. But the number underneath is real: Reploom reads your actual workouts and body metrics
from Apple Health and turns consistent, progressive training into your score.

WHAT YOU GET
• One-tap & voice logging — type or speak "bench 100 x5", it parses into sets instantly.
• Combat Power — a for-fun score (not a medical metric) built from your real volume, sessions,
  conditioning, streaks, and fitness markers.
• JUICE — escalating arcade feedback: hit a PR and the screen goes into OVERDRIVE.
• Apple Health sync — reads your workouts, heart rate, VO₂ max, and body composition; writes the
  strength workouts you log back to Apple Health.
• Evolution & themes — original power-fantasy looks that change as you level up.
• Anti-shame by design — showing up always counts; bad days still earn a pop.

YOUR DATA STAYS YOURS
• Your Apple Health data never leaves your device. Ever.
• No accounts, no ads, no trackers, no selling your data.
• Leaderboards are opt-in — nothing about you leaves your phone until you choose to join.

Combat Power is an original, for-fun score — not a scientific or medical metric.
```

## App Privacy ("nutrition label") — what to enter in App Store Connect

Reploom's privacy answers, grounded in code:

**Data NOT collected by us as identifiable:** No account, no name/email, no advertising identifiers,
no third-party analytics.

Declare the following:

| ASC data type | Collected? | Linked to identity? | Used for tracking? | Purpose | Notes |
|---|---|---|---|---|---|
| Health & Fitness | Used on device, **not collected by us** | No | No | App Functionality | Apple Health data is read/written **on device only**; never sent to our servers. Do **not** mark as "Data Linked to You" / "Used to Track You". |
| Audio Data (voice log) | Collected (transient) | No | No | App Functionality | Sent to Groq (Whisper) to transcribe a spoken log; not used to identify you. |
| User Content — Photos | Collected (transient) | No | No | App Functionality | Only photos you pick for a meal log / avatar; sent to Google Gemini for estimate/generation. |
| Other User Content — workout/meal text | Collected (transient) | No | No | App Functionality | Sent to Groq/Gemini to parse into structured entries. |
| User Content — handle (optional) | Collected only if you opt in | No | No | App Functionality | Leaderboard handle + anonymous device ID; opt-in. |

> Key ASC switches: **"Used to Track You" = NO** for everything (no cross-app/− data-broker tracking).
> Health data → declare as used for App Functionality, **on-device**, not linked. Third-party AI
> processors (Groq, Google) are **processors** for the text/audio/photo features.

## App Review notes (paste into "Notes")

```
Reploom is device-local. There is no login — reviewers can use all core features immediately.

HealthKit: On first launch, open Settings → Connect Apple Health to grant read/write. Combat Power
is computed on-device from Health data; Health data is never transmitted off the device. The app
writes only workouts/body metrics the user explicitly logs (never fabricated values).

Voice logging: tap the mic in the QuickLog bar and say e.g. "squat 80 kilos 5 reps" — audio is sent
to a speech-to-text service to transcribe, then parsed into sets.

Combat Power is an explicitly-labeled for-fun score, not a medical metric.

To test without Apple Health data, you can type logs manually (e.g. "bench 100 x5, x5, x4").
```

## URLs needed in ASC

- **Privacy Policy URL:** https://reploom.app/privacy  (host `website/privacy.html`)
- **Support URL:** https://reploom.app/support  (host `website/support.html`)
- **Marketing URL (optional):** https://reploom.app

## Assets still to produce

- App icon (1024×1024) — from `assets/images/icon.png` (verify final).
- iPhone screenshots (6.9" + 6.5" required) — capture from a build: Home (Combat Power + aura),
  a PR OVERDRIVE moment, Power breakdown, QuickLog.
- (Optional) App Preview video of a PR detonation.
