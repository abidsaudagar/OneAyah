/**
 * The hairline that fills while auto-advance holds an ayah.
 *
 * The one thing an automatic page turn must not be is a surprise. Without a
 * cue the ayah simply vanishes and is replaced, and a reader mid-word does not
 * know whether they lost their place or the app did something -- which is the
 * complaint every autoplaying thing on the web has earned. A line that has been
 * filling for eight seconds turns the same event into one that was announced.
 *
 * It fills from the RIGHT, because the text does. The bar arrives at the end of
 * the line at the same moment the reader's eye does.
 *
 * Driven through the Web Animations API rather than a CSS transition, for the
 * same reason ui/slide.ts is: the duration is a number computed per ayah, and
 * handing it to `element.animate()` keeps it out of the stylesheet entirely.
 * The bar is deliberately NOT neutralised by `prefers-reduced-motion` -- it is
 * not decoration, it is the only readout of how long is left, and a reader who
 * has asked for less motion has not asked to be kept in the dark.
 */
import { el } from './dom.ts';

export class AutoLine {
  readonly root: HTMLElement;
  private anim: Animation | null = null;

  constructor(cls: string) {
    this.root = el('div', { class: cls, attrs: { 'aria-hidden': 'true' } });
    this.root.style.transform = 'scaleX(0)';
  }

  /**
   * Fills over `ms`, or clears the line when null.
   *
   * Cancelling drops the animation's effect, and the inline `scaleX(0)` under
   * it is what the element falls back to -- so a stopped line is a line of zero
   * width rather than one frozen wherever it had got to.
   */
  run(ms: number | null): void {
    this.anim?.cancel();
    this.anim = null;
    this.root.style.transform = 'scaleX(0)';
    if (ms === null) return;
    this.anim = this.root.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: ms, easing: 'linear', fill: 'forwards' },
    );
  }
}
