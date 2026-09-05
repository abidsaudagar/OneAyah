import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { celebrationCopy, celebrationFor, firstVisitChip } from '../src/core/celebrate.ts';
import { addDays } from '../src/core/day.ts';
import type { DayMap } from '../src/core/streak.ts';
import type { DayRecord, Rung } from '../src/types.ts';

const day = (v: number, g: Rung = 5): DayRecord => ({ v, s: 0, g, p: 0 });

/** `n` consecutive days ending at `end`, each with `verses` read at rung 5. */
function run(end: string, n: number, verses: number, g: Rung = 5): DayMap {
  const days: Record<string, DayRecord> = {};
  for (let i = 0; i < n; i++) days[addDays(end, -i)] = day(verses, g);
  return days;
}

const TODAY = '2026-03-15';

describe('celebrate', () => {
  it('says nothing when the goal is not met', () => {
    assert.equal(celebrationFor({ [TODAY]: day(4) }, TODAY), null);
    assert.equal(celebrationFor({}, TODAY), null);
  });

  it('marks the first goal a reader ever meets', () => {
    const c = celebrationFor({ [TODAY]: day(5) }, TODAY);
    assert.equal(c?.firstGoal, 5);
    assert.equal(c?.milestone, null);
    assert.equal(c?.particles, 90);
  });

  it('does not mark a first goal when an earlier day already met one', () => {
    const days = { '2026-03-01': day(5), [TODAY]: day(5) };
    assert.equal(celebrationFor(days, TODAY), null);
  });

  it('carries the rung the day was actually scored at into the headline', () => {
    const c = celebrationFor({ [TODAY]: day(3, 3) }, TODAY);
    assert.equal(celebrationCopy(c!).headline, 'Three verses. Your first goal met.');
  });

  it('stays silent on an ordinary goal-met day', () => {
    // Six days of reading, the goal met throughout, no tier crossed.
    assert.equal(celebrationFor(run(TODAY, 6, 5), TODAY), null);
  });

  it('marks the 7-day tier on the day it is reached', () => {
    const c = celebrationFor(run(TODAY, 7, 5), TODAY);
    assert.deepEqual(c?.milestone, { days: 7, multiplier: 1.2 });
    assert.equal(c?.particles, 90);
    // Seven straight goal-met days is also the reader's first goal, six days
    // ago -- so the first-goal slot is empty and the streak owns the card.
    assert.equal(c?.firstGoal, null);
  });

  it('escalates the burst at 30 and 100', () => {
    assert.equal(celebrationFor(run(TODAY, 30, 5), TODAY)?.particles, 140);
    assert.equal(celebrationFor(run(TODAY, 100, 5), TODAY)?.particles, 200);
  });

  it('marks each tier once and only once', () => {
    // Day 8 of an unbroken goal-met run: 7 was marked yesterday.
    assert.equal(celebrationFor(run(TODAY, 8, 5), TODAY), null);
    assert.equal(celebrationFor(run(TODAY, 31, 5), TODAY), null);
  });

  it('carries a tier forward when its own day missed the goal', () => {
    // Nine days read; the goal met only today. The streak is 9, and the
    // 7-day tier has never been marked, so it lands now -- worded 9, not 7.
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i < 9; i++) days[addDays(TODAY, -i)] = day(1);
    days[TODAY] = day(5);
    const c = celebrationFor(days, TODAY);
    assert.deepEqual(c?.milestone, { days: 9, multiplier: 1.2 });
    assert.equal(celebrationCopy(c!).headline, '9 days.');
  });

  it('skips a tier that was overtaken while no goal was met', () => {
    // Thirty days read, the goal met only today: 7 was never marked, but 30
    // is the highest tier crossed and only it lands. One card, not two.
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i < 30; i++) days[addDays(TODAY, -i)] = day(1);
    days[TODAY] = day(5);
    const c = celebrationFor(days, TODAY);
    assert.equal(c?.milestone?.days, 30);
    assert.equal(c?.particles, 140);
  });

  it('does not let a broken run re-mark a tier', () => {
    // 7 marked, then a missed day, then seven more goal-met days. The tier
    // has been marked already, so the second run is silent.
    const days: Record<string, DayRecord> = { ...run(addDays(TODAY, -8), 7, 5) };
    Object.assign(days, run(TODAY, 7, 5));
    assert.equal(celebrationFor(days, TODAY), null);
  });

  it('treats a day with time but no verses as a break in the run', () => {
    const days: Record<string, DayRecord> = run(TODAY, 7, 5) as Record<string, DayRecord>;
    days[addDays(TODAY, -3)] = day(0);
    // The run ending today is only three days, so no tier is crossed -- and
    // the reader has met the goal before, so there is nothing to say.
    assert.equal(celebrationFor(days, TODAY), null);
  });

  it('lets a milestone take the headline while the first goal keeps the teach line', () => {
    // Six days of one verse, then the goal met for the first time on day 7.
    const days: Record<string, DayRecord> = {};
    for (let i = 1; i < 7; i++) days[addDays(TODAY, -i)] = day(1);
    days[TODAY] = day(5);
    const c = celebrationFor(days, TODAY);
    assert.equal(c?.firstGoal, 5);
    assert.equal(c?.milestone?.days, 7);

    const copy = celebrationCopy(c!);
    assert.equal(copy.headline, '7 days.');
    assert.equal(copy.body, 'Every verse now earns ×1.2 while the streak holds.');
    assert.ok(copy.teach !== null);
  });

  it('offers the teach line only on a first goal', () => {
    const first = celebrationFor({ [TODAY]: day(5) }, TODAY)!;
    assert.ok(celebrationCopy(first).teach !== null);
    assert.equal(celebrationCopy(celebrationFor(run(TODAY, 7, 5), TODAY)!).teach, null);
  });

  it('writes no em dashes into any copy it produces', () => {
    const cards = [
      celebrationFor({ [TODAY]: day(5) }, TODAY)!,
      celebrationFor(run(TODAY, 7, 5), TODAY)!,
      celebrationFor(run(TODAY, 100, 5), TODAY)!,
    ];
    for (const c of cards) {
      const { headline, body, teach } = celebrationCopy(c);
      assert.ok(!`${headline}${body}${teach ?? ''}`.includes('—'));
    }
  });

  it('keeps the first-visit chip singular at rung 1', () => {
    assert.equal(firstVisitChip(1), '1 VERSE TODAY');
    assert.equal(firstVisitChip(5), '5 VERSES TODAY');
  });
});
