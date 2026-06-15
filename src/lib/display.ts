import chalk from "chalk";
import type { Phase, TimerState } from "./timer.js";

const BAR_WIDTH = 24;

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

export function progressBar(remaining: number, total: number): string {
  if (total === 0) return "";
  const filled = Math.round(((total - remaining) / total) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
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

export function tickLine(state: TimerState, time: string): void {
  const label = phaseLabel(state.phase);
  const bar = progressBar(state.remaining, state.total);
  // Show the pomodoro you're on. pomodoroCount tracks *completed* work blocks,
  // so during work the current block is count + 1; a break belongs to the
  // block that just finished, so it stays at count.
  const num =
    state.phase === "work" ? state.pomodoroCount + 1 : state.pomodoroCount;
  const pom = num > 0 ? chalk.dim(` #${num}`) : "";
  process.stdout.write(`\r  ${label} ${bar} ${chalk.bold(time)}${pom}  `);
}

export function header(lines: string[]): void {
  console.log();
  console.log(chalk.bold("  devflow") + chalk.dim("  ·  atrivolabs.com"));
  console.log(chalk.dim("  ─────────────────────────────"));
  lines.forEach((l) => console.log(`  ${l}`));
}

export function bell(): void {
  process.stdout.write("\x07");
}
