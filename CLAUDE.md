# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`devflow` is a CLI focus companion: pomodoro/countdown timers plus background
focus music streamed from YouTube. It's a TypeScript ESM package published to
npm (`bin: devflow`). The marketing site and channel API live in a separate web
repo at devflow.fm.

## Commands

```sh
pnpm dev <args>      # run the CLI from source via tsx (e.g. pnpm dev start --demo)
pnpm build           # bundle src/cli.ts -> dist/cli.js with tsup (ESM)
pnpm typecheck       # tsc --noEmit; the only "test" gate — there is no test suite
```

There are no unit tests, no linter, and no CI config in the repo. `pnpm typecheck`
is the correctness check before committing.

`package.json` pins `"packageManager": "pnpm@10.30.2"`, so if your `pnpm` is a
Corepack shim (the default on recent Node), the first `pnpm` command in this repo
may prompt `Corepack is about to download pnpm-10.30.2.tgz … continue? [Y/n]`.
Answer `Y` once (it caches), or run `corepack install` up front. This is a
contributor-only, build-toolchain prompt — it never reaches published-package
users, who just run the bundled `dist/cli.js`.

The fastest way to exercise runtime behavior end-to-end is `pnpm dev start --demo`,
which runs an accelerated pomodoro (durations in seconds, not minutes) so music,
transitions, cues, and the watchdog all fire within ~1 minute.

## Architecture

### One owner process, thin signal-based clients

`devflow start` is the **only** long-lived process. It owns the timer, the music
player, and the terminal UI. Every other subcommand (`stop`, `pause`, `music`) is
a thin client that finds the running session and pokes it with a Unix signal —
they do no work themselves:

- `pause`  → `SIGUSR1` → toggles pause (timer + music)
- `music`  → `SIGUSR2` → revives music (unpause if paused, respawn if dead)
- `stop`   → `SIGTERM` → triggers cleanup

The bridge between client and owner is `~/.config/devflow/session.json`
(`src/lib/session.ts`), which stores the owner's `pid`. `session.active()` tests
liveness with `process.kill(pid, 0)` and self-heals a stale file. When adding a
new control command, follow this pattern: register a signal handler in
`start.ts`, send the signal from the command. Don't try to mutate session state
from a client process.

`start.ts` has a single `cleanup()` function as the one source of truth for
teardown (clears watchdog, restores terminal raw mode, stops music + heartbeat,
clears the session file). All exit paths route through it.

### Music playback (`src/lib/player.ts`)

Music is an external `mpv --no-video <youtube-url>` subprocess; `mpv` invokes
`yt-dlp` to resolve the stream. Both are **PATH dependencies**, not bundled —
see `docs/dependencies.md` for the full rationale and install/troubleshooting
notes (this is the file to read before touching anything music-related).

Pause/resume is done over an mpv **IPC socket** (`--input-ipc-server`, a unix
socket in tmpdir) so a break doesn't tear down and re-resolve the stream. All
IPC is best-effort and never throws — losing audio must never crash a session.

Because mpv exits when a finite track ends (or the stream drops), `start.ts`
runs a **watchdog** (`setInterval`) that respawns music when it should be playing
but isn't, with backoff after repeated fast failures. `wantMusic` is the flag for
"should audio be on right now" (false during breaks/pause); the watchdog respects
it.

### Channel resolution (`src/lib/channel-source.ts`)

The channel list is **not** primarily the bundled `src/lib/channels.ts`. At
startup it's resolved with a fallback chain: fresh on-disk cache (<6h) → live
fetch from `https://www.devflow.fm/api/channels` (3s timeout) → stale cache →
bundled fallback. This lets a dead stream be fixed server-side and reach users
within ~6h without a CLI release. Keep `channels.ts` roughly current as the
offline first-run fallback. Override the endpoint with `DEVFLOW_CHANNELS_URL`.

### Timer (`src/lib/timer.ts`)

`Timer` is an `EventEmitter` driven by a 1s `setInterval`, emitting
`tick` / `warning` / `phase` / `complete`. `start.ts` is the only consumer and
wires these to UI redraws and audio cues. `unitSeconds` (60 normally, 1 in demo
mode) is what makes the same duration numbers mean seconds for `--demo`.

### Settings precedence

Resolution order everywhere is **explicit flag > config file > built-in default**
(`--demo` overrides durations on top of that). Config lives in
`~/.config/devflow/config.json` (`src/lib/config.ts`), is validated/sanitized on
load, and a malformed file silently falls back to defaults rather than breaking a
session. Defaults live in `config.ts` `DEFAULTS`.

### Other pieces

- `src/lib/cues.ts` — transition sounds (macOS `afplay` system sounds, terminal
  bell fallback) and `--voice` TTS (`say` / `spd-say`). Never throws.
- `src/lib/listener.ts` — anonymous "now listening" heartbeat POSTed to the web
  API every 15s; entirely best-effort and fire-and-forget.
- `src/lib/paths.ts` — XDG config dir (`~/.config/devflow`), with a one-time
  migration from the legacy `~/.devflow` location.

## Conventions / gotchas

- **ESM with `.js` import specifiers.** Source is `.ts` but imports must use the
  `.js` extension (e.g. `import ... from "./lib/timer.js"`). Required by the ESM
  module resolution config — getting this wrong breaks the build/runtime.
- **Audio/IO is always best-effort.** Player, cues, IPC, and the listener
  heartbeat all swallow errors. Preserve this — a missing binary, dropped stream,
  or network failure must degrade gracefully, never crash or block the session.
- All user-facing output is greyscale/compact by design (`chalk.dim`, one line
  per phase); the live countdown redraws in place with `\r`, so avoid `console.log`
  during an active tick loop — emit audible cues instead (see how `warning`/`phase`
  are handled in `start.ts`).
