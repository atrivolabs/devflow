import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SESSION_DIR = join(homedir(), ".devflow");
const SESSION_FILE = join(SESSION_DIR, "session.json");

export interface SessionData {
  pid: number;
  channel: string;
  pomodoro: boolean;
  startedAt: string;
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  timerMinutes?: number;
}

export function saveSession(data: SessionData): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }
  writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

export function loadSession(): SessionData | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const raw = readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (existsSync(SESSION_FILE)) {
    writeFileSync(SESSION_FILE, "");
  }
}

export function isSessionActive(): boolean {
  const session = loadSession();
  if (!session) return false;

  // Check if the process is still running
  try {
    process.kill(session.pid, 0);
    return true;
  } catch {
    clearSession();
    return false;
  }
}
