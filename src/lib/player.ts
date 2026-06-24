import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Channel } from "./channels.js";
import { which } from "./deps.js";

export { checkDeps } from "./deps.js";

// Every mpv we've spawned that might still be alive — tracked as a set, not a
// single handle, because play() is async (it awaits a binary lookup) and is
// called from overlapping paths (the watchdog, channel-switch, revive). If we
// only remembered the latest child, an earlier overlapping spawn could outlive
// the session and keep playing after exit. stop() kills the whole set, so no
// mpv can be orphaned.
const procs = new Set<ChildProcess>();
let proc: ChildProcess | null = null; // most recent, used as the IPC target
let ipcPath: string | null = null;
let mpvPath: string | null | undefined; // cached so the spawn path has no await

export async function play(
  channel: Channel,
  volume = 40,
  ytdlpPath?: string,
  audioDevice?: string
): Promise<boolean> {
  await stop();

  // Resolve mpv once and cache it: keeping the spawn synchronous after stop()
  // shrinks the window where overlapping play() calls could double-spawn.
  if (mpvPath === undefined) mpvPath = await which("mpv");
  const mpv = mpvPath;
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
  // Route audio to a chosen output device (e.g. headphones). When unset, mpv
  // uses the system default. mpv falls back to the default on its own if the
  // named device is gone (e.g. headphones unplugged), so this never hard-fails.
  if (audioDevice) args.push(`--audio-device=${audioDevice}`);
  if (ytdlpPath) args.push(`--script-opts=ytdl_hook-ytdl_path=${ytdlpPath}`);
  args.push(url);

  const child = spawn(mpv, args, { stdio: "ignore" });
  procs.add(child);
  proc = child;

  const forget = () => {
    procs.delete(child);
    if (proc === child) proc = null;
  };
  child.on("error", forget);
  child.on("exit", forget);

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
  // Kill every mpv we've spawned, not just the latest — this is what guarantees
  // music can't outlive the session (see the note on `procs`). Synchronous, so
  // it's effective even when cleanup() calls it right before process.exit().
  for (const p of procs) {
    if (!p.killed) p.kill("SIGTERM");
  }
  procs.clear();
  proc = null;
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

export interface AudioDevice {
  name: string; // pass to --audio-device / config.audioDevice
  description: string; // human-readable label mpv reports
}

// Enumerate the audio output devices mpv can see (`mpv --audio-device=help`).
// Best-effort: returns [] when mpv is missing or output can't be parsed.
export async function listAudioDevices(): Promise<AudioDevice[]> {
  const mpv = mpvPath !== undefined ? mpvPath : await which("mpv");
  mpvPath = mpv;
  if (!mpv) return [];

  return new Promise((resolve) => {
    const p = spawn(mpv, ["--audio-device=help"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
    });
    p.on("error", () => resolve([]));
    p.on("close", () => {
      const devices: AudioDevice[] = [];
      // Lines look like:  'coreaudio/AppleHDA...' (Built-in Output)
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^\s*'([^']*)'\s*(?:\((.*)\))?\s*$/);
        if (m && m[1]) devices.push({ name: m[1], description: (m[2] ?? "").trim() });
      }
      resolve(devices);
    });
  });
}
