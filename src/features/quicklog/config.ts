// QuickLog AI proxy endpoint — a PUBLIC URL (the Cloudflare Worker), NOT a secret. The Gemini key
// lives only inside that Worker. Defaults to the deployed production Worker so store/TestFlight
// builds ship with AI enabled even when no env var is injected (a build once shipped with '' and
// killed voice/food/photo — see docs/troubleshooting.md). Override via repo-root .env or the
// eas.json build env:  EXPO_PUBLIC_QUICKLOG_ENDPOINT=https://overdrive-quicklog.<you>.workers.dev
// An explicitly EMPTY value disables AI → the on-device rule parser handles everything.
export const QUICKLOG_ENDPOINT = (
  process.env.EXPO_PUBLIC_QUICKLOG_ENDPOINT ?? 'https://overdrive-quicklog.daeseon.workers.dev'
).trim();
