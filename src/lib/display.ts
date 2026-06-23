import chalk from "chalk";
import type { Phase, TimerState } from "./timer.js";
import { mascotWidth, mascotFrame } from "./mascot.js";

// Default/maximum bar width; the live bar shrinks below this to fit a narrow
// terminal, and is dropped entirely when there isn't even room for BAR_MIN.
const BAR_WIDTH = 24;
const BAR_MIN = 6;

// Greyscale: focus stands out (bright), breaks recede (dim). All padded to a
// fixed width so the bars line up regardless of phase.
const PHASE_LABELS: Record<Phase, (s: string) => string> = {
  work: chalk.whiteBright,
  break: chalk.dim,
  "long-break": chalk.dim,
  countdown: chalk.whiteBright,
};

const PHASE_NAMES: Record<Phase, string> = {
  work: "FOCUS",
  break: "break",
  "long-break": "long",
  countdown: "timer",
};

export function phaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase](PHASE_NAMES[phase].padEnd(5));
}

// Optional mascot (issue #15): a tiny figure that animates while you focus and
// rests during a break. The character/size live in ./mascot.ts (data-driven and
// swappable) — this just dims it and advances the frame off `remaining` so it's
// stateless (one step per 1s tick). Off by default; opt-in via `--mascot`.
function mascotGlyph(state: TimerState): string {
  const resting = state.phase === "break" || state.phase === "long-break" || state.paused;
  return chalk.dim(mascotFrame(state.remaining, resting));
}

export function progressBar(remaining: number, total: number, width = BAR_WIDTH): string {
  if (total === 0 || width <= 0) return "";
  const filled = Math.round(((total - remaining) / total) * width);
  const empty = width - filled;
  // Live bar fills bright white (in progress); the final bar at 00:00 fades to
  // grey, so completed phases left in scrollback read as past.
  const fill = remaining <= 0 ? chalk.gray : chalk.whiteBright;
  return (
    chalk.dim("[") +
    fill("█".repeat(filled)) +
    chalk.dim("░".repeat(empty)) +
    chalk.dim("]")
  );
}

export function tickLine(
  state: TimerState,
  time: string,
  mascot = false,
  status = ""
): void {
  const label = phaseLabel(state.phase); // styled, but 5 columns wide
  // Show the pomodoro you're on. pomodoroCount tracks *completed* work blocks,
  // so during work the current block is count + 1; a break belongs to the
  // block that just finished, so it stays at count.
  const num =
    state.phase === "work" ? state.pomodoroCount + 1 : state.pomodoroCount;
  const pomText = num > 0 ? ` #${num}` : "";

  // Optional mascot prefix: "<glyph> " => mascot width + 1 column for the space.
  const prefix = mascot ? `${mascotGlyph(state)} ` : "";
  const pw = mascot ? mascotWidth() + 1 : 0;

  // Transient hotkey feedback ("volume 45", "mascot on") shown dim at the right
  // of the live line. start.ts redraws this in place, so it replaces the line
  // rather than scrolling the session. Reserve its width (" · " + text) so the
  // line still never wraps.
  const tail = status ? chalk.dim(` · ${status}`) : "";
  const sw = status ? status.length + 3 : 0;

  // Size the bar to the terminal so the line never exceeds one physical row —
  // otherwise it soft-wraps and the leading `\r` can't overwrite the wrapped
  // remainder, scrolling the pane every tick (esp. small tmux splits). Reason
  // in *visible* columns, not string length: chalk's ANSI codes add bytes but
  // no width. Layout: "  " + prefix + label(5) + " " + [bar] + " " + time + pom + " " + status.
  const cols = process.stdout.columns || 80;
  const fixed = 2 + pw + 5 + 1 + 1 + time.length + pomText.length + 1 + sw;
  const barBudget = cols - fixed - 2; // -2 for the bar's "[" and "]"

  let line: string;
  if (barBudget >= BAR_MIN) {
    const bar = progressBar(state.remaining, state.total, Math.min(BAR_WIDTH, barBudget));
    line = `  ${prefix}${label} ${bar} ${chalk.bold(time)}${chalk.dim(pomText)}${tail} `;
  } else if (2 + pw + 5 + 1 + time.length + sw <= cols) {
    // Too narrow for a bar: label + time, dropping the pomodoro tag if even that
    // wouldn't fit.
    const pom = 2 + pw + 5 + 1 + time.length + pomText.length + sw <= cols ? chalk.dim(pomText) : "";
    line = `  ${prefix}${label} ${chalk.bold(time)}${pom}${tail}`;
  } else {
    // Pathologically narrow (< ~13 cols): just the clock, truncated so even this
    // can never wrap.
    line = time.slice(0, Math.max(0, cols));
  }

  // `\x1b[K` clears to end of line so a previous, wider frame leaves nothing
  // behind; combined with the width-aware sizing the line can't wrap.
  process.stdout.write(`\r\x1b[K${line}`);
}

export function header(lines: string[]): void {
  console.log();
  console.log(chalk.bold("  devflow"));
  console.log(chalk.dim("  ─────────────────────────────"));
  lines.forEach((l) => console.log(`  ${l}`));
}

export function bell(): void {
  process.stdout.write("\x07");
}

// Full-screen takeover via the terminal's alternate screen buffer — the same
// trick vim / less / htop use. `enter` switches to a fresh blank screen and
// hides the cursor; `exit` restores the user's original terminal (scrollback
// and all) and shows the cursor again. Only acts on a real TTY, so piped or
// non-interactive output is left exactly as-is. Best-effort: never throws, and
// `exit` is safe to call more than once (the cleanup path + the on-exit safety
// net both call it).
export function enterFullscreen(): void {
  if (!process.stdout.isTTY) return;
  try {
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
  } catch {
    // ignore — terminal may not support it
  }
}

export function exitFullscreen(): void {
  if (!process.stdout.isTTY) return;
  try {
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  } catch {
    // ignore
  }
}
