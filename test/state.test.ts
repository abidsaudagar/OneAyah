import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Coverage } from '../src/core/coverage.ts';
import type { OffsetFn } from '../src/core/day.ts';
import {
  DEFAULT_SETTINGS, PHONE_ARABIC_SIZE, initialState, reduce, select, type Action,
} from '../src/core/state.ts';
import type { PersistedState, Rung } from '../src/types.ts';

const utc: OffsetFn = () => 0;
const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h);
const run = (s: PersistedState, ...as: Action[]) => as.reduce((acc, a) => reduce(acc, a, utc), s);

/** Credit `n` verses on a given day, starting from global id `base`. */
const readDay = (s: PersistedState, ms: number, n: number, base = 0) =>
  run(s, ...Array.from({ length: n }, (_, i) => ({ t: 'creditVerse', id: base + i, nowMs: ms }) as Action));

describe('state reducer', () => {
  it('starts with nothing read and a 5-verse goal', () => {
    const s = initialState(at(2026, 9, 4), utc);
    const v = select(s, at(2026, 9, 4), utc);
    assert.equal(v.versesToday, 0);
    assert.equal(v.goal, 5);
    assert.equal(v.streak.current, 0);
    assert.deepEqual(v.selectable, [1, 3, 5, 10]);
  });

  it('credits a verse once, however many times it is submitted', () => {
    let s = initialState(at(2026, 9, 4), utc);
    s = readDay(s, at(2026, 9, 4), 1);
    s = reduce(s, { t: 'creditVerse', id: 0, nowMs: at(2026, 9, 4) }, utc);
    assert.equal(select(s, at(2026, 9, 4), utc).versesToday, 1);
  });

  it('returns the identical object when an action changes nothing', () => {
    const s = readDay(initialState(at(2026, 9, 4), utc), at(2026, 9, 4), 1);
    assert.equal(reduce(s, { t: 'creditVerse', id: 0, nowMs: at(2026, 9, 4) }, utc), s);
    assert.equal(reduce(s, { t: 'heartbeat', nowMs: at(2026, 9, 4) }, utc), s);
  });

  it('reproduces the design anchor end to end', () => {
    // 14 prior days read, then six verses today at rung 5.
    let s = initialState(at(2026, 8, 21), utc);
    for (let i = 0; i < 14; i++) s = readDay(s, at(2026, 8, 21) + i * 86_400_000, 5, i * 10);
    s = readDay(s, at(2026, 9, 4), 6, 500);

    const v = select(s, at(2026, 9, 4), utc);
    assert.equal(v.streak.current, 15);
    assert.equal(v.versesToday, 6);
    assert.equal(v.goalMet, true);
    // Streak 15 is still the x1.2 tier, so the day scores exactly 78.
    assert.equal(v.pointsToday, 78);
  });

  it('splits a session across the 3am rollover', () => {
    let s = initialState(at(2026, 9, 7, 23), utc);
    s = readDay(s, at(2026, 9, 8, 2) - 60_000, 3);              // 01:59 Tue -> Monday
    s = readDay(s, at(2026, 9, 8, 3) + 60_000, 2, 100);         // now Tuesday

    assert.equal(select(s, at(2026, 9, 8, 3) + 60_000, utc).versesToday, 2);
    assert.equal(s.days['2026-09-07']!.v, 3);
    assert.equal(s.days['2026-09-08']!.v, 2);
    assert.deepEqual(s.credited.ids, [100, 101]);
  });

  it('records time read before any verse is credited, without lighting the day', () => {
    let s = initialState(at(2026, 9, 4), utc);
    s = reduce(s, { t: 'addSeconds', seconds: 40, nowMs: at(2026, 9, 4) }, utc);
    assert.equal(s.days['2026-09-04']!.s, 40);
    assert.equal(s.days['2026-09-04']!.v, 0);
    // A day with time but no verses is still an unread day.
    assert.equal(select(s, at(2026, 9, 4), utc).streak.current, 0);
  });

  describe('the rung-raise exploit', () => {
    it('does not rescore a day upward when the goal is raised', () => {
      let s = initialState(at(2026, 9, 4), utc);
      s = reduce(s, { t: 'setRung', rung: 1, nowMs: at(2026, 9, 4) }, utc);
      s = readDay(s, at(2026, 9, 4), 10);
      const banked = select(s, at(2026, 9, 4), utc).pointsToday;

      s = reduce(s, { t: 'setRung', rung: 10, nowMs: at(2026, 9, 4) }, utc);
      const after = select(s, at(2026, 9, 4), utc);
      assert.equal(after.pointsToday, banked, 'raising the rung must not rescore today');
      assert.equal(after.goal, 10, 'but the new goal applies from tomorrow');
      assert.equal(after.effectiveRung, 1);
    });

    it('lets a reader drop a rung immediately, and rescores for it', () => {
      let s = initialState(at(2026, 9, 4), utc);
      s = reduce(s, { t: 'setRung', rung: 10, nowMs: at(2026, 9, 4) }, utc);
      s = readDay(s, at(2026, 9, 4), 5);
      assert.equal(select(s, at(2026, 9, 4), utc).goalMet, false);

      s = reduce(s, { t: 'setRung', rung: 5, nowMs: at(2026, 9, 4) }, utc);
      const v = select(s, at(2026, 9, 4), utc);
      assert.equal(v.goalMet, true, 'dropping is free and takes effect today');
      assert.equal(v.pointsToday, 60);
    });

    it('refuses a rung that has not been unlocked', () => {
      const s = initialState(at(2026, 9, 4), utc);
      assert.equal(reduce(s, { t: 'setRung', rung: 20, nowMs: at(2026, 9, 4) }, utc).goal, 5);
    });
  });

  it('unlocks rung 20 after seven goal-met days at rung 10', () => {
    let s = initialState(at(2026, 9, 1), utc);
    s = reduce(s, { t: 'setRung', rung: 10, nowMs: at(2026, 9, 1) }, utc);
    for (let i = 0; i < 7; i++) s = readDay(s, at(2026, 9, 1) + i * 86_400_000, 10, i * 20);

    const v = select(s, at(2026, 9, 7), utc);
    assert.equal(v.unlockedMax, 20);
    assert.deepEqual(v.selectable, [1, 3, 5, 10, 20]);
  });

  it('keeps totals equal to the sum of every day', () => {
    let s = initialState(at(2026, 9, 1), utc);
    for (let i = 0; i < 5; i++) s = readDay(s, at(2026, 9, 1) + i * 86_400_000, 6, i * 10);
    const sum = Object.values(s.days).reduce(
      (acc, d) => ({ p: acc.p + d.p, v: acc.v + d.v }), { p: 0, v: 0 },
    );
    assert.equal(s.totals.points, sum.p);
    assert.equal(s.totals.verses, sum.v);
    assert.equal(s.totals.verses, 30);
  });

  it('tracks lifetime coverage separately from today', () => {
    let s = initialState(at(2026, 9, 4), utc);
    s = readDay(s, at(2026, 9, 4), 3);
    s = readDay(s, at(2026, 9, 5), 3);           // same verse ids, a new day
    assert.equal(s.days['2026-09-05']!.v, 3, 're-reading credits again on a new day');
    // ...but the lifetime set still holds only three distinct verses.
    assert.equal(Coverage.fromBase64(s.coverage).count(), 3);
  });

  it('accepts a wholesale state replacement, for backup import', () => {
    const a = readDay(initialState(at(2026, 9, 4), utc), at(2026, 9, 4), 4);
    const b = initialState(at(2026, 9, 4), utc);
    assert.deepEqual(reduce(b, { t: 'replaceState', next: a }, utc), a);
  });

  it('rebuilds totals on import rather than trusting them', () => {
    const good = readDay(initialState(at(2026, 9, 4), utc), at(2026, 9, 4), 4);
    const tampered = { ...good, totals: { points: 999_999, verses: 999, seconds: 999 } };
    const out = reduce(initialState(at(2026, 9, 4), utc),
      { t: 'replaceState', next: tampered }, utc);
    assert.deepEqual(out.totals, good.totals);
  });

  it('clamps an out-of-range rung rather than trusting it', () => {
    const s = initialState(at(2026, 9, 4), utc);
    assert.equal(reduce(s, { t: 'setRung', rung: 30 as Rung, nowMs: at(2026, 9, 4) }, utc).goal, 5);
  });

  describe('the size a fresh install starts on', () => {
    it('takes the desktop default when the shell seeds nothing', () => {
      const s = initialState(at(2026, 9, 4), utc);
      assert.equal(s.settings.arabicSize, DEFAULT_SETTINGS.arabicSize);
    });

    it('takes the phone size when the shell seeds one', () => {
      const s = initialState(at(2026, 9, 4), utc, { arabicSize: PHONE_ARABIC_SIZE });
      assert.equal(s.settings.arabicSize, 45);
    });

    it('leaves every setting the seed does not name alone', () => {
      const s = initialState(at(2026, 9, 4), utc, { arabicSize: PHONE_ARABIC_SIZE });
      assert.equal(s.settings.arabicFont, DEFAULT_SETTINGS.arabicFont);
      assert.equal(s.settings.translationSize, DEFAULT_SETTINGS.translationSize);
      assert.equal(s.settings.theme, DEFAULT_SETTINGS.theme);
    });
  });
});
