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
