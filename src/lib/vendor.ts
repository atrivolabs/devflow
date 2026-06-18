import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR } from "./paths.js";

// yt-dlp ships official, self-contained per-platform binaries (no Python
// needed) that self-update via `yt-dlp -U`. When it isn't already on PATH we
// fetch the right one into ~/.config/devflow/bin so music "just works" on the
// npm/pnpm install path — without brew, sudo, or a postinstall script. mpv is
// deliberately NOT vendored (big native app, no clean single-file build); it
// stays detect-and-instruct.
const RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

const DOWNLOAD_TIMEOUT_MS = 60_000; // the binary is ~tens of MB
const SUMS_TIMEOUT_MS = 10_000;

// Map platform/arch to the official standalone asset. Only targets that ship a
// no-Python binary are vendorable; anything else returns null and we fall back
// to detect-and-instruct.
function assetName(): string | null {
  if (process.platform === "darwin") return "yt-dlp_macos"; // universal2 (arm64 + x64)
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "linux") {
    if (process.arch === "x64") return "yt-dlp_linux";
    if (process.arch === "arm64") return "yt-dlp_linux_aarch64";
    if (process.arch === "arm") return "yt-dlp_linux_armv7l";
  }
  return null;
}

export function vendorDir(): string {
  return join(DEVFLOW_DIR, "bin");
}

export function vendoredYtdlpPath(): string {
  return join(vendorDir(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

// Honour an explicit opt-out for anyone who doesn't want us downloading an
// executable (locked-down environments, policy, preference).
export function vendorOptedOut(): boolean {
  const v = process.env.DEVFLOW_NO_DOWNLOAD?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// Provide a usable yt-dlp, downloading the official release on first need.
// Returns the binary path, or null if we can't help (unsupported platform,
// opted out, or any download/verification failure). Best-effort: never throws —
// a null just means "no music", exactly as before this existed.
export async function ensureYtdlp(): Promise<string | null> {
  if (vendorOptedOut()) return null;

  const dest = vendoredYtdlpPath();
  if (isUsable(dest)) return dest;

  const asset = assetName();
  if (!asset) return null;

  try {
    const bytes = await download(`${RELEASE}/${asset}`, DOWNLOAD_TIMEOUT_MS);
    if (!bytes) return null;
    // Verify against the release's published checksums (fail-closed: if we
    // can't confirm the hash, we don't install it).
    if (!(await checksumMatches(asset, bytes))) return null;

    mkdirSync(vendorDir(), { recursive: true });
    const tmp = `${dest}.download`;
    writeFileSync(tmp, bytes);
    if (process.platform !== "win32") chmodSync(tmp, 0o755);
    renameSync(tmp, dest); // atomic swap into place
    return dest;
  } catch {
    return null;
  }
}

function isUsable(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

async function download(url: string, timeoutMs: number): Promise<Buffer | null> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 ? buf : null;
}

// Compare the download against the release's SHA2-256SUMS manifest.
async function checksumMatches(asset: string, bytes: Buffer): Promise<boolean> {
  try {
    const res = await fetch(`${RELEASE}/SHA2-256SUMS`, {
      redirect: "follow",
      signal: AbortSignal.timeout(SUMS_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const manifest = await res.text();
    const want = manifest
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .find((parts) => parts[1] === asset)?.[0];
    if (!want) return false;
    const got = createHash("sha256").update(bytes).digest("hex");
    return got.toLowerCase() === want.toLowerCase();
  } catch {
    return false;
  }
}
