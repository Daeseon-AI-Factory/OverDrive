// QuickLog AI proxy endpoint — a PUBLIC URL (the Cloudflare Worker), NOT a secret. The Gemini key
// lives only inside that Worker. Empty = AI disabled → the on-device rule parser handles everything.
// Set it in the repo-root .env:  EXPO_PUBLIC_QUICKLOG_ENDPOINT=https://overdrive-quicklog.<you>.workers.dev
export const QUICKLOG_ENDPOINT = (process.env.EXPO_PUBLIC_QUICKLOG_ENDPOINT ?? '').trim();
