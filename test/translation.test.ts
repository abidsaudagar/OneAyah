import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cycleOrder, cycleTranslation, type TranslationState } from '../src/core/translation.ts';
import { DEFAULT_SETTINGS } from '../src/core/state.ts';
import { TRANSLATION_LANGS, type TranslationLang } from '../src/types.ts';

/** A state as the reader would hold it: `home` is what they chose in the panel. */
const at = (
  home: TranslationLang, showing: TranslationLang | null = null,
): TranslationState => ({
  showTranslation: showing !== null,
  translationLang: showing ?? home,
  translationHome: home,
});

/** Presses T `n` times and reports what was on screen after each press. */
function run(start: TranslationState, n: number): (TranslationLang | 'off')[] {
  const seen: (TranslationLang | 'off')[] = [];
  let s = start;
  for (let i = 0; i < n; i++) {
    s = cycleTranslation(s);
    seen.push(s.showTranslation ? s.translationLang : 'off');
  }
  return seen;
}

describe('the T cycle', () => {
  it('opens on the reader’s own language, not on a fixed first one', () => {
    assert.equal(cycleTranslation(at('ur')).translationLang, 'ur');
    assert.equal(cycleTranslation(at('en')).translationLang, 'en');
  });

  it('walks every language once, then closes — starting from English', () => {
    assert.deepEqual(run(at('en'), 3), ['en', 'ur', 'off']);
  });

  it('walks every language once, then closes — starting from Urdu', () => {
    assert.deepEqual(run(at('ur'), 3), ['ur', 'en', 'off']);
  });

  // The whole reason `translationHome` exists: a fixed order spent the reader's
  // choice on the second press and never gave it back.
  it('hands the reader’s own language back when the turn closes', () => {
    let s = at('ur');
    for (let i = 0; i < 3; i++) s = cycleTranslation(s);
    assert.equal(s.showTranslation, false);
    assert.equal(s.translationHome, 'ur');
    assert.equal(s.translationLang, 'ur');
  });

  it('shows the same language on every turn — the choice never drifts', () => {
    assert.deepEqual(run(at('ur'), 9),
      ['ur', 'en', 'off', 'ur', 'en', 'off', 'ur', 'en', 'off']);
    assert.deepEqual(run(at('en'), 9),
      ['en', 'ur', 'off', 'en', 'ur', 'off', 'en', 'ur', 'off']);
  });

  it('never lets the home wander off the reader’s choice', () => {
    let s = at('ur');
    for (let i = 0; i < 12; i++) {
      s = cycleTranslation(s);
      assert.equal(s.translationHome, 'ur');
    }
  });

  it('reopens on the reader’s language after being closed part-way through', () => {
    // On English, mid-turn, from an Urdu home. Choosing OFF in the panel and
    // pressing T again must not strand them on English.
    const midTurn = at('ur', 'en');
    const closed = { ...midTurn, showTranslation: false };
    assert.equal(cycleTranslation(closed).translationLang, 'ur');
  });

  it('takes a language switch in the panel as the new home', () => {
    // What openSettings dispatches when اردو is clicked.
    const picked = at('ur', 'ur');
    assert.deepEqual(run(picked, 3), ['en', 'off', 'ur']);
  });

  // A backup written by a later build, or hand-edited: repair() catches these
  // on the way in, but the cycle must still land somewhere real.
  it('recovers onto a real language from a home it does not know', () => {
    const bogus = { showTranslation: false, translationLang: 'en', translationHome: 'fr' } as
      unknown as TranslationState;
    const next = cycleTranslation(bogus);
    assert.equal(next.showTranslation, true);
    assert.ok(TRANSLATION_LANGS.includes(next.translationLang));
    assert.ok(TRANSLATION_LANGS.includes(next.translationHome));
  });

  it('recovers onto the reader’s language from a shown one it does not know', () => {
    const bogus = { showTranslation: true, translationLang: 'fr', translationHome: 'ur' } as
      unknown as TranslationState;
    assert.deepEqual(cycleTranslation(bogus),
      { showTranslation: true, translationLang: 'ur', translationHome: 'ur' });
  });

  it('never touches anything but the three fields it owns', () => {
    assert.deepEqual(Object.keys(cycleTranslation(at('en'))).sort(),
      ['showTranslation', 'translationHome', 'translationLang']);
  });

  it('starts from a default the cycle can actually reach', () => {
    assert.equal(DEFAULT_SETTINGS.showTranslation, false);
    assert.ok(TRANSLATION_LANGS.includes(DEFAULT_SETTINGS.translationLang));
    assert.equal(DEFAULT_SETTINGS.translationHome, DEFAULT_SETTINGS.translationLang);
  });
});

describe('the order the hint promises', () => {
  it('leads with the reader’s own language', () => {
    assert.deepEqual([...cycleOrder('ur')], ['ur', 'en']);
    assert.deepEqual([...cycleOrder('en')], ['en', 'ur']);
  });

  it('lists every language exactly once', () => {
    for (const home of TRANSLATION_LANGS) {
      assert.equal(new Set(cycleOrder(home)).size, TRANSLATION_LANGS.length);
    }
  });

  // The hint and the key must not be able to disagree: one press per language,
  // in that order, before the turn closes.
  it('matches what pressing T actually does', () => {
    for (const home of TRANSLATION_LANGS) {
      assert.deepEqual(run(at(home), TRANSLATION_LANGS.length), [...cycleOrder(home)]);
    }
  });

  it('falls back to a real order for a home it does not know', () => {
    assert.deepEqual([...cycleOrder('fr' as TranslationLang)], [...TRANSLATION_LANGS]);
  });
});
