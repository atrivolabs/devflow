import chalk from "chalk";
import { Timer, fmt, type TimerState } from "../lib/timer.js";
import {
  play,
  stop as stopMusic,
  checkDeps,
  pauseMusic,
  resumeMusic,
  playing,
} from "../lib/player.js";
import { cue, speak } from "../lib/cues.js";
import { installHint } from "../lib/deps.js";
import { findChannel, channelList } from "../lib/channels.js";
import { loadChannels } from "../lib/channel-source.js";
import { loadConfig, configExists, saveConfig } from "../lib/config.js";
import * as session from "../lib/session.js";
import * as ui from "../lib/display.js";
import { startHeartbeat, stopHeartbeat } from "../lib/listener.js";

interface StartOptions {
  channel?: string;
  timer?: string;
  pomodoro?: boolean;
  rounds?: string;
  work?: string;
  break?: string;
  longBreak?: string;
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

  // First run: point them at setup, then write defaults so the tip shows once.
  const firstRun = !configExists();
  const cfg = loadConfig();
  if (firstRun) {
    console.log(
      chalk.dim("  👋 First time? Run ") +
        chalk.bold("devflow setup") +
        chalk.dim(" to personalize your defaults.\n")
    );
    saveConfig(cfg);
  }

  const allChannels = await loadChannels();
  const channelName = options.channel ?? cfg.channel;
  const channel = findChannel(allChannels, channelName);
  if (!channel) {
    console.log(chalk.red(`Unknown channel: ${channelName}\n`));
    console.log(chalk.dim("Available channels:\n" + channelList(allChannels)));
    return;
  }

  // Resolve each setting: explicit flag > config > built-in. Demo overrides
  // durations with an accelerated, seconds-based preset (unitSeconds=1) so you
  // can preview music + transitions in about a minute.
  const demo = options.demo ?? false;
  const unitSeconds = demo ? 1 : 60;
  const work = demo ? 10 : intOr(options.work, cfg.work);
  const brk = demo ? 5 : intOr(options.break, cfg.break);
  const longBrk = demo ? 8 : intOr(options.longBreak, cfg.longBreak);
  const longBreakEvery = cfg.longBreakEvery;
  const warnLeadSeconds = cfg.warnLeadSeconds;
  const countdown = options.timer ? parseInt(options.timer, 10) : undefined;
  const rounds = options.rounds
    ? parseInt(options.rounds, 10)
    : demo
      ? 5
      : cfg.rounds ?? undefined;
  const pomodoro = demo || (options.pomodoro ?? false);
  const withMusic = options.music !== false;
  const voice = options.voice ?? cfg.voice;
  const musicVolume = cfg.musicVolume;
  const cueVolume = cfg.cueVolume;
  const mode = pomodoro ? "pomodoro" : countdown ? "countdown" : "free";

  // One-line header: mode (bright) · channel · rounds, with a DEMO tag.
  const u = demo ? "s" : "";
  const modeStr = pomodoro
    ? `Pomodoro ${work}${u}/${brk}${u}/${longBrk}${u}`
    : countdown
      ? `Timer ${countdown}min`
      : "Free flow";
  const bits = [chalk.whiteBright(modeStr)];
  if (withMusic) bits.push(chalk.dim(channel.name));
  if (pomodoro && rounds) bits.push(chalk.dim(`${rounds} rounds`));
  let infoLine = bits.join(chalk.dim(" · "));
  if (demo) infoLine += "   " + chalk.dim("DEMO");
  ui.header([infoLine]);

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
    rounds,
    longBreakEvery,
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
      // Write without a newline so we can clear it once the stream resolves.
      process.stdout.write(chalk.dim("  loading stream…"));
      musicOk = await play(channel, musicVolume);
      process.stdout.write("\r\x1b[K");
      if (musicOk) {
        console.log(chalk.dim(`  ${channel.icon} playing ${channel.name}`));
        startHeartbeat(channel.id);
      } else {
        console.log(chalk.dim("  stream unavailable — continuing without music"));
      }
    }
  }

  console.log();

  // --- Music resilience (watchdog) ---
  // mpv exits when a finite track ends, or if it crashes / the stream drops.
  // Without this, the session would silently fall quiet. We respawn it (a fresh
  // track) whenever it should be playing but isn't. Breaks pause music (mpv
  // stays alive), so a paused player is left untouched.
  let wantMusic = musicOk; // should music be playing right now?
  let musicSpawnAt = Date.now();
  let musicFails = 0;
  let watchdog: ReturnType<typeof setInterval> | null = null;

  const restartMusic = () => {
    void play(channel, musicVolume); // fire-and-forget; picks a fresh track
    musicSpawnAt = Date.now();
  };

  // Bring music back on demand: unpause if merely paused, respawn if it died.
  const reviveMusic = () => {
    if (!musicOk) return;
    wantMusic = true;
    if (playing()) resumeMusic();
    else restartMusic();
  };

  if (musicOk) {
    watchdog = setInterval(() => {
      if (!wantMusic || playing()) return; // intentionally paused, or still fine
      const aliveMs = Date.now() - musicSpawnAt;
      if (aliveMs < 10_000) {
        // Died almost immediately — likely a broken stream. Back off after a few.
        if (++musicFails >= 3) {
          if (watchdog) clearInterval(watchdog);
          watchdog = null;
          return;
        }
      } else {
        musicFails = 0; // played a good while (track ended) — that's normal
      }
      restartMusic();
    }, 5000);
  }

  // `devflow music` restores music for the active session (any mode).
  process.on("SIGUSR2", () => {
    reviveMusic();
    console.log(chalk.dim("\n  ♪ music restored"));
  });

  // Swallow stray keystrokes so typing in this pane (e.g. the wrong tmux pane)
  // doesn't echo onto the live countdown. Raw mode disables echo + line
  // buffering; we therefore handle Ctrl+C / Ctrl+D ourselves.
  const stdin = process.stdin;
  const rawInput = !!stdin.isTTY && typeof stdin.setRawMode === "function";

  // Cleanup handler — single source of truth
  let activeTimer: Timer | undefined;
  let cleaned = false;
  const cleanup = (timer = activeTimer, closing = chalk.dim("\n  stopped")) => {
    if (cleaned) return;
    cleaned = true;
    if (watchdog) clearInterval(watchdog);
    if (rawInput) {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore — terminal may already be gone
      }
      stdin.pause();
    }
    timer?.stop();
    stopMusic();
    stopHeartbeat();
    session.clear();
    console.log(closing);
    process.exit(0);
  };

  if (rawInput) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", (buf: Buffer) => {
      const key = buf.toString();
      if (key === "\x03" || key === "\x04") cleanup(); // Ctrl+C / Ctrl+D
      // any other keystroke is swallowed — not echoed, not acted on
    });
    // Safety net: restore the terminal even on an unexpected exit.
    process.on("exit", () => {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore
      }
    });
  }

  // Timer modes
  if (mode !== "free") {
    const timer = new Timer({
      mode,
      workMinutes: work,
      breakMinutes: brk,
      longBreakMinutes: longBrk,
      countdownMinutes: countdown,
      rounds,
      longBreakEvery,
      warnLeadSeconds,
      unitSeconds,
    });
    activeTimer = timer;

    // While counting, show time remaining; once a phase completes, show its
    // total duration so the finished line reads as a log of how long it was.
    timer.on("tick", (state: TimerState) =>
      ui.tickLine(state, fmt(state.remaining > 0 ? state.remaining : state.total))
    );

    // Proactive heads-up before a transition. Audible only — no printed line,
    // which would interrupt the live countdown (it redraws in place with \r).
    timer.on("warning", (state: TimerState) => {
      cue("warn", cueVolume);
      if (voice) {
        const phrase = leadPhrase(warnLeadSeconds);
        speak(
          state.phase === "work"
            ? `${phrase} to go`
            : `${phrase} left, get ready to focus`,
          cueVolume
        );
      }
    });

    // Transitions are marked by the new bar line + the audible cue/voice — no
    // printed banner. Just commit the finished phase's bar with a newline.
    timer.on("phase", (state: TimerState) => {
      process.stdout.write("\n");
      if (state.phase === "work") {
        reviveMusic();
        cue("work", cueVolume);
        if (voice) speak("Back to work", cueVolume);
      } else {
        wantMusic = false;
        if (musicOk && playing()) pauseMusic();
        const kind = state.phase === "long-break" ? "long-break" : "break";
        cue(kind, cueVolume);
        if (voice) {
          speak(
            kind === "long-break" ? "Time for a long break" : "Time for a break",
            cueVolume
          );
        }
      }
    });

    timer.on("complete", () => {
      cue("complete", cueVolume);
      if (voice) speak("Session complete", cueVolume);
      cleanup(timer, chalk.dim("\n\n  ✓ done"));
    });

    // Handle SIGUSR1 for pause toggle from `devflow pause`
    process.on("SIGUSR1", () => {
      timer.togglePause();
      const s = timer.snapshot();
      if (s.paused) {
        wantMusic = false;
        if (musicOk && playing()) pauseMusic();
        console.log(chalk.dim("\n  ⏸  paused"));
      } else {
        reviveMusic();
        console.log(chalk.dim("\n  ▶  resumed"));
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

// Parse a flag value, falling back to a config/default when absent or invalid.
function intOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

// Humanize a lead time for the heads-up nudge ("one minute", "2 minutes", "30 seconds").
function leadPhrase(seconds: number): string {
  if (seconds === 60) return "one minute";
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}
