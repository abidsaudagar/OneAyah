import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Coverage } from '../src/core/coverage.ts';
import { TOTAL_AYAT } from '../src/types.ts';

describe('coverage bitset', () => {
  it('holds every ayah in the Qur\'an', () => {
    const c = Coverage.empty();
    for (let i = 0; i < TOTAL_AYAT; i++) c.add(i);
    assert.equal(c.count(), TOTAL_AYAT);
  });

  it('reports a first set as new and a repeat as not', () => {
    const c = Coverage.empty();
    assert.equal(c.add(42), true);
    assert.equal(c.add(42), false);
    assert.equal(c.count(), 1);
  });

  it('round-trips through base64 unchanged', () => {
    const c = Coverage.empty();
    for (const id of [0, 7, 8, 1234, TOTAL_AYAT - 1]) c.add(id);
    const back = Coverage.fromBase64(c.toBase64());
    for (const id of [0, 7, 8, 1234, TOTAL_AYAT - 1]) assert.equal(back.has(id), true);
    assert.equal(back.count(), 5);
    assert.equal(back.toBase64(), c.toBase64());
  });

  it('stays a constant 780 bytes however much is read', () => {
    const empty = Coverage.empty();
    const full = Coverage.empty();
    for (let i = 0; i < TOTAL_AYAT; i++) full.add(i);
    assert.equal(empty.toBase64().length, full.toBase64().length);
    assert.equal(full.toBase64().length, 1040);
  });

  it('returns an empty set for corrupt input rather than throwing', () => {
    assert.equal(Coverage.fromBase64('not valid base64 !!!').count(), 0);
    assert.equal(Coverage.fromBase64('').count(), 0);
  });

  it('counts a surah range, for the drawer\'s per-surah progress', () => {
    const c = Coverage.empty();
    // Al-Baqarah starts at global index 7 and runs 286 ayat.
    for (let i = 7; i < 7 + 40; i++) c.add(i);
    assert.equal(c.countRange(7, 286), 40);
    assert.equal(c.countRange(0, 7), 0);
  });

  it('ignores out-of-range ids', () => {
    const c = Coverage.empty();
    assert.equal(c.add(-1), false);
    assert.equal(c.add(TOTAL_AYAT), false);
    assert.equal(c.has(TOTAL_AYAT), false);
    assert.equal(c.count(), 0);
  });
});
