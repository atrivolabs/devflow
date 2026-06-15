import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { DEVFLOW_DIR } from "./session.js";
import { channels as bundledChannels, type Channel } from "./channels.js";

// Single source of truth lives on the web app; the CLI fetches it and keeps a
// local cache so it stays fast and works offline. The bundled list (imported
// above) is the last-resort fallback shipped with each release.
const ENDPOINT =
  process.env.DEVFLOW_CHANNELS_URL ?? "https://www.devflow.fm/api/channels";
const CACHE_FILE = join(DEVFLOW_DIR, "channels.json");
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — channels change rarely
const FETCH_TIMEOUT = 3000; // 3s

interface ChannelsPayload {
  version: number;
  channels: Channel[];
}

function isValidPayload(data: unknown): data is ChannelsPayload {
  if (!data || typeof data !== "object") return false;
  const list = (data as { channels?: unknown }).channels;
  return (
    Array.isArray(list) &&
    list.length > 0 &&
    list.every(
      (c): c is Channel =>
        !!c &&
        typeof c.id === "string" &&
        typeof c.name === "string" &&
        Array.isArray(c.youtubeIds) &&
        c.youtubeIds.length > 0
    )
  );
}

function readCache(): { channels: Channel[]; ageMs: number } | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    if (!isValidPayload(data)) return null;
    return { channels: data.channels, ageMs: Date.now() - statSync(CACHE_FILE).mtimeMs };
  } catch {
    return null;
  }
}

function writeCache(payload: ChannelsPayload): void {
  try {
    if (!existsSync(DEVFLOW_DIR)) mkdirSync(DEVFLOW_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2));
  } catch {
    // Best-effort cache — a write failure shouldn't break playback.
  }
}

async function fetchChannels(): Promise<ChannelsPayload | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return isValidPayload(data) ? data : null;
  } catch {
    return null; // offline, timeout, bad JSON — fall back
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the channel list, preferring freshness but never failing:
 *   1. Fresh on-disk cache (< TTL) — instant, no network.
 *   2. Live fetch from the web app — refreshes the cache.
 *   3. Stale cache — when the network is unavailable.
 *   4. Bundled list shipped with this release.
 */
export async function loadChannels(): Promise<Channel[]> {
  const cached = readCache();
  if (cached && cached.ageMs < CACHE_TTL) return cached.channels;

  const fetched = await fetchChannels();
  if (fetched) {
    writeCache(fetched);
    return fetched.channels;
  }

  return cached?.channels ?? bundledChannels;
}
