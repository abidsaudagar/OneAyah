/**
 * How long a screenful is held before auto-advance turns it.
 *
 * The whole point of the feature is that a reader with the phone propped on a
 * shelf, or the laptop pushed to the far end of the table, never has to reach
 * for it. That only works if the hold is EARNED BY THE WORDS. A fixed dwell
 * cannot be right twice: five seconds is a yawn on `ٱلرَّحْمَٰنِ ٱلرَّحِيمِ`
 * and a snatched glimpse of 2:255. So the time comes from what is actually on
 * screen, and the reader's dial only scales it.
 *
 * ## Why letters as well as words
 *
 * Word count alone is too blunt for Arabic: `مِن` and `وَٱلْمُسْتَغْفِرِينَ`
 * are one word each and nothing like the same amount of reading. So a screenful
 * costs a fixed amount per word -- the eye's jump, and the beat a waqf mark
 * asks for -- plus an amount per letter, which is where the actual length lives.
 * Across the whole Qur'an that averages 4.21 letters a word, so the two terms
 * sit at roughly 40/60 on a typical verse and the model only diverges from a
 * plain word count where it should: on the long words.
 *
 * Diacritics do not count. The Uthmani text carries full tashkīl and the
 * Indo-Pak text carries its own annotation signs and joiners; neither is a
 * letter you stop on, and counting them would make the same verse take a
 * different time in the two scripts.
 *
 * ## Why nothing here measures the box
 *
 * ui/pages.ts already decided how much fits; this only asks how long what fits
 * takes. Keeping the two apart is what lets this be a pure function with real
 * tests, and it means a dwell can be computed before the browser has painted
 * anything.
 */
import { AUTO_SPEEDS, DEFAULT_AUTO_SPEED } from '../types.ts';

/**
 * Tashkīl, the Qur'anic annotation signs, tatweel, and the zero-width joiners
 * the Indo-Pak text uses to shape its ligatures. All of it is ink the eye
 * reads THROUGH, not letters it reads.
 */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ​-‏﻿]/g;

/**
 * The four rates the model is made of, at speed 1.
 *
 * They are anchored on recitation rather than on silent reading, because that
 * is what someone holding an ayah still on a screen across the room is most
 * often doing. At 1x the basmala gets 5.1s and Al-Fātiḥah's last ayah 10.8s,
 * which is a measured, unhurried tartīl; the average ayah lands near 12s. A
 * reader who only wants the words in front of their eyes turns the dial up and
 * gets the same shape faster.
 */
const BASE_MS = 1300;
const ARABIC_MS_PER_WORD = 380;
const ARABIC_MS_PER_LETTER = 115;
/** ~165 words a minute: the English is a gloss being taken in, not studied. */
const ENGLISH_MS_PER_WORD = 360;

/**
 * The floor exists for `الم` at 2.5x, where the arithmetic asks for less than a
 * second and the slide itself is 240ms of that. Below this the ayah would be
 * gone before the eye had found it.
 */
export const MIN_DWELL_MS = 2_200;

/**
 * And the ceiling for 2:282 with the translation on, whose English alone is 227
 * words. Nothing automatic can serve that verse well -- it is the one the whole
 * paging machinery exists for -- so the dwell stops growing at a minute and the
 * reader is expected to reach for `P`. A cap that high never fires on anything
 * else: the longest single screenful of Arabic asks for about 25s.
 */
export const MAX_DWELL_MS = 60_000;

/** The corpus average, used only for the words-a-minute the settings panel shows. */
const AVG_LETTERS_PER_WORD = 4.21;
/** And the average ayah, so the panel's figure carries its share of BASE_MS. */
const AVG_WORDS_PER_AYAH = 12.49;

const countWords = (s: string): number => (s.match(/\S+/g) ?? []).length;

/** Letters, with every mark and joiner taken out first. */
export const countArabicLetters = (s: string): number =>
  (s.replace(MARKS, '').match(/\S/g) ?? []).length;

export interface Dwell {
  /**
   * The Arabic actually on screen. For an ayah too long for the frame this is
   * the CURRENT PART, not the whole verse -- each part is turned on its own and
   * so earns its own time.
   */
  arabic: string;
  /**
   * The English the reader still has to take in, or '' when there is none.
   *
   * The caller passes '' on every part after the first: the translation is the
   * meaning of the whole ayah and is deliberately held still while the parts
   * turn under it, so it is read once, on arrival, and paying for it again on
   * part four would strand the reader in front of English they finished
   * three screens ago.
   */
  translation: string;
  /** The reader's dial. Higher is faster; see AUTO_SPEEDS. */
  speed: number;
}

/** How long this screenful is held, in ms. */
export function dwellMs({ arabic, translation, speed }: Dwell): number {
  const content = countWords(arabic) * ARABIC_MS_PER_WORD
    + countArabicLetters(arabic) * ARABIC_MS_PER_LETTER
    + countWords(translation) * ENGLISH_MS_PER_WORD;

  // The dial scales the base too. It is the beat between verses, and a reader
  // who has asked to go faster meant that beat as well as the words.
  const scaled = (BASE_MS + content) / (speed > 0 ? speed : 1);
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, Math.round(scaled)));
}

/**
 * The dial as a figure a reader can picture: Arabic words a minute on an
 * average ayah, BASE_MS included, since that is time they spend too.
 */
export function arabicWordsPerMinute(speed: number): number {
  const perWord = ARABIC_MS_PER_WORD + AVG_LETTERS_PER_WORD * ARABIC_MS_PER_LETTER;
  const perAyah = BASE_MS + AVG_WORDS_PER_AYAH * perWord;
  return Math.round((AVG_WORDS_PER_AYAH * 60_000 * speed) / perAyah);
}

/* -------------------------------------------------------------------- dial */

/**
 * The nearest rung of AUTO_SPEEDS to `n`, and the default for anything that is
 * not a usable number at all.
 *
 * Every value that reaches the settings comes through here, so a hand-edited
 * backup carrying `autoAdvanceSpeed: 400` cannot leave a reader watching the
 * Qur'an flicker past with no obvious way to slow it down -- and one carrying
 * `0` cannot leave them on an ayah that never turns.
 */
export function snapSpeed(n: unknown): number {
  // Asked strictly, not through Number(): `Number(null)` is 0, which would snap
  // an absent value to the SLOWEST rung rather than to the default -- and a
  // missing key is exactly what an older backup has.
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_AUTO_SPEED;
  let best = AUTO_SPEEDS[0]!;
  for (const s of AUTO_SPEEDS) {
    if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  }
  return best;
}

/** One rung along the ladder, stopping at either end rather than wrapping. */
export function stepSpeed(current: number, direction: 1 | -1): number {
  const i = AUTO_SPEEDS.indexOf(snapSpeed(current));
  return AUTO_SPEEDS[Math.min(AUTO_SPEEDS.length - 1, Math.max(0, i + direction))]!;
}
