import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/core/day.ts';
import { goalMetDays, report, reportText, shouldAsk } from '../src/core/feedback.ts';
import { initialState, reduce, select, type Action } from '../src/core/state.ts';
import type { OffsetFn } from '../src/core/day.ts';
import type { DayMap } from '../src/core/streak.ts';
import type { DayRecord, PersistedState, Rung } from '../src/types.ts';

const utc: OffsetFn = () => 0;
const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);

/** `n` consecutive days ending at `end`, each reading `v` verses at rung `g`. */
function run(end: string, n: number, v: number, g: Rung): DayMap {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < n; i++) days[addDays(end, -i)] = { v, s: 60, g, p: 0 };
  return days;
}

const ctx = { build: 'abc1234', agent: 'Firefox/141.0', viewport: '1440x900' };

describe('the feedback ask', () => {
  it('counts only the days the goal was actually met', () => {
    assert.equal(goalMetDays(run('2026-09-04', 4, 5, 5)), 4);
    assert.equal(goalMetDays(run('2026-09-04', 4, 4, 5)), 0);
  });

  it('counts a day that overshot its goal, once', () => {
    assert.equal(goalMetDays(run('2026-09-04', 2, 40, 5)), 2);
  });

  // A day record can exist with v = 0: time accrues from the moment the app is
  // opened. An empty day is not a goal met, whatever its rung.
  it('does not count a day that banked no verse', () => {
    assert.equal(goalMetDays(run('2026-09-04', 3, 0, 1)), 0);
  });

  it('holds off until the third goal-met day', () => {
    assert.equal(shouldAsk(run('2026-09-04', 2, 5, 5), false), false);
    assert.equal(shouldAsk(run('2026-09-04', 3, 5, 5), false), true);
  });

  it('counts goal-met days that are not consecutive', () => {
    const days = { ...run('2026-09-04', 5, 5, 5) } as Record<string, DayRecord>;
    delete days['2026-09-02'];
    delete days['2026-09-03'];
    assert.equal(shouldAsk(days, false), true);
  });

  it('never asks again once it has been answered or waved off', () => {
    assert.equal(shouldAsk(run('2026-09-04', 30, 10, 5), true), false);
  });

  it('does not ask a reader who has only just arrived', () => {
    assert.equal(shouldAsk({}, false), false);
  });
});

describe('the report a reader can hand over', () => {
  const state = (): PersistedState => {
    let s = initialState(at(2026, 9, 4), utc);
    const credit = (id: number): Action => ({ t: 'creditVerse', id, nowMs: at(2026, 9, 4) });
    for (let i = 0; i < 6; i++) s = reduce(s, credit(i), utc);
    return s;
  };

  it('names the build it came from', () => {
    const s = state();
    const rows = report(s, select(s, at(2026, 9, 4), utc), ctx);
    assert.deepEqual(rows[0], ['build', 'abc1234']);
  });

  it('reports the reading it can see, and nothing that identifies anyone', () => {
    const s = state();
    const text = reportText(report(s, select(s, at(2026, 9, 4), utc), ctx));
    assert.match(text, /verses\s+6 total, 6 today/);
    assert.match(text, /goal\s+5 verses, unlocked to 10/);
    assert.match(text, /streak\s+1 now, 1 longest/);
    // The coverage bitset, the day map and the credited ids are the reader's
    // own business; a report is a summary, never a copy of their state.
    assert.doesNotMatch(text, /coverage|credited|"days"/);
  });

  it('lines the labels up into one column', () => {
    const lines = reportText([['a', '1'], ['bbb', '2']]).split('\n');
    assert.deepEqual(lines, ['a    1', 'bbb  2']);
  });
});
