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
      const next: Phase =
        this.state.pomodoroCount % 4 === 0 ? "long-break" : "break";
      this.setPhase(next);
    } else {
      this.setPhase("work");
    }
    this.emit("phase", this.snapshot());
  }

  private setPhase(phase: Phase) {
    const seconds = this.phaseSeconds(phase);
    this.state.phase = phase;
    this.state.total = seconds;
    this.state.remaining = seconds;
  }

  private phaseSeconds(phase: Phase): number {
    switch (phase) {
      case "work":
        return this.config.workMinutes * 60;
      case "break":
        return this.config.breakMinutes * 60;
      case "long-break":
        return this.config.longBreakMinutes * 60;
      case "countdown":
        return (this.config.countdownMinutes ?? 25) * 60;
    }
  }
}

export function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
