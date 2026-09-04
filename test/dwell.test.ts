import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateDwell, requiredDwellMs, requiredDwellMsForWords, wordCount } from '../src/core/dwell.ts';
import { DWELL_CAP_MS } from '../src/types.ts';

const gate = (o: Partial<Parameters<typeof evaluateDwell>[0]> = {}) => evaluateDwell({
  enteredAtActiveMs: 0, leftAtActiveMs: 5000, requiredMs: 2000,
  alreadyCredited: false, direction: 'forward', ...o,
});

describe('dwell gate', () => {
  it('counts words in Arabic and English alike', () => {
    assert.equal(wordCount('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'), 4);
    assert.equal(wordCount('Praise be to God, Lord of the Worlds.'), 8);
    assert.equal(wordCount('  spaced   out  '), 2);
    assert.equal(wordCount(''), 0);
  });

  it('applies the 2s floor to short ayat', () => {
    assert.equal(requiredDwellMsForWords(1), 2000);
    assert.equal(requiredDwellMsForWords(3), 2000);
    assert.equal(requiredDwellMsForWords(4), 2400);
    assert.equal(requiredDwellMsForWords(10), 6000);
  });

  it('caps long ayat so 2:282 stays creditable', () => {
    // ~128 words. Uncapped this demands 76.8s — longer than the whole 70s
    // session, which would make the longest ayah in the Qur'an unreadable
    // for credit. The cap is what keeps it reachable.
    assert.equal(128 * 600, 76_800);
    assert.equal(requiredDwellMsForWords(128), DWELL_CAP_MS);
    assert.ok(DWELL_CAP_MS < 70_000);
  });

  it('credits at the threshold but not a millisecond below', () => {
    assert.equal(gate({ leftAtActiveMs: 1999 }).credit, false);
    assert.equal(gate({ leftAtActiveMs: 1999 }).reason, 'too-fast');
    assert.equal(gate({ leftAtActiveMs: 2000 }).credit, true);
  });

  it('never credits a backward move, however long the dwell', () => {
    const v = gate({ direction: 'backward', leftAtActiveMs: 999_999 });
    assert.equal(v.credit, false);
    assert.equal(v.reason, 'backward');
  });

  it('never re-credits a verse already banked today', () => {
    const v = gate({ alreadyCredited: true });
    assert.equal(v.credit, false);
    assert.equal(v.reason, 'already-credited');
  });

  it('ignores paused time, because it measures the active clock', () => {
    // 60s of wall time, but only 1.2s of it active: no credit.
    assert.equal(gate({ enteredAtActiveMs: 400, leftAtActiveMs: 1600 }).credit, false);
  });

  it('derives the requirement straight from the text', () => {
    assert.equal(requiredDwellMs('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'), 2400);
  });
});
