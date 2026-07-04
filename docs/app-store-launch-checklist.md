# Reploom App Store Launch Checklist

Status: launch-prep working document. Reploom is the current candidate public brand replacing the blocked OverDrive store name.

## Done in repo

- Public app name changed to `Reploom`.
- iOS bundle identifier changed to `ai.daeseon.reploom`.
- URL scheme changed to `reploom`.
- Store-facing permission strings changed from OverDrive to Reploom.
- iOS `CFBundleDisplayName` and `CFBundleName` changed to `Reploom`.
- Local-network / Bonjour / `exp+overdrive` development plist entries removed from `ios/OverDrive/Info.plist`.
- Reploom brand assets added:
  - `assets/brand/reploom-mark.svg`
  - `assets/brand/reploom-wordmark.svg`
  - `assets/images/icon.png`
  - `assets/images/android-icon-foreground.png`
  - `assets/images/android-icon-background.png`
  - `assets/images/android-icon-monochrome.png`
  - `assets/images/splash-icon.png`
  - `assets/images/favicon.png`
- Reproducible asset generator added at `scripts/gen-brand-assets.py`.

## Must finish before App Review submission

1. Run final trademark clearance for `Reploom`.
   - USPTO classes 9 / 41 / 42.
   - KIPRIS English and Korean marks.
   - App Store / Google Play exact and confusingly similar names.
   - Domain and social handles.

2. Create the App Store Connect app record.
   - Bundle ID: `ai.daeseon.reploom`.
   - Display name: `Reploom`.
   - SKU: choose a stable internal value such as `reploom-ios`.
   - Category: Health & Fitness.
   - Age rating: confirm final questionnaire.

3. Finalize privacy and health disclosures.
   - Review `docs/compliance/privacy-policy-draft.md` with counsel.
   - Publish a privacy policy URL.
   - Complete App Store privacy nutrition labels for:
     - Health and fitness data used on-device.
     - User-provided workout/food/rank inputs.
     - Photo/audio data sent to the worker for AI processing.
     - Anonymous ranking handle/device ID if ranking is enabled.
   - Re-check `ios/OverDrive/PrivacyInfo.xcprivacy`; it now declares app-functionality data flows for fitness leaderboard data, food/evolution photos, voice audio, user-entered content, and rank handle IDs. Confirm the final App Store Connect privacy nutrition labels match it.

4. Remove or deliberately justify dev-client dependency before final archive.
   - `expo-dev-client` is still in `package.json`.
   - Current source plist no longer exposes Dev Launcher local-network copy, but the dependency and native pods remain.
   - A removal attempt reached `pod install`, but CocoaPods needed the external trunk CDN and could not complete in the current restricted environment; keeping the dependency declared avoids a half-removed native state.
   - Preferred final path: remove `expo-dev-client`, regenerate native pods, then run a clean Release archive.

5. Verify production backend.
   - Deploy `worker/src/index.js`.
   - Confirm `/parse`, `/transcribe`, `/food`, `/rank/board`, `/rank/submit`, and `/evolve` with production secrets.
   - Confirm app `.env` / Xcode env points to the production worker.

6. Dogfood a signed Release build on a real iPhone.
   - Cold launch after install.
   - First-run onboarding.
   - One-tap plan generation.
   - Typed QuickLog.
   - Voice QuickLog.
   - Food text/photo.
   - Apple Health connect, sync, and InBody write.
   - Evolution image flow.
   - Theme switching.
   - Offline / endpoint-failure behavior.

7. Prepare store assets.
   - App icon: generated in repo, review at all masked sizes.
   - Screenshots: iPhone 6.7", 6.5", and 5.5" if required by App Store Connect.
   - Subtitle, promo text, description, keywords.
   - Support URL and marketing URL.

8. Archive and upload.
   - Use Xcode Archive or EAS equivalent with the App Store distribution profile for `ai.daeseon.reploom`.
   - Confirm `CFBundleDisplayName=Reploom`.
   - Confirm `CFBundleName=Reploom`.
   - Confirm no `NSBonjourServices`, `NSLocalNetworkUsageDescription`, or `exp+...` scheme in the archived app plist.
   - Upload to TestFlight first; do not submit direct to public review.
