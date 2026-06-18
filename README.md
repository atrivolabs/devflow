# devflow

**A focus companion for your terminal — pomodoro/countdown timers plus background focus music, all from the command line.**

`devflow` runs a focus session in one long-lived process: it owns the timer, streams background music (lo-fi, ambient, synthwave, and more) from curated channels, and plays gentle audible cues at each transition. Everything is greyscale and compact — one quiet line per phase, a live countdown that redraws in place, and no visual noise to pull you out of flow.

```
  devflow  ·  atrivolabs.com
  ─────────────────────────────
  Pomodoro 25/5/15 · lo-fi · 4 rounds
  ~ playing lo-fi

  FOCUS [████████░░░░░░░░░░░░░░░░] 17:42 #1
```

## Quick start

```sh
devflow start              # start a free-flow session with music
devflow start --pomodoro   # 25/5/15 pomodoro
devflow start --demo       # accelerated preview (seconds, not minutes) — try this first
devflow stats              # your focus history
```

> New here? Run `devflow start --demo` — it runs a full, accelerated pomodoro in about a minute so you can hear the music, transitions, and cues end-to-end.

## Install

### Prerequisites

- **Node.js ≥ 18**
- **`mpv`** and **`yt-dlp`** on your `PATH` — devflow streams music through them. They're standard media CLIs (the same way other tools depend on `git`); devflow detects them and, if either is missing, prints the right install command and continues *without* music rather than failing.

  ```sh
  # macOS
  brew install mpv yt-dlp
  # Debian/Ubuntu
  sudo apt install mpv yt-dlp
  # Windows
  winget install mpv.mpv yt-dlp.yt-dlp
  ```

  See **[docs/dependencies.md](docs/dependencies.md)** for the full rationale, per-OS instructions, the `deno` note, and troubleshooting (stale yt-dlp, custom Homebrew prefixes, etc.).

### Via Homebrew (recommended on macOS/Linux)

```sh
brew install atrivolabs/tap/devflow
```

This pulls in `mpv` and `yt-dlp` automatically (declared as formula
dependencies), so music works out of the box with no extra setup.

### From npm

```sh
npm i -g @atrivolabs/devflow
```

You'll need `mpv` and `yt-dlp` on your `PATH` (see [Prerequisites](#prerequisites) above).

### From source (works today)

```sh
git clone https://github.com/atrivolabs/devflow.git
cd devflow
pnpm install
pnpm build
npm link          # makes `devflow` available globally
```

For local development you can also run straight from source without linking:

```sh
pnpm dev start --demo
```

## Commands

| Command | What it does |
|---------|--------------|
| `devflow start` | Start a focus session (the only long-lived process). |
| `devflow pause` | Toggle pause on the running session (timer + music). |
| `devflow music` | Restart/resume music for the active session. |
| `devflow stop` | Stop the current session. |
| `devflow status` | Show the current session's mode, channel, and elapsed time. |
| `devflow stats` | Your focus history — today/week/all-time time, streak, top channel, completion rate. |
| `devflow channels` | List the available music channels. |
| `devflow setup` | Set your defaults (channel, durations, voice, nudges). |
| `devflow feedback` | Report a bug or send feedback (opens a pre-filled GitHub issue). |

`pause`, `music`, and `stop` are thin clients — they find the running session and signal it; `start` does all the work.

### `start` options

| Flag | Description |
|------|-------------|
| `-c, --channel <name>` | Music channel (default from config, else `lofi`). |
| `-p, --pomodoro` | Pomodoro mode (work / break / long break). |
| `-t, --timer <minutes>` | Single countdown timer. |
| `-r, --rounds <n>` | Stop after N pomodoro work blocks (default: run forever). |
| `--work <minutes>` | Work block duration. |
| `--break <minutes>` | Short break duration. |
| `--long-break <minutes>` | Long break duration. |
| `--no-music` | Timer only, no music. |
| `--voice` | Speak transitions aloud ("Back to work", "Time for a break"). |
| `--demo` | Accelerated pomodoro (seconds, not minutes) to preview everything quickly. |

## Configuration

Defaults live in `~/.config/devflow/config.json` — run `devflow setup` to edit them interactively. Settings resolve as **explicit flag > config file > built-in default**. Defaults: 25/5/15 minute pomodoro, a long break every 4 blocks, `lofi` channel, voice off. A malformed config never breaks a session — it falls back to defaults.

## Focus history

`devflow stats` reads a private, local, append-only log of your finished sessions (`~/.config/devflow/history.jsonl`) and shows today / this week / all-time focus time and pomodoro counts, your current streak, top channel, completion rate, and a per-day weekly sparkline. It's terminal-only — nothing is synced or uploaded.

```
  today         1h 40m  ·  3 pomodoros
  this week     4h 50m
  all time      7h 20m  ·  15 pomodoros
  streak        5 days
  top channel   lo-fi (49%)
  completion    6/8 sessions finished

  Mon ▪▪░░  Tue ▪▪▪▪  Wed ▪▪░░  Thu ▪▪▪▪  Fri ░░░░  Sat ░░░░  Sun ░░░░
```

## Reporting bugs

Found a problem or have a suggestion? The fastest path is from inside the CLI:

```sh
devflow feedback "music stops after the first break"
```

This opens a **pre-filled GitHub issue** with your environment details (OS, devflow version, Node version) already filled in. You can also file one directly at **[github.com/atrivolabs/devflow/issues](https://github.com/atrivolabs/devflow/issues)**. If it's a music/playback problem, the [troubleshooting section](docs/dependencies.md#troubleshooting) often has the fix.

## Links

- Website: **[devflow.fm](https://devflow.fm)**
- Issues & feedback: [github.com/atrivolabs/devflow/issues](https://github.com/atrivolabs/devflow/issues)
- Dependencies & troubleshooting: [docs/dependencies.md](docs/dependencies.md)

## License

[MIT](LICENSE) © Atrivo Labs
