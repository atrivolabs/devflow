import chalk from "chalk";
import { listAudioDevices } from "../lib/player.js";
import { checkDeps, installHint } from "../lib/deps.js";

export async function devicesCmd(): Promise<void> {
  const { mpv } = await checkDeps();
  if (!mpv) {
    console.log(
      chalk.yellow("\n  mpv not found — audio devices are read from mpv.\n")
    );
    console.log(chalk.dim("  Install mpv:"));
    console.log(chalk.dim(installHint("mpv")));
    console.log();
    return;
  }

  const devices = await listAudioDevices();
  if (devices.length === 0) {
    console.log(chalk.dim("\n  mpv reported no audio output devices.\n"));
    return;
  }

  console.log("\n  Audio output devices:\n");
  for (const d of devices) {
    const desc = d.description ? chalk.dim(`  — ${d.description}`) : "";
    console.log("  " + chalk.cyan(d.name) + desc);
  }
  console.log(
    chalk.dim("\n  Play to one: ") +
      chalk.bold("devflow start --audio-device <name>")
  );
  console.log(
    chalk.dim("  Set a default: ") + chalk.bold("devflow setup") + "\n"
  );
}
