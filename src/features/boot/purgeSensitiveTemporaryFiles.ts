import { cacheDirectory, deleteAsync } from 'expo-file-system/legacy';

type RemoveFile = (uri: string, options: { idempotent: boolean }) => Promise<void>;

/**
 * Sweep only cache directories owned by Reploom's microphone and selected-meal-photo flows. This
 * catches artifacts left by a force-quit before the normal request-level finally cleanup ran.
 */
export async function purgeSensitiveTemporaryFiles(
  cache: string | null = cacheDirectory,
  remove: RemoveFile = deleteAsync,
): Promise<boolean> {
  if (!cache) return false;
  const targets = ['ExpoAudio/', 'ImagePicker/', 'ImageManipulator/'].map((name) => `${cache}${name}`);
  const results = await Promise.allSettled(targets.map((uri) => remove(uri, { idempotent: true })));
  return results.every((result) => result.status === 'fulfilled');
}
