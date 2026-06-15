#!/usr/bin/env node

import { Command } from "commander";
import { startSession } from "./commands/start.js";
import { showStatus } from "./commands/status.js";
import { pauseSession } from "./commands/pause.js";
import { stopSession } from "./commands/stop.js";
import { listChannelsCmd } from "./commands/channels.js";

const program = new Command();

program
  .name("devflow")
  .description("Focus companion for developers — music, pomodoro, and session flow")
  .version("0.1.0");

program
  .command("start")
  .description("Start a focus session")
  .option("-c, --channel <channel>", "Music channel (default: lofi)", "lofi")
  .option("-t, --timer <minutes>", "Countdown timer in minutes")
  .option("-p, --pomodoro", "Pomodoro mode (25/5/15)")
  .option("-r, --rounds <n>", "Stop after N pomodoro work blocks (default: run forever)")
  .option("--work <minutes>", "Work block duration", "25")
  .option("--break <minutes>", "Short break duration", "5")
  .option("--long-break <minutes>", "Long break duration (every 4th)", "15")
  .option("--no-music", "Timer only, no music")
  .option("--demo", "Accelerated pomodoro (seconds, not minutes) to preview music + transitions")
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
  .command("status")
  .description("Show current session info")
  .action(showStatus);

program
  .command("channels")
  .description("List available music channels")
  .action(listChannelsCmd);

program.parse();
