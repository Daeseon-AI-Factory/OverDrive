import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { withTimeout } from '@/lib/async';

// Upload a recorded audio file to the proxy's /transcribe (Groq whisper-large-v3) → text.
// Uses expo-file-system's native multipart upload (NOT RN FormData — the {uri} file-part shape
// throws "Unsupported FormDataPart Implementation" on the New Architecture). Language is omitted by
// default → Whisper AUTO-DETECTS (EN/KO/…). Throws with HTTP status + body so the caller can show
// the real reason. Key stays server-side.
export async function transcribeAudio(uri: string, endpoint: string, language?: string): Promise<string> {
  const res = await withTimeout(
    uploadAsync(`${endpoint.replace(/\/$/, '')}/transcribe`, uri, {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'audio/m4a',
      parameters: language ? { language } : undefined,
    }),
    8000, // hard cap — a stuck upload must never hold the logging bar hostage (spec: logging speed first)
    'transcribe',
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${(res.body ?? '').slice(0, 140)}`);
  }
  const data = JSON.parse(res.body) as { text?: string };
  return String(data?.text ?? '').trim();
}
