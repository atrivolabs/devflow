import chalk from "chalk";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { channels } from "../lib/channels.js";
import { loadConfig, saveConfig, configPath, parseHHMM, type Config } from "../lib/config.js";
import { listAudioDevices } from "../lib/player.js";

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

    // Enforced breaks
    console.log(
      "\n" +
        chalk.cyan("  Enforce breaks") +
        chalk.dim(" — lock the terminal during breaks so you actually stop.")
    );
    const enforce = await askBool(rl, "  enforce breaks", cur.enforce);

    // Hard daily stop
    console.log(
      "\n" +
        chalk.cyan("  Hard stop") +
        chalk.dim(" — refuse to start a new sprint after this time. blank = off.")
    );
    const hardStop = await askTime(rl, "  hard stop (HH:MM)", cur.hardStop);
    // Audio output device
    console.log(
      "\n" +
        chalk.cyan("  Audio output") +
        chalk.dim(" — where music plays; blank = system default.")
    );
    const audioDevice = await askAudioDevice(rl, "  audio device", cur.audioDevice);

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
      enforce,
      hardStop,
      profiles: cur.profiles, // setup doesn't edit profiles — preserve any from config
      audioDevice,
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

async function askTime(
  rl: Interface,
  label: string,
  def: string | null
): Promise<string | null> {
  const shown = def ?? "off";
  while (true) {
    const a = (await rl.question(`${label} [${shown}]: `)).trim();
    if (!a) return def;
    if (/^(off|none|0)$/i.test(a)) return null;
    if (parseHHMM(a) !== null) return a;
    console.log(chalk.red("    enter a time as HH:MM (24h), or 'off'"));
  }
}

async function askAudioDevice(
  rl: Interface,
  label: string,
  def: string
): Promise<string> {
  const devices = await listAudioDevices();
  if (devices.length) {
    console.log(chalk.dim("    available:"));
    for (const d of devices) {
      console.log(
        chalk.dim(`      ${d.name}${d.description ? ` — ${d.description}` : ""}`)
      );
    }
  } else {
    console.log(chalk.dim("    (mpv not found or no devices — leave blank for system default)"));
  }
  const shown = def || "system default";
  const a = (await rl.question(`${label} [${shown}]: `)).trim();
  if (!a) return def;
  // Accept common words for "let the OS decide" → store as "" (no flag passed).
  if (/^(system|default|auto|none)$/i.test(a)) return "";
  return a;
}

async function askBool(rl: Interface, label: string, def: boolean): Promise<boolean> {
  const a = (await rl.question(`${label} [${def ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
  if (!a) return def;
  return a.startsWith("y");
}
