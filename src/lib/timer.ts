import { EventEmitter } from "node:events";

export type TimerPhase = "work" | "break" | "long-break" | "countdown";

export interface TimerState {
  phase: TimerPhase;
  remaining: number; // seconds
  total: number; // seconds
  pomodoroCount: number;
  paused: boolean;
  running: boolean;
}

export interface TimerOptions {
  pomodoro: boolean;
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  timerMinutes?: number;
}

export class Timer extends EventEmitter {
  private state: TimerState;
  private interval: ReturnType<typeof setInterval> | null = null;
  private options: TimerOptions;

  constructor(options: TimerOptions) {
    super();
    this.options = options;

    const initialSeconds = options.pomodoro
      ? options.workMinutes * 60
      : options.timerMinutes
        ? options.timerMinutes * 60
        : 0;

    this.state = {
      phase: options.pomodoro ? "work" : "countdown",
      remaining: initialSeconds,
      total: initialSeconds,
      pomodoroCount: 0,
      paused: false,
      running: false,
    };
  }

  start() {
    if (this.state.running) return;
    this.state.running = true;
    this.state.paused = false;

    this.interval = setInterval(() => {
      if (this.state.paused) return;

      if (this.state.remaining > 0) {
        this.state.remaining--;
        this.emit("tick", this.getState());
      } else {
        this.onPhaseComplete();
      }
    }, 1000);

    this.emit("start", this.getState());
  }

  pause() {
    this.state.paused = !this.state.paused;
    this.emit(this.state.paused ? "pause" : "resume", this.getState());
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.state.running = false;
    this.emit("stop", this.getState());
  }

  getState(): TimerState {
    return { ...this.state };
  }

  private onPhaseComplete() {
    if (!this.options.pomodoro) {
      this.emit("complete", this.getState());
      this.stop();
      return;
    }

    if (this.state.phase === "work") {
      this.state.pomodoroCount++;
      const isLongBreak = this.state.pomodoroCount % 4 === 0;
      this.state.phase = isLongBreak ? "long-break" : "break";
      this.state.total = isLongBreak
        ? this.options.longBreakMinutes * 60
        : this.options.breakMinutes * 60;
      this.state.remaining = this.state.total;
      this.emit("phase-change", this.getState());
    } else {
      this.state.phase = "work";
      this.state.total = this.options.workMinutes * 60;
      this.state.remaining = this.state.total;
      this.emit("phase-change", this.getState());
    }
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
