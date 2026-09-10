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

### 2. The band scrolls, and its last line fades to say so
The band used to clip silently. Setting the type SMALLER until it fit was tried
first and taken back out: it meant that raising the translation size did nothing
on exactly the verses where raising it was the point, which reads as the text
being hidden all over again. The type is now always the size the reader chose.

What will not fit scrolls, and the last line fades away rather than stopping
dead -- which says both of the things a reader needs: that there is more of
this, and that the band will move if they ask it to. The fade follows the
scroll: bottom edge while there is more below, top edge once the end is in view,
both while in the middle.

At the default size on a 1440x900 window it appears on 1.6% of English verses
(97 of 6236, worst 3.2x the band) and 9.5% of Urdu (592, worst 4x). Before any
of this, a long Urdu verse showed 2 of its 16 lines with nothing to say so; the
band now reserves a fixed number of LINES per script rather than a fixed number
of pixels, so Urdu gets the same four English gets.

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

### 4. Auto-advance runs while the reader is still scrolling
`dwellMs` counts the translation's words, so the hold is generous -- but on the
one verse in ten where the Urdu overruns its band, the reader has to scroll it
WHILE the timer runs, and the turn puts the next translation back at line one.
Either hold longer when the band has more in it, or do not turn until it has
been read to the end.

### 5. Nothing scrolls the translation in fullscreen without a pointer
The fading line says there is more; a wheel and a finger can reach it, and a
keyboard and a TV remote -- the two inputs fullscreen exists for -- cannot. The
arrows are spoken for: they move verses.

### 6. Urdu is charged the English reading rate
[`src/core/dwell.ts`](src/core/dwell.ts) bills `ENGLISH_MS_PER_WORD` for both
languages. Urdu carries more per word, so its dwell is probably short.

### 7. Part counts run away at large Arabic sizes
128px Arabic on a 1280px screen makes 2:282 `PART 1 OF 35` in fullscreen and
`part 1 of 141` in a small window -- two or three words a screen. Nothing warns
the reader that the size they just chose turned one verse into a hundred
screenfuls.

### 8. One text size, every form factor
`arabicSize` is a single stored number, so a reader who narrows a desktop window
-- or opens the app on a phone in the same browser profile -- keeps 128px and
gets ninety parts. The "start a phone on 45px" commit only reaches a FRESH
install.

## Improvements

### 9. The translation-size stepper lies about its step
The panel shows the SCALED px, so one press of `+` moves Urdu 26 -> 28 -> 29 ->
30. The setting steps by 1 and is then multiplied by 1.45, so the number the
reader is watching moves by one or two with no pattern they can see.

### 10. The soft edge smudges under nastaliq
Descenders from the line below show through the fade, which reads as a stain
rather than a soft edge. Clipping the box to whole lines would be cleaner.

### 11. The nav arrows are nearly invisible at rest
Very low contrast on the paper ground, and no affordance until the pointer is
already on them.

### 12. A task gets one layout flush, so measure-and-adjust loops lie
Worth knowing before writing another one. In Chrome 152, writing a style and
reading a layout property repeatedly inside ONE task does not re-flush: the
first read flushes, and every later write in that task is invisible to every
later read. A synthetic `<div>` with a direct inline `font-size` reports the
same `offsetHeight` for 30px, 20px and 10px. Text mutations DO re-flush, which
is why `Pager` -- which writes `textContent` between reads -- works, and why an
attempt at fitting the translation by writing sizes and measuring them produced
confident wrong answers that depended on the previous verse. That approach is
gone; the entry above is kept because the trap is not.

Anything that needs to try several presentations and pick one must either
reckon it, the way `fittedSize` does for the Arabic, or spread the probes across
frames. A SINGLE measurement is always sound -- which is all the fade below the
translation needs, and why it is a scroll state rather than a fitted size.
