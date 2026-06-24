import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR, ensureDir } from "./paths.js";

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
  enforce: boolean; // lock the terminal during breaks so you actually stop
  hardStop: string | null; // "HH:MM" daily cutoff after which `start` refuses; null = off
}

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
  enforce: false,
  hardStop: null,
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
  const c: Config = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return c;
  const r = raw as Record<string, unknown>;

  if (typeof r.channel === "string" && r.channel.trim()) c.channel = r.channel.trim();
  if (typeof r.voice === "boolean") c.voice = r.voice;
  if (typeof r.mascot === "boolean") c.mascot = r.mascot;
  if (typeof r.enforce === "boolean") c.enforce = r.enforce;
  if (r.hardStop === null) c.hardStop = null;
  else if (typeof r.hardStop === "string" && parseHHMM(r.hardStop) !== null) c.hardStop = r.hardStop.trim();

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

  return c;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Parse a 24-hour "HH:MM" string to minutes-since-midnight, or null if it isn't
// a valid time. Shared by config sanitize and the `--hard-stop` flag parsing.
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
