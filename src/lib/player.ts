import { spawn, type ChildProcess } from "node:child_process";
import { getChannel } from "./channels.js";

let playerProcess: ChildProcess | null = null;
let currentChannel: string | null = null;

/**
 * Start playing a music channel.
 * Uses mpv if available (best), falls back to ffplay.
 * Streams audio from YouTube via yt-dlp.
 */
export async function play(channelName: string): Promise<void> {
  const channel = getChannel(channelName);
  if (!channel || !channel.url) return;

  // Stop any existing playback
  await stop();

  const playerBin = await findPlayer();
  if (!playerBin) {
    console.error(
      "No audio player found. Install mpv or ffplay:\n" +
        "  brew install mpv    # macOS\n" +
        "  sudo apt install mpv  # Linux\n"
    );
    return;
  }

  const ytdlpBin = await findBinary("yt-dlp");
  if (!ytdlpBin) {
    console.error(
      "yt-dlp not found. Install it:\n" +
        "  brew install yt-dlp    # macOS\n" +
        "  pip install yt-dlp     # pip\n"
    );
    return;
  }

  // Get audio stream URL via yt-dlp
  const streamUrl = await getStreamUrl(ytdlpBin, channel.url);
  if (!streamUrl) {
    console.error("Failed to get stream URL. The stream may be unavailable.");
    return;
  }

  // Play audio
  if (playerBin.endsWith("mpv")) {
    playerProcess = spawn(playerBin, [
      "--no-video",
      "--really-quiet",
      "--volume=50",
      streamUrl,
    ], { stdio: "ignore", detached: false });
  } else {
    // ffplay
    playerProcess = spawn(playerBin, [
      "-nodisp",
      "-autoexit",
      "-loglevel", "quiet",
      "-volume", "50",
      streamUrl,
    ], { stdio: "ignore", detached: false });
  }

  currentChannel = channelName;

  playerProcess.on("error", () => {
    playerProcess = null;
    currentChannel = null;
  });

  playerProcess.on("exit", () => {
    playerProcess = null;
  });
}

export async function stop(): Promise<void> {
  if (playerProcess) {
    playerProcess.kill("SIGTERM");
    playerProcess = null;
    currentChannel = null;
  }
}

export function isPlaying(): boolean {
  return playerProcess !== null && !playerProcess.killed;
}

export function getCurrentChannel(): string | null {
  return currentChannel;
}

async function getStreamUrl(ytdlpBin: string, url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(ytdlpBin, [
      "-f", "bestaudio",
      "-g",
      "--no-warnings",
      url,
    ]);

    let output = "";
    proc.stdout.on("data", (data) => { output += data.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim().split("\n")[0]);
      } else {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

async function findPlayer(): Promise<string | null> {
  return (await findBinary("mpv")) || (await findBinary("ffplay"));
}

async function findBinary(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("which", [name]);
    let path = "";
    proc.stdout.on("data", (data) => { path += data.toString(); });
    proc.on("close", (code) => {
      resolve(code === 0 ? path.trim() : null);
    });
    proc.on("error", () => resolve(null));
  });
}
