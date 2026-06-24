#!/usr/bin/env node

import { Command } from "commander";
import { startSession } from "./commands/start.js";
import { showStatus } from "./commands/status.js";
import { pauseSession } from "./commands/pause.js";
import { stopSession } from "./commands/stop.js";
import { listChannelsCmd } from "./commands/channels.js";
import { setupCmd } from "./commands/setup.js";
import { musicCmd } from "./commands/music.js";
import { devicesCmd } from "./commands/devices.js";
import { statsCmd } from "./commands/stats.js";
import { feedbackCmd } from "./commands/feedback.js";

const program = new Command();

program
  .name("devflow")
  .description("Focus companion for developers — music, pomodoro, and session flow")
  .version("0.1.0");

program
  .command("start")
  .description("Start a focus session")
  .option("-c, --channel <channel>", "Music channel (default from config, else lofi)")
  .option("-t, --timer <minutes>", "Countdown timer in minutes")
  .option("-p, --pomodoro", "Pomodoro mode")
  .option("--profile <name>", "Named cadence profile (e.g. deep, scatter)")
  .option("-r, --rounds <n>", "Stop after N pomodoro work blocks (default: run forever)")
  .option("--work <minutes>", "Work block duration")
  .option("--break <minutes>", "Short break duration")
  .option("--long-break <minutes>", "Long break duration")
  .option("--audio-device <name>", "Audio output device (run `devflow devices` to list; default: system)")
  .option("--no-music", "Timer only, no music")
  .option("--demo", "Accelerated pomodoro (seconds, not minutes) to preview music + transitions")
  .option("--voice", "Speak transitions aloud (work / break / complete)")
  .option("--mascot", "Show an animated runner alongside the progress bar")
  .option("--no-mascot", "Hide the animated runner")
  .option("--enforce", "Lock the terminal during breaks so you actually stop")
  .option("--hard", "Alias for --enforce")
  .option("--hard-stop <HH:MM>", "Refuse to start a new sprint after this time of day")
  .action(startSession);

program
  .command("stop")
  .description("Stop the current session")
  .action(stopSession);

program
  .command("pause")
  .description("Toggle pause on the current session")
  .action(pauseSession);

program
  .command("music")
  .description("Restart/resume music for the active session")
  .action(musicCmd);

program
  .command("status")
  .description("Show current session info")
  .action(showStatus);

program
  .command("stats")
  .description("Show your focus history — time, streak, top channel, completion")
  .action(statsCmd);

program
  .command("channels")
  .description("List available music channels")
  .action(listChannelsCmd);

program
  .command("devices")
  .description("List audio output devices (for --audio-device / setup)")
  .action(devicesCmd);

program
  .command("setup")
  .description("Set up your defaults (channel, durations, voice, nudges)")
  .action(setupCmd);

program
  .command("feedback")
  .description("Report a bug or send feedback from the terminal (no browser)")
  .argument("[message...]", "Optional short summary of the issue")
  .action(feedbackCmd);

program.parse();
