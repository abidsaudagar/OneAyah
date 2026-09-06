import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DWELL_MS, MIN_DWELL_MS, arabicWordsPerMinute, countArabicLetters, dwellMs,
  snapSpeed, stepSpeed,
} from '../src/core/dwell.ts';
import { AUTO_SPEEDS, DEFAULT_AUTO_SPEED } from '../src/types.ts';

/** Al-Fātiḥah, Uthmani, straight out of public/data. */
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const FATIHA_7 = 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ';
/** The same verse in the Indo-Pak text, which carries its own marks and joiners. */
const BASMALA_INDOPAK = 'بِسۡمِ اللهِ الرَّحۡمٰنِ الرَّحِيۡمِ';

const at = (arabic: string, speed = 1, translation = '') =>
  dwellMs({ arabic, translation, speed });

describe('countArabicLetters', () => {
  it('counts letters, not the tashkīl written over them', () => {
    // Four words, nineteen letters -- the fatḥas and sukūns are not letters.
    assert.equal(countArabicLetters(BASMALA), 19);
  });

  it('reads the same verse the same way in either orthography', () => {
    // The two texts differ in marks and joiners, not in the letters, and a
    // reader who switches script must not find every ayah re-timed under them.
    assert.equal(countArabicLetters(BASMALA_INDOPAK), countArabicLetters(BASMALA));
  });

  it('ignores whitespace and takes nothing from an empty string', () => {
    assert.equal(countArabicLetters(''), 0);
    assert.equal(countArabicLetters('   \n '), 0);
  });
});

describe('dwellMs', () => {
  it('gives a longer verse longer, which is the whole point', () => {
    assert.ok(at(FATIHA_7) > at(BASMALA));
  });

  it('separates two verses of equal word count by their letters', () => {
    // Same three words; the second is far more to read. A word-count model
    // would hold both for exactly as long, which is the thing this avoids.
    const short = at('مِن مِن مِن');
    const long = at('وَٱلْمُسْتَغْفِرِينَ وَٱلْمُسْتَغْفِرِينَ وَٱلْمُسْتَغْفِرِينَ');
    assert.ok(long > short * 1.5, `${long} should be well past ${short}`);
  });

  it('holds Al-Fātiḥah at a pace a reader would recognise', () => {
    // Anchors, so a change to the rates has to be a deliberate one: the
    // basmala near five seconds and 1:7 near ten, which is unhurried tartīl.
    assert.ok(at(BASMALA) > 4_000 && at(BASMALA) < 6_000, String(at(BASMALA)));
    assert.ok(at(FATIHA_7) > 8_500 && at(FATIHA_7) < 11_500, String(at(FATIHA_7)));
  });

  it('pays for the translation only when there is one on screen', () => {
    const withEnglish = at(BASMALA, 1, 'In the name of God, the Gracious, the Merciful.');
    assert.ok(withEnglish > at(BASMALA));
  });

  it('takes a higher speed as less time, and a lower one as more', () => {
    assert.ok(at(FATIHA_7, 2) < at(FATIHA_7, 1));
    assert.ok(at(FATIHA_7, 0.5) > at(FATIHA_7, 1));
  });

  it('is monotone in speed across the whole ladder', () => {
    // Nothing in the ladder may hold an ayah longer than the rung below it --
    // a `+` that made the reading slower would be indistinguishable from a bug.
    const times = AUTO_SPEEDS.map((s) => at(FATIHA_7, s));
    for (let i = 1; i < times.length; i += 1) assert.ok(times[i]! <= times[i - 1]!);
  });

  it('never drops below the floor, however short the verse or fast the dial', () => {
    assert.equal(at('الم', 2.5), MIN_DWELL_MS);
    assert.equal(at('', 2.5), MIN_DWELL_MS);
  });

  it('never climbs past the ceiling, however long the translation', () => {
    const huge = Array.from({ length: 4_000 }, () => 'word').join(' ');
    assert.equal(at(FATIHA_7, 0.5, huge), MAX_DWELL_MS);
  });

  it('treats a speed of zero as 1 rather than dividing by it', () => {
    assert.equal(at(FATIHA_7, 0), at(FATIHA_7, 1));
  });

  it('returns whole milliseconds, which is what setTimeout wants', () => {
    assert.ok(Number.isInteger(at(FATIHA_7, 0.85)));
  });
});

describe('the speed dial', () => {
  it('snaps anything to the nearest rung of the ladder', () => {
    assert.equal(snapSpeed(1), 1);
    assert.equal(snapSpeed(1.1), 1.2);
    assert.equal(snapSpeed(0.52), 0.5);
  });

  it('pulls a hand-edited backup back onto the ladder rather than trusting it', () => {
    // 400x would be a Qur'an flickering past with no obvious way to slow it,
    // and 0 an ayah that never turns at all.
    assert.equal(snapSpeed(400), 2.5);
    assert.equal(snapSpeed(0), 0.5);
    assert.equal(snapSpeed(-3), 0.5);
  });

  it('falls back to the default for anything that is not a number', () => {
    for (const junk of [undefined, null, 'fast', NaN, {}]) {
      assert.equal(snapSpeed(junk), DEFAULT_AUTO_SPEED);
    }
  });

  it('steps one rung at a time', () => {
    assert.equal(stepSpeed(1, 1), 1.2);
    assert.equal(stepSpeed(1, -1), 0.85);
  });

  it('stops at either end instead of wrapping round to the other', () => {
    const [slowest] = AUTO_SPEEDS;
    const fastest = AUTO_SPEEDS[AUTO_SPEEDS.length - 1];
    assert.equal(stepSpeed(slowest!, -1), slowest);
    assert.equal(stepSpeed(fastest!, 1), fastest);
  });

  it('steps from an off-ladder value onto the ladder', () => {
    assert.equal(stepSpeed(1.13, 1), 1.4);
  });

  it('reaches every rung by stepping, from either end', () => {
    let s = AUTO_SPEEDS[0]!;
    const seen = [s];
    for (let i = 0; i < AUTO_SPEEDS.length; i += 1) {
      s = stepSpeed(s, 1);
      if (s !== seen[seen.length - 1]) seen.push(s);
    }
    assert.deepEqual(seen, [...AUTO_SPEEDS]);
  });
});

describe('arabicWordsPerMinute', () => {
  it('reports a pace a reader can picture, and rises with the dial', () => {
    const base = arabicWordsPerMinute(1);
    assert.ok(base > 45 && base < 80, String(base));
    assert.ok(arabicWordsPerMinute(2) > base);
    assert.ok(arabicWordsPerMinute(0.5) < base);
  });

  it('is a whole number, because it is shown as one', () => {
    for (const s of AUTO_SPEEDS) assert.ok(Number.isInteger(arabicWordsPerMinute(s)));
  });
});
