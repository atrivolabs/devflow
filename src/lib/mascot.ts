// The optional mascot that animates on the live countdown line (--mascot /
// config). This module is intentionally self-contained and data-driven so the
// character and its size are easy to change without touching layout code.
//
// To tweak the mascot:
//   • Edit a sprite's `frames` below (the animation cycle, one frame per 1s
//     tick while focusing) and `still` (the resting pose during break/pause).
//   • Add a new sprite to SPRITES, then point DEFAULT at it.
//   • Or, without rebuilding, run with DEVFLOW_MASCOT=<name>, e.g.
//       DEVFLOW_MASCOT=flask devflow start -p --mascot
//
// Constraints: a sprite is ONE line (the countdown is a single row), and every
// frame should be the same visible width. `width` is that visible column count
// — set it explicitly for emoji/wide glyphs whose display width differs from
// their string length; it's reserved in the live-line layout so the countdown
// never wraps.

export interface Sprite {
  /** Animation frames, cycled one per tick while focusing. */
  frames: string[];
  /** Pose shown while resting (break / long-break / paused). */
  still: string;
  /** Visible width in terminal columns. Defaults to `still`'s string length. */
  width?: number;
}

// --- Sprite library — add your own and switch DEFAULT / DEVFLOW_MASCOT --------

const runner: Sprite = {
  // Side-view figure whose arm pumps each tick. ASCII, renders anywhere.
  frames: ["o/", "o-", "o\\", "o-"],
  still: "o-",
};

const jogger: Sprite = {
  // Scissoring legs (λ open / ʌ together) — reads as a little jog. 1 column.
  frames: ["λ", "ʌ"],
  still: "ʌ",
  width: 1,
};

const flask: Sprite = {
  // A wobbling flask (on brand for devflow). Emoji, so width is fixed at 2.
  // Swap these for ASCII art with arms/legs once you've sketched something.
  frames: ["🧪", "⚗️"],
  still: "🧪",
  width: 2,
};

const pulse: Sprite = {
  // Minimal: a dim dot that breathes. Not a figure, but calm and clean.
  frames: ["·", "•", "●", "•"],
  still: "•",
  width: 1,
};

export const SPRITES = { runner, jogger, flask, pulse };

/** The mascot used unless overridden by the DEVFLOW_MASCOT env var. */
const DEFAULT: keyof typeof SPRITES = "runner";

/** The active sprite: DEVFLOW_MASCOT (if it names a known sprite) else DEFAULT. */
export const ACTIVE: Sprite = (() => {
  const name = process.env.DEVFLOW_MASCOT;
  if (name && name in SPRITES) return SPRITES[name as keyof typeof SPRITES];
  return SPRITES[DEFAULT];
})();

/** Visible width (columns) of a sprite, for the live-line layout budget. */
export function mascotWidth(sprite: Sprite = ACTIVE): number {
  return sprite.width ?? sprite.still.length;
}

/**
 * The glyph to show this tick. `step` advances one frame per tick — pass the
 * timer's `remaining` so it stays stateless. `resting` shows the still pose.
 */
export function mascotFrame(
  step: number,
  resting: boolean,
  sprite: Sprite = ACTIVE
): string {
  if (resting) return sprite.still;
  return sprite.frames[step % sprite.frames.length];
}
