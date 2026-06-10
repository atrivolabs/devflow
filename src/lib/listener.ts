import { randomUUID } from "node:crypto";

const API = "https://www.devflow.fm/api/listeners";
const HEARTBEAT_MS = 15_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let listenerId: string | null = null;

export function startHeartbeat(channelId: string): void {
  listenerId = randomUUID();
  ping(channelId);
  intervalId = setInterval(() => ping(channelId), HEARTBEAT_MS);
}

export function stopHeartbeat(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  if (listenerId) {
    // Best-effort cleanup
    fetch(API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listenerId }),
    }).catch(() => {});
    listenerId = null;
  }
}

function ping(channelId: string): void {
  if (!listenerId) return;
  fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listenerId, channelId }),
  }).catch(() => {});
}
