import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/core/day.ts';
import {
  currentStreak, daysRead, goalMetRun, longestStreak, longestStreakSpan, type DayMap,
} from '../src/core/streak.ts';
import type { DayRecord, Rung } from '../src/types.ts';

const rec = (v: number, g: Rung = 5): DayRecord => ({ v, s: 60, g, p: 0 });

/** A run of `n` days ending at `end`, each with `v` verses at rung `g`. */
function run(end: string, n: number, v = 6, g: Rung = 5): DayMap {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < n; i++) days[addDays(end, -i)] = rec(v, g);
  return days;
}

describe('streak', () => {
  it('counts an unbroken run ending today', () => {
    assert.equal(currentStreak(run('2026-09-04', 14), '2026-09-04'), 14);
  });

  it('holds the streak at 4am before anything is read today', () => {
    // The commonest real case: the day rolled over, the reader has not read yet.
    // The header must still say 14, not 0.
    const days = run('2026-09-03', 14);
    assert.equal(currentStreak(days, '2026-09-04'), 14);
  });

  it('breaks when both today and yesterday are empty', () => {
    assert.equal(currentStreak(run('2026-09-02', 14), '2026-09-04'), 0);
  });

  it('restarts after a gap but remembers the longest run', () => {
    const days = { ...run('2026-08-01', 20), ...run('2026-09-04', 3) };
    assert.equal(currentStreak(days, '2026-09-04'), 3);
    assert.equal(longestStreak(days), 20);
  });

  it('spans a year boundary and a leap day', () => {
    assert.equal(currentStreak(run('2028-03-02', 90), '2028-03-02'), 90);
    assert.equal(currentStreak(run('2027-01-05', 40), '2027-01-05'), 40);
  });

  it('reports the span of the longest run', () => {
    const days = { ...run('2026-08-01', 20), ...run('2026-09-04', 3) };
    assert.deepEqual(longestStreakSpan(days), ['2026-07-13', '2026-08-01']);
  });

  it('counts only days actually read', () => {
    assert.equal(daysRead({ ...run('2026-08-01', 20), ...run('2026-09-04', 3) }), 23);
  });

  it('handles an empty history', () => {
    assert.equal(currentStreak({}, '2026-09-04'), 0);
    assert.equal(longestStreak({}), 0);
    assert.equal(longestStreakSpan({}), null);
  });

  describe('goalMetRun', () => {
    it('counts consecutive goal-met days at or above a rung', () => {
      assert.equal(goalMetRun(run('2026-09-04', 7, 10, 10), '2026-09-04', 10), 7);
    });

    it('stops at a day where the goal was missed', () => {
      const days = { ...run('2026-09-04', 7, 10, 10) };
      days['2026-09-01'] = rec(9, 10); // read, streak intact, but goal missed
      assert.equal(goalMetRun(days, '2026-09-04', 10), 3);
    });

    it('counts a day at a higher rung toward a lower requirement', () => {
      const days = { ...run('2026-09-04', 7, 20, 20) };
      assert.equal(goalMetRun(days, '2026-09-04', 10), 7);
    });

    it('does not count a day at a lower rung', () => {
      const days = { ...run('2026-09-04', 7, 10, 10) };
      days['2026-09-02'] = rec(5, 5);
      assert.equal(goalMetRun(days, '2026-09-04', 10), 2);
    });
  });
});
