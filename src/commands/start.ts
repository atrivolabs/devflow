import chalk from "chalk";
import { Timer, fmt, type TimerState } from "../lib/timer.js";
import {
  play,
  stop as stopMusic,
  checkDeps,
  pauseMusic,
  resumeMusic,
} from "../lib/player.js";
import { cue, speak } from "../lib/cues.js";
import { installHint } from "../lib/deps.js";
import { findChannel, channelList } from "../lib/channels.js";
import { loadChannels } from "../lib/channel-source.js";
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
  demo?: boolean;
  voice?: boolean;
}

export async function startSession(options: StartOptions): Promise<void> {
  if (session.active()) {
    console.log(
      chalk.yellow("A session is already running. Use `devflow stop` first.")
    );
    return;
  }

  const allChannels = await loadChannels();
  const channel = findChannel(allChannels, options.channel);
  if (!channel) {
    console.log(chalk.red(`Unknown channel: ${options.channel}\n`));
    console.log(chalk.dim("Available channels:\n" + channelList(allChannels)));
    return;
  }

  // Demo runs an accelerated, seconds-based pomodoro (same numbers, but
  // unitSeconds=1) so you can hear music start, the work/break transitions, a
  // long break, and completion in about a minute.
  const demo = options.demo ?? false;
  const unitSeconds = demo ? 1 : 60;
  const work = demo ? 10 : parseInt(options.work, 10);
  const brk = demo ? 5 : parseInt(options.break, 10);
  const longBrk = demo ? 8 : parseInt(options.longBreak, 10);
  const countdown = options.timer ? parseInt(options.timer, 10) : undefined;
  const rounds = options.rounds
    ? parseInt(options.rounds, 10)
    : demo
      ? 5
      : undefined;
  const pomodoro = demo || (options.pomodoro ?? false);
  const withMusic = options.music !== false;
  const voice = options.voice ?? false;
  const mode = pomodoro ? "pomodoro" : countdown ? "countdown" : "free";

  // Show header
  const headerLines: string[] = [];
  if (pomodoro) {
    const u = demo ? "s" : "";
    const roundsLabel = rounds ? ` · ${rounds} rounds` : "";
    const demoTag = demo ? chalk.yellow(" · DEMO") : "";
    headerLines.push(
      chalk.green(
        `Mode:    Pomodoro (${work}${u}/${brk}${u}/${longBrk}${u})${roundsLabel}`
      ) + demoTag
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
      unitSeconds,
    });

    timer.on("tick", (state: TimerState) => ui.tickLine(state, fmt(state.remaining)));

    timer.on("phase", (state: TimerState) => {
      console.log();
      if (state.phase === "work") {
        if (musicOk) resumeMusic();
        cue("work");
        if (voice) speak("Back to work");
        console.log(chalk.green(`\n  ▶ Back to work! (${fmt(state.total)})`));
      } else {
        if (musicOk) pauseMusic();
        const kind = state.phase === "long-break" ? "long-break" : "break";
        cue(kind);
        if (voice) {
          speak(kind === "long-break" ? "Time for a long break" : "Time for a break");
        }
        const pausedNote = musicOk ? chalk.dim("  (music paused)") : "";
        console.log(
          chalk.yellow(`\n  ☕ ${ui.phaseLabel(state.phase)}! (${fmt(state.total)})`) +
            pausedNote
        );
      }
    });

    timer.on("complete", () => {
      cue("complete");
      if (voice) speak("Session complete");
      console.log(chalk.green("\n\n  ✓ Session complete!"));
      cleanup(timer);
    });

    // Handle SIGUSR1 for pause toggle from `devflow pause`
    process.on("SIGUSR1", () => {
      timer.togglePause();
      const s = timer.snapshot();
      if (s.paused) {
        if (musicOk) pauseMusic();
        console.log(chalk.yellow("\n  ⏸  Paused"));
      } else {
        if (musicOk) resumeMusic();
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
