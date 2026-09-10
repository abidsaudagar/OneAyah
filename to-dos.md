# To-dos

Found while working on the translation-truncation fix (2026-09-10), by driving
the app in a real browser at 1440x900, 1280x800, 768x1024, 900x400, 390x844 and
844x390. Each item says what was seen, where it lives, and why it matters.
Nothing here is speculative: every bug was reproduced, and the ones marked
*pre-existing* were confirmed against `main` with the working tree stashed.

## Done

### 1. A short non-touch window painted the ayah unsplit, over everything below
*Pre-existing. Was reproducible at 844x390 and 900x400 with no touch emulation.*

Every rule in the `@media (max-height: 560px)` block was gated on
`:root[data-touch]`, so a laptop window dragged short kept the full-height
header, nav and hints and 64px of frame under them -- which `.ayah`'s desktop
padding of 32px top and bottom then consumed whole. `availableHeight()` came to
**0**, the pager took its "no box to measure against" path and handed back the
ayah entire, and 365px of Arabic was drawn through a 64px box under a locator
reading `part 1 of 1`.

The block is about the WINDOW, not the pointer, and is no longer touch-gated.
900x400 now gets 160px of frame and `part 1 of 20`, everything inside its box.

### 2. Nothing on the reading screen scrolls, and the translation is set to fit
The band used to clip silently; the first fix gave it a scroll and a `more`
control, which was the wrong shape -- the reading screen should be still. Now
the translation is SET SMALLER until it fits, down to the same 12px floor the
panel offers, and `overflow` is `hidden` everywhere on the reading surface.
Zooming past what fits simply stops, which is the behaviour that was asked for.

Across all 6236 verses: **English 97.6%** at the chosen size, 2.4% set smaller
and whole, 1 verse cut. **Urdu 86.1%** at the chosen size, 13.6% set smaller and
whole, 14 verses cut. Before any of this, a long Urdu verse showed 2 of its 16
lines with nothing to say so.

### 3. Fullscreen kept a split it measured before it had been laid out
*Pre-existing, and the more interesting half of it is item 12 below.*

`enterFullscreen` appended the overlay and painted it in the same task, so the
pager measured an ayah still set in the body's 14px -- at which size the whole
of 2:282 "fitted" a TV screen and was painted unsplit, nine thousand pixels tall.
It stuck because `Pager`'s cache key read `probe.style.fontSize`, which is empty
in fullscreen (the overlay sizes the stack and the ayah inherits `1em`), so no
later repaint could miss the cache. The key now reads the COMPUTED size, and the
first repaint waits two animation frames.

## Bugs

### 4. Auto-advance and the fifteen verses that still get cut
`dwellMs` counts the translation's words, so the hold is generous, and now that
the type gives way instead of the text there is nothing to scroll while the
timer runs. What remains is the fifteen verses that do not fit even at the
floor: auto-advance will turn past the part of those the reader cannot see.

### 5. Urdu is charged the English reading rate
[`src/core/dwell.ts`](src/core/dwell.ts) bills `ENGLISH_MS_PER_WORD` for both
languages. Urdu carries more per word, so its dwell is probably short.

### 6. Part counts run away at large Arabic sizes
128px Arabic on a 1280px screen makes 2:282 `PART 1 OF 35` in fullscreen and
`part 1 of 141` in a small window -- two or three words a screen. Nothing warns
the reader that the size they just chose turned one verse into a hundred
screenfuls.

### 7. One text size, every form factor
`arabicSize` is a single stored number, so a reader who narrows a desktop window
-- or opens the app on a phone in the same browser profile -- keeps 128px and
gets ninety parts. The "start a phone on 45px" commit only reaches a FRESH
install.

## Improvements

### 8. The translation-size stepper now shows a ceiling, not a size
The panel says `26 px`, and on a long verse the type is set at 20px. That was
already a small lie (the number moves by 1 or 2 with no visible pattern, because
the setting steps by 1 and is multiplied by 1.45); it is a larger one now that
the size is a ceiling rather than the size. The row should say so.

### 9. The soft edge smudges under nastaliq
On the fifteen cut verses, descenders from the line below still show through the
fade, which reads as a stain rather than a cut. Clipping the box to whole lines
would be cleaner.

### 10. The nav arrows are nearly invisible at rest
Very low contrast on the paper ground, and no affordance until the pointer is
already on them.

### 11. The fit is an estimate, and could be a measurement
`fittedTranslationSize` reckons a line count from an average character width per
script (`advance` in `TRANSLATIONS`). It errs wide on purpose, so it sometimes
sets a verse one step smaller than it had to. A once-per-face calibration pass
-- measuring real strings at real widths and solving for `advance` -- would
tighten it. See item 12 for why it cannot simply measure and bisect.

### 12. A task gets one layout flush, so measure-and-adjust loops lie
Worth knowing before writing another one. In Chrome 152, writing a style and
reading a layout property repeatedly inside ONE task does not re-flush: the
first read flushes, and every later write in that task is invisible to every
later read. A synthetic `<div>` with a direct inline `font-size` reports the
same `offsetHeight` for 30px, 20px and 10px. Text mutations DO re-flush, which
is why `Pager` -- which writes `textContent` between reads -- works, and why the
first shot at fitting the translation, which only wrote styles, produced
confident wrong answers that depended on the previous verse.

Anything that needs to try several presentations and pick one must either
reckon it (`fittedSize`, `fittedTranslationSize`) or spread the probes across
frames. Measuring quantities that do not move with the thing being chosen --
the band's width and height, say -- is always safe.
