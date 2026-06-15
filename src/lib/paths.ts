import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, renameSync } from "node:fs";

// Config/state directory, following the XDG convention:
//   $XDG_CONFIG_HOME/devflow  (defaults to ~/.config/devflow)
// Holds config.json, the channels cache, and the active session.
const configHome =
  process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
export const DEVFLOW_DIR = join(configHome, "devflow");

// One-time migration from the legacy ~/.devflow location, so existing users
// keep their config/session without noticing the move.
const LEGACY_DIR = join(homedir(), ".devflow");
(function migrateLegacy() {
  try {
    if (!existsSync(DEVFLOW_DIR) && existsSync(LEGACY_DIR)) {
      mkdirSync(dirname(DEVFLOW_DIR), { recursive: true });
      renameSync(LEGACY_DIR, DEVFLOW_DIR);
    }
  } catch {
    // Best-effort: if the move fails we simply start fresh in the new location.
  }
})();

export function ensureDir(): void {
  if (!existsSync(DEVFLOW_DIR)) mkdirSync(DEVFLOW_DIR, { recursive: true });
}
