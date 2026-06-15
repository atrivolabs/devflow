import { spawn, type ChildProcess } from "node:child_process";
import type { Channel } from "./channels.js";
import { which } from "./deps.js";

export { checkDeps } from "./deps.js";

let proc: ChildProcess | null = null;

export async function play(channel: Channel): Promise<boolean> {
  await stop();

  const mpv = await which("mpv");
  if (!mpv) return false;

  // Pick a random YouTube ID so it's not always the same one
  const videoId =
    channel.youtubeIds[Math.floor(Math.random() * channel.youtubeIds.length)];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // mpv handles YouTube natively (via yt-dlp/youtube-dl)
  proc = spawn(mpv, ["--no-video", "--really-quiet", "--volume=40", url], {
    stdio: "ignore",
  });

  proc.on("error", () => { proc = null; });
  proc.on("exit", () => { proc = null; });

  return true;
}

export async function stop(): Promise<void> {
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    proc = null;
  }
}

export function playing(): boolean {
  return proc !== null && !proc.killed;
}

