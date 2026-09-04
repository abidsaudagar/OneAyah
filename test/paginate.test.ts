import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paginate } from '../src/core/paginate.ts';

/** Stands in for measured height: a run fits while it is within `budget` characters. */
const upTo = (budget: number) => (run: string) => run.length <= budget;

describe('paginate', () => {
  it('leaves an ayah that fits in one part', () => {
    assert.deepEqual(paginate('alif lam mim', upTo(100)), ['alif lam mim']);
  });

  it('fills each part as far as it will go before starting the next', () => {
    // 'aaa bbb ccc ddd' -- 7 characters holds two words, never three.
    assert.deepEqual(paginate('aaa bbb ccc ddd', upTo(7)), ['aaa bbb', 'ccc ddd']);
  });

  it('loses no word and invents none', () => {
    const words = Array.from({ length: 97 }, (_, i) => `w${i}`);
    const pages = paginate(words.join(' '), upTo(23));
    assert.deepEqual(pages.join(' ').split(' '), words);
  });

  it('emits a word that cannot fit alone rather than looping forever', () => {
    assert.deepEqual(paginate('short enormouslylongword end', upTo(6)),
      ['short', 'enormouslylongword', 'end']);
  });

  it('collapses the runs of spaces the Arabic texts carry', () => {
    assert.deepEqual(paginate('  alif   lam  ', upTo(100)), ['alif lam']);
  });

  it('returns the text itself when there are no words to split', () => {
    assert.deepEqual(paginate('', upTo(10)), ['']);
    assert.deepEqual(paginate('   ', upTo(10)), ['   ']);
  });

  it('always makes progress, so every part is non-empty', () => {
    for (const budget of [1, 2, 3, 5, 8, 13, 40]) {
      const pages = paginate('one two three four five six seven', upTo(budget));
      assert.ok(pages.every((p) => p.length > 0), `empty part at budget ${budget}`);
    }
  });

  it('only ever asks fits about a whole-word run of the text', () => {
    const text = 'one two three four five six seven eight';
    const seen: string[] = [];
    paginate(text, (run) => { seen.push(run); return run.length <= 12; });
    assert.ok(seen.length > 0);
    // Padding both sides is what makes this a word-boundary test rather than a
    // substring one: 'wo thre' is inside the text, ' wo thre ' is not.
    assert.ok(seen.every((run) => ` ${text} `.includes(` ${run} `)),
      `not a whole-word run: ${JSON.stringify(seen)}`);
  });
});
