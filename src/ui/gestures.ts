/**
 * Touch plumbing. Every decision this makes it asks core/gesture.ts for; what
 * is left here is listeners, geometry and the two browser quirks that stand
 * between a pinch and a text size.
 *
 * Nothing in this file runs on a desktop. It is attached only behind the
 * capability checks below, so a mouse-and-keyboard reader's code path is the
 * one it was before any of this existed.
 */
import {
  PINCH_MIN_PX, SCROLL_QUIET_MS, drag, isTap, isTwoFingerTap, pinchSize, swipe, tapZone,
  type Move, type Point,
} from '../core/gesture.ts';

/**
 * Swipe and pinch go to anything with a coarse pointer -- a phone, a tablet, a
 * touchscreen laptop. They are additive: a device that also has a mouse loses
 * nothing by understanding a flick as well.
 */
export const touchCapable = (): boolean =>
  window.matchMedia?.('(pointer: coarse)').matches ?? false;

/**
 * Tap zones are held to a tighter test, because they are the one gesture with a
 * cost. A tap forward credits the verse it leaves, permanently, and on a
 * touchscreen laptop at 1440px a stray mouse click landing in the reading area
 * would do it silently. Phones and tablets only.
 */
export const tapZonesWanted = (): boolean =>
  window.matchMedia?.('(pointer: coarse) and (max-width: 1024px)').matches ?? false;

/**
 * How far from the left edge of the window a swipe must begin.
 *
 * A rightward drag from the very edge is the system's own back-navigation on
 * iOS and on Android, and it is not ours to take -- preventDefault does not
 * reliably reach it. A rightward drag is also `next`, which is the swipe a
 * reader makes most, so this is the difference between a page turn and leaving
 * the app. Started further in, the gesture is ours.
 */
const EDGE_GUARD_PX = 24;

/** How far a finger travels before this decides whether it is a swipe or a scroll. */
const AXIS_LOCK_PX = 8;

/** A swipe ends over a button often enough that the click it produces must be eaten. */
const CLICK_GUARD_MS = 400;

export interface GestureCallbacks {
  /** A completed swipe or tap. Same vocabulary the core speaks. */
  onMove: (move: Move) => void;
  /** Live position of the ayah under the finger; `null` puts it back. */
  onDrag: (px: number | null) => void;
  /** Live Arabic size during a pinch, already clamped. */
  onSize: (px: number) => void;
  /** The pinch is over and the size it landed on is final. */
  onSizeSettled: () => void;
  /** A two-finger tap over the frame: turn the translation on or off. */
  onCycleTranslation: () => void;
  /** The Arabic size a pinch should scale from. */
  arabicSize: () => number;
  /** True while a panel or the drawer is open, when nothing here applies. */
  blocked: () => boolean;
}

export interface GestureTargets {
  /** Where swipes are read: the whole reading column, or the overlay. */
  surface: HTMLElement;
  /** What tap zones divide, and the only place native zoom is refused. */
  frame: HTMLElement;
  /**
   * Whether this surface wants tap zones, asked at the moment of the tap
   * rather than once at boot: the answer turns on viewport width, and a phone
   * rotated into landscape is a different width than the one it started in.
   */
  taps: () => boolean;
}

const dist = (a: Touch, b: Touch): number => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const pointOf = (t: Touch): Point => ({ x: t.clientX, y: t.clientY });

/**
 * Wires one surface up and hands back the way to unwire it.
 *
 * Everything is registered non-passively, because both of the things this has
 * to stop -- the page panning under a swipe, and the browser zooming under a
 * pinch -- can only be stopped by a preventDefault the browser was willing to
 * wait for.
 */
export function attachGestures(t: GestureTargets, cb: GestureCallbacks): () => void {
  const { surface, frame } = t;

  let start: Point | null = null;
  let startAt = 0;
  /** Whether the gesture began inside the ayah frame; taps and pinches need it. */
  let inFrame = false;
  /** Set once the finger has committed to an axis, so a scroll is never re-judged. */
  let axis: 'x' | 'y' | null = null;
  /**
   * A two-finger touch in progress. `spread` is the largest change in finger
   * separation seen so far: while it stays under `PINCH_MIN_PX` the gesture is
   * still a candidate two-finger tap, and once it crosses it has committed to
   * being a pinch and cannot go back.
   */
  let pinch: { span: number; from: number; startAt: number; spread: number } | null = null;
  let scrolledAt = 0;
  let swipedAt = 0;
  /** Coalesces a pinch to one repaint per frame however fast the fingers move. */
  let sizeFrame = 0;
  let pendingSize = 0;

  const reset = (): void => {
    start = null;
    axis = null;
    pinch = null;
    cb.onDrag(null);
  };

  const within = (el: HTMLElement, x: number, y: number): boolean => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const pushSize = (px: number): void => {
    pendingSize = px;
    if (sizeFrame !== 0) return;
    sizeFrame = requestAnimationFrame(() => {
      sizeFrame = 0;
      cb.onSize(pendingSize);
    });
  };

  const onTouchStart = (e: TouchEvent): void => {
    if (cb.blocked()) { reset(); return; }

    const [a, b] = [e.touches[0], e.touches[1]];
    if (e.touches.length === 2 && a && b) {
      // A pinch anywhere else on the page is the reader zooming the browser,
      // which is theirs to do. Only over the ayah does it mean text size.
      if (!within(frame, a.clientX, a.clientY) && !within(frame, b.clientX, b.clientY)) return;
      cb.onDrag(null);
      start = null;
      axis = null;
      pinch = { span: dist(a, b), from: cb.arabicSize(), startAt: e.timeStamp, spread: 0 };
      return;
    }

    if (e.touches.length !== 1 || !a) { reset(); return; }
    if (a.clientX < EDGE_GUARD_PX) { reset(); return; }

    start = pointOf(a);
    startAt = e.timeStamp;
    inFrame = within(frame, a.clientX, a.clientY);
    axis = null;
    pinch = null;
  };

  const onTouchMove = (e: TouchEvent): void => {
    if (cb.blocked()) return;

    const [a, b] = [e.touches[0], e.touches[1]];
    if (pinch !== null) {
      if (e.touches.length < 2 || !a || !b) return;
      // Refusing the default here is the whole of "pinch means text size":
      // without it the browser zooms the page underneath and the reader gets
      // both at once.
      e.preventDefault();
      const span = dist(a, b);
      if (pinch.span <= 0) return;
      pinch.spread = Math.max(pinch.spread, Math.abs(span - pinch.span));
      // Under the threshold the fingers have not clearly spread yet, so this is
      // still a possible two-finger tap -- don't nudge the size out from under
      // it. Once crossed, it is a pinch for the rest of the gesture.
      if (pinch.spread < PINCH_MIN_PX) return;
      pushSize(pinchSize(pinch.from, span / pinch.span));
      return;
    }

    if (start === null || !a) return;
    const dx = a.clientX - start.x;
    const dy = a.clientY - start.y;

    if (axis === null) {
      if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
      // Decided once, and never revisited. A thumb flicking the translation
      // drifts sideways as it goes; re-judging every frame would let a scroll
      // turn into a page turn half way down.
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis !== 'x') return;

    e.preventDefault();
    cb.onDrag(drag(dx));
  };

  const onTouchEnd = (e: TouchEvent): void => {
    if (pinch !== null) {
      // Still a finger down: the other one lifting does not end the pinch, but
      // what remains must not then be read as the start of a swipe.
      if (e.touches.length >= 1) { start = null; axis = null; return; }
      const wasTap = isTwoFingerTap(pinch.spread, e.timeStamp - pinch.startAt);
      // The fingers never spread far enough to pinch, so no size was ever
      // pushed -- there is nothing to settle either way.
      const pinched = pinch.spread >= PINCH_MIN_PX;
      pinch = null;
      if (sizeFrame !== 0) {
        cancelAnimationFrame(sizeFrame);
        sizeFrame = 0;
        if (pinched) cb.onSize(pendingSize);
      }
      if (wasTap) {
        if (!cb.blocked()) cb.onCycleTranslation();
        return;
      }
      if (pinched) cb.onSizeSettled();
      return;
    }

    const from = start;
    const touch = e.changedTouches[0];
    const lockedX = axis === 'x';
    reset();
    if (from === null || !touch || cb.blocked()) return;

    const end = pointOf(touch);
    const elapsed = e.timeStamp - startAt;

    if (lockedX) {
      const move = swipe(from, end, elapsed);
      if (move !== 'none') {
        swipedAt = e.timeStamp;
        cb.onMove(move);
      }
      return;
    }

    if (!inFrame || !t.taps()) return;
    if (!isTap(from, end, elapsed)) return;
    // Lifting off a translation that is still coasting reads as a tap on
    // whatever is underneath it. In the wake of a scroll, it is not one.
    if (e.timeStamp - scrolledAt < SCROLL_QUIET_MS) return;

    const r = frame.getBoundingClientRect();
    const move = tapZone(end.x - r.left, r.width);
    if (move !== 'none') cb.onMove(move);
  };

  const onScroll = (e: Event): void => { scrolledAt = e.timeStamp; };

  /**
   * A swipe that ends over the nav arrows -- or over the overlay's own tap
   * halves -- produces a click on top of the move it already made, which steps
   * twice. This eats it. Capture phase, so it never reaches the button.
   */
  const onClick = (e: MouseEvent): void => {
    if (e.timeStamp - swipedAt >= CLICK_GUARD_MS) return;
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Safari's own pinch, which is not a touch event and does not answer to
   * `touch-action`. Refusing it over the frame is the only way to stop iOS
   * zooming the page while the fingers are also setting the Arabic size.
   */
  const onGesture = (e: Event): void => {
    if (cb.blocked()) return;
    e.preventDefault();
  };

  surface.addEventListener('touchstart', onTouchStart, { passive: false });
  surface.addEventListener('touchmove', onTouchMove, { passive: false });
  surface.addEventListener('touchend', onTouchEnd, { passive: false });
  surface.addEventListener('touchcancel', reset, { passive: true });
  surface.addEventListener('scroll', onScroll, { capture: true, passive: true });
  surface.addEventListener('click', onClick, { capture: true });
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    frame.addEventListener(name, onGesture, { passive: false });
  }

  return () => {
    if (sizeFrame !== 0) cancelAnimationFrame(sizeFrame);
    surface.removeEventListener('touchstart', onTouchStart);
    surface.removeEventListener('touchmove', onTouchMove);
    surface.removeEventListener('touchend', onTouchEnd);
    surface.removeEventListener('touchcancel', reset);
    surface.removeEventListener('scroll', onScroll, { capture: true });
    surface.removeEventListener('click', onClick, { capture: true });
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
      frame.removeEventListener(name, onGesture);
    }
  };
}
