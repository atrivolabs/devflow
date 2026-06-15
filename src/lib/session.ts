import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR, ensureDir } from "./paths.js";

const SESSION_FILE = join(DEVFLOW_DIR, "session.json");

export interface SessionData {
  pid: number;
  channel: string;
  mode: "pomodoro" | "countdown" | "free";
  startedAt: string;
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  countdownMinutes?: number;
}

export function save(data: SessionData): void {
  ensureDir();
  writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

export function load(): SessionData | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const raw = readFileSync(SESSION_FILE, "utf-8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clear(): void {
  try {
    if (existsSync(SESSION_FILE)) unlinkSync(SESSION_FILE);
  } catch {}
}

export function active(): boolean {
  const s = load();
  if (!s) return false;
  try {
    process.kill(s.pid, 0);
    return true;
  } catch {
    clear();
    return false;
  }
}
