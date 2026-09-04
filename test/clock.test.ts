import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ActiveClock, createTicker } from '../src/platform/clock.ts';

/** A hand-cranked stand-in for requestAnimationFrame. */
function fakeScheduler() {
  let next = 1;
  const queued = new Map<number, (t: number) => void>();
  let t = 0;
  return {
    schedule: (cb: (t: number) => void) => { const id = next++; queued.set(id, cb); return id; },
    unschedule: (id: number) => { queued.delete(id); },
    /** Runs whatever is queued right now, once. */
    frame() {
      t += 16;
      const due = [...queued.entries()];
      queued.clear();
      for (const [, cb] of due) cb(t);
    },
    get pending() { return queued.size; },
  };
}

describe('ticker', () => {
  it('keeps running after a subscriber throws', () => {
    // The regression this exists for: the loop used to re-arm AFTER running
    // subscribers, so the first throw stopped every clock in the app for good.
    const s = fakeScheduler();
    const ticker = createTicker(s.schedule, s.unschedule);

    let good = 0;
    ticker.add(() => { throw new Error('boom'); });
    ticker.add(() => { good++; });

    for (let i = 0; i < 5; i++) s.frame();

    assert.equal(good, 5, 'the healthy subscriber must still be ticking');
    assert.ok(s.pending > 0, 'the loop must still be scheduled');
    ticker.dispose();
  });

  it('runs every subscriber on every frame', () => {
    const s = fakeScheduler();
    const ticker = createTicker(s.schedule, s.unschedule);
    let a = 0;
    let b = 0;
    ticker.add(() => { a++; });
    ticker.add(() => { b++; });
    s.frame();
    s.frame();
    assert.deepEqual([a, b], [2, 2]);
    ticker.dispose();
  });

  it('stops scheduling once disposed', () => {
    const s = fakeScheduler();
    const ticker = createTicker(s.schedule, s.unschedule);
    let n = 0;
    ticker.add(() => { n++; });
    s.frame();
    ticker.dispose();
    s.frame();
    assert.equal(n, 1);
    assert.equal(s.pending, 0);
  });

  it('lets a subscriber unsubscribe itself', () => {
    const s = fakeScheduler();
    const ticker = createTicker(s.schedule, s.unschedule);
    let n = 0;
    const off = ticker.add(() => { n++; });
    s.frame();
    off();
    s.frame();
    assert.equal(n, 1);
    ticker.dispose();
  });
});

describe('ActiveClock', () => {
  it('only advances while running', () => {
    let now = 0;
    const c = new ActiveClock(() => now);
    assert.equal(c.elapsedMs(), 0);

    c.start();
    now = 1000;
    assert.equal(c.elapsedMs(), 1000);

    c.pause();
    now = 5000;
    assert.equal(c.elapsedMs(), 1000, 'paused time must not accrue');

    c.start();
    now = 6000;
    assert.equal(c.elapsedMs(), 2000, 'resuming continues from where it stopped');
  });

  it('derives elapsed rather than accumulating, so dropped frames cost nothing', () => {
    let now = 0;
    const c = new ActiveClock(() => now);
    c.start();
    // No ticks at all for a minute; the value is still exact.
    now = 60_000;
    assert.equal(c.elapsedMs(), 60_000);
  });

  it('ignores a redundant start', () => {
    let now = 0;
    const c = new ActiveClock(() => now);
    c.start();
    now = 500;
    c.start();
    now = 1000;
    assert.equal(c.elapsedMs(), 1000);
  });

  it('resets to zero', () => {
    let now = 0;
    const c = new ActiveClock(() => now);
    c.start();
    now = 3000;
    c.reset();
    assert.equal(c.elapsedMs(), 0);
    assert.equal(c.running, false);
  });
});
