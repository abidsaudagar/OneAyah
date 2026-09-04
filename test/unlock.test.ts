import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/core/day.ts';
import { recomputeUnlockedMax, selectableRungs, unlockProgress } from '../src/core/unlock.ts';
import type { DayMap } from '../src/core/streak.ts';
import type { DayRecord, Rung } from '../src/types.ts';

function run(end: string, n: number, v: number, g: Rung): DayMap {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < n; i++) days[addDays(end, -i)] = { v, s: 60, g, p: 0 };
  return days;
}

describe('rung unlocks', () => {
  it('offers 1/3/5/10 for free', () => {
    assert.deepEqual(selectableRungs(10), [1, 3, 5, 10]);
  });

  it('unlocks 20 after exactly 7 consecutive goal-met days at rung 10', () => {
    assert.equal(recomputeUnlockedMax(run('2026-09-04', 7, 10, 10), '2026-09-04', 10), 20);
  });

  it('does not unlock on 6 days', () => {
    assert.equal(recomputeUnlockedMax(run('2026-09-04', 6, 10, 10), '2026-09-04', 10), 10);
  });

  it('does not unlock when one of the seven missed its goal', () => {
    const days = { ...run('2026-09-04', 7, 10, 10) } as Record<string, DayRecord>;
    days['2026-09-01'] = { v: 9, s: 60, g: 10, p: 0 };
    assert.equal(recomputeUnlockedMax(days, '2026-09-04', 10), 10);
  });

  it('does not unlock on 7 non-consecutive days', () => {
    const days = { ...run('2026-09-04', 8, 10, 10) } as Record<string, DayRecord>;
    delete days['2026-08-31'];
    assert.equal(recomputeUnlockedMax(days, '2026-09-04', 10), 10);
  });

  it('is sticky — a missed day never takes a rung back', () => {
    // Earned at rung 20, then three empty days.
    assert.equal(recomputeUnlockedMax({}, '2026-09-04', 20), 20);
  });

  it('will not grant 30 before 20 is held, even with the days for it', () => {
    assert.equal(recomputeUnlockedMax(run('2026-09-04', 7, 20, 20), '2026-09-04', 10), 20);
  });

  it('grants 30 once 20 is held and seven days at 20 are met', () => {
    assert.equal(recomputeUnlockedMax(run('2026-09-04', 7, 20, 20), '2026-09-04', 20), 30);
  });

  it('reports 5/7 with a seven-box strip, exactly as screen 1d draws it', () => {
    const days = run('2026-09-04', 5, 10, 10);
    const p = unlockProgress(days, '2026-09-04', 10);
    assert.equal(p.target, 20);
    assert.equal(p.requires, 10);
    assert.equal(p.progress, 5);
    assert.equal(p.needed, 7);
    assert.equal(p.recentDays.length, 7);
    assert.deepEqual(p.recentDays.map((d) => d.met), [false, false, true, true, true, true, true]);
  });

  it('reports nothing left to unlock at rung 30', () => {
    assert.equal(unlockProgress({}, '2026-09-04', 30).target, null);
  });
});
