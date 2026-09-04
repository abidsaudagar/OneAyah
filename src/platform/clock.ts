/**
 * Time. Two bases, never mixed:
 *   performance.now() -- every duration. Monotonic, so a system clock change
 *                        or an NTP step cannot corrupt a session.
 *   Date.now()        -- day identity only.
 *
 * And exactly three timers in the whole app: one rAF loop, one re-armed idle
 * timeout, one re-armed rollover timeout.
 */
import { IDLE_TIMEOUT_MS } from '../types.ts';

export type Now = () => number;
const perf: Now = () => performance.now();

/**
 * A clock that only advances while it is running.
 *
 * Elapsed time is DERIVED (`accumulated + now - startedAt`), never incremented
 * by a tick, so a dropped or throttled frame changes when we repaint but never
 * what the value is. Drift is structurally impossible.
 */
export class ActiveClock {
  private readonly now: Now;
  private accumulated = 0;
  private startedAt: number | null = null;

  constructor(now: Now = perf) {
    this.now = now;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = this.now();
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.accumulated += this.now() - this.startedAt;
    this.startedAt = null;
  }

  reset(): void {
    this.accumulated = 0;
    this.startedAt = null;
  }

  elapsedMs(): number {
    return this.accumulated + (this.startedAt === null ? 0 : this.now() - this.startedAt);
  }
}

export type ActivityReason = 'hidden' | 'visible' | 'idle' | 'input';

export interface ActivityMonitor {
  readonly active: boolean;
  poke(): void;
  onChange(fn: (active: boolean, why: ActivityReason) => void): () => void;
  dispose(): void;
}

/**
 * Active means visible AND not idle. Deliberately does NOT listen to mousemove:
 * the rule is "any key or click", and a cursor resting on a trackpad would
 * otherwise defeat idle detection entirely.
 */
export function createActivityMonitor(idleMs = IDLE_TIMEOUT_MS): ActivityMonitor {
  let idle = false;
  let visible = !document.hidden;
  let timer: number | undefined;
  const listeners = new Set<(active: boolean, why: ActivityReason) => void>();
  let last = visible;

  const state = () => visible && !idle;

  const announce = (why: ActivityReason) => {
    const nowActive = state();
    if (nowActive === last) return;
    last = nowActive;
    for (const fn of listeners) fn(nowActive, why);
  };

  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { idle = true; announce('idle'); }, idleMs) as unknown as number;
  };

  const poke = () => {
    const wasIdle = idle;
    idle = false;
    arm();
    if (wasIdle) announce('input');
  };

  const onVisibility = () => {
    visible = !document.hidden;
    if (visible) { idle = false; arm(); } else clearTimeout(timer);
    announce(visible ? 'visible' : 'hidden');
  };

  const opts = { passive: true } as const;
  for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const) {
    window.addEventListener(ev, poke, opts);
  }
  document.addEventListener('visibilitychange', onVisibility);
  arm();

  return {
    get active() { return state(); },
    poke,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() {
      clearTimeout(timer);
      for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const) {
        window.removeEventListener(ev, poke);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      listeners.clear();
    },
  };
}

export interface Ticker {
  add(fn: (nowMs: number) => void): () => void;
  dispose(): void;
}

/** Injectable so the loop can be unit-tested without a browser. */
export type Schedule = (cb: (t: number) => void) => number;
export type Unschedule = (handle: number) => void;

/**
 * The one requestAnimationFrame loop. Every clock in the app rides it.
 *
 * Two rules earn their keep here, both learned the hard way:
 *
 * 1. RE-ARM BEFORE running subscribers. The previous version scheduled the
 *    next frame *after* the loop body, so the first subscriber to throw
 *    stopped the loop permanently -- and with it every timer in the app.
 * 2. ISOLATE each subscriber. One broken readout must not silently take down
 *    the countdown and the time-read accounting with it.
 */
export function createTicker(
  schedule: Schedule = (cb) => requestAnimationFrame(cb),
  unschedule: Unschedule = (h) => cancelAnimationFrame(h),
): Ticker {
  const subs = new Set<(nowMs: number) => void>();
  let handle = 0;
  let alive = true;

  const loop = (t: number) => {
    if (alive) handle = schedule(loop);
    for (const fn of subs) {
      try {
        fn(t);
      } catch (err) {
        console.error('[one-ayah] ticker subscriber threw; the clock keeps running', err);
      }
    }
  };
  handle = schedule(loop);

  return {
    add(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispose() { alive = false; unschedule(handle); subs.clear(); },
  };
}
