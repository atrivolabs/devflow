import chalk from "chalk";
import { loadSession, isSessionActive } from "../lib/session.js";

export async function showStatus(): Promise<void> {
  if (!isSessionActive()) {
    console.log(chalk.dim("No active session. Start one with: devflow start"));
    return;
  }

  const session = loadSession();
  if (!session) return;

  const started = new Date(session.startedAt);
  const elapsed = Math.floor((Date.now() - started.getTime()) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  console.log();
  console.log(chalk.bold("  devflow session"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(`  Channel:  ${chalk.cyan(session.channel)}`);
  console.log(`  Mode:     ${session.pomodoro ? chalk.green("Pomodoro") : session.timerMinutes ? chalk.cyan(`Timer (${session.timerMinutes}min)`) : chalk.dim("Free flow")}`);
  console.log(`  Elapsed:  ${chalk.bold(`${minutes}m ${seconds}s`)}`);
  console.log(`  PID:      ${chalk.dim(session.pid.toString())}`);
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log();
}
