/**
 * Splitting one ayah across several screens.
 *
 * Holding the type at one size is what makes moving between ayat feel still --
 * a size that changes with the verse restyles and reflows the frame on every
 * move. But some ayat do not fit a screen at a readable size, and 2:282 does
 * not fit at any size worth reading. Shrinking to fit trades the stillness
 * away; scrolling asks for a gesture nobody on a sofa has. So a long ayah is
 * read in parts instead, a screenful at a time, at the same size as every
 * other ayah.
 *
 * The split is by whole words and nothing else. It carries no claim about
 * where an ayah may be paused -- that is what the waqf marks in the text are
 * for, and a reader who knows them can see them. This only decides how much
 * ink fits, so it must never be shown as anything more than a page break.
 */

/**
 * The line box the Arabic is set on, as a multiple of its font size. It is the
 * `line-height` on `.ayah__text` and has to stay in step with it: this is the
 * one number that turns a frame's height into a type size.
 */
export const ARABIC_LINE = 1.9;

/**
 * The size the Arabic is PAINTED at in a frame `available` px tall, given the
 * size the reader chose.
 *
 * Paging is what makes a long ayah fit a frame, and it cannot help with a
 * short one: a single word already occupies a whole line, and no split makes
 * that line shorter. A phone rotated into landscape is the case -- the column
 * has ~390px to give and the frame comes out around a fifth of that, while the
 * size was chosen by a pinch in portrait against a frame three times taller.
 * Left alone the verse is simply drawn over the header and the translation.
 *
 * This is a cap, not the shrink-to-fit that the module above argues against,
 * and the difference is where the input comes from. A measure-and-shrink pass
 * reads a height that its own output moves, so it can oscillate. The frame
 * here does not move with the type: it is `flex: 1` in a column whose every
 * other band is sized from the settings, so the same window always yields the
 * same cap, and the cap is computed once from a height the type cannot change.
 *
 * The reader's setting is never written to. It is what portrait still paints,
 * what the panel still shows, and what a pinch still moves -- rotating back
 * gives the size back, whole. A frame too short for even the smallest readable
 * size gets that size and overflows: there is nothing below it worth showing.
 *
 * `available` is null when there is no box to measure yet -- painted before
 * layout, or while the overlay has the screen -- and the size is then painted
 * as asked, the way the pager shows the ayah whole until there is something to
 * split it against. A measured zero is the opposite answer and must not be
 * confused with it: the column really has nothing left to give, and the reply
 * to that is the smallest readable size, not the largest.
 */
export function fittedSize(size: number, available: number | null, min: number): number {
  if (available === null) return size;
  return Math.max(min, Math.min(size, Math.floor(available / ARABIC_LINE)));
}

/**
 * The largest whole px at or under `want` at which `chars` characters of this
 * script wrap into `boxW` x `boxH`. Never below `min`.
 *
 * Reckoned, not measured, and that is the whole point. The obvious version sets
 * a size, reads the height back, and bisects -- and it cannot be trusted,
 * because a browser flushes layout for a READ and a style write between two
 * reads inside one task can be folded into a flush that has already happened.
 * Every probe after the first then answers about the size before it. The
 * symptom is not a crash but a confident wrong number: one verse shrunk to the
 * floor though it fitted, the next left at full size though it did not, the
 * answer depending on which verse happened to be on screen before it.
 *
 * `boxW` and `boxH` are still measured, and safely: neither moves with the size
 * this returns. The width is the column, the height is reserved from the size
 * the READER chose. Only the count of lines is reckoned, and only that needs to
 * be, because it is the one quantity the type is allowed to move.
 *
 * The estimate is a line count from an average character width, so it is an
 * estimate: prose is ragged, a long word can break a line early, and the answer
 * can be out by a line either way. That is why the caller still marks a cut.
 *
 * Walked down rather than bisected. The range is the twenty-nine sizes the
 * panel offers, the test is arithmetic, and walking gives the largest size that
 * fits even where rounding makes `fits` non-monotone for a size or two -- which
 * bisection would sail straight past.
 */
export function fittedTranslationSize(
  want: number, min: number, chars: number, boxW: number, boxH: number,
  lead: number, advance: number,
): number {
  // Nothing to fit, or nothing measured to fit it into. Leave the size alone
  // rather than shrink to a floor on the strength of a zero.
  if (chars <= 0 || boxW <= 0 || boxH <= 0 || advance <= 0 || lead <= 0) return want;
  const fits = (px: number): boolean => {
    const perLine = Math.max(1, Math.floor(boxW / (px * advance)));
    return Math.ceil(chars / perLine) * px * lead <= boxH;
  };
  // The chosen size first, and unrounded: it is not a candidate to be searched
  // for but the answer whenever it works, and a script scaled to 26.1px should
  // be set at 26.1px rather than shaved to 26 for the sake of the loop below.
  if (fits(want)) return want;
  for (let px = Math.floor(want); px > min; px -= 1) if (fits(px)) return px;
  return min;
}

/**
 * The fewest runs of whole words that each satisfy `fits`, in order. `fits` is
 * asked about candidate runs and must be monotone: if a run fits, every prefix
 * of it fits too. Height of wrapped text is, which is what lets each run be
 * found by bisection rather than by growing a word at a time.
 *
 * A single word that will not fit alone is still emitted on its own page --
 * the alternative is a page holding nothing and a loop that never ends.
 */
export function paginate(text: string, fits: (run: string) => boolean): string[] {
  const words = text.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [text];

  const pages: string[] = [];
  let start = 0;
  while (start < words.length) {
    let lo = start + 1;
    let hi = words.length;
    let end = start + 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(words.slice(start, mid).join(' '))) { end = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    pages.push(words.slice(start, end).join(' '));
    start = end;
  }
  return pages;
}
