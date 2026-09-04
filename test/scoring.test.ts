import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { goalBonus, multiplierTenths, scoreDay } from '../src/core/scoring.ts';
import { RUNGS, type Rung } from '../src/types.ts';

describe('scoring', () => {
  it('reproduces the design anchor: 6 verses at rung 5 on a 14-day streak = 78', () => {
    const s = scoreDay({ verses: 6, rung: 5, streakDays: 14 });
    assert.equal(s.base, 30);
    assert.equal(s.goalBonus, 35);
    assert.equal(s.multiplierTenths, 12);
    assert.equal(s.total, 78);
    // The float path gives 78.00000000000001; integers must give exactly 78.
    assert.ok(Number.isInteger(s.total));
  });

  it('applies no multiplier below a 7-day streak', () => {
    assert.equal(scoreDay({ verses: 6, rung: 5, streakDays: 6 }).total, 65);
  });

  it('steps the multiplier at exactly 7, 30 and 100 days', () => {
    assert.equal(multiplierTenths(6), 10);
    assert.equal(multiplierTenths(7), 12);
    assert.equal(multiplierTenths(29), 12);
    assert.equal(multiplierTenths(30), 15);
    assert.equal(multiplierTenths(99), 15);
    assert.equal(multiplierTenths(100), 20);
  });

  it('halves points past twice the goal', () => {
    assert.equal(scoreDay({ verses: 10, rung: 5, streakDays: 0 }).total, 85);
    assert.equal(scoreDay({ verses: 11, rung: 5, streakDays: 0 }).total, 88);
    assert.equal(scoreDay({ verses: 12, rung: 5, streakDays: 0 }).total, 90);
    const s = scoreDay({ verses: 12, rung: 5, streakDays: 0 });
    assert.equal(s.fullVerses, 10);
    assert.equal(s.halfVerses, 2);
  });

  it('pays no bonus when the goal is missed', () => {
    const s = scoreDay({ verses: 4, rung: 5, streakDays: 0 });
    assert.equal(s.goalMet, false);
    assert.equal(s.goalBonus, 0);
    assert.equal(s.total, 20);
  });

  it('matches the goal-bonus table for every rung', () => {
    assert.deepEqual(
      Object.fromEntries(RUNGS.map((r) => [r, goalBonus(r)])),
      { 1: 21, 3: 28, 5: 35, 10: 49, 20: 63, 30: 70 },
    );
  });

  it('matches the full-goal day table for every rung', () => {
    const got = Object.fromEntries(
      RUNGS.map((r) => [r, scoreDay({ verses: r, rung: r, streakDays: 0 }).total]),
    );
    assert.deepEqual(got, { 1: 24, 3: 40, 5: 60, 10: 119, 20: 243, 30: 370 });
  });

  it('never decreases as verses increase', () => {
    for (const rung of RUNGS) {
      let prev = -1;
      for (let v = 0; v <= rung * 4; v++) {
        const t = scoreDay({ verses: v, rung, streakDays: 14 }).total;
        assert.ok(t >= prev, `rung ${rung} dropped at ${v} verses`);
        prev = t;
      }
    }
  });

  it('does NOT always pay more at a higher rung — the bonus dominates small days', () => {
    // Deliberate: 1 verse pays 24 at rung 1 (bonus fires) but only 10 at rung 30.
    // Nobody should "fix" this; picking an honest rung is the whole point.
    assert.equal(scoreDay({ verses: 1, rung: 1, streakDays: 0 }).total, 24);
    assert.equal(scoreDay({ verses: 1, rung: 30 as Rung, streakDays: 0 }).total, 10);
  });

  it('scores an empty day as zero', () => {
    assert.equal(scoreDay({ verses: 0, rung: 5, streakDays: 3 }).total, 0);
  });
});
