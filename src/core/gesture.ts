/**
 * What a touch MEANT. No DOM, no listeners, no state -- given where a finger
 * started, where it ended and how long it took, this says whether the reader
 * asked for the next ayah, the previous one, or nothing at all.
 *
 * It lives in core/ for the same reason the scoring does: the decision is the
 * part that can be wrong in ways nobody notices for weeks. A threshold that is
 * fifteen pixels too low does not throw, it just banks verses the reader never
 * meant to read -- and a verse credits the moment you move forward off it and
 * can never be un-credited. So the arithmetic is here, pure and tested, and
 * ui/gestures.ts is left holding nothing but event plumbing.
 *
 * ## Direction
 *
 * Forward is rightward here, on every input that has a side to it: a rightward
 * swipe is `next`, the right side of the frame is `next`, `ArrowRight` is
 * `next` (see main.ts), and the forward button sits on the right.
 *
 * The text is RTL and the book turns the other way, and an earlier version of
 * this file mirrored the touch controls to match it. It read correctly to
 * anyone holding a mushaf and backwards to everyone else, because a tap zone
 * has no page edge to give the game away -- the only thing a reader has to go
 * on is the side, and every other app on their phone has already taught them
 * which side is forward. So the sides follow the phone, not the book.
 *
 * The one place the book still shows is the slide (see ui/slide.ts): `next`
 * sends the ayah out to the right, the way a page leaves under a thumb.
 */

/** Which way a gesture asked the reader to move, if it asked at all. */
export type Move = 'next' | 'prev' | 'none';

export interface Point {
  x: number;
  y: number;
}

/* ------------------------------------------------------------- swipe */

/**
 * How far a finger must travel before it counts. Deliberately generous: the
 * cost of a false positive here is a verse banked that was never read, and the
 * cost of a false negative is that you swipe again.
 */
export const SWIPE_MIN_PX = 60;

/**
 * And how fast, in px/ms. Distance alone lets a slow thumb-drag across the
 * screen -- someone repositioning their grip, or steadying the phone -- read as
 * a page turn. 0.15 px/ms is 60px in 400ms: a lazy flick still clears it, a
 * deliberate drag does not.
 */
export const SWIPE_MIN_VELOCITY = 0.15;

/**
 * A gesture that has been going this long is not a swipe any more, whatever it
 * ends up doing. This is what stops a finger parked on the screen for a second
 * and then thrown from turning the page.
 */
export const SWIPE_MAX_MS = 800;

/**
 * How much a swipe must beat its own vertical travel by. The translation box
 * under the ayah scrolls, and a thumb dragging it is never perfectly vertical;
 * without this, every scroll would also be a half-hearted page turn.
 */
export const SWIPE_AXIS_RATIO = 1.4;

/**
 * The furthest the ayah is allowed to follow the finger before the threshold is
 * crossed. Not a scroll -- a hint that the gesture has been noticed. The ayah is
 * held still on purpose in this app; letting it slide the full width of the
 * screen under a thumb would undo the one thing the reader is built around.
 */
export const DRAG_CAP_PX = 40;

/**
 * Decides a completed swipe.
 *
 * Vertical travel is measured but never acted on: there is nothing above or
 * below the ayah to go to, so an up-swipe is not a gesture with no handler, it
 * is a scroll that happened to start here and must be left alone.
 */
export function swipe(start: Point, end: Point, elapsedMs: number): Move {
  if (elapsedMs > SWIPE_MAX_MS) return 'none';

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const travel = Math.abs(dx);

  if (travel < SWIPE_MIN_PX) return 'none';
  if (travel < Math.abs(dy) * SWIPE_AXIS_RATIO) return 'none';
  // Guard the divide: a zero-length gesture cannot reach here (travel is
  // already past the threshold), but a clock that did not tick could.
  if (elapsedMs > 0 && travel / elapsedMs < SWIPE_MIN_VELOCITY) return 'none';

  return dx > 0 ? 'next' : 'prev';
}

/**
 * Where the ayah sits mid-gesture: the finger's travel, damped so it asymptotes
 * at `DRAG_CAP_PX` instead of tracking one-to-one.
 *
 * `tanh` rather than a hard clamp, because a clamp has a corner in it -- the
 * ayah moves with your finger and then abruptly stops dead, which reads as the
 * gesture having failed. This just runs out of give. It is tuned so that by the
 * time the swipe threshold is crossed the ayah is already at ~90% of its
 * travel, so "as far as it goes" and "far enough to count" are the same
 * feeling.
 */
export function drag(dx: number, cap: number = DRAG_CAP_PX): number {
  if (cap <= 0) return 0;
  return Math.sign(dx) * cap * Math.tanh(Math.abs(dx) / cap);
}

/* --------------------------------------------------------------- tap */

/** The furthest a finger may move and still be a tap rather than a swipe. */
export const TAP_MAX_PX = 10;

/** And the longest it may rest. Past this it is a press, which means something else. */
export const TAP_MAX_MS = 400;

/**
 * The share of the frame's width, centred, that does nothing at all.
 *
 * Two live halves meeting at a seam would mean every point in the reading area
 * turns a page, with the two most damaging outcomes -- forward and back --
 * adjacent across a line the reader cannot see. The dead band is where a thumb
 * can rest, where a pinch can start, and where a mis-aimed tap costs nothing.
 */
export const TAP_DEAD_BAND = 0.16;

/**
 * Whether a scroll this recent disqualifies a tap. Lifting off the translation
 * after flicking it registers as a tap on whatever is underneath; this ignores
 * taps in the wake of one.
 */
export const SCROLL_QUIET_MS = 300;

/**
 * Which zone of a frame `x` px wide was tapped. The right of the frame is
 * forward, the left is back, and the middle is nothing -- the side a reader
 * arrives already knowing, from every other app on the phone.
 */
export function tapZone(x: number, width: number): Move {
  if (width <= 0) return 'none';
  const fraction = x / width;
  if (fraction < 0 || fraction > 1) return 'none';

  const edge = (1 - TAP_DEAD_BAND) / 2;
  if (fraction < edge) return 'prev';
  if (fraction > 1 - edge) return 'next';
  return 'none';
}

/** Whether a touch that travelled `dx`,`dy` in `elapsedMs` was a tap at all. */
export function isTap(start: Point, end: Point, elapsedMs: number): boolean {
  if (elapsedMs > TAP_MAX_MS) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_MAX_PX;
}

/* ------------------------------------------------------------- pinch */

/** The same floor and ceiling `[` and `]` obey, so the two controls cannot disagree. */
export const SIZE_MIN = 24;
export const SIZE_MAX = 200;

/**
 * How far two fingers must separate before a two-finger touch is treated as a
 * pinch rather than as a two-fingered scroll. In px of change in the distance
 * between them.
 */
export const PINCH_MIN_PX = 12;

/**
 * The Arabic size a pinch of `scale` lands on, from the size it started at.
 *
 * Rounded to a whole px and clamped to the same range the keyboard uses. Scale
 * is applied to the size the gesture STARTED from, never accumulated frame to
 * frame -- accumulating multiplies rounding error by the frame rate, and a
 * pinch out and back would not return to where it began.
 */
export function pinchSize(startSize: number, scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return clampSize(startSize);
  return clampSize(Math.round(startSize * scale));
}

export function clampSize(size: number): number {
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size)));
}
