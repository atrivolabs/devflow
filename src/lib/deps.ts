import { spawn } from "node:child_process";
import { platform } from "node:os";

export type Dep = "mpv" | "yt-dlp";

export interface DepStatus {
  mpv: boolean;
  ytdlp: boolean;
}

/**
 * Locate an executable on PATH. Cross-platform: uses `where` on Windows and
 * `which` elsewhere. Resolves to the resolved path, or null if not found.
 */
export function which(name: string): Promise<string | null> {
  const finder = platform() === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    const p = spawn(finder, [name], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
    });
    p.on("close", (code) =>
      resolve(code === 0 && out.trim() ? out.trim().split(/\r?\n/)[0] : null)
    );
    p.on("error", () => resolve(null));
  });
}

export async function checkDeps(): Promise<DepStatus> {
  const [mpv, ytdlp] = await Promise.all([which("mpv"), which("yt-dlp")]);
  return { mpv: !!mpv, ytdlp: !!ytdlp };
}

// Per-platform install commands. Linux is used as the fallback for unknown OSes.
const HINTS: Record<Dep, { darwin: string[]; linux: string[]; win32: string[]; docs: string }> = {
  mpv: {
    darwin: ["brew install mpv"],
    linux: [
      "sudo apt install mpv      # Debian/Ubuntu",
      "sudo dnf install mpv      # Fedora",
      "sudo pacman -S mpv        # Arch",
    ],
    win32: ["winget install mpv.mpv", "scoop install mpv", "choco install mpv"],
    docs: "https://mpv.io/installation/",
  },
  "yt-dlp": {
    darwin: ["brew install yt-dlp"],
    linux: [
      "sudo apt install yt-dlp   # Debian/Ubuntu",
      "pipx install yt-dlp       # any distro",
    ],
    win32: ["winget install yt-dlp.yt-dlp", "scoop install yt-dlp", "pipx install yt-dlp"],
    docs: "https://github.com/yt-dlp/yt-dlp#installation",
  },
};

/**
 * Platform-appropriate, multi-line install guidance for a missing dependency.
 * Falls back to a standalone-binary tip when a package manager isn't an option
 * (e.g. a Homebrew install at a non-standard prefix, which can't use bottles).
 */
export function installHint(dep: Dep): string {
  const os = platform();
  const entry = HINTS[dep];
  const cmds = os === "darwin" ? entry.darwin : os === "win32" ? entry.win32 : entry.linux;
  const lines = cmds.map((c) => `      ${c}`);

  // Both deps ship a self-contained binary you can drop on PATH with no
  // package manager — the reliable escape hatch on locked-down or
  // custom-prefix setups.
  if (dep === "yt-dlp") {
    lines.push("      or grab the standalone binary (self-updates via `yt-dlp -U`):");
    lines.push("      https://github.com/yt-dlp/yt-dlp/releases/latest");
  } else {
    lines.push("      or a self-contained build (bundles its own FFmpeg):");
    lines.push(`      ${entry.docs}`);
  }

  return lines.join("\n");
}
