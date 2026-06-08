// Upload a recorded audio file to the proxy's /transcribe (Groq whisper-large-v3) → text.
// The key stays server-side; the app only sends the audio + gets text back. Throws on failure so
// the caller can fall back (e.g. ask the user to type).
export async function transcribeAudio(uri: string, endpoint: string, language = 'ko'): Promise<string> {
  const fd = new FormData();
  // React Native multipart file shape — cast to Blob to satisfy the DOM FormData typing.
  fd.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as unknown as Blob);
  fd.append('language', language);
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/transcribe`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return String(data?.text ?? '').trim();
}
