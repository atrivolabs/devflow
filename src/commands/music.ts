import chalk from "chalk";
import * as session from "../lib/session.js";

export async function musicCmd(): Promise<void> {
  if (!session.active()) {
    console.log(chalk.dim("No active session."));
    return;
  }

  const s = session.load();
  if (!s) return;

  try {
    process.kill(s.pid, "SIGUSR2");
    console.log(chalk.green("  ♪ music restored."));
  } catch {
    console.log(chalk.red("  Could not reach session process."));
  }
}
