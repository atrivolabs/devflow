import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR, ensureDir } from "./paths.js";

// A named cadence profile — a one-word shorthand for a set of durations (and
// optionally a channel), switched in with `--profile <name>`. Every field is
// optional; whatever a profile omits falls back to the base config.
export interface Profile {
  work?: number; // minutes
  break?: number; // minutes
  longBreak?: number; // minutes
  longBreakEvery?: number; // a long break replaces the short one every N blocks
  channel?: string;
}

export interface Config {
  channel: string;
  work: number; // minutes
  break: number; // minutes
  longBreak: number; // minutes
  rounds: number | null; // null = run forever
  longBreakEvery: number; // a long break replaces the short one every N blocks
  voice: boolean; // speak transitions aloud
  mascot: boolean; // animated runner alongside the progress bar
  warnLeadSeconds: number; // heads-up cue this many seconds before a transition; 0 = off
  musicVolume: number; // 0–100
  cueVolume: number; // 0–100, applies to transition sounds and voice
  profiles: Record<string, Profile>; // user-defined named cadence profiles
}

// Ships-with presets. Merged under any same-named profile from config.json, so
// a user can tweak `deep` without redefining it from scratch.
export const PROFILE_PRESETS: Record<string, Profile> = {
  // 50/10, long break every 2 rounds — a 2h container is exactly 2 cycles.
  deep: { work: 50, break: 10, longBreak: 15, longBreakEvery: 2 },
  // 25/5, long break every 4 rounds — classic pomodoro for scattered days.
  scatter: { work: 25, break: 5, longBreak: 15, longBreakEvery: 4 },
};

export const DEFAULTS: Config = {
  channel: "lofi",
  work: 25,
  break: 5,
  longBreak: 15,
  rounds: null,
  longBreakEvery: 4,
  voice: false,
  mascot: false,
  warnLeadSeconds: 60,
  musicVolume: 40,
  cueVolume: 100,
  profiles: {},
};

const CONFIG_FILE = join(DEVFLOW_DIR, "config.json");

export function configPath(): string {
  return CONFIG_FILE;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return sanitize(JSON.parse(readFileSync(CONFIG_FILE, "utf-8")));
  } catch {
    return { ...DEFAULTS }; // malformed file should never break a session
  }
}

export function saveConfig(cfg: Config): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Merge a raw object over the defaults, keeping only valid values.
function sanitize(raw: unknown): Config {
  const c: Config = { ...DEFAULTS, profiles: {} }; // fresh map — never mutate DEFAULTS
  if (!raw || typeof raw !== "object") return c;
  const r = raw as Record<string, unknown>;

  if (typeof r.channel === "string" && r.channel.trim()) c.channel = r.channel.trim();
  if (typeof r.voice === "boolean") c.voice = r.voice;
  if (typeof r.mascot === "boolean") c.mascot = r.mascot;

  const posInt = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 1;
  if (posInt(r.work)) c.work = r.work as number;
  if (posInt(r.break)) c.break = r.break as number;
  if (posInt(r.longBreak)) c.longBreak = r.longBreak as number;
  if (posInt(r.longBreakEvery)) c.longBreakEvery = r.longBreakEvery as number;

  if (typeof r.warnLeadSeconds === "number" && Number.isFinite(r.warnLeadSeconds) && r.warnLeadSeconds >= 0) {
    c.warnLeadSeconds = r.warnLeadSeconds;
  }
  if (r.rounds === null || posInt(r.rounds)) c.rounds = r.rounds as number | null;

  const vol = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (vol(r.musicVolume)) c.musicVolume = clamp(r.musicVolume as number);
  if (vol(r.cueVolume)) c.cueVolume = clamp(r.cueVolume as number);

  if (r.profiles && typeof r.profiles === "object") {
    for (const [name, raw] of Object.entries(r.profiles as Record<string, unknown>)) {
      const p = sanitizeProfile(raw);
      if (p) c.profiles[name] = p;
    }
  }

  return c;
}

// Keep only the valid fields of a raw profile; return null if nothing usable.
function sanitizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p: Profile = {};
  const posInt = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 1;
  if (posInt(r.work)) p.work = r.work as number;
  if (posInt(r.break)) p.break = r.break as number;
  if (posInt(r.longBreak)) p.longBreak = r.longBreak as number;
  if (posInt(r.longBreakEvery)) p.longBreakEvery = r.longBreakEvery as number;
  if (typeof r.channel === "string" && r.channel.trim()) p.channel = r.channel.trim();
  return Object.keys(p).length ? p : null;
}

// Resolve a profile by name from the ships-with presets overlaid by any
// same-named profile in config. Returns null if the name is unknown.
export function resolveProfile(cfg: Config, name: string): Profile | null {
  const preset = PROFILE_PRESETS[name];
  const user = cfg.profiles[name];
  if (!preset && !user) return null;
  return { ...preset, ...user };
}

// Every profile name known right now (presets + user-defined), for listing.
export function profileNames(cfg: Config): string[] {
  return [...new Set([...Object.keys(PROFILE_PRESETS), ...Object.keys(cfg.profiles)])].sort();
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
