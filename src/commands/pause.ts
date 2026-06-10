import chalk from "chalk";
import { loadSession, isSessionActive } from "../lib/session.js";

export async function pauseSession(): Promise<void> {
  if (!isSessionActive()) {
    console.log(chalk.dim("No active session."));
    return;
  }

  const session = loadSession();
  if (!session) return;

  // Send SIGUSR1 to toggle pause in the running session
  try {
    process.kill(session.pid, "SIGUSR1");
    console.log(chalk.yellow("  Toggled pause."));
  } catch {
    console.log(chalk.red("  Could not reach session process."));
  }
}
