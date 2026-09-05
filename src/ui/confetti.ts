/**
 * The one loud thing in the app.
 *
 * Hand-rolled on a throwaway canvas rather than pulled from a library: the
 * README publishes an exact byte budget and this is worth about a kilobyte,
 * where the smallest package for it is seven. One canvas is also cheaper than
 * two hundred DOM nodes at 200 particles, and it leaves nothing behind.
 *
 * Colours come from the live theme -- the accent plus two neutrals -- so the
 * burst belongs to the surface it lands on. Under `paper` and the black accent
 * that reduces to warm page-scraps drifting over cream, which is the best of
 * the four cases rather than a degraded one.
 */

/** Rectangles, not circles: a tumbling rectangle reads as paper, a dot as a dot. */
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number;
  /** Rotation and its rate, in radians. */
  rot: number; vrot: number;
  /** Phase of the edge-on flip, which is what makes it tumble rather than spin. */
  flip: number; vflip: number;
  color: string;
}

const GRAVITY = 340;
const DRAG = 0.86;
/** Particles stop being drawn after this; the canvas goes soon after. */
const LIFE_MS = 2500;
const FADE_MS = 600;

export const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** The accent and two neutrals, read off the root the moment the burst starts. */
function palette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string) => cs.getPropertyValue(name).trim();
  return [pick('--accent'), pick('--muted'), pick('--hairline')].filter((c) => c !== '');
}

/**
 * Drops `count` particles from just above the top edge and lets them fall.
 *
 * Returns a function that removes the canvas early. It removes itself anyway;
 * the handle is for the caller who leaves fullscreen mid-burst and would
 * otherwise leave a canvas painting over nothing.
 */
export function confetti(count: number): () => void {
  if (prefersReducedMotion()) return () => {};

  const canvas = document.createElement('canvas');
  // Above the modal layer (30) so a burst is never painted under a panel, and
  // inert: nothing here may intercept a tap meant for the ayah underneath.
  //
  // width/height are explicit and not left to `inset: 0`. A canvas is a
  // REPLACED element: with auto dimensions it takes its intrinsic 300x150 and
  // ignores the box the insets describe, so the whole burst would have been
  // squeezed into a small rectangle in the corner.
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:40;pointer-events:none';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return () => {};
  // Neither bail above has appended anything, so neither leaves a node behind.

  let raf = 0;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    canvas.remove();
  };

  let w = 0;
  let h = 0;
  /**
   * The canvas is `inset: 0` on a fixed element, so its own box IS the
   * viewport. Measuring that rather than `window.innerWidth` means the burst
   * is sized by the same layout the reader is looking at, and it needs no
   * separate answer for the mobile URL bar or a zoomed visual viewport. The
   * window is only the fallback for a browser that hands back a zero rect.
   */
  function size(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = rect.width || window.innerWidth;
    h = rect.height || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  document.body.append(canvas);
  size();
  window.addEventListener('resize', size);

  const colors = palette();
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const parts: Particle[] = Array.from({ length: count }, () => ({
    x: rand(0, w),
    // Staggered above the fold, so the burst arrives as a fall rather than as
    // a single rank crossing the top edge together.
    y: rand(-h * 0.55, -12),
    vx: rand(-46, 46),
    vy: rand(90, 210),
    w: rand(5, 9),
    h: rand(8, 14),
    rot: rand(0, Math.PI * 2),
    vrot: rand(-3.4, 3.4),
    flip: rand(0, Math.PI * 2),
    vflip: rand(3, 7),
    color: colors[Math.floor(Math.random() * colors.length)] ?? '#888',
  }));

  let elapsed = 0;
  let last = performance.now();

  const frame = (now: number): void => {
    // Clamped: a backgrounded tab hands back a delta of many seconds, which
    // would teleport every particle past the fold in one step.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt * 1000;

    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = elapsed > LIFE_MS - FADE_MS
      ? Math.max(0, (LIFE_MS - elapsed) / FADE_MS)
      : 1;

    let visible = 0;
    for (const p of parts) {
      p.vy += GRAVITY * dt;
      p.vx *= 1 - (1 - DRAG) * dt * 6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.flip += p.vflip * dt;
      if (p.y - p.h > h) continue;
      visible++;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Scaling the height by the flip's cosine turns the rectangle edge-on
      // and back. It is the whole tumble, and it costs one cosine.
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (visible === 0 || elapsed >= LIFE_MS) { stop(); return; }
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return stop;
}
