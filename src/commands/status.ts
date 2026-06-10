import chalk from "chalk";
import * as session from "../lib/session.js";
import { findChannel } from "../lib/channels.js";
import { fmt } from "../lib/timer.js";
import * as ui from "../lib/display.js";

export async function showStatus(): Promise<void> {
  if (!session.active()) {
    console.log(chalk.dim("No active session. Start one with: devflow start"));
    return;
  }

  const s = session.load();
  if (!s) return;

  const elapsed = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 1000);
  const channel = findChannel(s.channel);

  const modeLabel =
    s.mode === "pomodoro"
      ? chalk.green(`Pomodoro (${s.workMinutes}/${s.breakMinutes}/${s.longBreakMinutes})`)
      : s.mode === "countdown"
        ? chalk.cyan(`Timer (${s.countdownMinutes}min)`)
        : chalk.dim("Free flow");

  ui.header([
    `Channel:  ${chalk.cyan(channel?.name ?? s.channel)}`,
    `Mode:     ${modeLabel}`,
    `Elapsed:  ${chalk.bold(fmt(elapsed))}`,
    `PID:      ${chalk.dim(String(s.pid))}`,
  ]);
}
