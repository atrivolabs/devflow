#!/usr/bin/env node

import { Command } from "commander";
import { startSession } from "./commands/start.js";
import { showStatus } from "./commands/status.js";
import { pauseSession } from "./commands/pause.js";
import { stopSession } from "./commands/stop.js";

const program = new Command();

program
  .name("devflow")
  .description("Focus companion for developers — music, pomodoro, and session flow")
  .version("0.1.0");

program
  .command("start")
  .description("Start a focus session")
  .option("-c, --channel <channel>", "Music channel", "deepfocus")
  .option("-t, --timer <minutes>", "Session timer in minutes")
  .option("-p, --pomodoro", "Use pomodoro mode (25min work / 5min break)")
  .option("--work <minutes>", "Pomodoro work duration", "25")
  .option("--break <minutes>", "Pomodoro break duration", "5")
  .option("--long-break <minutes>", "Pomodoro long break duration (every 4th)", "15")
  .option("--no-music", "Timer only, no music")
  .action(startSession);

program
  .command("status")
  .description("Show current session status")
  .action(showStatus);

program
  .command("pause")
  .description("Pause/resume the current session")
  .action(pauseSession);

program
  .command("stop")
  .description("Stop the current session")
  .action(stopSession);

program.parse();
