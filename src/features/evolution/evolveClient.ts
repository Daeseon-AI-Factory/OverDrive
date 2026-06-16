import { documentDirectory, EncodingType, FileSystemUploadType, copyAsync, getInfoAsync, uploadAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { downscaleForUpload } from '@/lib/image';
import { withTimeout } from '@/lib/async';

// EVOLUTION client — pick a photo of yourself, the Worker (Gemini image model, key server-side)
// returns the AI-evolved physique version for your current grade. The photo is pass-through only
// (never stored server-side); originals + results live in the app's local documents directory.

export const ORIGINAL_PATH = `${documentDirectory}evolution-original.jpg`;
export const EVOLVED_PATH = `${documentDirectory}evolution-evolved.jpg`;

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
 * Returns the evolved file uri. Throws with the HTTP status/body on failure.
 */
export async function evolve(endpoint: string, gradeKey: string): Promise<string> {
  const res = await withTimeout(
    uploadAsync(`${endpoint.replace(/\/$/, '')}/evolve`, ORIGINAL_PATH, {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'image/jpeg',
      parameters: { gradeKey },
    }),
    60000,
    'evolve',
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${(res.body ?? '').slice(0, 140)}`);
  }
  const data = JSON.parse(res.body) as { image?: string };
  if (!data.image) throw new Error('no image returned');
  await writeAsStringAsync(EVOLVED_PATH, data.image, { encoding: EncodingType.Base64 });
  return EVOLVED_PATH;
}
