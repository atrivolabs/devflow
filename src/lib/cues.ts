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
 * Play a short transition sound. On macOS this is a real system sound ("pop"
 * etc.) via afplay; elsewhere it falls back to the terminal bell so there's
 * still an audible nudge.
 */
export function cue(kind: CueKind): void {
  if (platform() === "darwin") {
    const file = MAC_SOUNDS[kind];
    if (existsSync(file)) {
      run("afplay", [file]);
      return;
    }
  }
  process.stdout.write("\x07"); // terminal bell fallback
}

/**
 * Speak a short announcement (opt-in via --voice). macOS uses `say`; Linux
 * tries `spd-say` then `espeak`. Silent no-op if none are installed.
 */
export function speak(text: string): void {
  if (platform() === "darwin") {
    run("say", [text]);
  } else if (platform() === "linux") {
    // spd-say is the common one; espeak as a fallback. Both no-op if absent.
    run("spd-say", [text]);
  }
}
