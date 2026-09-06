import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placeIn, rememberPlace, repairPlaces } from '../src/core/places.ts';
import type { OffsetFn } from '../src/core/day.ts';
import { initialState, reduce, type Action } from '../src/core/state.ts';
import type { PersistedState, Places } from '../src/types.ts';

const utc: OffsetFn = () => 0;
const NOW = Date.UTC(2026, 8, 4, 12);
const run = (s: PersistedState, ...as: Action[]) => as.reduce((acc, a) => reduce(acc, a, utc), s);
const goTo = (surah: number, ayah: number): Action => ({ t: 'setPosition', position: { surah, ayah } });

describe('per-surah place memory', () => {
  describe('placeIn', () => {
    it('starts an unvisited surah at its first ayah', () => {
      assert.equal(placeIn({}, 36), 1);
      assert.equal(placeIn({ 2: 5 }, 36), 1);
    });

    it('returns the ayah last stood on', () => {
      assert.equal(placeIn({ 2: 255 }, 2), 255);
    });

    it('falls back to the first ayah rather than trusting a broken entry', () => {
      assert.equal(placeIn({ 2: 0 }, 2), 1);
      assert.equal(placeIn({ 2: -4 }, 2), 1);
      assert.equal(placeIn({ 2: NaN }, 2), 1);
      assert.equal(placeIn({ 2: 'five' as unknown as number }, 2), 1);
    });
  });

  describe('rememberPlace', () => {
    it('records one ayah per surah, last one wins', () => {
      let p: Places = {};
      p = rememberPlace(p, { surah: 2, ayah: 5 });
      p = rememberPlace(p, { surah: 2, ayah: 9 });
      assert.deepEqual(p, { 2: 9 });
    });

    it('keeps surahs apart', () => {
      let p: Places = {};
      p = rememberPlace(p, { surah: 2, ayah: 5 });
      p = rememberPlace(p, { surah: 36, ayah: 12 });
      assert.deepEqual(p, { 2: 5, 36: 12 });
    });

    it('returns the same object when nothing moved', () => {
      const p = rememberPlace({}, { surah: 2, ayah: 5 });
      assert.equal(rememberPlace(p, { surah: 2, ayah: 5 }), p);
    });

    it('refuses a surah outside 1..114 and a sub-1 ayah', () => {
      assert.deepEqual(rememberPlace({}, { surah: 0, ayah: 3 }), {});
      assert.deepEqual(rememberPlace({}, { surah: 115, ayah: 3 }), {});
      assert.deepEqual(rememberPlace({}, { surah: 2, ayah: 0 }), {});
      assert.deepEqual(rememberPlace({}, { surah: 2.5, ayah: 3 }), {});
    });
  });

  describe('through the reducer', () => {
    it('remembers where the reader was standing in each surah', () => {
      const s = run(initialState(NOW, utc),
        goTo(2, 5), goTo(36, 1), goTo(36, 12), goTo(112, 2));
      assert.equal(placeIn(s.places, 2), 5);
      assert.equal(placeIn(s.places, 36), 12);
      assert.equal(placeIn(s.places, 112), 2);
    });

    /** The bug this whole record exists for. */
    it('hands a surah back at the ayah it was left on, not at its first', () => {
      // Read to 2:5, jump away to Ya-Sin, then come back to Al-Baqarah.
      const s = run(initialState(NOW, utc), goTo(2, 5), goTo(36, 1));
      assert.equal(placeIn(s.places, 2), 5, 'the old surah kept its place');

      // Coming back is a jump to that remembered ayah, which then re-records it.
      const back = run(s, goTo(2, placeIn(s.places, 2)));
      assert.deepEqual(back.position, { surah: 2, ayah: 5 });
    });

    it('leaves an unvisited surah on its first ayah', () => {
      const s = run(initialState(NOW, utc), goTo(2, 5));
      assert.equal(placeIn(s.places, 36), 1);
    });

    it('still returns identity when the position did not change', () => {
      const s = run(initialState(NOW, utc), goTo(2, 5));
      assert.equal(reduce(s, goTo(2, 5), utc), s, 'an unchanged position must not cost a write');
    });

    it('seeds the opening ayah of Al-Fatihah, so a fresh reader has a place', () => {
      assert.deepEqual(initialState(NOW, utc).places, { 1: 1 });
    });
  });

  describe('repairPlaces', () => {
    const pos = { surah: 2, ayah: 5 };

    it('keeps well-formed entries', () => {
      assert.deepEqual(repairPlaces({ 2: 5, 36: 12 }, pos), { 2: 5, 36: 12 });
    });

    it('drops surah keys outside 1..114 and ayat below 1', () => {
      const out = repairPlaces(
        { 0: 3, 115: 3, '-1': 3, 'two': 4, 36: 0, 55: -2, 99: 'x', 18: 10 }, pos);
      assert.deepEqual(out, { 2: 5, 18: 10 }, 'only the valid entry survives, plus the seed');
    });

    it('seeds the current position for a state written before places existed', () => {
      assert.deepEqual(repairPlaces(undefined, pos), { 2: 5 });
      assert.deepEqual(repairPlaces(null, pos), { 2: 5 });
      assert.deepEqual(repairPlaces('nonsense', pos), { 2: 5 });
    });

    it('does not overwrite a stored place with the current position', () => {
      assert.deepEqual(repairPlaces({ 2: 99 }, pos), { 2: 99 });
    });

    it('floors a fractional ayah rather than carrying it into the reader', () => {
      assert.deepEqual(repairPlaces({ 36: 12.7 }, pos), { 2: 5, 36: 12 });
    });
  });
});
