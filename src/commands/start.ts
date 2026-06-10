import chalk from "chalk";
import { Timer, formatTime, type TimerState } from "../lib/timer.js";
import { play, stop as stopPlayer } from "../lib/player.js";
import { getChannel, listChannels } from "../lib/channels.js";
import { saveSession, clearSession, isSessionActive } from "../lib/session.js";

interface StartOptions {
  channel: string;
  timer?: string;
  pomodoro?: boolean;
  work: string;
  break: string;
  longBreak: string;
  music?: boolean;
}

export async function startSession(options: StartOptions): Promise<void> {
  if (isSessionActive()) {
    console.log(chalk.yellow("A session is already running. Use 'devflow stop' first."));
    return;
  }

  const channel = getChannel(options.channel);
  if (!channel) {
    console.log(chalk.red(`Unknown channel: ${options.channel}`));
    console.log(chalk.dim("Available channels:"));
    for (const ch of listChannels()) {
      console.log(chalk.dim(`  ${ch.name.toLowerCase().padEnd(12)} ${ch.description}`));
    }
    return;
  }

  const workMinutes = parseInt(options.work, 10);
  const breakMinutes = parseInt(options.break, 10);
  const longBreakMinutes = parseInt(options.longBreak, 10);
  const timerMinutes = options.timer ? parseInt(options.timer, 10) : undefined;
  const isPomodoro = options.pomodoro ?? false;
  const withMusic = options.music !== false;

  // Header
  console.log();
  console.log(chalk.bold("  devflow"));
  console.log(chalk.dim("  ─────────────────────────────"));

  if (isPomodoro) {
    console.log(chalk.green(`  Mode:    Pomodoro (${workMinutes}/${breakMinutes}/${longBreakMinutes})`));
  } else if (timerMinutes) {
    console.log(chalk.green(`  Mode:    Timer (${timerMinutes}min)`));
  } else {
    console.log(chalk.green("  Mode:    Free flow (no timer)"));
  }

  if (withMusic) {
    console.log(chalk.cyan(`  Channel: ${channel.name}`));
    console.log(chalk.dim(`  ${channel.description}`));
  }

  console.log(chalk.dim("  ─────────────────────────────"));
  console.log();

  // Save session info
  saveSession({
    pid: process.pid,
    channel: options.channel,
    pomodoro: isPomodoro,
    startedAt: new Date().toISOString(),
    workMinutes,
    breakMinutes,
    longBreakMinutes,
    timerMinutes,
  });

  // Start music
  if (withMusic && channel.url) {
    console.log(chalk.dim("  Loading stream..."));
    await play(options.channel);
    console.log(chalk.green("  ♪ Playing"));
    console.log();
  }

  // Start timer if needed
  if (isPomodoro || timerMinutes) {
    const timer = new Timer({
      pomodoro: isPomodoro,
      workMinutes,
      breakMinutes,
      longBreakMinutes,
      timerMinutes,
    });

    timer.on("tick", (state: TimerState) => {
      const phaseLabel = getPhaseLabel(state.phase);
      const bar = progressBar(state.remaining, state.total, 20);
      const timeStr = formatTime(state.remaining);
      const pomCount = state.pomodoroCount > 0 ? ` #${state.pomodoroCount}` : "";
      process.stdout.write(
        `\r  ${phaseLabel} ${bar} ${chalk.bold(timeStr)}${chalk.dim(pomCount)}  `
      );
    });

    timer.on("phase-change", (state: TimerState) => {
      console.log();
      const phaseLabel = getPhaseLabel(state.phase);
      if (state.phase === "work") {
        console.log(chalk.green(`\n  ▶ Back to work! (${formatTime(state.total)})`));
      } else {
        console.log(chalk.yellow(`\n  ☕ ${phaseLabel}! (${formatTime(state.total)})`));
      }
      // Ring bell
      process.stdout.write("\x07");
    });

    timer.on("complete", () => {
      console.log();
      console.log(chalk.green("\n  ✓ Session complete!"));
      process.stdout.write("\x07");
      cleanup();
    });

    timer.start();

    // Handle graceful shutdown
    const cleanup = () => {
      timer.stop();
      stopPlayer();
      clearSession();
      console.log();
      console.log(chalk.dim("  Session ended."));
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } else {
    // Free flow mode — just music, ctrl+c to stop
    console.log(chalk.dim("  Press Ctrl+C to stop"));

    const cleanup = () => {
      stopPlayer();
      clearSession();
      console.log();
      console.log(chalk.dim("  Session ended."));
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "work":
      return chalk.green("FOCUS");
    case "break":
      return chalk.yellow("BREAK");
    case "long-break":
      return chalk.magenta("LONG BREAK");
    case "countdown":
      return chalk.cyan("TIMER");
    default:
      return phase;
  }
}

function progressBar(remaining: number, total: number, width: number): string {
  if (total === 0) return "";
  const elapsed = total - remaining;
  const filled = Math.round((elapsed / total) * width);
  const empty = width - filled;
  return chalk.dim("[") + chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty)) + chalk.dim("]");
}
