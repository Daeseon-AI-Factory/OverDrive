/** Empty means remote refresh is disabled; bundled/SQLite/seed discovery remains fully usable. */
export const CATALOG_ENDPOINT = (process.env.EXPO_PUBLIC_CATALOG_ENDPOINT ?? '').trim();
