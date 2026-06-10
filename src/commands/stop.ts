import chalk from "chalk";
import * as session from "../lib/session.js";

export async function stopSession(): Promise<void> {
  if (!session.active()) {
    console.log(chalk.dim("No active session."));
    return;
  }

  const s = session.load();
  if (!s) return;

  try {
    process.kill(s.pid, "SIGTERM");
  } catch {}

  session.clear();
  console.log(chalk.green("  Session stopped."));
}
