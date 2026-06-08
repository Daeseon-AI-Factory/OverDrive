import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSettingsStore } from '@/stores/settingsStore';
import type { JuiceVerdict, SfxName } from '../juice.types';
import { SFX_SOURCES } from './manifest';
import { selectSfx } from './selectSfx';

/**
 * The audio half of JUICE. One preloaded one-shot player per SFX (a fixed, small set with
 * app-scoped lifetime). Every entry point is fire-and-forget and never throws — playback must NOT
 * block or break the log hot path (spec §6.4 철칙). Gating is by the in-app `soundOn` setting.
 */

const players = new Map<SfxName, AudioPlayer>();
let loaded = false;

/** Preload all SFX once at boot. Idempotent; safe to call repeatedly. */
export async function loadSfx(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    // Play through the iOS silent switch — the hype is the whole point; the in-app sound toggle
    // (and per-sound volume baked into the WAVs) governs loudness. No background playback.
    // mixWithOthers: SFX layer over the user's gym music instead of pausing/ducking it.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // non-fatal — players still work with default audio mode
  }
  (Object.keys(SFX_SOURCES) as SfxName[]).forEach((name) => {
    try {
      players.set(name, createAudioPlayer(SFX_SOURCES[name]));
    } catch {
      // skip a single sound that fails to load rather than disable audio entirely
    }
  });
}

/** Play one SFX by name. Respects the soundOn setting. Fire-and-forget, never throws. */
export function playNamed(name: SfxName): void {
  if (!useSettingsStore.getState().soundOn) return;
  const p = players.get(name);
  if (!p) return;
  try {
    // Restart from the top THEN play — sequenced (seekTo is async) so rapid re-triggers replay from
    // the head instead of racing. Still fire-and-forget: never awaited on the caller's path.
    void p.seekTo(0).then(() => p.play()).catch(() => {});
  } catch {
    // ignore — audio must never break logging
  }
}

/** Play the SFX for a JUICE verdict. Mirrors fireHaptic() at the JuiceProvider choke-point. */
export function playSfx(verdict: JuiceVerdict): void {
  playNamed(selectSfx(verdict));
}
