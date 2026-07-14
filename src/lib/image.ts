import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Downscale a picked photo before uploading to a vision API. Full-resolution iPhone album photos
 * (12MP, multi-MB) overflow Groq's image limit → the worker gets HTTP 413, or the model silently
 * returns zero items (→ the food card shows "couldn't estimate"). Capping the width to ~1024px puts
 * every photo in the proven-working range (~150–300KB) and is plenty of detail for recognition.
 * A resize failure is intentionally fatal: uploading the original can exceed the provider limit
 * and would disclose a full-resolution photo the user was told would be reduced first.
 */
export async function downscaleForUpload(uri: string, maxWidth = 1024): Promise<string> {
  const out = await manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return out.uri;
}
