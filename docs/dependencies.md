# Dependencies & Setup

devflow plays focus music by streaming YouTube audio. It does this with two
external command-line programs that must be on your `PATH`:

| Tool | Role |
|------|------|
| [`mpv`](https://mpv.io) | The player. Decodes and plays the audio. Bundles its own FFmpeg, so you do **not** need a separate ffmpeg install. |
| [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) | Resolves a YouTube URL into a playable stream. mpv calls it automatically. |

devflow itself bundles neither — they're declared as runtime prerequisites
(the standard pattern for media CLIs, the same way tools depend on `git`).
Bundling them would add ~90 MB of OS/arch-specific binaries and break
portability. Keeping them as PATH dependencies is what makes devflow run
identically on macOS, Linux, and Windows.

## Install

### macOS
```sh
brew install mpv yt-dlp
```

### Linux
```sh
sudo apt install mpv yt-dlp     # Debian/Ubuntu
sudo dnf install mpv yt-dlp     # Fedora
sudo pacman -S mpv yt-dlp       # Arch
```

### Windows
```powershell
winget install mpv.mpv yt-dlp.yt-dlp
# or: scoop install mpv yt-dlp
```

If either is missing, `devflow start` prints the right command for your OS and
continues without music — it never hard-fails.

### Auto-fetching yt-dlp

`yt-dlp` ships as a single self-contained binary, so if it isn't on your `PATH`,
`devflow start` downloads the official release for your platform into
`~/.config/devflow/bin/` on first use (one-time, no `brew`/`sudo`) and points
mpv at it. The download is verified against the release's published
`SHA2-256SUMS` before it's installed, and it self-updates via `yt-dlp -U`. Set
`DEVFLOW_NO_DOWNLOAD=1` to opt out and keep the detect-and-instruct behavior.

`mpv` is **not** auto-fetched — it's a large native app with no clean
single-file build, so it stays a detect-and-instruct dependency (install it with
the commands above).

## How playback works

```
devflow start  ─►  mpv --no-video <youtube-url>
                     │
                     ├─► yt-dlp        resolves the stream (solves YouTube's
                     │                 JS challenge; needs deno, see below)
                     │
                     └─► FFmpeg (bundled in mpv) decodes audio
                                       │
                                       └─► system audio output (CoreAudio / etc.)
```

`mpv` is invoked with `--no-video`, so it decodes only the audio track and
discards video — even when YouTube serves only muxed (audio+video) streams.

### deno

Current `yt-dlp` versions use [deno](https://deno.com) to solve YouTube's
JavaScript player challenges. On macOS via Homebrew it's pulled in
automatically as a `yt-dlp` dependency. If stream resolution fails with
challenge/format errors on a fresh machine, install deno
(`brew install deno` / see deno docs) and update yt-dlp.

## Troubleshooting

### "Requested format is not available" / "This live stream recording is not available"
YouTube changed its player and your `yt-dlp` is stale. Update it:
```sh
yt-dlp -U                 # standalone binary
brew upgrade yt-dlp       # Homebrew
pipx upgrade yt-dlp       # pipx
```
yt-dlp needs frequent updates — YouTube breaks old versions regularly.

### Homebrew at a non-standard prefix (the bottle gotcha)

Homebrew only ships precompiled **bottles** for the two default prefixes
(`/opt/homebrew` on Apple Silicon, `/usr/local` on Intel). If your Homebrew
lives anywhere else (a custom or external-volume prefix), `brew install` is
forced to **compile heavy C programs like ffmpeg and mpv from source** — a
large, fragile build that often fails.

`yt-dlp` is unaffected: it's pure Python and its bottle is relocatable, so it
installs and upgrades normally even at a custom prefix.

For `mpv` on a custom-prefix machine, skip Homebrew and use a **self-contained
binary** instead — no compilation, no brew:

**macOS (Apple Silicon)** — a prebuilt `mpv.app` bundles mpv *and* FFmpeg:
```sh
# 1. Download a self-contained mpv.app build (e.g. m154k1/mpv-build-macOS
#    GitHub Actions artifact, or https://mpv.io/installation/).
# 2. Move it to /Applications.
# 3. Put its binary on PATH (~/bin is on PATH ahead of Homebrew here):
ln -sf /Applications/mpv.app/Contents/MacOS/mpv ~/bin/mpv
mpv --version   # verify; the bundled FFmpeg version is listed
```
The binary uses `@executable_path`-relative library paths, so the symlink
resolves its bundled FFmpeg/libass correctly.

**yt-dlp** also has a self-contained binary that self-updates via `yt-dlp -U`:
<https://github.com/yt-dlp/yt-dlp/releases/latest>

> This same self-contained approach is how this repo's primary dev machine
> ("Snap") runs devflow — its Homebrew is on an external volume, so mpv comes
> from a dropped-in `mpv.app` while yt-dlp upgrades through the custom brew.

## Music source

### Channel list

The channel list has a single source of truth: the web app's
`https://www.devflow.fm/api/channels` endpoint. The CLI resolves channels at
startup via `src/lib/channel-source.ts`, in this order of preference:

1. **Fresh on-disk cache** (`~/.config/devflow/channels.json`, < 6h old) — instant, no network.
2. **Live fetch** from the endpoint (3s timeout) — refreshes the cache.
3. **Stale cache** — when the network is unavailable.
4. **Bundled list** in `src/lib/channels.ts` — last-resort fallback shipped with the release.

So a dead/changed stream is fixed in one place (today: the web repo's
`channels.ts`; later: a datastore behind the same endpoint) and reaches CLI
users within ~6h without a release. Override the endpoint for testing with
`DEVFLOW_CHANNELS_URL`. Keep the bundled fallback roughly current so first-run
offline installs still work.

### YouTube coupling

Channels point at public YouTube video/stream IDs, so playback depends on
yt-dlp keeping pace with YouTube's changes, and on those streams staying live.
Moving to a self-owned source is tracked as future work — see the repo issues.
