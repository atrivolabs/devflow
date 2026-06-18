# Homebrew packaging

`devflow.rb` is the Homebrew formula for devflow. It's kept here as the source
of truth; the **live** copy is served from a tap repo so users can install with:

```sh
brew install atrivolabs/tap/devflow
```

This is the recommended install path because the formula declares
`depends_on "mpv"` and `depends_on "yt-dlp"` — so Homebrew installs both system
binaries automatically and music works out of the box (no first-run
auto-download needed).

## Status / prerequisites

The formula installs from the **published npm tarball**, so it can't go live
until devflow is published to npm (see [#6]). The `url` / `sha256` in the
formula are placeholders until then. Publishing under the scoped name
`@atrivolabs/devflow` is the plan in #6; the installed binary stays `devflow`.

[#6]: https://github.com/atrivolabs/devflow/issues/6

## One-time: create the tap

A Homebrew tap is just a GitHub repo named `homebrew-<tap>`:

1. Create `atrivolabs/homebrew-tap` (public).
2. Add the formula at `Formula/devflow.rb` (copy this file).
3. Done — `brew install atrivolabs/tap/devflow` resolves `atrivolabs/homebrew-tap`
   → `Formula/devflow.rb`.

## Releasing (per version)

After publishing a new version to npm:

1. Grab the tarball URL and checksum for the new version:

   ```sh
   VERSION=0.1.1
   npm view @atrivolabs/devflow@$VERSION dist.tarball   # -> url
   npm view @atrivolabs/devflow@$VERSION dist.shasum    # SHA-1 (npm)
   # Homebrew needs SHA-256 — compute it from the tarball:
   curl -sL "$(npm view @atrivolabs/devflow@$VERSION dist.tarball)" | shasum -a 256
   ```

2. Update `url` and `sha256` in `devflow.rb` here, and copy the file into the
   tap repo's `Formula/devflow.rb`.
3. Commit + push the tap. `brew update && brew upgrade devflow` picks it up.

> Tip: this can be automated later with a release workflow that bumps the tap on
> a pushed `v*` tag, the same way npm publish is automated in #6.

## Verifying locally

```sh
brew install --build-from-source ./devflow.rb   # from this dir, once url/sha256 are real
brew test devflow
brew audit --strict --formula ./devflow.rb
```
