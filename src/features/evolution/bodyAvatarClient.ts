import {
  EncodingType,
  FileSystemUploadType,
  copyAsync,
  createUploadTask,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { downscaleForUpload } from '@/lib/image';

export type BodyAvatarOutfit = 'compression' | 'sport_top' | 'sleeveless';
export type BodyAvatarImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface BodyAvatarConsent {
  adultConfirmed: boolean;
  ownershipConfirmed: boolean;
  aiConsent: boolean;
}

export interface BodyAvatarManifest {
  schemaVersion: 1;
  generationRevision: number;
  originalPath: string;
  atlasPath: string | null;
  mimeType: BodyAvatarImageMime | null;
  outfit: BodyAvatarOutfit | null;
  selectedAt: string;
  generatedAt: string | null;
}

export interface GenerateBodyAvatarOptions {
  outfit: BodyAvatarOutfit;
  consent: BodyAvatarConsent;
  signal?: AbortSignal;
}

export interface BodyAvatarGeneration {
  pendingAtlasPath: string;
  manifest: BodyAvatarManifest;
  activationToken: number;
}

export type BodyAvatarErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'server'
  | 'validation'
  | 'filesystem'
  | 'superseded';

export class BodyAvatarError extends Error {
  constructor(
    readonly code: BodyAvatarErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'BodyAvatarError';
  }
}

export const BODY_AVATAR_TIMEOUT_MS = 60_000;
export const BODY_AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const BODY_AVATAR_MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
export const BODY_AVATAR_TARGET_ASPECT_RATIO = 4 / 5;
export const BODY_AVATAR_MIN_WIDTH = 400;
export const BODY_AVATAR_MIN_HEIGHT = 500;
export const BODY_AVATAR_MAX_PIXELS = 4_000_000;

const FALLBACK_DIRECTORY = 'file:///__body_avatar_documents_unavailable__/';
export const BODY_AVATAR_DIRECTORY = `${documentDirectory ?? FALLBACK_DIRECTORY}body-avatar/`;
export const BODY_AVATAR_ORIGINAL_PATH = `${BODY_AVATAR_DIRECTORY}original.jpg`;
export const BODY_AVATAR_ATLAS_PATH_PREFIX = `${BODY_AVATAR_DIRECTORY}atlas-r`;
export const BODY_AVATAR_PENDING_PATH_PREFIX = `${BODY_AVATAR_DIRECTORY}pending-r`;
export const BODY_AVATAR_MANIFEST_PATH = `${BODY_AVATAR_DIRECTORY}manifest.json`;
export const LEGACY_EVOLUTION_ORIGINAL_PATH = `${documentDirectory ?? FALLBACK_DIRECTORY}evolution-original.jpg`;
export const LEGACY_EVOLUTION_RESULT_PATH = `${documentDirectory ?? FALLBACK_DIRECTORY}evolution-evolved.jpg`;

const MANIFEST_BACKUP_PATH = `${BODY_AVATAR_MANIFEST_PATH}.bak`;
const ORIGINAL_TEMP_PATH = `${BODY_AVATAR_DIRECTORY}original.tmp.jpg`;
const ORIGINAL_BACKUP_PATH = `${BODY_AVATAR_ORIGINAL_PATH}.bak`;
const OUTFITS: readonly BodyAvatarOutfit[] = ['compression', 'sport_top', 'sleeveless'];
const OUTPUT_MIMES: readonly BodyAvatarImageMime[] = ['image/jpeg', 'image/png', 'image/webp'];

let generationToken = 0;
let activeUpload: { token: number; cancel: () => void } | null = null;

function requireDocumentsDirectory(): void {
  if (!documentDirectory) throw new BodyAvatarError('filesystem', 'document directory unavailable');
}

function isOutfit(value: unknown): value is BodyAvatarOutfit {
  return typeof value === 'string' && (OUTFITS as readonly string[]).includes(value);
}

function normalizeMime(value: unknown): BodyAvatarImageMime | null {
  if (typeof value !== 'string') return null;
  const mime = value.toLowerCase().split(';', 1)[0].trim();
  if (mime === 'image/jpg') return 'image/jpeg';
  return (OUTPUT_MIMES as readonly string[]).includes(mime) ? (mime as BodyAvatarImageMime) : null;
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function validBase64(value: string): boolean {
  return value.length >= 32 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function decodeBase64Prefix(value: string, maxBytes = 12): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    if (char === '=') break;
    const digit = alphabet.indexOf(char);
    if (digit < 0) return [];
    buffer = buffer * 64 + digit;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push(Math.floor(buffer / 2 ** bits) & 0xff);
      buffer %= 2 ** bits;
      if (bytes.length >= maxBytes) return bytes;
    }
  }
  return bytes;
}

function responseSignatureMatches(value: string, mimeType: BodyAvatarImageMime): boolean {
  const bytes = decodeBase64Prefix(value);
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  }
  return (
    bytes.slice(0, 4).map((byte) => String.fromCharCode(byte)).join('') === 'RIFF' &&
    bytes.slice(8, 12).map((byte) => String.fromCharCode(byte)).join('') === 'WEBP'
  );
}

export function assertBodyAvatarDimensions(width: number, height: number): void {
  const ratio = width / height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < BODY_AVATAR_MIN_WIDTH ||
    height < BODY_AVATAR_MIN_HEIGHT ||
    width * height > BODY_AVATAR_MAX_PIXELS ||
    Math.abs(ratio - BODY_AVATAR_TARGET_ASPECT_RATIO) > 0.05
  ) {
    throw new BodyAvatarError('server', `invalid atlas dimensions ${width}x${height}`);
  }
}

/** Runtime gate as well as a TypeScript contract: callers cannot bypass consent with casts/JS. */
export function assertBodyAvatarGenerationInput(outfit: unknown, consent: BodyAvatarConsent): asserts outfit is BodyAvatarOutfit {
  if (!isOutfit(outfit)) throw new BodyAvatarError('validation', 'invalid outfit');
  if (consent?.adultConfirmed !== true || consent?.ownershipConfirmed !== true || consent?.aiConsent !== true) {
    throw new BodyAvatarError('validation', 'all confirmations must be true');
  }
}

/** Validate the Worker's JSON before any bytes reach the published local atlas path. */
export function normalizeBodyAvatarResponse(value: unknown): { mimeType: BodyAvatarImageMime; image: string } {
  if (!value || typeof value !== 'object') throw new BodyAvatarError('server', 'invalid response shape');
  const response = value as { mimeType?: unknown; image?: unknown };
  const mimeType = normalizeMime(response.mimeType);
  if (!mimeType) throw new BodyAvatarError('server', 'unsupported response image type');
  if (typeof response.image !== 'string' || !validBase64(response.image)) {
    throw new BodyAvatarError('server', 'invalid response image');
  }
  if (!responseSignatureMatches(response.image, mimeType)) {
    throw new BodyAvatarError('server', 'response image signature mismatch');
  }
  if (base64ByteLength(response.image) > BODY_AVATAR_MAX_OUTPUT_BYTES) {
    throw new BodyAvatarError('server', 'response image too large');
  }
  return { mimeType, image: response.image };
}

export function nextBodyAvatarRevision(current: number | null | undefined): number {
  return Number.isSafeInteger(current) && (current ?? -1) >= 0 ? (current as number) + 1 : 1;
}

function atlasExtension(mimeType: BodyAvatarImageMime): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function bodyAvatarAtlasPath(revision: number, mimeType: BodyAvatarImageMime): string {
  return `${BODY_AVATAR_ATLAS_PATH_PREFIX}${revision}.${atlasExtension(mimeType)}`;
}

function bodyAvatarPendingPath(revision: number): string {
  return `${BODY_AVATAR_PENDING_PATH_PREFIX}${revision}.png`;
}

function isSafeLocalPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith(BODY_AVATAR_DIRECTORY) && !path.includes('..');
}

function isManifest(value: unknown): value is BodyAvatarManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<BodyAvatarManifest>;
  return (
    manifest.schemaVersion === 1 &&
    Number.isSafeInteger(manifest.generationRevision) &&
    (manifest.generationRevision ?? -1) >= 0 &&
    manifest.originalPath === BODY_AVATAR_ORIGINAL_PATH &&
    (manifest.atlasPath === null || isSafeLocalPath(manifest.atlasPath)) &&
    (manifest.mimeType === null || normalizeMime(manifest.mimeType) === manifest.mimeType) &&
    (manifest.outfit === null || isOutfit(manifest.outfit)) &&
    typeof manifest.selectedAt === 'string' &&
    (manifest.generatedAt === null || typeof manifest.generatedAt === 'string')
  );
}

async function ensureDirectory(): Promise<void> {
  requireDocumentsDirectory();
  await makeDirectoryAsync(BODY_AVATAR_DIRECTORY, { intermediates: true });
}

async function readManifestAt(path: string): Promise<BodyAvatarManifest | null> {
  try {
    const parsed: unknown = JSON.parse(await readAsStringAsync(path));
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Reads the last published state; a backup is recovered after a process death between renames. */
export async function loadBodyAvatarManifest(): Promise<BodyAvatarManifest | null> {
  const current = await readManifestAt(BODY_AVATAR_MANIFEST_PATH);
  if (current) return current;
  const backup = await readManifestAt(MANIFEST_BACKUP_PATH);
  if (!backup) return null;
  try {
    // Legacy moveAsync replaces destinations on iOS but not consistently on Android. Remove an
    // invalid partial manifest first; the valid backup remains intact if the following rename fails.
    await deleteAsync(BODY_AVATAR_MANIFEST_PATH, { idempotent: true });
    await moveAsync({ from: MANIFEST_BACKUP_PATH, to: BODY_AVATAR_MANIFEST_PATH });
  } catch {
    // The valid backup still remains readable, so recovery can be retried on the next load.
  }
  return backup;
}

async function replaceFromTemp(tempPath: string, finalPath: string, backupPath: string): Promise<void> {
  await deleteAsync(backupPath, { idempotent: true });
  const current = await getInfoAsync(finalPath);
  if (current.exists) await moveAsync({ from: finalPath, to: backupPath });
  try {
    await moveAsync({ from: tempPath, to: finalPath });
  } catch (error) {
    const backup = await getInfoAsync(backupPath).catch(() => ({ exists: false }) as const);
    if (backup.exists) await moveAsync({ from: backupPath, to: finalPath }).catch(() => undefined);
    throw error;
  }
  await deleteAsync(backupPath, { idempotent: true });
}

async function publishManifest(manifest: BodyAvatarManifest, token: number, signal?: AbortSignal): Promise<void> {
  const tempPath = `${BODY_AVATAR_MANIFEST_PATH}.${token}.tmp`;
  await writeAsStringAsync(tempPath, JSON.stringify(manifest));
  try {
    assertCurrentGeneration(token, signal);
    await replaceFromTemp(tempPath, BODY_AVATAR_MANIFEST_PATH, MANIFEST_BACKUP_PATH);
    assertCurrentGeneration(token, signal);
  } finally {
    await deleteAsync(tempPath, { idempotent: true }).catch(() => undefined);
  }
}

async function removeGeneratedFiles(keepAtlasPath: string | null = null): Promise<void> {
  let names: string[] = [];
  try {
    names = await readDirectoryAsync(BODY_AVATAR_DIRECTORY);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name.startsWith('atlas-'))
      .map((name) => `${BODY_AVATAR_DIRECTORY}${name}`)
      .filter((path) => path !== keepAtlasPath)
      .map((path) => deleteAsync(path, { idempotent: true }).catch(() => undefined)),
  );
}

async function removePendingFiles(keepPath: string | null = null): Promise<void> {
  let names: string[] = [];
  try {
    names = await readDirectoryAsync(BODY_AVATAR_DIRECTORY);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => name.startsWith('pending-'))
      .map((name) => `${BODY_AVATAR_DIRECTORY}${name}`)
      .filter((path) => path !== keepPath)
      .map((path) => deleteAsync(path, { idempotent: true }).catch(() => undefined)),
  );
}

function supersedeActiveGeneration(): number {
  generationToken += 1;
  activeUpload?.cancel();
  activeUpload = null;
  return generationToken;
}

function assertCurrentGeneration(token: number, signal?: AbortSignal): void {
  if (token !== generationToken) throw new BodyAvatarError('superseded');
  if (signal?.aborted) throw new BodyAvatarError('cancelled');
}

/**
 * User-initiated picker only. The selected image is downscaled and published locally; generation is
 * deliberately separate so choosing a photo never implies consent or an external request.
 */
export async function pickAndStoreBodyAvatarPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const token = supersedeActiveGeneration();
  const asset = result.assets[0];
  const downscaled = await downscaleForUpload(asset.uri, 1024);
  const sourceMime = normalizeMime(asset.mimeType);
  if (downscaled === asset.uri && sourceMime !== 'image/jpeg') {
    throw new BodyAvatarError('validation', 'photo could not be converted to JPEG');
  }

  await ensureDirectory();
  await deleteAsync(ORIGINAL_TEMP_PATH, { idempotent: true });
  try {
    await copyAsync({ from: downscaled, to: ORIGINAL_TEMP_PATH });
    const info = await getInfoAsync(ORIGINAL_TEMP_PATH);
    if (!info.exists || info.isDirectory || info.size <= 0) {
      throw new BodyAvatarError('validation', 'empty photo');
    }
    if (info.size > BODY_AVATAR_MAX_INPUT_BYTES) {
      throw new BodyAvatarError('validation', 'photo too large');
    }

    const previous = await loadBodyAvatarManifest();
    await replaceFromTemp(ORIGINAL_TEMP_PATH, BODY_AVATAR_ORIGINAL_PATH, ORIGINAL_BACKUP_PATH);
    const selectedAt = new Date().toISOString();
    await publishManifest(
      {
        schemaVersion: 1,
        generationRevision: previous?.generationRevision ?? 0,
        originalPath: BODY_AVATAR_ORIGINAL_PATH,
        atlasPath: previous?.atlasPath ?? null,
        mimeType: previous?.mimeType ?? null,
        outfit: previous?.outfit ?? null,
        selectedAt,
        generatedAt: previous?.generatedAt ?? null,
      },
      token,
    );
    await removeGeneratedFiles(previous?.atlasPath ?? null);
    return BODY_AVATAR_ORIGINAL_PATH;
  } catch (error) {
    if (error instanceof BodyAvatarError) throw error;
    throw new BodyAvatarError('filesystem', error instanceof Error ? error.message : String(error));
  } finally {
    await deleteAsync(ORIGINAL_TEMP_PATH, { idempotent: true }).catch(() => undefined);
  }
}

export async function hasBodyAvatarOriginal(): Promise<boolean> {
  const info = await getInfoAsync(BODY_AVATAR_ORIGINAL_PATH);
  return info.exists && !info.isDirectory && info.size > 0;
}

export async function hasBodyAvatarAtlas(): Promise<boolean> {
  const manifest = await loadBodyAvatarManifest();
  if (!manifest?.atlasPath) return false;
  const info = await getInfoAsync(manifest.atlasPath);
  return info.exists && !info.isDirectory && info.size > 0;
}

/** Legacy hero-photo files remain deletable after that consent-less UI is retired. */
export async function hasLegacyBodyAvatarFiles(): Promise<boolean> {
  const files = await Promise.all(
    [LEGACY_EVOLUTION_ORIGINAL_PATH, LEGACY_EVOLUTION_RESULT_PATH].map((path) =>
      getInfoAsync(path).catch(() => ({ exists: false }) as const),
    ),
  );
  return files.some((file) => file.exists && !file.isDirectory);
}

/**
 * Explicit external action. All confirmations are sent as literal "true" fields and independently
 * revalidated by the Worker. A unique revision path is published before the manifest pointer moves.
 */
export async function generateBodyAvatar(
  endpoint: string,
  options: GenerateBodyAvatarOptions,
): Promise<BodyAvatarGeneration> {
  assertBodyAvatarGenerationInput(options.outfit, options.consent);
  if (options.signal?.aborted) throw new BodyAvatarError('cancelled');
  if (!endpoint.trim()) throw new BodyAvatarError('validation', 'missing endpoint');
  if (!(await hasBodyAvatarOriginal())) throw new BodyAvatarError('validation', 'missing original photo');

  const sourceInfo = await getInfoAsync(BODY_AVATAR_ORIGINAL_PATH);
  if (!sourceInfo.exists || sourceInfo.isDirectory || sourceInfo.size > BODY_AVATAR_MAX_INPUT_BYTES) {
    throw new BodyAvatarError('validation', 'invalid original photo');
  }
  if (options.signal?.aborted) throw new BodyAvatarError('cancelled');

  const token = supersedeActiveGeneration();
  const task = createUploadTask(`${endpoint.replace(/\/$/, '')}/body-avatar`, BODY_AVATAR_ORIGINAL_PATH, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    parameters: {
      outfit: options.outfit,
      adultConfirmed: 'true',
      ownershipConfirmed: 'true',
      aiConsent: 'true',
    },
  });
  const cancelUpload = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  activeUpload = { token, cancel: cancelUpload };
  options.signal?.addEventListener('abort', cancelUpload);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    cancelUpload();
  }, BODY_AVATAR_TIMEOUT_MS);

  let response: FileSystemUploadResult | null | undefined;
  try {
    response = await task.uploadAsync();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (token !== generationToken) throw new BodyAvatarError('superseded', detail);
    if (timedOut) throw new BodyAvatarError('timeout', detail);
    if (options.signal?.aborted) throw new BodyAvatarError('cancelled', detail);
    throw new BodyAvatarError('network', detail);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancelUpload);
    if (activeUpload?.token === token) activeUpload = null;
  }

  assertCurrentGeneration(token, options.signal);
  if (!response) throw new BodyAvatarError(timedOut ? 'timeout' : 'cancelled');
  if (response.status < 200 || response.status >= 300) {
    throw new BodyAvatarError('server', `HTTP ${response.status} ${(response.body ?? '').slice(0, 160)}`);
  }
  if ((response.body ?? '').length > Math.ceil((BODY_AVATAR_MAX_OUTPUT_BYTES * 4) / 3) + 1024) {
    throw new BodyAvatarError('server', 'response body too large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    throw new BodyAvatarError('server', 'invalid JSON response');
  }
  const output = normalizeBodyAvatarResponse(parsed);
  const previous = await loadBodyAvatarManifest();
  const revision = nextBodyAvatarRevision(previous?.generationRevision);
  // Decode and normalize locally before publishing. A model can return syntactically valid base64
  // that ignores the requested atlas shape; only an actual 4:5 image becomes the active avatar.
  const atlasPath = bodyAvatarAtlasPath(revision, 'image/png');
  const pendingAtlasPath = bodyAvatarPendingPath(revision);
  const rawTempPath = `${BODY_AVATAR_DIRECTORY}atlas-input-${token}.${atlasExtension(output.mimeType)}`;
  const atlasTempPath = `${atlasPath}.${token}.tmp.png`;
  let decodedCachePath: string | null = null;
  await ensureDirectory();

  try {
    await writeAsStringAsync(rawTempPath, output.image, { encoding: EncodingType.Base64 });
    const written = await getInfoAsync(rawTempPath);
    if (!written.exists || written.isDirectory || written.size <= 0 || written.size > BODY_AVATAR_MAX_OUTPUT_BYTES) {
      throw new BodyAvatarError('server', 'invalid encoded atlas');
    }
    const decoded = await manipulateAsync(rawTempPath, [], { compress: 1, format: SaveFormat.PNG });
    decodedCachePath = decoded.uri;
    assertBodyAvatarDimensions(decoded.width, decoded.height);
    await copyAsync({ from: decoded.uri, to: atlasTempPath });
    const normalized = await getInfoAsync(atlasTempPath);
    if (!normalized.exists || normalized.isDirectory || normalized.size <= 0 || normalized.size > BODY_AVATAR_MAX_OUTPUT_BYTES) {
      throw new BodyAvatarError('server', 'invalid normalized atlas');
    }
    assertCurrentGeneration(token, options.signal);
    await deleteAsync(pendingAtlasPath, { idempotent: true });
    await moveAsync({ from: atlasTempPath, to: pendingAtlasPath });
    const generatedAt = new Date().toISOString();
    const manifest: BodyAvatarManifest = {
      schemaVersion: 1,
      generationRevision: revision,
      originalPath: BODY_AVATAR_ORIGINAL_PATH,
      atlasPath,
      mimeType: 'image/png',
      outfit: options.outfit,
      selectedAt: previous?.selectedAt ?? generatedAt,
      generatedAt,
    };
    assertCurrentGeneration(token, options.signal);
    await removePendingFiles(pendingAtlasPath);
    return { pendingAtlasPath, manifest, activationToken: token };
  } catch (error) {
    if (error instanceof BodyAvatarError) throw error;
    throw new BodyAvatarError('filesystem', error instanceof Error ? error.message : String(error));
  } finally {
    await deleteAsync(rawTempPath, { idempotent: true }).catch(() => undefined);
    await deleteAsync(atlasTempPath, { idempotent: true }).catch(() => undefined);
    if (decodedCachePath && decodedCachePath !== rawTempPath && decodedCachePath !== atlasTempPath) {
      await deleteAsync(decodedCachePath, { idempotent: true }).catch(() => undefined);
    }
  }
}

/** Publish only after the user has inspected the two-panel preview and explicitly accepts it. */
export async function activateBodyAvatarGeneration(generation: BodyAvatarGeneration): Promise<BodyAvatarManifest> {
  assertCurrentGeneration(generation.activationToken);
  if (
    !isSafeLocalPath(generation.pendingAtlasPath) ||
    !generation.pendingAtlasPath.startsWith(BODY_AVATAR_PENDING_PATH_PREFIX) ||
    !isManifest(generation.manifest) ||
    !generation.manifest.atlasPath
  ) {
    throw new BodyAvatarError('validation', 'invalid pending generation');
  }
  const pending = await getInfoAsync(generation.pendingAtlasPath);
  if (!pending.exists || pending.isDirectory || pending.size <= 0 || pending.size > BODY_AVATAR_MAX_OUTPUT_BYTES) {
    throw new BodyAvatarError('filesystem', 'pending atlas missing');
  }
  assertCurrentGeneration(generation.activationToken);
  await deleteAsync(generation.manifest.atlasPath, { idempotent: true });
  await moveAsync({ from: generation.pendingAtlasPath, to: generation.manifest.atlasPath });
  await publishManifest(generation.manifest, generation.activationToken);
  await removeGeneratedFiles(generation.manifest.atlasPath);
  await removePendingFiles();
  return generation.manifest;
}

/** Discard an unapproved preview without changing the currently active avatar. */
export async function discardBodyAvatarGeneration(generation: BodyAvatarGeneration): Promise<void> {
  if (generation.activationToken === generationToken) supersedeActiveGeneration();
  if (
    isSafeLocalPath(generation.pendingAtlasPath) &&
    generation.pendingAtlasPath.startsWith(BODY_AVATAR_PENDING_PATH_PREFIX)
  ) {
    await deleteAsync(generation.pendingAtlasPath, { idempotent: true });
  }
}

/** Delete every local original, atlas, manifest, temp, and backup; no network request is made. */
export async function deleteBodyAvatarLocalFiles(): Promise<void> {
  supersedeActiveGeneration();
  requireDocumentsDirectory();
  await Promise.all([
    deleteAsync(BODY_AVATAR_DIRECTORY, { idempotent: true }),
    deleteAsync(LEGACY_EVOLUTION_ORIGINAL_PATH, { idempotent: true }),
    deleteAsync(LEGACY_EVOLUTION_RESULT_PATH, { idempotent: true }),
  ]);
}
