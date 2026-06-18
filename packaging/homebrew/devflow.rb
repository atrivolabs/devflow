# Homebrew formula for devflow.
#
# This file is the source of truth; the live copy lives in the tap repo
# (atrivolabs/homebrew-tap) at Formula/devflow.rb so users can:
#
#     brew install atrivolabs/tap/devflow
#
# See ./README.md for the tap setup + per-release sync steps. The `url` and
# `sha256` below are refreshed on every release from the published npm tarball.
class Devflow < Formula
  desc "Focus companion for developers — music, pomodoro, and session flow"
  homepage "https://devflow.fm"
  # Published npm tarball for the scoped package (binary stays `devflow`).
  # Update both lines on every release (see README.md "Releasing").
  url "https://registry.npmjs.org/@atrivolabs/devflow/-/devflow-0.1.0.tgz"
  sha256 "2a2a7abe7a840237e1a0c119d690c74cede9f7b4d68e66bf9b56e67880250b29"
  license "MIT"

  # mpv + yt-dlp are the two system binaries devflow needs at runtime. Declaring
  # them here is the whole point of the brew path: `brew install devflow` pulls
  # them in automatically, so music "just works" with no auto-download step.
  # (deps kept alphabetical to satisfy `brew audit --strict`.)
  depends_on "mpv"
  depends_on "node"
  depends_on "yt-dlp"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/devflow --version")
  end
end
