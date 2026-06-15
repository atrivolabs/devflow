import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR } from "./session.js";

export interface Config {
  channel: string;
  work: number; // minutes
  break: number; // minutes
  longBreak: number; // minutes
  rounds: number | null; // null = run forever
  longBreakEvery: number; // a long break replaces the short one every N blocks
  voice: boolean; // speak transitions aloud
  warnLeadSeconds: number; // heads-up cue this many seconds before a transition; 0 = off
}

export const DEFAULTS: Config = {
  channel: "lofi",
  work: 25,
  break: 5,
  longBreak: 15,
  rounds: null,
  longBreakEvery: 4,
  voice: false,
  warnLeadSeconds: 60,
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
  if (!existsSync(DEVFLOW_DIR)) mkdirSync(DEVFLOW_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Merge a raw object over the defaults, keeping only valid values.
function sanitize(raw: unknown): Config {
  const c: Config = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return c;
  const r = raw as Record<string, unknown>;

  if (typeof r.channel === "string" && r.channel.trim()) c.channel = r.channel.trim();
  if (typeof r.voice === "boolean") c.voice = r.voice;

  const posInt = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 1;
  if (posInt(r.work)) c.work = r.work as number;
  if (posInt(r.break)) c.break = r.break as number;
  if (posInt(r.longBreak)) c.longBreak = r.longBreak as number;
  if (posInt(r.longBreakEvery)) c.longBreakEvery = r.longBreakEvery as number;

  if (typeof r.warnLeadSeconds === "number" && Number.isFinite(r.warnLeadSeconds) && r.warnLeadSeconds >= 0) {
    c.warnLeadSeconds = r.warnLeadSeconds;
  }
  if (r.rounds === null || posInt(r.rounds)) c.rounds = r.rounds as number | null;

  return c;
}
