import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARABIC_LINE, fittedSize, fittedTranslationSize, paginate } from '../src/core/paginate.ts';

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

describe('fittedSize', () => {
  const MIN = 24;

  it('paints the size the reader chose when the frame can show it', () => {
    // A portrait phone: ~500px of frame holds a 128px line more than twice over.
    assert.equal(fittedSize(128, 500, MIN), 128);
  });

  it('caps a portrait size down to the line a landscape frame can hold', () => {
    // 90px of frame, and a line is 1.9 times the size: 47px, not 128.
    assert.equal(fittedSize(128, 90, MIN), 47);
  });

  it('leaves a whole line inside the frame, never a hair over it', () => {
    for (const available of [50, 90, 120, 240, 333, 512]) {
      assert.ok(fittedSize(200, available, MIN) * ARABIC_LINE <= available);
    }
  });

  it('never returns something too small to read', () => {
    assert.equal(fittedSize(128, 20, MIN), MIN);
  });

  it('paints as asked when there is no box to measure yet', () => {
    assert.equal(fittedSize(128, null, MIN), 128);
  });

  it('reads a measured zero as a window with nothing left, not as no measurement', () => {
    assert.equal(fittedSize(128, 0, MIN), MIN);
    assert.equal(fittedSize(128, -10, MIN), MIN);
  });

  it('is a cap and never a promotion: a small size stays small in a tall frame', () => {
    assert.equal(fittedSize(32, 900, MIN), 32);
  });

  it('settles in one pass -- capping a capped size changes nothing', () => {
    for (const available of [40, 90, 200, 640]) {
      const once = fittedSize(128, available, MIN);
      assert.equal(fittedSize(once, available, MIN), once);
    }
  });
});

describe('fittedTranslationSize', () => {
  /** English-ish: half-width characters on 1.55 leading, in an 800x120 box. */
  const en = (chars: number, want = 18, min = 12, boxH = 120) =>
    fittedTranslationSize(want, min, chars, 800, boxH, 1.55, 0.5);

  it('leaves the chosen size alone when the text already fits', () => {
    // 40 chars is one line at 18px: 27.9px of a 120px box.
    assert.equal(en(40), 18);
  });

  it('gives way a step at a time as the verse gets longer', () => {
    const sizes = [200, 400, 700, 1000, 1600].map((n) => en(n));
    for (let i = 1; i < sizes.length; i += 1) {
      assert.ok(sizes[i]! <= sizes[i - 1]!, `${sizes}`);
    }
    assert.ok(sizes[0]! > sizes[sizes.length - 1]!, `${sizes}`);
  });

  it('never returns more than the reader asked for', () => {
    for (const chars of [1, 40, 400, 4000]) assert.ok(en(chars) <= 18);
  });

  it('never returns less than the floor, however long the verse', () => {
    assert.equal(en(100_000), 12);
    assert.ok(en(4000) >= 12);
  });

  it('what it returns actually fits, by its own arithmetic', () => {
    for (const chars of [200, 400, 700, 1000]) {
      const px = en(chars);
      if (px === 12) continue;                       // the floor may not fit; that is the cut
      const perLine = Math.floor(800 / (px * 0.5));
      assert.ok(Math.ceil(chars / perLine) * px * 1.55 <= 120, `${chars} at ${px}`);
    }
  });

  it('and one step larger would not', () => {
    for (const chars of [200, 400, 700, 1000]) {
      const px = en(chars);
      if (px === 18) continue;
      const perLine = Math.floor(800 / ((px + 1) * 0.5));
      assert.ok(Math.ceil(chars / perLine) * (px + 1) * 1.55 > 120, `${chars} at ${px + 1}`);
    }
  });

  it('a tighter script needs less room for the same characters', () => {
    const latin = fittedTranslationSize(18, 12, 600, 800, 120, 1.55, 0.5);
    const wider = fittedTranslationSize(18, 12, 600, 800, 120, 1.55, 0.7);
    assert.ok(wider <= latin, `${wider} vs ${latin}`);
  });

  it('leaves the size alone when there is nothing measured yet', () => {
    assert.equal(fittedTranslationSize(18, 12, 500, 0, 120, 1.55, 0.5), 18);
    assert.equal(fittedTranslationSize(18, 12, 500, 800, 0, 1.55, 0.5), 18);
    assert.equal(fittedTranslationSize(18, 12, 0, 800, 120, 1.55, 0.5), 18);
  });

  it('a taller band buys back size', () => {
    assert.ok(en(800, 18, 12, 240) >= en(800, 18, 12, 120));
  });

  it('settles in one pass -- refitting at the size it returned changes nothing', () => {
    for (const chars of [300, 600, 900]) {
      const once = en(chars);
      assert.equal(en(chars, once), once);
    }
  });
});
