import chalk from "chalk";
import { Timer, fmt, type TimerState } from "../lib/timer.js";
import {
  play,
  stop as stopMusic,
  checkDeps,
  pauseMusic,
  resumeMusic,
  setVolume,
  playing,
} from "../lib/player.js";
import { cue, speak } from "../lib/cues.js";
import { installHint } from "../lib/deps.js";
import { ensureYtdlp } from "../lib/vendor.js";
import { findChannel, channelList, type Channel } from "../lib/channels.js";
import { loadChannels } from "../lib/channel-source.js";
import {
  loadConfig,
  configExists,
  saveConfig,
  parseHHMM,
  resolveProfile,
  profileNames,
  type Profile,
} from "../lib/config.js";
import * as session from "../lib/session.js";
import * as history from "../lib/history.js";
import * as ui from "../lib/display.js";
import { startHeartbeat, stopHeartbeat } from "../lib/listener.js";
import { buildContext, submitFeedback } from "../lib/feedback.js";
import { createInterface } from "node:readline";

interface StartOptions {
  channel?: string;
  timer?: string;
  pomodoro?: boolean;
  profile?: string;
  rounds?: string;
  work?: string;
  break?: string;
  longBreak?: string;
  music?: boolean;
  demo?: boolean;
  voice?: boolean;
  mascot?: boolean;
  enforce?: boolean;
  hard?: boolean;
  hardStop?: string;
  audioDevice?: string;
}

export async function startSession(options: StartOptions): Promise<void> {
  if (session.active()) {
    console.log(
      chalk.yellow("A session is already running. Use `devflow stop` first.")
    );
    return;
  }

  // First run: write defaults so the setup tip shows once. The tip itself is
  // printed below, after we take over the screen, so it doesn't flash on the
  // real terminal and then vanish.
  const firstRun = !configExists();
  const cfg = loadConfig();
  if (firstRun) saveConfig(cfg);

  // Hard daily stop (issue #41): once past the configured cutoff, refuse to
  // start a new sprint so late-night drift just… stops. Checked here, before we
  // take over the screen, so the refusal stays on the real terminal. An invalid
  // --hard-stop value is ignored rather than blocking a session.
  const hardStop = options.hardStop ?? cfg.hardStop ?? null;
  const stopMinutes = hardStop ? parseHHMM(hardStop) : null;
  if (stopMinutes !== null) {
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= stopMinutes) {
      console.log(
        chalk.yellow(`  Hard stop ${hardStop} reached — no new sprints tonight.`) +
          chalk.dim("\n  Rest up; start fresh tomorrow.")
      );
      return;
    }
  }

  // Named cadence profile (e.g. --profile deep): a one-word shorthand for a set
  // of durations (and optionally a channel). Sits between explicit flags and
  // config in the precedence chain — flags still override every profile value.
  let profile: Profile = {};
  if (options.profile) {
    const resolved = resolveProfile(cfg, options.profile);
    if (!resolved) {
      console.log(chalk.red(`Unknown profile: ${options.profile}\n`));
      console.log(chalk.dim("Available profiles: " + profileNames(cfg).join(", ")));
      return;
    }
    profile = resolved;
  }

  const allChannels = await loadChannels();
  const channelName = options.channel ?? profile.channel ?? cfg.channel;
  const resolvedChannel = findChannel(allChannels, channelName);
  if (!resolvedChannel) {
    console.log(chalk.red(`Unknown channel: ${channelName}\n`));
    console.log(chalk.dim("Available channels:\n" + channelList(allChannels)));
    return;
  }
  // Mutable so hotkeys can switch channels live (see the key handler below).
  let channel: Channel = resolvedChannel;

  // Resolve each setting: explicit flag > config > built-in. Demo overrides
  // durations with an accelerated, seconds-based preset (unitSeconds=1) so you
  // can preview music + transitions in about a minute.
  const demo = options.demo ?? false;
  const unitSeconds = demo ? 1 : 60;
  const work = demo ? 10 : intOr(options.work, profile.work ?? cfg.work);
  const brk = demo ? 5 : intOr(options.break, profile.break ?? cfg.break);
  const longBrk = demo ? 8 : intOr(options.longBreak, profile.longBreak ?? cfg.longBreak);
  const longBreakEvery = profile.longBreakEvery ?? cfg.longBreakEvery;
  const warnLeadSeconds = cfg.warnLeadSeconds;
  const countdown = options.timer ? parseInt(options.timer, 10) : undefined;
  const rounds = options.rounds
    ? parseInt(options.rounds, 10)
    : demo
      ? 5
      : cfg.rounds ?? undefined;
  const pomodoro = demo || (options.pomodoro ?? false);
  const withMusic = options.music !== false;
  // Mutable so hotkeys can toggle/adjust them live during the session.
  let voice = options.voice ?? cfg.voice;
  let mascot = options.mascot ?? cfg.mascot;
  // Enforced-break mode: --enforce / --hard, else config. Only meaningful where
  // there are breaks (pomodoro); a no-op otherwise.
  const enforce = options.enforce || options.hard || cfg.enforce;
  let musicVolume = cfg.musicVolume;
  const cueVolume = cfg.cueVolume;
  // Audio output device: explicit flag > config > system default ("").
  const audioDevice = options.audioDevice ?? cfg.audioDevice;
  const mode = pomodoro ? "pomodoro" : countdown ? "countdown" : "free";

  // Take over the screen (alternate buffer) now that every early-exit check
  // above has passed — those error paths must stay on the real terminal. The
  // matching restore happens in cleanup(); this on-exit hook is a safety net
  // for any path that bypasses it (e.g. an unexpected throw).
  ui.enterFullscreen();
  process.on("exit", () => ui.exitFullscreen());

  if (firstRun) {
    console.log(
      chalk.dim("  👋 First time? Run ") +
        chalk.bold("devflow setup") +
        chalk.dim(" to personalize your defaults.\n")
    );
  }

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
  if (enforce && pomodoro) bits.push(chalk.dim("enforced breaks"));
  let infoLine = bits.join(chalk.dim(" · "));
  if (demo) infoLine += "   " + chalk.dim("DEMO");
  ui.header([infoLine]);

  // Persist session
  const startedAt = new Date().toISOString();
  session.save({
    pid: process.pid,
    channel: channel.id,
    mode,
    startedAt,
    workMinutes: work,
    breakMinutes: brk,
    longBreakMinutes: longBrk,
    countdownMinutes: countdown,
    rounds,
    longBreakEvery,
  });

  // Start music
  let musicOk = false;
  let ytdlpPath: string | undefined; // set when we vendor our own yt-dlp
  if (withMusic) {
    const deps = await checkDeps();

    // mpv finds yt-dlp on PATH; if it isn't there, fetch the official
    // standalone binary into ~/.config/devflow/bin so music works on a fresh
    // npm/pnpm install (one-time, no brew/sudo). mpv can't be vendored, so a
    // missing mpv still falls back to the install hint.
    if (!deps.ytdlp) {
      process.stdout.write(
        chalk.dim("  fetching yt-dlp (one-time, from github.com/yt-dlp)…")
      );
      ytdlpPath = (await ensureYtdlp()) ?? undefined;
      process.stdout.write("\r\x1b[K");
    }

    const haveYtdlp = deps.ytdlp || !!ytdlpPath;
    const missing = [
      ...(!deps.mpv ? (["mpv"] as const) : []),
      ...(!haveYtdlp ? (["yt-dlp"] as const) : []),
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
      musicOk = await play(channel, musicVolume, ytdlpPath, audioDevice);
      process.stdout.write("\r\x1b[K");
      if (musicOk) {
        const where = audioDevice ? chalk.dim(` → ${audioDevice}`) : "";
        console.log(chalk.dim(`  ${channel.icon} playing ${channel.name}`) + where);
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
    void play(channel, musicVolume, ytdlpPath, audioDevice); // fire-and-forget; fresh track
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

  // Breaks taken so far — counted as each break phase begins. Used for stats.
  let breaksTaken = 0;

  // Cleanup handler — single source of truth
  let activeTimer: Timer | undefined;
  let cleaned = false;
  const cleanup = (timer = activeTimer, completed = false) => {
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

    const snap = timer?.snapshot();
    const focusMinutes = Math.round(
      focusSecondsOf(snap, mode, work, unitSeconds, startedAt) / 60
    );
    const poms = snap?.pomodoroCount ?? 0;

    // Log the finished session to local history (powers `devflow stats`). Demo
    // runs are previews, not real focus, so they're never recorded. Skip
    // sub-minute sessions to avoid noise.
    const logged = !demo && focusMinutes >= 1;
    if (logged) {
      history.record({
        timestamp: new Date().toISOString(),
        mode,
        channel: withMusic ? channel.id : "",
        focusMinutes,
        workBlocks: poms,
        breaks: breaksTaken,
        completed,
      });
    }

    session.clear();

    // Restore the user's terminal (leave the alt screen) *before* printing the
    // recap, so the summary lands in their real scrollback and outlives the
    // session.
    ui.exitFullscreen();
    console.log(
      sessionSummary(completed, focusMinutes, mode, poms, withMusic ? channel.name : null, logged)
    );
    process.exit(0);
  };

  // --- Live hotkeys ---
  // Single keys act immediately and only do safe, reversible things; quitting
  // stays on Ctrl+C/Ctrl+D so a stray keystroke (wrong tmux pane) can't end a
  // session. Feedback is a dim status line, the same way the pause/music
  // handlers already report — the countdown resumes below it.
  // Only advertise keys that actually do something in this mode. Free flow has
  // no timer and no progress bar, so pause and the mascot don't apply there.
  const timed = mode !== "free";
  const pomo = mode === "pomodoro";
  const HINTS =
    "keys: " +
    [
      ...(timed ? ["space pause"] : []),
      "n channel",
      ...(pomo ? ["[/] rounds"] : []),
      ...(timed ? ["m mascot"] : []),
      "v voice",
      "+/- volume",
      "f feedback",
    ].join(" · ");

  // Transient hotkey feedback. Rendered *in place* — appended to the live
  // countdown in a timed mode, or on its own redrawn line in free flow — so
  // pressing keys updates the session instead of scrolling it. It clears a
  // couple seconds after the last keypress (timed modes redraw on the next
  // ticks; see `render`).
  const FLASH_MS = 2500;
  let lastState: TimerState | undefined;
  let flashText = "";
  let flashUntil = 0;
  // True while an enforced break has the screen locked (see the `phase` handler).
  let locked = false;
  // True while the feedback hotkey is reading a line: suspends the in-place
  // redraw so the timer tick doesn't clobber the prompt the user is typing.
  let capturing = false;

  function render(): void {
    if (capturing) return;
    if (locked && lastState) {
      const s = lastState;
      ui.lockScreen(s, fmt(s.remaining > 0 ? s.remaining : s.total));
      return;
    }
    const status = Date.now() < flashUntil ? flashText : "";
    if (lastState) {
      const s = lastState;
      ui.tickLine(s, fmt(s.remaining > 0 ? s.remaining : s.total), mascot, status);
    } else if (status) {
      // Free flow has no live countdown — show the flash on its own in-place
      // line so it replaces rather than scrolls.
      process.stdout.write(`\r\x1b[K  ${chalk.dim(status)}`);
    }
  }

  function flash(text: string): void {
    flashText = text;
    flashUntil = Date.now() + FLASH_MS;
    render();
  }

  function togglePause(): void {
    if (locked) return; // enforced break — can't pause/skip out of it
    if (!activeTimer) return; // free flow has no timer to pause
    activeTimer.togglePause();
    const snap = activeTimer.snapshot();
    if (snap.paused) {
      wantMusic = false;
      if (musicOk && playing()) pauseMusic();
      flash("⏸  paused");
    } else {
      // Only bring music back if we're resuming into a phase that should have
      // it. Breaks are intentionally silent, so unpausing mid-break must not
      // revive music (that was the surprising bug). Use `devflow music` (or the
      // watchdog) to force audio back during a break.
      const onBreak = snap.phase === "break" || snap.phase === "long-break";
      if (!onBreak) reviveMusic();
      flash("▶  resumed");
    }
  }

  function cycleChannel(): void {
    if (allChannels.length < 2) return;
    const i = allChannels.findIndex((c) => c.id === channel.id);
    channel = allChannels[(i + 1) % allChannels.length];
    if (musicOk) {
      stopHeartbeat();
      startHeartbeat(channel.id);
      if (wantMusic) restartMusic(); // play() stops the old stream first
    }
    flash(`${channel.icon} ${channel.name}`);
  }

  function adjustVolume(delta: number): void {
    musicVolume = Math.max(0, Math.min(100, musicVolume + delta));
    setVolume(musicVolume);
    flash(`volume ${musicVolume}`);
  }

  function changeRounds(delta: number): void {
    if (!activeTimer || !pomo) return; // rounds only apply to pomodoro
    const next = activeTimer.adjustRounds(delta);
    // Keep the session file (and so `devflow status`) in step with the change.
    const s = session.load();
    if (s) session.save({ ...s, rounds: next });
    const done = activeTimer.snapshot().pomodoroCount;
    flash(
      next === undefined
        ? "rounds: unlimited"
        : `rounds: ${next} (${done} done)`
    );
  }

  function handleKey(key: string): void {
    // During an enforced break every soft key is swallowed — no pause, no skip,
    // no channel hop. Only Ctrl+C/Ctrl+D (handled before this) still works.
    if (locked) return;
    switch (key) {
      case " ":
        return togglePause();
      case "n":
      case "N":
        return cycleChannel();
      case "[":
        return changeRounds(-1);
      case "]":
        return changeRounds(1);
      case "m":
      case "M":
        mascot = !mascot;
        return flash(`mascot ${mascot ? "on" : "off"}`);
      case "v":
      case "V":
        voice = !voice;
        return flash(`voice ${voice ? "on" : "off"}`);
      case "+":
      case "=":
        return adjustVolume(5);
      case "-":
      case "_":
        return adjustVolume(-5);
      case "f":
      case "F":
        return void captureFeedback();
      // anything else is swallowed — not echoed, not acted on
    }
  }

  // Quick in-session bug report. Suspends the raw-mode key handling + live
  // redraw, drops to a normal one-line read, submits best-effort, then restores
  // — the timer and music keep running throughout. Entirely best-effort: any
  // failure here must never crash or corrupt the session.
  async function captureFeedback(): Promise<void> {
    if (capturing || !rawInput) return;
    capturing = true;
    try {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      process.stdout.write("\n"); // step off the live countdown line
      const msg = await readLine(
        chalk.dim("  feedback (one line, blank to cancel): ")
      );
      if (!msg) {
        flash("feedback cancelled");
        return;
      }
      const result = await submitFeedback(msg, buildContext());
      flash(
        result.ok
          ? "✓ feedback sent"
          : "couldn't send — try `devflow feedback`"
      );
    } catch {
      // never let feedback break the session
    } finally {
      try {
        stdin.setRawMode(true);
        stdin.resume();
      } catch {
        // terminal may be gone — nothing more to do
      }
      stdin.on("data", onData);
      capturing = false;
    }
  }

  // One-line read over the owner's stdin, used by the feedback hotkey while raw
  // mode is temporarily off.
  function readLine(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = createInterface({ input: stdin, output: process.stdout });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  const onData = (buf: Buffer): void => {
    const key = buf.toString();
    if (key === "\x03" || key === "\x04") return cleanup(); // Ctrl+C / Ctrl+D
    handleKey(key);
  };

  if (rawInput) {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    // Safety net: restore the terminal even on an unexpected exit.
    process.on("exit", () => {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore
      }
    });
    console.log(chalk.dim("  " + HINTS) + "\n");
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
    timer.on("tick", (state: TimerState) => {
      lastState = state;
      render();
    });

    // Proactive heads-up before a transition. Audible only — no printed line,
    // which would interrupt the live countdown (it redraws in place with \r).
    timer.on("warning", (state: TimerState) => {
      cue("warn", cueVolume);
      if (voice) {
        // remaining == the lead that triggered this warning (standard or the
        // longer early heads-up), so phrase off it directly.
        const phrase = leadPhrase(state.remaining);
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
        // Break over: release the enforced lock and clear its full-screen
        // overlay so the live countdown resumes on a clean screen.
        if (locked) {
          locked = false;
          process.stdout.write("\x1b[2J\x1b[H");
        }
        reviveMusic();
        cue("work", cueVolume);
        if (voice) speak("Back to work", cueVolume);
      } else {
        breaksTaken++;
        wantMusic = false;
        if (musicOk && playing()) pauseMusic();
        // Enforced mode: take the screen and lock out the soft hotkeys for the
        // whole break, then auto-release when work resumes (above).
        if (enforce) locked = true;
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
      cleanup(timer, true);
    });

    // Handle SIGUSR1 for pause toggle from `devflow pause` — same path as the
    // in-session space hotkey.
    process.on("SIGUSR1", () => togglePause());

    timer.start();
    process.on("SIGINT", () => cleanup(timer));
    process.on("SIGTERM", () => cleanup(timer));
  } else {
    console.log(chalk.dim("  Press Ctrl+C to stop"));
    process.on("SIGINT", () => cleanup());
    process.on("SIGTERM", () => cleanup());
  }
}

// How much focus time accrued, in seconds, for the history log. Breaks don't
// count. Free mode has no timer, so it's wall-clock elapsed since start.
// Countdown is whatever ran. Pomodoro is completed work blocks plus any partial
// progress through the current block (when interrupted mid-work).
function focusSecondsOf(
  snap: TimerState | undefined,
  mode: "pomodoro" | "countdown" | "free",
  workMinutes: number,
  unitSeconds: number,
  startedAt: string
): number {
  if (mode === "free") {
    return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  }
  if (!snap) return 0;
  if (mode === "countdown") {
    return Math.max(0, snap.total - snap.remaining);
  }
  // pomodoro
  let seconds = snap.pomodoroCount * workMinutes * unitSeconds;
  if (snap.phase === "work" && snap.remaining > 0) {
    seconds += snap.total - snap.remaining;
  }
  return seconds;
}

// A compact recap printed to the real terminal after the session (and the alt
// screen) is torn down, so there's a trace left behind:
//   ✓ session complete · 1h 15m focused · 3 pomodoros · lo-fi
//   logged — run devflow stats to see your history
// When the session was logged, a second line points to `devflow stats` so the
// user knows their focus was recorded and how to review it.
function sessionSummary(
  completed: boolean,
  focusMinutes: number,
  mode: "pomodoro" | "countdown" | "free",
  pomodoros: number,
  channelName: string | null,
  logged: boolean
): string {
  const parts: string[] = [];
  if (focusMinutes >= 1) parts.push(`${fmtDuration(focusMinutes)} focused`);
  if (mode === "pomodoro" && pomodoros > 0) {
    parts.push(`${pomodoros} ${pomodoros === 1 ? "pomodoro" : "pomodoros"}`);
  }
  if (channelName) parts.push(channelName);
  const head = completed ? "✓ session complete" : "session stopped";
  const tail = parts.length ? "  ·  " + parts.join("  ·  ") : "";
  let out = "\n  " + chalk.dim(head + tail);
  if (logged) {
    out +=
      "\n  " +
      chalk.dim("logged — run ") +
      chalk.bold("devflow stats") +
      chalk.dim(" to see your history");
  }
  return out + "\n";
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
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
