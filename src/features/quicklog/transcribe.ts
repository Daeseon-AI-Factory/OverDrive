import {
  FileSystemUploadType,
  createUploadTask,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import { REPLOOM_CLIENT_HEADERS } from './config';

// Upload a recorded audio file to the proxy's /transcribe (Groq whisper-large-v3) → text.
// Uses expo-file-system's native multipart upload (NOT RN FormData — the {uri} file-part shape
// throws "Unsupported FormDataPart Implementation" on the New Architecture). Language is omitted by
// default → Whisper AUTO-DETECTS (EN/KO/…). Throws with HTTP status + body so the caller can show
// the real reason. Key stays server-side.
export async function transcribeAudio(
  uri: string,
  endpoint: string,
  language?: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new Error('transcribe cancelled');
  const task = createUploadTask(`${endpoint.replace(/\/$/, '')}/transcribe`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'audio/m4a',
    headers: REPLOOM_CLIENT_HEADERS,
    parameters: language ? { language } : undefined,
  });
  let timedOut = false;
  const cancel = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel);
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 8000);
  let res: FileSystemUploadResult | null | undefined;
  try {
    res = await task.uploadAsync();
  } catch (error) {
    if (timedOut) throw new Error('transcribe timed out');
    if (signal?.aborted) throw new Error('transcribe cancelled');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  // Native cancellation can race with a successful-looking upload result. Cancellation wins.
  if (timedOut) throw new Error('transcribe timed out');
  if (signal?.aborted) throw new Error('transcribe cancelled');
  if (!res) throw new Error('transcribe cancelled');
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${(res.body ?? '').slice(0, 140)}`);
  }
  const data = JSON.parse(res.body) as { text?: string };
  return String(data?.text ?? '').trim();
}
