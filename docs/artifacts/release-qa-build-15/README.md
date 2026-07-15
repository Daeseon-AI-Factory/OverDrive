# Release QA evidence — Build 15 candidate

This directory curates simulator evidence for the Build 15 release candidate. Screenshots 01–10 were captured from a **Release** simulator build of product code at `6240fbf`, immediately before `c98e021` changed only `expo.ios.buildNumber` from 14 to 15. Screenshot 11 was captured from the final Build 15 Release simulator app after its installed metadata and preserved seed database were read back.

## Verification boundary

- Device: iPhone 17 Pro Max simulator, iOS 26.5, 1320 × 2868 screenshots.
- Interaction: real touch-driven flows against a seeded schema-v8 SQLite database, not static mockups.
- Seed baseline: 5 workout sessions, 1 open session, 20 strength sets, 1 cardio row, and 3 food rows.
- Catalog baseline: bundled catalog 1.0.0 active with 64 exercises and SHA-256 `43491e64b66fbd16f87325d8e8ea9e5d2325d888b71c700b61b80da19566604a`.
- Cleanup: QA writes were removed by restoring the verified baseline; SQLite integrity was `ok` with zero foreign-key violations after restoration.
- Exclusions: these screenshots are not physical-device, TestFlight, App Store subscription, purchase, restore, renewal, refund, or App Review evidence.

## Curated screenshots

| File | Release flow evidenced | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| `01-today-set-saved.png` | Existing workout session resumed and an explicit set log produced visible saved state. | 1320 × 2868 | `584b3d098fef6f8fde1bbbc49ba54c602b17a4b18a608ae4afde5c2887cc6ed9` |
| `02-body-map-sportswear.png` | Female avatar uses non-sexualized sportswear presentation with tappable body regions. | 1320 × 2868 | `6c64dac2184ff7e6ff7cf01d1db0548f300e18f51a5b627ef9e869377e9b0d44` |
| `03-body-map-chest.png` | A real chest-region touch resolves to Chest recommendations including Barbell Bench Press. | 1320 × 2868 | `d0161bc6ef351da81dea0a6113a89ae934ea70e36e2507fd91d06e21073dc926` |
| `04-reps-per-side.png` | Bulgarian split squat selection exposes the required `Reps per side` input semantics. | 1320 × 2868 | `1aabdaade9bc81a7e3623a6a740a5b12e498d07d7f11e75fb4e7ecc95cd8c0eb` |
| `05-plank-duration-guard.png` | Plank logging fails closed on repetition-style input and states that this tracking mode is not loggable yet. | 1320 × 2868 | `cc1f3b80317f6ba016ff1aeeb008ef6a4b6a63ed463e67f176f70c74ddff15d1` |
| `06-curl-total-reps.png` | Curl logging presents total-repetition semantics rather than per-side semantics. | 1320 × 2868 | `787514e49978367bfaaabdc55eefe03f89b78cb98c7bd5e1f7611ecb5408974f` |
| `07-korean-alias-search.png` | Korean locale and Korean exercise alias search resolve to the intended catalog entry. | 1320 × 2868 | `edfb33e0446d345aa42a568ca6a2164eed073536e32d564faef872e4f167a9e8` |
| `08-quick-log-trap-bar.png` | Quick Log accepts a newly canonicalized trap-bar exercise and shows the recorded result. | 1320 × 2868 | `ae962f2e3a4913856c3df400320e45efc5e4c39e1f63238b1cfa3a990838652c` |
| `09-manual-meal-saved.png` | Manual meal entry saves `QA Bowl · 640kcal · 42g` and exposes Edit/Undo controls. | 1320 × 2868 | `2bc45fcad1d9dcf98248ed9136d08a1c7465fda6dfe788e3e6117a9bc3384f56` |
| `10-manual-meal-undone.png` | Undo removes the just-created meal and shows the visible `Meal removed` confirmation. | 1320 × 2868 | `b7e44288868c8c1108a67bc2bb1caf644f50e35657ae8e4e2a82dda4ab9ab510` |
| `11-build-15-smoke.png` | Installed Build 15 opens Explore, accepts an actual chest-region touch, and presents seeded Chest recommendations including Barbell Bench Press. | 1320 × 2868 | `5b990c8fccc5aee1a5059f2d7df4f967577c976c0180423d51e984a9f1b74f7b` |

## Final Build 15 simulator readback

- Installed app metadata: bundle `ai.daeseon.reploom`, version `1.0`, build `15`.
- Touch flow: Today launch → Explore → chest-region touch → Chest recommendations → Barbell Bench Press assertion; Maestro exit 0.
- Preserved database after the flow: schema 8, 5 sessions, 1 open session, 20 sets, 1 cardio row, and 3 food rows.
- Post-flow SQLite checks: integrity `ok`, zero foreign-key violations.

This closes the final Build 15 simulator UI gate only. Signed IPA validation and TestFlight processing remain separate verification layers.
