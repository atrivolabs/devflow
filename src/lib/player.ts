import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Channel } from "./channels.js";
import { which } from "./deps.js";

export { checkDeps } from "./deps.js";

let proc: ChildProcess | null = null;
let ipcPath: string | null = null;

export async function play(channel: Channel): Promise<boolean> {
  await stop();

  const mpv = await which("mpv");
  if (!mpv) return false;

  // Pick a random YouTube ID so it's not always the same one
  const videoId =
    channel.youtubeIds[Math.floor(Math.random() * channel.youtubeIds.length)];
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // IPC socket lets us pause/resume the running mpv (e.g. during breaks)
  // without tearing down and re-resolving the stream.
  ipcPath = join(tmpdir(), `devflow-mpv-${process.pid}.sock`);

  // mpv handles YouTube natively (via yt-dlp/youtube-dl)
  proc = spawn(
    mpv,
    [
      "--no-video",
      "--really-quiet",
      "--volume=40",
      `--input-ipc-server=${ipcPath}`,
      url,
    ],
    { stdio: "ignore" }
  );

  proc.on("error", () => { proc = null; });
  proc.on("exit", () => { proc = null; });

  return true;
}

// Fire-and-forget JSON command to the mpv IPC socket. Best-effort: a missing
// socket or closed player is a silent no-op.
function ipcCommand(command: unknown[]): void {
  if (!ipcPath || !proc) return;
  try {
    const sock = createConnection(ipcPath);
    sock.on("error", () => sock.destroy());
    sock.on("connect", () => {
      sock.write(JSON.stringify({ command }) + "\n");
      sock.end();
    });
  } catch {
    // ignore — pausing music should never crash a session
  }
}

export function pauseMusic(): void {
  ipcCommand(["set_property", "pause", true]);
}

export function resumeMusic(): void {
  ipcCommand(["set_property", "pause", false]);
}

export async function stop(): Promise<void> {
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    proc = null;
  }
  if (ipcPath) {
    try {
      unlinkSync(ipcPath);
    } catch {
      // socket may already be gone
    }
    ipcPath = null;
  }
}

export function playing(): boolean {
  return proc !== null && !proc.killed;
}
