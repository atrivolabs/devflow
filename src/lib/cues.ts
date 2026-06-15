import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

export type CueKind = "work" | "break" | "long-break" | "complete" | "warn";

// Best-effort, non-blocking spawn. Never throws — a missing binary just means
// no sound, which must not interrupt a session.
function run(cmd: string, args: string[]): void {
  try {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", () => {});
  } catch {
    // ignore
  }
}

// macOS ships these system sounds; each transition gets a distinct cue.
const MAC_SOUNDS: Record<CueKind, string> = {
  work: "/System/Library/Sounds/Hero.aiff",
  break: "/System/Library/Sounds/Pop.aiff",
  "long-break": "/System/Library/Sounds/Glass.aiff",
  complete: "/System/Library/Sounds/Hero.aiff",
  warn: "/System/Library/Sounds/Ping.aiff", // softer heads-up before a transition
};

/**
 * Play a short transition sound at the given volume (0–100). On macOS this is a
 * real system sound ("pop" etc.) via afplay; elsewhere it falls back to the
 * terminal bell so there's still an audible nudge. volume 0 = silent.
 */
export function cue(kind: CueKind, volume = 100): void {
  if (volume <= 0) return;
  if (platform() === "darwin") {
    const file = MAC_SOUNDS[kind];
    if (existsSync(file)) {
      run("afplay", ["-v", (volume / 100).toFixed(2), file]);
      return;
    }
  }
  process.stdout.write("\x07"); // terminal bell fallback
}

/**
 * Speak a short announcement (opt-in via --voice) at the given volume (0–100).
 * macOS uses `say` (volume via an inline `[[volm]]` command); Linux tries
 * `spd-say`. Silent no-op if disabled or no TTS is installed.
 */
export function speak(text: string, volume = 100): void {
  if (volume <= 0) return;
  if (platform() === "darwin") {
    const v = Math.min(1, volume / 100).toFixed(2);
    run("say", [`[[volm ${v}]] ${text}`]);
  } else if (platform() === "linux") {
    // spd-say is the common one. -i sets volume (-100..100). Best-effort.
    run("spd-say", ["-i", String(Math.round((volume / 100) * 100 - 100)), text]);
  }
}
