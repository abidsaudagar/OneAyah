/**
 * The reverse timer and the time-read accounting.
 *
 * Both run on ActiveClocks gated by the same "visible AND not idle" boolean, so
 * a session cannot run down in a background tab: hidden means paused, paused
 * means the remaining time is frozen, and frozen time cannot reach zero.
 *
 * Reaching 0:00 does not interrupt the reader. The caller rolls straight into
 * another session; points are banked per verse as they are read, never at the
 * end of a session, so nothing depends on the boundary.
 */
import { ActiveClock, createActivityMonitor, createTicker, type ActivityMonitor, type Ticker } from '../platform/clock.ts';
import type { SessionLen } from '../types.ts';

/** How often accrued read-time is written to the store. Worst-case loss on a crash. */
const FLUSH_MS = 5_000;

export interface SessionDeps {
  lengthSec: () => SessionLen;
  onFlushSeconds: (seconds: number) => void;
  onComplete: (readSeconds: number) => void;
  onFrame: () => void;
}

export class Session {
  readonly activity: ActivityMonitor;
  readonly ticker: Ticker;

  /** Never reset; feeds TIME READ. */
  private readonly readClock = new ActiveClock();
  /** Reset at the start of every session. */
  private readonly sessionClock = new ActiveClock();

  private readonly deps: SessionDeps;
  private lengthMs: number;
  private completed = false;
  private flushedMs = 0;
  private running = false;

  constructor(deps: SessionDeps) {
    this.deps = deps;
    this.lengthMs = deps.lengthSec() * 1000;
    this.activity = createActivityMonitor();
    this.ticker = createTicker();

    this.activity.onChange((active) => {
      if (active && this.running) { this.readClock.start(); this.sessionClock.start(); }
      else { this.readClock.pause(); this.sessionClock.pause(); this.flush(); }
    });

    this.ticker.add(() => this.frame());
  }

  /** Active read time since the page loaded, in ms. */
  activeMs(): number { return this.readClock.elapsedMs(); }

  remainingMs(): number { return Math.max(0, this.lengthMs - this.sessionClock.elapsedMs()); }

  elapsedMs(): number { return this.sessionClock.elapsedMs(); }

  get isRunning(): boolean { return this.running; }

  /** Starts on the reader's first real interaction, not on page load. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.completed = false;
    if (this.activity.active) { this.readClock.start(); this.sessionClock.start(); }
  }

  restart(): void {
    this.lengthMs = this.deps.lengthSec() * 1000;
    this.sessionClock.reset();
    this.completed = false;
    this.running = false;
    this.start();
  }

  /** Applies a session-length change; a running session keeps its own length. */
  setLength(): void {
    if (!this.running) this.lengthMs = this.deps.lengthSec() * 1000;
  }

  stop(): void {
    this.running = false;
    this.readClock.pause();
    this.sessionClock.pause();
    this.flush();
  }

  dispose(): void {
    this.flush();
    this.ticker.dispose();
    this.activity.dispose();
  }

  private flush(): void {
    const elapsed = this.readClock.elapsedMs();
    const whole = Math.floor((elapsed - this.flushedMs) / 1000);
    if (whole <= 0) return;
    this.flushedMs += whole * 1000;
    this.deps.onFlushSeconds(whole);
  }

  private frame(): void {
    this.deps.onFrame();
    if (this.readClock.elapsedMs() - this.flushedMs >= FLUSH_MS) this.flush();

    if (this.running && !this.completed && this.remainingMs() <= 0) {
      this.completed = true;
      this.running = false;
      this.sessionClock.pause();
      this.flush();
      this.deps.onComplete(Math.round(this.readClock.elapsedMs() / 1000));
    }
  }
}
