import { EventEmitter } from "node:events";

export type Phase = "work" | "break" | "long-break" | "countdown";

export interface TimerState {
  phase: Phase;
  remaining: number;
  total: number;
  pomodoroCount: number;
  paused: boolean;
}

export interface TimerConfig {
  mode: "pomodoro" | "countdown" | "free";
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  countdownMinutes?: number;
  /** Stop after this many work blocks (pomodoro mode). Undefined = run forever. */
  rounds?: number;
  /** A long break replaces the short break every N work blocks. Defaults to 4. */
  longBreakEvery?: number;
  /** Emit a `warning` event this many seconds before a phase ends (for phases
   *  at least twice this long). 0 or undefined disables it. */
  warnLeadSeconds?: number;
  /** Seconds per duration unit. Defaults to 60 (durations are minutes); demo
   *  mode sets it to 1 so the same numbers mean seconds. */
  unitSeconds?: number;
}

export class Timer extends EventEmitter {
  private state: TimerState;
  private interval: ReturnType<typeof setInterval> | null = null;
  private config: TimerConfig;

  constructor(config: TimerConfig) {
    super();
    this.config = config;

    const seconds = this.phaseSeconds(
      config.mode === "pomodoro" ? "work" : "countdown"
    );

    this.state = {
      phase: config.mode === "pomodoro" ? "work" : "countdown",
      remaining: seconds,
      total: seconds,
      pomodoroCount: 0,
      paused: false,
    };
  }

  start() {
    this.interval = setInterval(() => {
      if (this.state.paused) return;
      if (this.state.remaining > 0) {
        this.state.remaining--;
        this.emit("tick", this.snapshot());
        const lead = this.config.warnLeadSeconds ?? 0;
        if (lead > 0 && this.state.remaining === lead && this.state.total >= 2 * lead) {
          this.emit("warning", this.snapshot());
        }
      } else {
        this.advance();
      }
    }, 1000);
    this.emit("tick", this.snapshot());
  }

  togglePause() {
    this.state.paused = !this.state.paused;
    this.emit(this.state.paused ? "pause" : "resume", this.snapshot());
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  snapshot(): TimerState {
    return { ...this.state };
  }

  private advance() {
    if (this.config.mode !== "pomodoro") {
      this.emit("complete", this.snapshot());
      this.stop();
      return;
    }

    if (this.state.phase === "work") {
      this.state.pomodoroCount++;
      // Stop once the requested number of work blocks is done — no trailing break.
      if (this.config.rounds && this.state.pomodoroCount >= this.config.rounds) {
        this.emit("complete", this.snapshot());
        this.stop();
        return;
      }
      const every =
        this.config.longBreakEvery && this.config.longBreakEvery > 0
          ? this.config.longBreakEvery
          : 4;
      const next: Phase =
        this.state.pomodoroCount % every === 0 ? "long-break" : "break";
      this.setPhase(next);
    } else {
      this.setPhase("work");
    }
    this.emit("phase", this.snapshot());
    // Draw the new phase's bar right away so there's no blank gap.
    this.emit("tick", this.snapshot());
  }

  private setPhase(phase: Phase) {
    const seconds = this.phaseSeconds(phase);
    this.state.phase = phase;
    this.state.total = seconds;
    this.state.remaining = seconds;
  }

  private phaseSeconds(phase: Phase): number {
    const unit = this.config.unitSeconds ?? 60;
    switch (phase) {
      case "work":
        return this.config.workMinutes * unit;
      case "break":
        return this.config.breakMinutes * unit;
      case "long-break":
        return this.config.longBreakMinutes * unit;
      case "countdown":
        return (this.config.countdownMinutes ?? 25) * unit;
    }
  }
}

export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
