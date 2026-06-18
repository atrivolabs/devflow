import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR, ensureDir } from "./paths.js";

// Append-only log of finished sessions, one JSON object per line, in
// $XDG_CONFIG_HOME/devflow/history.jsonl. Kept local/offline/private — this is
// the user's own focus history, never sent anywhere (cf. #7 telemetry, which is
// aggregate data for us and lives elsewhere).
const HISTORY_FILE = join(DEVFLOW_DIR, "history.jsonl");

export interface SessionRecord {
  /** ISO timestamp of when the session ended. */
  timestamp: string;
  mode: "pomodoro" | "countdown" | "free";
  /** Channel id (e.g. "lofi"); may be empty for a --no-music session. */
  channel: string;
  /** Total focus minutes accrued (excludes breaks). */
  focusMinutes: number;
  /** Completed pomodoro work blocks; 0 for non-pomodoro modes. */
  workBlocks: number;
  /** Breaks taken (short + long). */
  breaks: number;
  /** Finished naturally vs. interrupted (stop / Ctrl+C). */
  completed: boolean;
}

// Append a finished session. Best-effort: logging must never break a session,
// so failures are swallowed.
export function record(r: SessionRecord): void {
  try {
    ensureDir();
    appendFileSync(HISTORY_FILE, JSON.stringify(r) + "\n");
  } catch {
    // ignore — a missing stat is better than a crashed session
  }
}

// Read every logged session, tolerating a truncated or corrupt final line
// (a crash mid-append shouldn't poison the whole history).
export function readHistory(): SessionRecord[] {
  if (!existsSync(HISTORY_FILE)) return [];
  let raw: string;
  try {
    raw = readFileSync(HISTORY_FILE, "utf-8");
  } catch {
    return [];
  }
  const out: SessionRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const r = JSON.parse(trimmed) as SessionRecord;
      if (r && typeof r.timestamp === "string") out.push(r);
    } catch {
      // skip the bad line, keep the rest
    }
  }
  return out;
}
