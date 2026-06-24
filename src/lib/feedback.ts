import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { release } from "node:os";
import { spawn } from "node:child_process";
import * as session from "./session.js";

// No-browser feedback submission. The CLI can't ship a GitHub token, so it
// POSTs the message + anonymous context to a server endpoint that holds the
// token and files the issue (same best-effort pattern as listener.ts). When the
// endpoint is unreachable we fall back to a pre-filled GitHub new-issue URL so
// feedback is never a dead end. Override the endpoint with DEVFLOW_FEEDBACK_URL.
const ENDPOINT =
  process.env.DEVFLOW_FEEDBACK_URL ?? "https://www.devflow.fm/api/feedback";
const ISSUES_NEW = "https://github.com/atrivolabs/devflow/issues/new";
const SUBMIT_TIMEOUT = 8000; // 8s — issue creation is a round-trip, not a ping

// Anonymous, low-noise environment context. Deliberately no PII: no file paths,
// no usernames, no hostname — just the bits that help triage a bug.
export interface FeedbackContext {
  version: string;
  os: string;
  arch: string;
  node: string;
  mode?: string;
  channel?: string;
}

export function buildContext(): FeedbackContext {
  const ctx: FeedbackContext = {
    version: cliVersion(),
    os: `${osName()} ${release()}`,
    arch: process.arch,
    node: process.version,
  };
  // Only attach session details (mode/channel) when one is actually running.
  if (session.active()) {
    const s = session.load();
    if (s) {
      ctx.mode = s.mode;
      ctx.channel = s.channel;
    }
  }
  return ctx;
}

// A compact, human-readable rendering of the context for the confirm preview.
export function describeContext(ctx: FeedbackContext): string[] {
  const lines = [
    `  OS:       ${ctx.os} (${ctx.arch})`,
    `  devflow:  ${ctx.version}`,
    `  Node:     ${ctx.node}`,
  ];
  if (ctx.mode) lines.push(`  session:  ${ctx.mode}${ctx.channel ? ` · ${ctx.channel}` : ""}`);
  return lines;
}

export interface SubmitResult {
  ok: boolean;
  url?: string; // the created issue URL, when the endpoint returns one
}

// POST the feedback to the server endpoint. Best-effort and never throws: on
// any failure (offline, timeout, non-2xx, bad JSON) it resolves { ok: false }
// so the caller can fall back to the browser URL.
export async function submitFeedback(
  message: string,
  context: FeedbackContext
): Promise<SubmitResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUBMIT_TIMEOUT);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message, context }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json().catch(() => null)) as
      | { url?: string; html_url?: string; issueUrl?: string }
      | null;
    const url = data?.url ?? data?.html_url ?? data?.issueUrl;
    return { ok: true, url };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// Fallback path: a GitHub "new issue" URL with the message + environment block
// pre-filled (matches the bug_report.md template fields), used when the
// endpoint is unreachable so the user can still file in one click.
export function buildIssueUrl(message: string, ctx: FeedbackContext): string {
  const summary = firstLine(message);
  const sessionNote = ctx.mode
    ? `\n\nReported from an active session — mode: ${ctx.mode}, channel: ${ctx.channel}.`
    : "";
  const body = [
    "## What happened",
    "",
    message.trim() || "<describe the problem>",
    "",
    "## Environment",
    "",
    `- OS: ${ctx.os} (${ctx.arch})`,
    `- devflow version: ${ctx.version}`,
    `- Node version: ${ctx.node}`,
    sessionNote.trim(),
    "",
  ].join("\n");

  const params = new URLSearchParams({ labels: "bug", body });
  if (summary) params.set("title", summary);
  return `${ISSUES_NEW}?${params.toString()}`;
}

// Best-effort browser open across platforms. Never throws; if there's no
// browser (headless / SSH), the printed URL is the fallback.
export function tryOpen(url: string): void {
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

function firstLine(s: string): string {
  return s.split("\n")[0]?.trim() ?? "";
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

// Read the version from package.json at runtime, falling back gracefully.
// Handles both the bundled layout (dist/cli.js → ../package.json) and running
// from source (src/lib → ../../package.json).
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
