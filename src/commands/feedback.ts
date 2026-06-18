import chalk from "chalk";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { release } from "node:os";
import * as session from "../lib/session.js";

// Where reports land. Public repo, so an anonymous user can file directly.
const ISSUES_NEW = "https://github.com/atrivolabs/devflow/issues/new";

// For now feedback is browser-based: we build a pre-filled GitHub "new issue"
// URL (environment auto-filled), print it, and try to open it. A true
// no-browser, in-CLI submission flow needs a server endpoint and is tracked
// separately in #17.
export async function feedbackCmd(message: string[] = []): Promise<void> {
  const summary = message.join(" ").trim();
  const url = buildIssueUrl(summary);

  console.log();
  console.log(chalk.bold("  Report a bug or send feedback"));
  console.log(
    chalk.dim("  Opens a pre-filled GitHub issue (environment details included).")
  );
  console.log();
  console.log("  " + chalk.cyan(url));
  console.log();
  console.log(chalk.dim("  If your browser doesn't open, copy the link above.\n"));

  tryOpen(url);
}

// Compose a GitHub new-issue URL with the title/body/labels pre-filled. We
// build the body ourselves (rather than selecting the bug_report template) so
// the environment block comes in already filled from the running CLI.
function buildIssueUrl(summary: string): string {
  const active = session.active() ? session.load() : null;
  const ctx = active
    ? `\n\nReported from an active session — mode: ${active.mode}, channel: ${active.channel}.`
    : "";

  const body = [
    "## What happened",
    "",
    summary || "<describe the problem>",
    "",
    "## What you expected",
    "",
    "",
    "## Steps to reproduce",
    "",
    "1. Run `devflow ...`",
    "2. ",
    "",
    "## Environment",
    "",
    `- OS: ${osName()} ${release()} (${process.arch})`,
    `- devflow version: ${cliVersion()}`,
    `- Node version: ${process.version}`,
    "- `mpv --version` (if it's a music issue): ",
    "- `yt-dlp --version` (if it's a music issue): ",
    "",
    "## Notes",
    `${ctx.trim() || "Anything else — error output, whether `devflow start --demo` reproduces it, etc."}`,
    "",
  ].join("\n");

  const params = new URLSearchParams({ labels: "bug", body });
  if (summary) params.set("title", summary);
  return `${ISSUES_NEW}?${params.toString()}`;
}

function osName(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}

// Best-effort browser open across platforms. Never throws; if there's no
// browser (headless / SSH), the printed URL is the fallback.
function tryOpen(url: string): void {
  let cmd: string;
  let args: string[];
  if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // swallow ENOENT etc.
    child.unref();
  } catch {
    // ignore — the URL was already printed
  }
}

// Read the version from package.json at runtime, falling back gracefully.
// Handles both the bundled layout (dist/cli.js → ../package.json) and running
// from source (src/commands → ../../package.json).
function cliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const rel of ["../package.json", "../../package.json"]) {
    try {
      const pkg = JSON.parse(readFileSync(join(here, rel), "utf-8")) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try the next candidate
    }
  }
  return "0.0.0";
}
