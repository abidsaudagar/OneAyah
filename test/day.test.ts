import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, dayKeyOf, daysBetween, nextRolloverMs, weekdayOf, type OffsetFn } from '../src/core/day.ts';

/** Fixed +00:00, so these assertions say what they mean. */
const utc: OffsetFn = () => 0;
/** New York, with the 2026 DST transitions in the right places. */
const ny: OffsetFn = (ms) => {
  const springForward = Date.UTC(2026, 2, 8, 7);
  const fallBack = Date.UTC(2026, 10, 1, 6);
  return ms >= springForward && ms < fallBack ? -240 : -300;
};
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h, mi, s);

describe('day rollover', () => {
  it('credits 01:15 Tuesday to Monday', () => {
    assert.equal(dayKeyOf(at(2026, 9, 8, 1, 15), utc), '2026-09-07');
  });

  it('credits late Monday evening to Monday', () => {
    assert.equal(dayKeyOf(at(2026, 9, 7, 23, 40), utc), '2026-09-07');
  });

  it('flips at exactly 03:00, not before', () => {
    assert.equal(dayKeyOf(at(2026, 9, 8, 2, 59, 59), utc), '2026-09-07');
    assert.equal(dayKeyOf(at(2026, 9, 8, 3, 0, 0), utc), '2026-09-08');
    assert.equal(dayKeyOf(at(2026, 9, 8, 4, 0, 0), utc), '2026-09-08');
  });

  it('produces contiguous keys across spring-forward', () => {
    const keys = [];
    for (let h = 0; h < 72; h++) keys.push(dayKeyOf(at(2026, 3, 7, 12) + h * 3_600_000, ny));
    const uniq = [...new Set(keys)];
    for (let i = 1; i < uniq.length; i++) {
      assert.equal(daysBetween(uniq[i - 1]!, uniq[i]!), 1, `gap at ${uniq[i - 1]} -> ${uniq[i]}`);
    }
  });

  it('is monotone across fall-back, when 01:00 happens twice', () => {
    let prev = '';
    for (let h = 0; h < 72; h++) {
      const k = dayKeyOf(at(2026, 10, 31, 12) + h * 3_600_000, ny);
      assert.ok(k >= prev, `went backwards: ${prev} -> ${k}`);
      prev = k;
    }
  });

  it('adds days across month, year and leap boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2028-02-29', 1), '2028-03-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });

  it('daysBetween inverts addDays over a 400-day sweep', () => {
    for (let n = -200; n <= 200; n++) {
      assert.equal(daysBetween('2026-09-04', addDays('2026-09-04', n)), n);
    }
  });

  it('knows weekdays', () => {
    assert.equal(weekdayOf('2026-09-06'), 0); // Sunday
    assert.equal(weekdayOf('2026-09-04'), 5); // Friday
  });

  it('arms the next rollover at the coming 03:00', () => {
    assert.equal(nextRolloverMs(at(2026, 9, 8, 2, 0), utc) - at(2026, 9, 8, 2, 0), 3_600_000);
    assert.equal(nextRolloverMs(at(2026, 9, 8, 4, 0), utc) - at(2026, 9, 8, 4, 0), 23 * 3_600_000);
  });
});
