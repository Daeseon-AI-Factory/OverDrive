# Reploom — App Store Listing & Review Pack

Last reconciled with the v1 code and App Store Connect record: 2026-07-13.

## App identity

- Name: `Reploom`
- Bundle ID: `ai.daeseon.reploom`
- App Store Connect app ID: `6786831176`
- Seller / legal operator: `Daeseon Yoo`
- App Store copyright field: `2026 Daeseon Yoo` (live value read back on 2026-07-13)
- Public support / privacy contact: `showep12@gmail.com` (connected Gmail profile and inbound
  delivery read back on 2026-07-13)
- Version: `1.0`
- Primary category: Health & Fitness
- Secondary category: none
- App download price: free
- In-App Purchase: `Reploom Pro Monthly`, auto-renewable one-month subscription,
  product ID `ai.daeseon.reploom.pro.monthly.v1`, App Store Connect subscription ID `6790532250`.
  The USA customer price is US $4.99. Apple's equalized prices were read back for exactly the 132
  enabled storefronts; every price row has `planType=UPFRONT` and `startDate=null`, and automatic
  new-territory inclusion is off.
- Live availability: `Specific Countries or Regions`; 132 of 175 storefronts enabled, the exact 43
  below disabled, no pre-orders, and automatic inclusion of newly added storefronts off. The full
  territory rows were read back independently on 2026-07-13.
  - EU 27: Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland,
    France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta,
    Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden.
  - Other European storefronts: Albania, Belarus, Bosnia and Herzegovina, Iceland, Kosovo, Moldova,
    Montenegro, North Macedonia, Norway, Russia, Serbia, Switzerland, Türkiye, Ukraine, United Kingdom.
  - China: China mainland. Hong Kong, Macau, and Taiwan remain included as separate storefronts.
- Tax category: likely `Fitness and health`; select and read back the live App Store Connect value
- Accounts / demo login: none
- Advertising identifier: not used
- Content rights: Reploom does not stream or sell third-party content. Confirm and retain the
  provenance/license record in `docs/compliance/asset-provenance.md` for every bundled brand,
  sportswear, sound, and font asset before answering the App Store Connect content-rights declaration.

Age rating must come from the completed Apple questionnaire. Known material answers are
`Health or Wellness Topics = Yes` and likely `Age Assurance = Yes` because Remote AI uses an 18+
self-attestation. Apple's `Contests` definition begins with users competing with one another. Arena
is one user versus a local deterministic NPC, with no real users, ranking, network, or prize, so
`Contests = No` is the defensible current answer; record that rationale and the live-form readback.
Public UGC, chat, gambling, unrestricted web access, medical treatment, and remote photo-avatar
generation are absent. Never substitute a marketing age guess for the completed form.

Regulated Medical Device declaration: `No`. Reploom is a general wellness logger and makes no
diagnosis, treatment, or medical-device claim. This live App Store Connect value still requires
readback before submission.

## Localized metadata — en-US

- App name: `Reploom`
- Subtitle: `Log Sets. Build Momentum.`
- Promotional text:

  `Fast workout and meal logging, a tappable sportswear body map, Apple Health progress, and arcade feedback that makes every recorded set feel alive.`

- Keywords (91 ASCII bytes, 100-byte limit):

  `workout,gym,strength,lifting,tracker,fitness,health,sets,reps,protein,gamified,progress,log`

### Description

```text
Reploom turns everyday training into visible momentum.

Log a set in seconds, see your progress move, and get energetic arcade-style feedback without
slowing down the next rep. Reploom is designed for the moments that matter: between sets at the
gym, after a meal, and when you want a clear next action instead of another dashboard.

FAST WORKOUT LOGGING
• Repeat a recent set with one tap.
• Type a simple entry such as “bench 100 5” and save it locally without a network request.
• Reploom Pro adds flexible workout AI and on-demand voice transcription.
• Edit or undo a recent result when something is wrong.

TRAIN BY BODY REGION
• Tap the built-in sportswear character’s front or back body regions.
• See relevant exercises, today’s program matches, recent work, and the remaining exercises for that region.
• Search the full strength and cardio catalog at any time.

PROGRESS WITH CONTEXT
• Combat Power is an original, for-fun score based on your logged consistency and progress.
• It is clearly labeled as entertainment, not a scientific or medical measurement.
• Showing up always counts; Reploom does not shame low numbers or missed days.

APPLE HEALTH — OPTIONAL
• Read workouts, VO₂ max, body weight, and body fat with your permission.
• Write only workouts, body weight, and body fat that you actually log or enter.
• Apple Health records stay on device and are never sent to Reploom’s AI service.

MEAL LOGGING — OPTIONAL REPLOOM PRO AI
• Estimate calories and protein from meal text or a photo you select.
• Estimates can be wrong and are not medical or dietary advice.
• Repeat a saved meal locally without another AI request.

REPLOOM PRO — MONTHLY SUBSCRIPTION
• Remote AI features use 1,000 AI credits per billing period; meal photos also have a 60-photo limit.
• Workout text uses 1 credit, meal text 2, voice transcription 3, and a meal photo 8.
• If a voice transcript needs flexible workout parsing, it uses 1 more credit (3–4 total).
• The purchase screen shows your localized monthly price before confirmation.
• Manual logging, local quick parsing, saved-meal repeat, plans, history, body map, Combat Power,
  and Apple Health remain available without Pro.

PRIVACY BY DEFAULT
• No Reploom login, ads, ad tracking, or third-party analytics SDK.
• Remote AI is off by default, requires an 18+ self-attestation and explicit consent, and can be
  disabled at any time.
• Manual workout logging remains available when remote AI is off, a quota is reached, or the
  network is unavailable.

Combat Power and nutrition estimates are for general wellness and entertainment only. They are
not diagnoses, treatment recommendations, or validated medical measurements.
```

## URLs

- Marketing URL: `https://reploom.pages.dev/`
- Privacy Policy URL: `https://reploom.pages.dev/privacy`
- Support URL: `https://reploom.pages.dev/support`
- Privacy Choices URL: `https://reploom.pages.dev/data`
- In-app supplemental Terms: `https://reploom.pages.dev/terms`
- App Store license agreement: Apple Standard EULA unless a separately reviewed custom license is
  explicitly configured in App Store Connect

Enter these URLs only after the Pages deployment returns HTTPS 200 at every route and the deployed
content matches the verified operator and support contact above.

## App Review notes

```text
Reploom has no login or account. Reviewers can use all core manual workout logging after the short
first-run setup.

Suggested core path:
1. On first launch, tap Skip on the welcome/setup flow (or complete its three short steps).
2. Open Log.
3. Type “bench 100 5” and submit. This common format parses and saves on device without a network request.
4. Use the visible Edit or Undo action on the confirmation card.
5. Open Explore and tap a region on the built-in sportswear body map to browse recommendations.

Optional Remote AI:
Settings → Remote AI processing. It is OFF by default. Enabling it requires an 18+ self-attestation and
discloses that selected input is sent through Reploom's Cloudflare Worker to Groq: workout text
with the display unit and exercise catalog names/IDs; microphone audio for transcription and, when
local matching cannot resolve it, the transcript with the same workout context; and submitted meal
text or a selected meal photo. Turning it off stops future AI requests; local workout quick logging
and saved-meal repeat remain available.

Reploom Pro subscription:
Settings → Reploom Pro, or attempt Voice/meal-photo AI while unsubscribed. The paywall retrieves the
localized product name and monthly price from StoreKit. Product ID:
ai.daeseon.reploom.pro.monthly.v1. Purchase, cancel/pending, current entitlement, Restore Purchases,
and Manage Subscription are implemented with StoreKit 2. Each paid billing period includes 1,000 AI
credits and up to 60 meal-photo analyses; workout text uses 1, meal text 2, voice transcription 3,
and photo 8. If a voice transcript needs flexible workout parsing, it uses 1 more credit (3–4
total), and voice recording requires at least 4 credits remaining.
Manual/local logging remains available without Pro and after quota exhaustion. Use an Apple Sandbox
account for review; no Reploom login is required.

Provider failures are returned to the advertised successful-use allowance. Separate cost-safety
counters can pause Remote AI after repeated failures; they do not block manual/local logging. Apple
test entitlements also use a UTC-day safety cap because Sandbox billing periods renew faster than
production periods.

Optional Apple Health:
Settings → Apple Health. Reploom requests read access only for workouts, VO₂ max, body weight, and
body fat, and write access only for workouts, body weight, and body fat actually logged or entered.
HealthKit records are processed on device and are never sent to Reploom's AI service. Combat Power
is never written to Apple Health.

Combat Power is visibly labeled as a for-fun score, not a scientific or medical metric. Arena uses
a local deterministic rival and weekly target; it contains no real users or network interaction.
V1 has no public leaderboard, chat, account creation, or remote photo-avatar generation.

Support and privacy contact: showep12@gmail.com
```

## App Privacy answers — conservative subscription build inventory

All declared collection is for App Functionality and not used for tracking. Selected AI inputs are
not linked to identity. Subscription entitlement and quota records are conservatively marked linked
to the Apple subscription even though Reploom stores only a one-way subscriber key rather than the
transaction identifier or deterministic app-account token processed during the session exchange.
“Collected” for AI content is conservative because selected inputs leave the device and Groq
documents limited reliability/abuse retention.

| Apple data type | Collected | Linked | Tracking | Exact v1 path |
|---|---:|---:|---:|---|
| Fitness | Yes | No | No | User-selected workout text plus display unit and exercise catalog names/IDs sent for optional AI parsing |
| Health | Yes | No | No | User-selected meal text and resulting nutrition estimate |
| Photos or Videos | Yes | No | No | Meal photo selected for optional AI estimation |
| Audio Data | Yes | No | No | Voice clip recorded for optional transcription; transcript may enter optional workout parsing when local matching cannot resolve it |
| Other User Content | Yes | No | No | Free-form workout/meal input sent for optional parsing |
| Purchase History | Yes | Yes | No | Subscription status and billing-period dates returned by Apple's authenticated server API and field-validated to provide Reploom Pro; exchange transaction IDs and deterministic app-account tokens are not written to D1 |
| User ID | Yes | Yes | No | One-way HMAC-derived subscriber key used to share and enforce quota across the Apple subscription |
| Product Interaction | Yes | Yes | No | Aggregate successful credits/photos, weighted provider attempts/photo attempts, one-way HMAC request key, request type/cost/status, billing reset time, and Apple-test UTC-day safety aggregate; no AI content |

HealthKit records read on device are not collected by Reploom and are not transmitted to the
Worker or Groq. The subscription build does not create or submit a leaderboard handle. Public ranking
routes return `410 Gone`; `/rank/delete` accepts an existing random TestFlight deletion token only
when that user explicitly removes the old row, and does not retain a new copy of the token.

## Screenshot set

Five 6.9-inch iPhone portrait screenshots were captured from the Release configuration at
1320×2868 with seeded, realistic local data. Each original was inspected without a device frame or
feature absent from v1, then uploaded to en-US `APP_IPHONE_67` and read back as `COMPLETE`.

Uploaded sequence:

1. Today cockpit with a realistic active session and quick actions.
2. Sportswear body map in the default front view.
3. Chest selected with today's-program, recent-set, and regional exercise recommendations.
4. History showing a realistic multi-day log.
5. Combat Power breakdown with the “for-fun” disclaimer visible.

Separate product QA also inspected the Log screen, `bench` search result, and Remote AI disclosure
with the setting visibly `OFF`. Originals are tracked in `docs/artifacts/app-store-v1/`.
