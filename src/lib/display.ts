import chalk from "chalk";
import type { Phase, TimerState } from "./timer.js";

const BAR_WIDTH = 24;

const PHASE_LABELS: Record<Phase, (s: string) => string> = {
  work: chalk.green,
  break: chalk.yellow,
  "long-break": chalk.magenta,
  countdown: chalk.cyan,
};

const PHASE_NAMES: Record<Phase, string> = {
  work: "FOCUS",
  break: "BREAK",
  "long-break": "LONG BREAK",
  countdown: "TIMER",
};

export function phaseLabel(phase: Phase): string {
  return PHASE_LABELS[phase](PHASE_NAMES[phase]);
}

export function progressBar(remaining: number, total: number): string {
  if (total === 0) return "";
  const filled = Math.round(((total - remaining) / total) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  // Live bar fills yellow (in progress); the final bar at 00:00 turns green,
  // so completed phases left in scrollback read as done.
  const fill = remaining <= 0 ? chalk.green : chalk.yellow;
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
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log();
}

export function bell(): void {
  process.stdout.write("\x07");
}
