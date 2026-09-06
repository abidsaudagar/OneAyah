/**
 * What `T` does, as a pure function.
 *
 * The key used to be an on/off toggle over a single translation. With two it
 * becomes a cycle, so the whole of the feature is reachable from the keyboard
 * without opening a panel -- but a cycle with a FIXED order has a flaw that a
 * toggle does not: it overrides the language the reader chose. A reader who
 * picked Urdu in the panel pressed T and got English, with Urdu buried on the
 * second press and gone on the third.
 *
 * So the turn starts from the reader's own language and comes home to it:
 *
 *     home = Urdu     off -> Urdu -> English -> off (still Urdu)
 *     home = English  off -> English -> Urdu -> off (still English)
 *
 * Every language is still one key away, and the choice made in the panel is
 * never spent: closing the turn hands it back, so the next press shows the
 * same language as the last one did. That is the property a fixed order cannot
 * have, and the reason `translationHome` exists at all.
 */
import { TRANSLATION_LANGS, type Settings, type TranslationLang } from '../types.ts';

/** Just the three fields the cycle owns, so it can never touch anything else. */
export type TranslationState =
  Pick<Settings, 'showTranslation' | 'translationLang' | 'translationHome'>;

const known = (l: TranslationLang): boolean => TRANSLATION_LANGS.includes(l);

export function cycleTranslation(current: TranslationState): TranslationState {
  // A home this build does not have -- a backup from a later version, or one
  // hand-edited past `repair` -- falls back to the first language rather than
  // leaving the turn with nowhere to come back to.
  const home = known(current.translationHome) ? current.translationHome : TRANSLATION_LANGS[0]!;
  const on = (lang: TranslationLang): TranslationState =>
    ({ showTranslation: true, translationLang: lang, translationHome: home });

  // Opening always shows the reader's own language, whatever was last on screen.
  if (!current.showTranslation) return on(home);

  const at = TRANSLATION_LANGS.indexOf(current.translationLang);
  // Showing a language this build does not have is the same recovery: land on
  // the reader's own rather than closing. They pressed T asking to SEE one.
  if (at < 0) return on(home);

  const next = TRANSLATION_LANGS[(at + 1) % TRANSLATION_LANGS.length]!;
  // Back where the turn began means every language has now been shown, so the
  // turn closes -- and the reader keeps the language they started with.
  return next === home
    ? { showTranslation: false, translationLang: home, translationHome: home }
    : on(next);
}

/**
 * The languages in the order this reader's `T` will visit them, for the hint
 * under the ayah. Their own language leads, because that is the one the first
 * press shows.
 */
export function cycleOrder(home: TranslationLang): readonly TranslationLang[] {
  const start = known(home) ? home : TRANSLATION_LANGS[0]!;
  const at = TRANSLATION_LANGS.indexOf(start);
  return TRANSLATION_LANGS.map((_, i) => TRANSLATION_LANGS[(at + i) % TRANSLATION_LANGS.length]!);
}
