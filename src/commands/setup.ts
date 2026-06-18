import chalk from "chalk";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { channels } from "../lib/channels.js";
import { loadConfig, saveConfig, configPath, type Config } from "../lib/config.js";

export async function setupCmd(): Promise<void> {
  if (!stdin.isTTY) {
    console.log(
      chalk.yellow("devflow setup needs an interactive terminal.") +
        chalk.dim(`\nEdit ${configPath()} directly instead.`)
    );
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const cur = loadConfig();

  console.log();
  console.log(chalk.bold("  devflow setup"));
  console.log(chalk.dim("  ─────────────────────────────"));
  console.log(chalk.dim("  Set your defaults so `devflow start` just works."));
  console.log(chalk.dim("  Press Enter to keep the current value shown in [brackets].\n"));

  try {
    // Channel
    console.log(chalk.cyan("  Music channel") + chalk.dim(" — what plays by default."));
    console.log(chalk.dim("    " + channels.map((c) => c.id).join(", ")));
    const channel = await askChoice(rl, "  channel", cur.channel, channels.map((c) => c.id));

    // Pomodoro durations
    console.log(
      "\n" +
        chalk.cyan("  Pomodoro durations") +
        chalk.dim(" — a focus block, then a short break; minutes.")
    );
    const work = await askInt(rl, "  work minutes", cur.work);
    const brk = await askInt(rl, "  short break minutes", cur.break);
    const longBreak = await askInt(rl, "  long break minutes", cur.longBreak);

    // Long-break cadence
    console.log(
      "\n" +
        chalk.cyan("  Long break cadence") +
        chalk.dim(" — every Nth focus block, the break is a long one instead.")
    );
    const longBreakEvery = await askInt(rl, "  long break every", cur.longBreakEvery);

    // Rounds
    console.log(
      "\n" +
        chalk.cyan("  Rounds") +
        chalk.dim(" — stop after N focus blocks, or run until you stop it.")
    );
    const rounds = await askRounds(rl, "  rounds (blank = forever)", cur.rounds);

    // Voice
    console.log(
      "\n" +
        chalk.cyan("  Voice") +
        chalk.dim(" — speak transitions aloud (“Back to work”, etc.).")
    );
    const voice = await askBool(rl, "  voice cues", cur.voice);

    // Mascot
    console.log(
      "\n" +
        chalk.cyan("  Mascot") +
        chalk.dim(" — a little runner that jogs along the progress bar.")
    );
    const mascot = await askBool(rl, "  show mascot", cur.mascot);

    // Heads-up warning
    console.log(
      "\n" +
        chalk.cyan("  Heads-up nudge") +
        chalk.dim(" — a cue before a transition so you can wrap up. 0 = off.")
    );
    const warnLeadSeconds = await askInt(rl, "  warn seconds before", cur.warnLeadSeconds, 0);

    // Volumes
    console.log(
      "\n" + chalk.cyan("  Volumes") + chalk.dim(" — 0–100. 0 mutes that channel.")
    );
    const musicVolume = await askInt(rl, "  music volume", cur.musicVolume, 0, 100);
    const cueVolume = await askInt(rl, "  cue/voice volume", cur.cueVolume, 0, 100);

    const cfg: Config = {
      channel,
      work,
      break: brk,
      longBreak,
      rounds,
      longBreakEvery,
      voice,
      mascot,
      warnLeadSeconds,
      musicVolume,
      cueVolume,
    };
    saveConfig(cfg);

    console.log("\n" + chalk.green("  ✓ Saved ") + chalk.dim(configPath()));
    console.log(chalk.dim("  Start a session: ") + chalk.bold("devflow start") + "\n");
  } catch (err) {
    // Ctrl+C / Ctrl+D / closed stdin — bail cleanly, no stack trace.
    if (err instanceof Error && err.name === "AbortError") {
      console.log(chalk.dim("\n  Setup cancelled — nothing saved."));
    } else {
      throw err;
    }
  } finally {
    rl.close();
  }
}

async function askChoice(
  rl: Interface,
  label: string,
  def: string,
  choices: string[]
): Promise<string> {
  while (true) {
    const a = (await rl.question(`${label} [${def}]: `)).trim();
    if (!a) return def;
    if (choices.includes(a)) return a;
    console.log(chalk.red(`    pick one of: ${choices.join(", ")}`));
  }
}

async function askInt(
  rl: Interface,
  label: string,
  def: number,
  min = 1,
  max = Infinity
): Promise<number> {
  while (true) {
    const a = (await rl.question(`${label} [${def}]: `)).trim();
    if (!a) return def;
    const n = parseInt(a, 10);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    const range = max === Infinity ? `${min} or more` : `${min}–${max}`;
    console.log(chalk.red(`    enter a number ${range}`));
  }
}

async function askRounds(
  rl: Interface,
  label: string,
  def: number | null
): Promise<number | null> {
  const shown = def ?? "forever";
  const a = (await rl.question(`${label} [${shown}]: `)).trim();
  if (!a) return def;
  if (/^(forever|0|none)$/i.test(a)) return null;
  const n = parseInt(a, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

async function askBool(rl: Interface, label: string, def: boolean): Promise<boolean> {
  const a = (await rl.question(`${label} [${def ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
  if (!a) return def;
  return a.startsWith("y");
}
