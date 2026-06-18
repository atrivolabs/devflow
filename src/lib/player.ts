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

export async function play(
  channel: Channel,
  volume = 40,
  ytdlpPath?: string
): Promise<boolean> {
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

  // mpv handles YouTube natively (via yt-dlp/youtube-dl). When we've vendored
  // our own yt-dlp (it isn't on PATH), point mpv's ytdl hook straight at it.
  const args = [
    "--no-video",
    "--really-quiet",
    `--volume=${volume}`,
    `--input-ipc-server=${ipcPath}`,
  ];
  if (ytdlpPath) args.push(`--script-opts=ytdl_hook-ytdl_path=${ytdlpPath}`);
  args.push(url);

  proc = spawn(mpv, args, { stdio: "ignore" });

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

// Live volume change on the running mpv (0–100). Best-effort like the rest of
// the IPC; a new track spawned later picks up the volume via play()'s argument.
export function setVolume(volume: number): void {
  ipcCommand(["set_property", "volume", volume]);
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
