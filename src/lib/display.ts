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
  return (
    chalk.dim("[") +
    chalk.green("█".repeat(filled)) +
    chalk.dim("░".repeat(empty)) +
    chalk.dim("]")
  );
}

export function tickLine(state: TimerState, time: string): void {
  const label = phaseLabel(state.phase);
  const bar = progressBar(state.remaining, state.total);
  const pom =
    state.pomodoroCount > 0 ? chalk.dim(` #${state.pomodoroCount}`) : "";
  process.stdout.write(`\r  ${label} ${bar} ${chalk.bold(time)}${pom}  `);
}

export function header(lines: string[]): void {
  console.log();
  console.log(chalk.bold("  devflow"));
  console.log(chalk.dim("  ─────────────────────────────"));
  lines.forEach((l) => console.log(`  ${l}`));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log();
}

export function bell(): void {
  process.stdout.write("\x07");
}
