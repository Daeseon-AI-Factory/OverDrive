import { deleteAsync, documentDirectory } from 'expo-file-system/legacy';

type RemoveFile = (uri: string, options: { idempotent: boolean }) => Promise<void>;

/**
 * Delete photo-avatar artifacts created by pre-v1 TestFlight builds. This intentionally runs on
 * every launch instead of setting a migration flag: a transient filesystem failure is retried and
 * an already-clean install remains a no-op.
 */
export async function purgeDeprecatedAvatarFiles(
  documents: string | null = documentDirectory,
  remove: RemoveFile = deleteAsync,
): Promise<boolean> {
  if (!documents) return false;
  const targets = [
    `${documents}body-avatar/`,
    `${documents}evolution-original.jpg`,
    `${documents}evolution-evolved.jpg`,
  ];
  const results = await Promise.allSettled(targets.map((uri) => remove(uri, { idempotent: true })));
  return results.every((result) => result.status === 'fulfilled');
}
