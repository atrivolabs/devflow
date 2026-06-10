import chalk from "chalk";
import * as session from "../lib/session.js";

export async function pauseSession(): Promise<void> {
  if (!session.active()) {
    console.log(chalk.dim("No active session."));
    return;
  }

  const s = session.load();
  if (!s) return;

  try {
    process.kill(s.pid, "SIGUSR1");
    console.log(chalk.yellow("  Toggled pause."));
  } catch {
    console.log(chalk.red("  Could not reach session process."));
  }
}
