import chalk from "chalk";
import { Timer, fmt, type TimerState } from "../lib/timer.js";
import { play, stop as stopMusic, checkDeps } from "../lib/player.js";
import { installHint } from "../lib/deps.js";
import { findChannel, channelList } from "../lib/channels.js";
import * as session from "../lib/session.js";
import * as ui from "../lib/display.js";
import { startHeartbeat, stopHeartbeat } from "../lib/listener.js";

interface StartOptions {
  channel: string;
  timer?: string;
  pomodoro?: boolean;
  rounds?: string;
  work: string;
  break: string;
  longBreak: string;
  music?: boolean;
}

export async function startSession(options: StartOptions): Promise<void> {
  if (session.active()) {
    console.log(
      chalk.yellow("A session is already running. Use `devflow stop` first.")
    );
    return;
  }

  const channel = findChannel(options.channel);
  if (!channel) {
    console.log(chalk.red(`Unknown channel: ${options.channel}\n`));
    console.log(chalk.dim("Available channels:\n" + channelList()));
    return;
  }

  const work = parseInt(options.work, 10);
  const brk = parseInt(options.break, 10);
  const longBrk = parseInt(options.longBreak, 10);
  const countdown = options.timer ? parseInt(options.timer, 10) : undefined;
  const rounds = options.rounds ? parseInt(options.rounds, 10) : undefined;
  const pomodoro = options.pomodoro ?? false;
  const withMusic = options.music !== false;
  const mode = pomodoro ? "pomodoro" : countdown ? "countdown" : "free";

  // Show header
  const headerLines: string[] = [];
  if (pomodoro) {
    const roundsLabel = rounds ? ` · ${rounds} rounds` : "";
    headerLines.push(
      chalk.green(`Mode:    Pomodoro (${work}/${brk}/${longBrk})${roundsLabel}`)
    );
  } else if (countdown) {
    headerLines.push(chalk.green(`Mode:    Timer (${countdown}min)`));
  } else {
    headerLines.push(chalk.green("Mode:    Free flow"));
  }
  if (withMusic) {
    headerLines.push(chalk.cyan(`Channel: ${channel.name}`));
    headerLines.push(chalk.dim(channel.description));
  }
  ui.header(headerLines);

  // Persist session
  session.save({
    pid: process.pid,
    channel: channel.id,
    mode,
    startedAt: new Date().toISOString(),
    workMinutes: work,
    breakMinutes: brk,
    longBreakMinutes: longBrk,
    countdownMinutes: countdown,
  });

  // Start music
  let musicOk = false;
  if (withMusic) {
    const deps = await checkDeps();
    const missing = [
      ...(!deps.mpv ? (["mpv"] as const) : []),
      ...(!deps.ytdlp ? (["yt-dlp"] as const) : []),
    ];
    if (missing.length > 0) {
      console.log(
        chalk.yellow(`  Music disabled — missing: ${missing.join(", ")}`)
      );
      for (const dep of missing) {
        console.log(chalk.dim(`\n  Install ${dep}:`));
        console.log(chalk.dim(installHint(dep)));
      }
      console.log();
    } else {
      console.log(chalk.dim("  Loading stream..."));
      musicOk = await play(channel);
      if (musicOk) {
        // Clear "Loading stream..." and show playing
        process.stdout.write("\r\x1b[K");
        console.log(chalk.green(`  ${channel.icon} Playing ${channel.name}`));
        startHeartbeat(channel.id);
      } else {
        console.log(chalk.yellow("  Stream unavailable. Continuing without music."));
      }
    }
  }

  console.log();

  // Cleanup handler — single source of truth
  let cleaned = false;
  const cleanup = (timer?: Timer) => {
    if (cleaned) return;
    cleaned = true;
    timer?.stop();
    stopMusic();
    stopHeartbeat();
    session.clear();
    console.log(chalk.dim("\n  Session ended."));
    process.exit(0);
  };

  // Timer modes
  if (mode !== "free") {
    const timer = new Timer({
      mode,
      workMinutes: work,
      breakMinutes: brk,
      longBreakMinutes: longBrk,
      countdownMinutes: countdown,
      rounds,
    });

    timer.on("tick", (state: TimerState) => ui.tickLine(state, fmt(state.remaining)));

    timer.on("phase", (state: TimerState) => {
      console.log();
      if (state.phase === "work") {
        console.log(chalk.green(`\n  ▶ Back to work! (${fmt(state.total)})`));
      } else {
        console.log(
          chalk.yellow(
            `\n  ☕ ${ui.phaseLabel(state.phase)}! (${fmt(state.total)})`
          )
        );
      }
      ui.bell();
    });

    timer.on("complete", () => {
      console.log(chalk.green("\n\n  ✓ Session complete!"));
      ui.bell();
      cleanup(timer);
    });

    // Handle SIGUSR1 for pause toggle from `devflow pause`
    process.on("SIGUSR1", () => {
      timer.togglePause();
      const s = timer.snapshot();
      if (s.paused) {
        console.log(chalk.yellow("\n  ⏸  Paused"));
      } else {
        console.log(chalk.green("\n  ▶  Resumed"));
      }
    });

    timer.start();
    process.on("SIGINT", () => cleanup(timer));
    process.on("SIGTERM", () => cleanup(timer));
  } else {
    console.log(chalk.dim("  Press Ctrl+C to stop"));
    process.on("SIGINT", () => cleanup());
    process.on("SIGTERM", () => cleanup());
  }
}
