import chalk from "chalk";
import { readHistory, type SessionRecord } from "../lib/history.js";
import { channels, findChannel } from "../lib/channels.js";
import * as ui from "../lib/display.js";

const LABEL_WIDTH = 14;

export async function statsCmd(): Promise<void> {
  const records = readHistory();

  ui.header(["Your focus history"]);
  console.log();

  if (records.length === 0) {
    console.log(chalk.dim("  No sessions logged yet."));
    console.log(chalk.dim("  Run ") + chalk.bold("devflow start") + chalk.dim(" to begin.\n"));
    return;
  }

  const now = new Date();
  const todayKey = dayKey(now);
  const weekStart = startOfWeek(now); // Monday 00:00 local

  let todayFocus = 0;
  let todayPoms = 0;
  let weekFocus = 0;
  let allFocus = 0;
  let allPoms = 0;
  let finished = 0;
  const focusByChannel = new Map<string, number>();
  const activeDays = new Set<string>(); // days with ≥1 minute of focus

  for (const r of records) {
    const when = new Date(r.timestamp);
    const focus = num(r.focusMinutes);
    const poms = num(r.workBlocks);

    allFocus += focus;
    allPoms += poms;
    if (r.completed) finished++;
    if (r.channel) focusByChannel.set(r.channel, (focusByChannel.get(r.channel) ?? 0) + focus);
    if (focus > 0) activeDays.add(dayKey(when));

    if (dayKey(when) === todayKey) {
      todayFocus += focus;
      todayPoms += poms;
    }
    if (when.getTime() >= weekStart.getTime()) weekFocus += focus;
  }

  const streak = computeStreak(activeDays, now);
  const top = topChannel(focusByChannel, allFocus);

  // today / week / all-time focus + pomodoro counts
  console.log(row("today", value(todayFocus) + pomSuffix(todayPoms)));
  console.log(row("this week", value(weekFocus)));
  console.log(row("all time", value(allFocus) + pomSuffix(allPoms)));
  console.log(
    row("streak", chalk.whiteBright(`${streak} ${streak === 1 ? "day" : "days"}`))
  );
  if (top) console.log(row("top channel", chalk.whiteBright(`${top.name} (${top.pct}%)`)));
  console.log(
    row(
      "completion",
      chalk.whiteBright(`${finished}/${records.length}`) + chalk.dim(" sessions finished")
    )
  );

  console.log();
  console.log("  " + weekSparkline(records, weekStart));
  console.log();
}

// --- formatting -------------------------------------------------------------

function row(label: string, val: string): string {
  return "  " + chalk.dim(label.padEnd(LABEL_WIDTH)) + val;
}

function value(minutes: number): string {
  return chalk.whiteBright(fmtDuration(minutes));
}

function pomSuffix(poms: number): string {
  if (poms <= 0) return "";
  return chalk.dim("  ·  ") + chalk.whiteBright(`${poms} ${poms === 1 ? "pomodoro" : "pomodoros"}`);
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// --- aggregation helpers ----------------------------------------------------

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function topChannel(
  byChannel: Map<string, number>,
  total: number
): { name: string; pct: number } | null {
  let bestId: string | null = null;
  let best = 0;
  for (const [id, mins] of byChannel) {
    if (mins > best) {
      best = mins;
      bestId = id;
    }
  }
  if (!bestId || total <= 0) return null;
  const name = findChannel(channels, bestId)?.name ?? bestId;
  return { name, pct: Math.round((best / total) * 100) };
}

// Consecutive days (ending today) with at least one minute of focus. A blank
// today doesn't break the streak — it counts back from yesterday in that case.
function computeStreak(activeDays: Set<string>, now: Date): number {
  let cursor = startOfDay(now);
  if (!activeDays.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Per-day focus for the current week (Mon→Sun) as a relative 4-cell sparkline,
// scaled against the busiest day so the shape reads at a glance.
function weekSparkline(records: SessionRecord[], weekStart: Date): string {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const perDay = new Array(7).fill(0) as number[];
  for (const r of records) {
    const idx = Math.floor(
      (startOfDay(new Date(r.timestamp)).getTime() - weekStart.getTime()) / 86_400_000
    );
    if (idx >= 0 && idx < 7) perDay[idx] += num(r.focusMinutes);
  }
  const max = Math.max(...perDay, 0);
  return days
    .map((name, i) => `${chalk.dim(name)} ${cells(perDay[i], max)}`)
    .join("  ");
}

function cells(minutes: number, max: number): string {
  const CELLS = 4;
  let filled = 0;
  if (minutes > 0 && max > 0) {
    filled = Math.max(1, Math.round((minutes / max) * CELLS));
  }
  return (
    chalk.whiteBright("▪".repeat(filled)) + chalk.dim("░".repeat(CELLS - filled))
  );
}

// --- date helpers (all local time) ------------------------------------------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Monday as the first day of the week.
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const offset = day === 0 ? 6 : day - 1; // days since Monday
  return addDays(startOfDay(d), -offset);
}
