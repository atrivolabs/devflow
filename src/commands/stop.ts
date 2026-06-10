import chalk from "chalk";
import { loadSession, isSessionActive, clearSession } from "../lib/session.js";

export async function stopSession(): Promise<void> {
  if (!isSessionActive()) {
    console.log(chalk.dim("No active session."));
    return;
  }

  const session = loadSession();
  if (!session) return;

  try {
    process.kill(session.pid, "SIGTERM");
    clearSession();
    console.log(chalk.green("  Session stopped."));
  } catch {
    clearSession();
    console.log(chalk.dim("  Session cleaned up."));
  }
}
