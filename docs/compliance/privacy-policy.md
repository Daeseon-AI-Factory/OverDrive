# Reploom — Privacy Policy

_Last updated: 2026-06-30_

Reploom ("Reploom", "the app", "we", "us") turns your real training into a game-style
**Combat Power** score. This policy explains, in plain language, exactly what data the app
uses, what never leaves your device, and the few things that are sent for processing.

**One-line summary:** Your Apple Health data never leaves your device. Your workout/meal
logs (text, voice, or photo) are sent only to turn them into structured entries. There are
**no accounts, no ads, no third-party trackers**, and we **never sell, rent, or mine** your data.

---

## 1. Who we are

Reploom is an independent fitness app. For any privacy question or request, contact:
**support@reploom.app**. (Set up this mailbox before launch — see the launch checklist.)

## 2. Apple Health / HealthKit data

If you connect Apple Health, Reploom reads the following data types **on your device** to
calculate your Combat Power score and show your progress:

- Workouts (HKWorkout)
- Active energy burned
- Heart rate
- Resting heart rate
- VO₂ max
- Body mass (weight)
- Body fat percentage

When you log a strength workout or a body-composition entry in Reploom, the app can **write**
the following back to Apple Health so your real training is reflected there:

- Workouts (HKWorkout)
- Body mass (weight)
- Body fat percentage
- Lean body mass

**Apple Health data is processed entirely on your device.** It is **never** transmitted to our
servers or any third party, **never** stored in iCloud by Reploom, and **never** used for
advertising, marketing, data-mining, or sale. We only write data you actually logged — Reploom
never writes false or "game" numbers to Apple Health. This is consistent with Apple's HealthKit
requirements.

## 3. Data that is sent off your device (and why)

Reploom has no health-data backend. The **only** time information leaves your device is when you
ask the app to interpret a log you created. That input is sent to our processing endpoint (a
Cloudflare Worker), which forwards it to a third-party AI service to convert it into structured
data, then returns the result:

| What you do | What is sent | Who processes it | Purpose |
|---|---|---|---|
| Type a workout/meal | The text you wrote | Groq, or Google Gemini (fallback) | Parse into sets / nutrition |
| Speak a workout log | The audio you recorded | Groq (Whisper) | Speech-to-text |
| Pick a meal photo / Evolution avatar photo | The image you chose | Google Gemini | Estimate nutrition / generate an avatar |

These inputs are sent **only to return your result**. We do not attach your identity to them
(Reploom has no account), and we do not use them to build an advertising or tracking profile.
Processing is handled by the providers above under their own terms; see Groq's and Google's
privacy policies for how they handle data sent to their APIs. We do not send your Apple Health
data, contacts, location, or device identifiers through this path.

## 4. Optional leaderboard

Leaderboards are **opt-in**. Until you choose a handle, **nothing about you leaves your device**.
If you opt in, the app may send:

- **Handle** — a username you type (no real name required)
- **Anonymous device ID** — a random identifier generated once on your device; it is not tied to
  your Apple ID, name, email, or phone number
- **Crew code** — an optional gym/crew code you enter

You can stay off leaderboards entirely and use every core feature.

## 5. On-device storage

Your workouts, sets, cardio, body-composition entries, daily goals, food logs, Combat Power
history, and settings are stored **locally on your device** (in an on-device SQLite database).
Deleting the app removes this data from your device.

## 6. What we do NOT do

- ❌ No advertising and no ad networks
- ❌ No third-party analytics or trackers
- ❌ No selling, renting, or data-mining of your information
- ❌ No sending your Apple Health data off your device
- ❌ No storing your Apple Health data in iCloud
- ❌ No accounts, no email/phone collection, no real-name requirement
- ❌ Not directed to children under 13

## 7. Permissions Reploom may ask for

| Permission | Why | When |
|---|---|---|
| Apple Health | Read metrics for Combat Power; write back workouts/body metrics you log | When you connect Health |
| Microphone | Transcribe a spoken workout log | Only while you record a voice log |
| Photo Library | Use a photo you pick for a meal log or your Evolution avatar | Only when you pick a photo |

Each permission is optional and is used only for the stated feature. You can revoke any of them in
iOS Settings at any time.

## 8. Combat Power is for fun

Combat Power is an **original, for-fun score — not a medical or scientific metric**, and is
labeled as such in the app. Don't use it as a health diagnosis.

## 9. Your choices

- Revoke Health, Microphone, or Photos access in iOS Settings.
- Skip the optional leaderboard (default).
- Delete the app to remove on-device data.

## 10. Changes

If this policy changes, we'll update the date above and post the new version at the Reploom
privacy URL.

## 11. Contact

Questions or requests: **support@reploom.app**.
