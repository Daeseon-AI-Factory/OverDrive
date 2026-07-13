# Reploom v1 Asset Provenance Ledger

Last audited: 2026-07-12. This ledger records evidence available in the repository; it is not a
substitute for the Account Holder's content-rights attestation or trademark clearance.

| Shipped asset | Repository evidence | Rights basis | Release status |
|---|---|---|---|
| Reploom mark, wordmark, app icon, splash, favicon, Android icon layers | Project vector sources and raster derivatives introduced in `a873470` | Repository-authored brand artwork; no third-party source is recorded | Account Holder must attest ownership and retain the editable sources |
| Sportswear body-map front/back PNGs | `assets/images/bodymap/sportswear-avatar-*.png`, introduced in `b646643`; its paired release log calls them original project assets | The repository does not retain the exact generation tool, source image, prompt, or license receipt | **Blocking attestation:** confirm they were generated/commissioned for Reploom without a third-party likeness or restricted source |
| Seven JUICE/forge WAV effects | Deterministic source generator `scripts/gen-sfx.mjs`, introduced with the WAV outputs in `a96743b` | Pure oscillator/noise synthesis; the source states no samples or external services | Evidence complete; regenerate and byte-compare if challenged |
| Anton font | `@expo-google-fonts/anton@0.4.2` in `package-lock.json` | Package declares `MIT AND OFL-1.1`; font license is `node_modules/@expo-google-fonts/anton/LICENSE_FONT` | Licensed third-party font; preserve package/version and license notice |
| Orbitron font | `@expo-google-fonts/orbitron@0.4.2` in `package-lock.json` | Package declares `MIT AND OFL-1.1`; font license is `node_modules/@expo-google-fonts/orbitron/LICENSE_FONT` | Licensed third-party font; preserve package/version and license notice |
| Exercise silhouettes and UI chrome | Rendered from project TypeScript/Skia geometry under `src/features/exercise-art/` and `src/ui/` | Project source code; no external bitmap or icon set is used for these drawings | Account Holder attestation required with the rest of the project source |

## Content-rights submission gate

Do not answer the App Store Connect content-rights question solely from this file. Before
submission, the Account Holder must:

1. confirm the sportswear PNG origin and absence of a real-person/third-party likeness;
2. confirm ownership of the Reploom brand artwork and all project-authored source;
3. retain the Anton and Orbitron package license texts with the release records; and
4. record the exact copyright owner entered in App Store Connect.

The old Expo/React template images that remain unreferenced in `assets/` are not imported by the
v1 application code. Archive inspection, rather than repository presence alone, determines what
is distributed in the IPA.

The repository root `LICENSE` is the untouched Expo template MIT notice naming 650 Industries. It
is evidence for upstream template material only and must not be presented as Reploom's copyright
ownership record. Replacing or supplementing it requires the verified Reploom copyright owner.
