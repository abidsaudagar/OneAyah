/**
 * Fullscreen / TV mode. The timer shrinks to a corner and everything else goes.
 *
 * The design's screen 1b is manual-only, which leaves the case it was drawn for
 * -- reading from across a room, or by someone who cannot sit at a desk --
 * unserved, since nobody can reach the arrow keys from a sofa. So auto-advance
 * is offered as an opt-in. The ayah still SITS STILL: this holds each verse for
 * a fixed dwell and then moves on. It is not scrolling text.
 */
import type { Snapshot } from '../core/state.ts';
import { clockText, el, tapOnly } from './dom.ts';
import type { Surah } from '../data/quran.ts';

export interface TvCallbacks {
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

export class TvView {
  readonly root: HTMLElement;
  private readonly elClock: HTMLElement;
  private readonly elBar: HTMLElement;
  private readonly elCount: HTMLElement;
  private readonly elAyah: HTMLElement;
  private readonly elTrans: HTMLElement;
  private readonly elStack: HTMLElement;
  private readonly elAuto: HTMLElement;
  /** The ayah on screen, so its size can be recomputed without a repaint. */
  private text = '';

  constructor(cb: TvCallbacks) {
    this.elClock = el('div', { class: 'tv__clock', text: '00:00' });
    this.elBar = el('div', { class: 'bar__fill' });
    this.elCount = el('div', { class: 'tv__count', text: '0/5' });
    this.elAyah = el('div', { class: 'tv__ayah', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elTrans = el('p', { class: 'tv__translation' });
    this.elStack = el('div', { class: 'tv__stack' }, this.elAyah, this.elTrans);
    this.elAuto = el('span', { class: 'tv__auto' });

    this.root = el('div', { class: 'tv', attrs: { role: 'dialog', 'aria-label': 'Fullscreen reader' } },
      this.elClock,
      el('div', { class: 'tv__goal' }, el('div', { class: 'bar' }, this.elBar), this.elCount),
      // Ayah and translation ride in one stack, so the pair stays centred in
      // the frame instead of the Arabic jumping when T brings the English in.
      this.elStack,
      // Large invisible halves, so a propped-up tablet or a cast screen stays
      // usable without a keyboard. RTL: the right half goes back.
      el('button', {
        class: 'tv__tap tv__tap--prev', attrs: { 'aria-label': 'Previous ayah' },
        on: { click: cb.onPrev, keydown: tapOnly },
      }),
      el('button', {
        class: 'tv__tap tv__tap--next', attrs: { 'aria-label': 'Next ayah' },
        on: { click: cb.onNext, keydown: tapOnly },
      }),
      el('div', { class: 'tv__foot' },
        this.elAuto,
        el('span', { text: '← → TO MOVE THROUGH THE AYAT · T FOR TRANSLATION · ESC TO EXIT' })),
    );
  }

  paintVerse(surah: Surah, index: number, settings: Snapshot['settings']): void {
    const text = surah.ar[index] ?? '';
    // Only a real change earns the fade; a size nudge or a translation toggle
    // repaints the same ayah and should not blink it.
    const moved = text !== this.text;
    this.text = text;
    this.elAyah.textContent = text;
    this.elAyah.dataset.font = settings.arabicFont;
    // The translation is sized off the same viewport rather than the reader's
    // own px setting: what is comfortable at a desk is unreadable at 3 metres.
    // It rides at a fraction of the stack's size, so one number drives both.
    this.elTrans.textContent = surah.en[index] ?? '';
    this.elTrans.hidden = !settings.showTranslation;

    // Scale with the viewport and inversely with length, so a long ayah still
    // fits without the nowrap overflow the design mock would have had. The
    // stack carries the size; the ayah is 1em of it and the translation a
    // fraction, so one number moves the pair together.
    //
    // With the English underneath, the Arabic gives up about a quarter of its
    // size to make room. That is a fixed ratio rather than a measured fit: a
    // measure-and-shrink pass has to re-run on every reflow, and one that
    // misfires leaves the reader staring at the wrong size with no way back.
    this.sizeStack(settings.showTranslation);
    if (moved) this.markChanged();
  }

  /**
   * Size falls as one over the square root of the length. Text fills an area,
   * and area grows with length times size squared, so this keeps roughly the
   * same block of ink on screen whatever the ayah is.
   *
   * It replaces four length buckets. Their edges meant two ayat of near-equal
   * length could land a third apart in size -- 3:5 at 105 characters rendered
   * at 50px and 3:6 at 147 characters at 37px -- and crossing an edge read as a
   * lurch. The constant is fitted to what those buckets already gave at their
   * own boundaries, so no ayah is resized much; only the cliffs between them go.
   */
  private sizeStack(showTranslation: boolean): void {
    const vw = Math.min(8.4, 68 / Math.sqrt(Math.max(1, this.text.length)));
    const scaled = showTranslation ? vw * 0.74 : vw;
    this.elStack.style.fontSize = `clamp(24px, ${scaled.toFixed(2)}vw, 160px)`;
  }

  /**
   * The size and the line count both move with the ayah, and the stack is
   * centred, so a swap in place pushes the text out from both ends at once --
   * the reader's eye follows it. Cutting to the new ayah at zero opacity and
   * fading it up puts the whole reflow behind a frame nobody sees: there is no
   * motion to track, so it reads as a replacement rather than a slide. Short
   * enough to keep up with a held arrow key, and reduced-motion collapses it
   * back to the plain cut.
   */
  private markChanged(): void {
    this.elStack.scrollTop = 0;
    this.elStack.classList.remove('tv__stack--in');
    void this.elStack.offsetWidth; // restart the animation
    this.elStack.classList.add('tv__stack--in');
  }

  paintState(snap: Snapshot): void {
    const goal = snap.effectiveRung;
    this.elCount.textContent = `${snap.versesToday}/${goal}`;
    this.elBar.style.width = `${Math.min(100, (snap.versesToday / goal) * 100)}%`;
    this.elAuto.textContent = snap.settings.autoAdvanceSec === null
      ? '' : `▸ AUTO · ${snap.settings.autoAdvanceSec}s`;
    // T reaches the overlay through here as well as through paintVerse, so
    // toggling it -- from the key or from the settings panel -- never waits on
    // the next ayah to take effect, size included.
    this.elTrans.hidden = !snap.settings.showTranslation;
    this.sizeStack(snap.settings.showTranslation);
  }

  paintClock(remainingSec: number): void {
    this.elClock.textContent = clockText(remainingSec);
  }
}
