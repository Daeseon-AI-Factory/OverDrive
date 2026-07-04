import {
  documentDirectory,
  EncodingType,
  FileSystemUploadType,
  copyAsync,
  createUploadTask,
  getInfoAsync,
  writeAsStringAsync,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { downscaleForUpload } from '@/lib/image';

// EVOLUTION client — pick a photo of yourself, the Worker (Gemini image model, key server-side)
// returns the AI-evolved physique version for your current grade. The photo is pass-through only
// (never stored server-side); originals + results live in the app's local documents directory.

export const ORIGINAL_PATH = `${documentDirectory}evolution-original.jpg`;
export const EVOLVED_PATH = `${documentDirectory}evolution-evolved.jpg`;

export type EvolveErrorCode = 'cancelled' | 'timeout' | 'network' | 'server';

/**
 * Typed evolve failure so the UI can map codes to friendly copy. Raw HTTP status/body/exception
 * text lives in `detail` for logging only — it must never be rendered to the user.
 */
export class EvolveError extends Error {
  constructor(
    readonly code: EvolveErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'EvolveError';
  }
}

/** Open the photo library picker. Returns the local uri, or null if cancelled. */
export async function pickPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: true,
    aspect: [3, 4],
  });
  if (res.canceled || !res.assets?.[0]?.uri) return null;
  const uri = await downscaleForUpload(res.assets[0].uri);
  await copyAsync({ from: uri, to: ORIGINAL_PATH });
  return ORIGINAL_PATH;
}

/** True if an original photo has been set. */
export async function hasOriginal(): Promise<boolean> {
  const info = await getInfoAsync(ORIGINAL_PATH);
  return info.exists;
}

/** True if an evolved image exists. */
export async function hasEvolved(): Promise<boolean> {
  const info = await getInfoAsync(EVOLVED_PATH);
  return info.exists;
}

/**
 * Send the stored original to the Worker's /evolve and save the AI-evolved image locally.
 * Returns the evolved file uri. Throws EvolveError on failure; pass an AbortSignal to let the
 * user cancel — cancel AND timeout both abort the underlying native upload (no zombie request
 * left draining the network after the caller gives up).
 */
export async function evolve(endpoint: string, gradeKey: string, themeId: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new EvolveError('cancelled');
  const task = createUploadTask(`${endpoint.replace(/\/$/, '')}/evolve`, ORIGINAL_PATH, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    parameters: { gradeKey, themeId },
  });
  const cancelUpload = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelUpload);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancelUpload();
  }, 60000);
  let res: FileSystemUploadResult | undefined | null;
  try {
    res = await task.uploadAsync();
  } catch (e) {
    // A cancelled native task surfaces as a rejection (NSURLErrorCancelled / OkHttp "Canceled")
    // — classify by what triggered it rather than leaking the platform error to the caller.
    const detail = e instanceof Error ? e.message : String(e);
    if (timedOut) throw new EvolveError('timeout', detail);
    if (signal?.aborted) throw new EvolveError('cancelled', detail);
    throw new EvolveError('network', detail);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelUpload);
  }
  // Cancelled-before-start resolves undefined/null instead of rejecting.
  if (!res) throw new EvolveError(timedOut ? 'timeout' : 'cancelled');
  if (res.status < 200 || res.status >= 300) {
    throw new EvolveError('server', `HTTP ${res.status} ${(res.body ?? '').slice(0, 140)}`);
  }
  let data: { image?: string };
  try {
    data = JSON.parse(res.body) as { image?: string };
  } catch {
    throw new EvolveError('server', `invalid JSON ${(res.body ?? '').slice(0, 140)}`);
  }
  if (!data.image) throw new EvolveError('server', 'no image returned');
  await writeAsStringAsync(EVOLVED_PATH, data.image, { encoding: EncodingType.Base64 });
  return EVOLVED_PATH;
}
