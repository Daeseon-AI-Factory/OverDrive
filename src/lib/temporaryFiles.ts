import { cacheDirectory, deleteAsync } from 'expo-file-system/legacy';

type RemoveFile = (uri: string, options: { idempotent: boolean }) => Promise<void>;

export function isAppCacheFile(uri: string, cacheRoot: string | null = cacheDirectory): boolean {
  if (!cacheRoot) return false;
  const root = cacheRoot.endsWith('/') ? cacheRoot : `${cacheRoot}/`;
  return uri.startsWith(root);
}

/** Delete only files inside this app's cache container; never touch a photo-library source URL. */
export async function deleteAppCacheFile(
  uri: string | null | undefined,
  cacheRoot: string | null = cacheDirectory,
  remove: RemoveFile = deleteAsync,
): Promise<boolean> {
  if (!uri || !isAppCacheFile(uri, cacheRoot)) return true;
  try {
    await remove(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

/** Delete a file that Reploom itself created, such as an expo-audio recording. */
export async function deleteOwnedTemporaryFile(
  uri: string | null | undefined,
  remove: RemoveFile = deleteAsync,
): Promise<boolean> {
  if (!uri) return true;
  try {
    await remove(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}
