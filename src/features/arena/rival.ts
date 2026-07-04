// THE RIVAL — an original-IP AI nemesis whose Combat Power grows every day, whether you train or
// not. Pure + deterministic: rival CP is a function of (config, date), so it needs no daily cron and
// no extra table (config lives in user settings JSON). The WEEKLY showdown compares week-over-week
// GAINS (yours vs the rival's), not absolutes — improvement-based competition per non-negotiable
// §10, so it is always winnable by training (anti-shame). Absolute rival CP is flavor/pressure.

import { BASE_SCALE, CP_FLOOR } from '../combat-power/constants';

export interface RivalConfig {
  name: string; // original codename, no borrowed IP
  epoch: string; // yyyy-mm-dd the rival appeared
  cp0: number; // rival CP at epoch
  seed: number; // jitter seed (daily-gain variance)
}

/** Original rival codenames (no trademarked characters). */
export const RIVAL_NAMES = ['KAIROS', 'VEX', 'TALOS', 'NYX', 'ORYN', 'SABLE'] as const;

/** Deterministic 0..1 hash from (seed, n) — same idea as the shader hash, integer-safe. */
export function hash01(seed: number, n: number): number {
  let x = (seed ^ (n * 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0xffffffff;
}

/** Local yyyy-mm-dd → Date at local midnight. */
function parseLocal(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** Whole days from a to b (local calendar). Negative if b < a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 86_400_000);
}

/** Monday-based start of the week containing `date` (yyyy-mm-dd). */
export function weekStartLocal(date: string): string {
  const d = parseLocal(date);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** The rival's daily gain at a given CP — ~1.4% ±40% jitter, floor 6, so it always feels alive. */
function dailyGain(cp: number, seed: number, dayIdx: number): number {
  const jitter = 0.6 + 0.8 * hash01(seed, dayIdx);
  return Math.max(6, Math.round(cp * 0.014 * jitter));
}

/** Rival CP on a date. Deterministic; clamped to [CP_FLOOR, BASE_SCALE]. Before epoch → cp0. */
export function rivalCpOn(cfg: RivalConfig, date: string): number {
  const days = daysBetween(cfg.epoch, date);
  let cp = Math.max(CP_FLOOR, cfg.cp0);
  for (let i = 1; i <= days; i++) {
    cp = Math.min(BASE_SCALE, cp + dailyGain(cp, cfg.seed, i));
  }
  return cp;
}

/** The rival's gain on a single day (for the "+N today" line). */
export function rivalGainOn(cfg: RivalConfig, date: string): number {
  const prev = daysBetween(cfg.epoch, date) <= 0 ? cfg.cp0 : rivalCpOn(cfg, addDays(date, -1));
  return Math.max(0, rivalCpOn(cfg, date) - prev);
}

export function addDays(date: string, n: number): string {
  const d = parseLocal(date);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Spawn a rival AT or just BELOW the user's current CP (you start ahead — the rival chases you,
 * not the other way around: hype framing, not shame per §9). A zero-data user at CP_FLOOR gets a
 * rival tied at the floor, never above them. Name/seed from the random source passed in.
 */
export function createRival(userCp: number, today: string, rand: () => number = Math.random): RivalConfig {
  const seed = Math.floor(rand() * 0xffffffff) >>> 0;
  const name = RIVAL_NAMES[seed % RIVAL_NAMES.length] ?? RIVAL_NAMES[0];
  return {
    name,
    epoch: today,
    cp0: Math.max(CP_FLOOR, Math.min(userCp - 10, Math.round(userCp * 0.93))),
    seed,
  };
}
