import {
  FileSystemUploadType,
  createUploadTask,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import type { FoodItemInput } from '@/db/repos/foodRepo';
import { authorizedAiFetch, authorizedAiUpload } from '@/features/subscription/workerClient';

// Includes resizing-complete native upload plus the Worker's bounded 15s vision-provider call.
export const FOOD_PHOTO_UPLOAD_TIMEOUT_MS = 30_000;

/** Pure: validate + normalize the proxy's loose food JSON. Drops empty/garbage rows. Unit-tested. */
export function normalizeFoodItems(data: unknown): FoodItemInput[] {
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: FoodItemInput[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const kcal = Number(r.kcal);
    const proteinG = Number(r.proteinG);
    if (!name) continue;
    if (!Number.isFinite(kcal) && !Number.isFinite(proteinG)) continue;
    out.push({
      name,
      kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : 0,
      proteinG: Number.isFinite(proteinG) ? Math.max(0, Math.round(proteinG)) : 0,
    });
  }
  return out;
}

/** Meal PHOTO → estimated items, via the Worker's vision path (native multipart upload). */
export async function parseFoodPhoto(
  uri: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<FoodItemInput[]> {
  if (signal?.aborted) throw new Error('food photo cancelled');
  const res = await authorizedAiUpload(endpoint, (headers) => uploadFoodPhotoOnce(uri, endpoint, headers, signal));
  return normalizeFoodItems(JSON.parse(res.body));
}

async function uploadFoodPhotoOnce(
  uri: string,
  endpoint: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<FileSystemUploadResult> {
  if (signal?.aborted) throw new Error('food photo cancelled');
  const task = createUploadTask(`${endpoint.replace(/\/$/, '')}/food`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    headers,
  });

  let timedOut = false;
  let cancellationRequested = false;
  let rejectCancellation: (reason: Error) => void = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const requestCancellation = (reason: Error) => {
    if (cancellationRequested) return;
    cancellationRequested = true;
    // Wait for the native cancel call to settle before the caller's finally block removes the file.
    void task.cancelAsync()
      .catch(() => undefined)
      .finally(() => rejectCancellation(reason));
  };
  const cancelFromSignal = () => requestCancellation(new Error('food photo cancelled'));
  signal?.addEventListener('abort', cancelFromSignal);
  const timer = setTimeout(() => {
    timedOut = true;
    requestCancellation(new Error('food photo timed out'));
  }, FOOD_PHOTO_UPLOAD_TIMEOUT_MS);

  let res: FileSystemUploadResult | null | undefined;
  try {
    res = await Promise.race([task.uploadAsync(), cancellation]);
  } catch (error) {
    if (timedOut) throw new Error('food photo timed out');
    if (signal?.aborted) throw new Error('food photo cancelled');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelFromSignal);
  }
  // Upload completion can race the native cancellation callback; cancellation still wins.
  if (timedOut) throw new Error('food photo timed out');
  if (signal?.aborted) throw new Error('food photo cancelled');
  if (!res) throw new Error(timedOut ? 'food photo timed out' : 'food photo cancelled');
  return res;
}

/** Meal description text → estimated items, via the Worker proxy (Groq; key server-side). */
export async function parseFoodText(text: string, endpoint: string, signal?: AbortSignal): Promise<FoodItemInput[]> {
  const res = await authorizedAiFetch(endpoint, '/food', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  return normalizeFoodItems(await res.json());
}
