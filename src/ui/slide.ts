/**
 * The motion a step makes. Both the reader and the fullscreen overlay own one.
 *
 * ## What moves, and why so little
 *
 * The Arabic slides; nothing else does. The translation cross-fades in place on
 * a real ayah change and is left completely alone on a part turn -- it is the
 * meaning of the WHOLE ayah, deliberately held still while the parts turn under
 * it, and carrying it sideways every time a long verse pages would say the
 * English had changed when it has not. The locator, the nav and the metrics
 * never move at all.
 *
 * The travel is 34px, not a screen width. This app's whole argument is that the
 * ayah is held still; a full-width page-turn would make the motion the subject.
 * 34px and a fade is enough to say "that moved, and it moved that way", which
 * is the only thing the animation is for.
 *
 * ## Direction
 *
 * RTL, matching core/gesture.ts: `next` sends the ayah out to the RIGHT and
 * brings the new one in from the left, the way a mushaf turns. It agrees with
 * the keyboard by coincidence rather than by design -- `ArrowRight` is next and
 * next travels rightward -- which is why the arrow keys could be left alone.
 */

/** Which way the reader went; the same vocabulary core/gesture.ts speaks. */
export type SlideDir = 'next' | 'prev';

const TRAVEL_PX = 34;
const OUT_MS = 110;
const IN_MS = 130;
const FADE_MS = 150;

/** Into the exit: gathering speed, because the reader has already committed. */
const OUT_EASE = 'cubic-bezier(0.4, 0, 1, 1)';
/** Out of the entry: arriving and settling, which is where the ayah stays. */
const IN_EASE = 'cubic-bezier(0, 0, 0.2, 1)';

/**
 * Honoured in JS, not CSS. The global `prefers-reduced-motion` block in app.css
 * neutralises transitions and CSS animations, and the Web Animations API is
 * neither -- a duration passed to `element.animate()` is untouched by it. So
 * this is asked directly, on every step, so a preference changed mid-session
 * takes effect without a reload.
 */
const reduced = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export class Slide {
  private readonly text: HTMLElement;
  private readonly trans: HTMLElement | null;
  private anim: Animation | null = null;
  private fade: Animation | null = null;
  /**
   * Bumped by every new phase. An animation's `finished` settles a frame or two
   * after a replacement has already started, and without this its cleanup would
   * reach in and clear the inline opacity the NEW animation is relying on.
   */
  private gen = 0;

  constructor(text: HTMLElement, trans: HTMLElement | null = null) {
    this.text = text;
    this.trans = trans;
  }

  /**
   * Where the ayah sits while a finger is on it. `null` puts it back.
   *
   * Refused outright while a step is animating: the drag is a preview of a
   * gesture that has not been decided yet, and a decided one is already playing.
   */
  offset(px: number | null): void {
    if (this.anim !== null) return;
    this.text.style.transform = px === null || px === 0 ? '' : `translateX(${px.toFixed(1)}px)`;
  }

  /**
   * The half before the repaint: the ayah leaves. Resolves when the frame is
   * clear, which is when the caller may swap the text.
   *
   * The exit is held at its end state (`fill: 'forwards'`) rather than snapping
   * back, because the repaint lands in the gap between the two halves -- letting
   * it spring home first would show the new ayah at full opacity for a frame
   * before the entry started, which is the flicker this replaced.
   */
  async out(dir: SlideDir): Promise<void> {
    this.gen++;
    this.anim?.cancel();
    this.text.style.transform = '';

    if (reduced()) {
      this.anim = null;
      return;
    }

    const to = dir === 'next' ? TRAVEL_PX : -TRAVEL_PX;
    this.anim = this.text.animate(
      [{ transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${to}px)`, opacity: 0 }],
      { duration: OUT_MS, easing: OUT_EASE, fill: 'forwards' },
    );

    // A cancel rejects `finished`; that is a takeover by a faster reader, not a
    // failure, and the step it belongs to should carry straight on.
    try {
      await this.anim.finished;
    } catch {
      // Interrupted mid-exit. The newer step owns the element now.
    }
  }

  /**
   * The half after: the new ayah arrives from the far side.
   *
   * `ayahChanged` is what decides whether the translation cross-fades. On a part
   * turn it is false and the English is not touched -- same words, same place,
   * held still exactly as it is today while the Arabic pages under it.
   */
  enter(dir: SlideDir, ayahChanged: boolean): void {
    const mine = ++this.gen;
    // The exit's held end-state has to go before the entry's own keyframes can
    // apply, and cancelling it would show the element at rest for a frame -- so
    // the floor is pinned by hand first.
    this.text.style.opacity = '0';
    this.anim?.cancel();
    this.text.style.transform = '';

    if (reduced()) {
      this.settleText(mine);
      if (ayahChanged) this.crossFade(true);
      return;
    }

    const from = dir === 'next' ? -TRAVEL_PX : TRAVEL_PX;
    this.anim = this.text.animate(
      [{ transform: `translateX(${from}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 }],
      { duration: IN_MS, easing: IN_EASE },
    );
    const done = () => this.settleText(mine);
    this.anim.finished.then(done, done);

    if (ayahChanged) this.crossFade(false);
  }

  /**
   * The English, which does not travel. It has already been repainted by the
   * time this runs, so this is a fade UP from nothing rather than a true
   * cross-fade -- there is no old text left to fade out against, and at 150ms
   * against the Arabic's 130 the eye reads the pair as one movement anyway.
   */
  private crossFade(instant: boolean): void {
    const el = this.trans;
    if (el === null || el.hidden) return;
    this.fade?.cancel();
    if (instant) { this.fade = null; return; }
    this.fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: IN_EASE });
  }

  /** Hands the element back to the stylesheet, if this generation still owns it. */
  private settleText(mine: number): void {
    if (mine !== this.gen) return;
    this.anim = null;
    this.text.style.opacity = '';
    this.text.style.transform = '';
  }

  /**
   * Drops everything in flight and restores the element. Called on the way out
   * of fullscreen and before a repaint that is not a step -- a resize, a font
   * landing, a size nudge -- none of which should find the ayah half-way
   * through a slide it will never finish.
   */
  settle(): void {
    this.gen++;
    this.anim?.cancel();
    this.fade?.cancel();
    this.anim = null;
    this.fade = null;
    this.text.style.opacity = '';
    this.text.style.transform = '';
  }
}
