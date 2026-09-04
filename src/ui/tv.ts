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
        el('span', { text: '← → TO MOVE THROUGH THE AYAT · [ ] FOR TEXT SIZE · T FOR TRANSLATION · ESC TO EXIT' })),
    );
  }

  paintVerse(surah: Surah, index: number, settings: Snapshot['settings']): void {
    this.elAyah.textContent = surah.ar[index] ?? '';
    this.elAyah.dataset.font = settings.arabicFont;
    this.elTrans.textContent = surah.en[index] ?? '';
    this.elTrans.hidden = !settings.showTranslation;
    this.sizeStack(settings);
    // A long ayah left scrolled down would otherwise hand its offset to the
    // next one, which arrives at the top.
    this.elStack.scrollTop = 0;
  }

  /**
   * The size the reader chose, read off the same `arabicSize` the reader itself
   * paints -- so `[` and `]` work here too -- but carried in vw rather than px,
   * since a number picked at a desk is not a number for a screen across a room.
   * The setting is what it would be on a 1000px window, so the default 64 gives
   * 6.4vw: near enough to what fullscreen already showed for a middling ayah,
   * and it grows with the screen the way a TV mode should.
   *
   * What matters is what is NOT here. The size used to be derived from the
   * length of the ayah, so every single verse change restyled the stack and
   * reflowed it, and no amount of smoothing the curve fixed that -- the reader
   * has no such term, which is exactly why moving between ayat felt clean there
   * and not here. Now both modes size from one setting and a verse change is a
   * textContent swap in both.
   *
   * The cost is that a long ayah is no longer shrunk to fit; the stack scrolls,
   * as it already did for the longest ayat with the translation on. That is the
   * better trade: `[` hands the reader the fit directly, and an automatic one
   * that misfires leaves them staring at the wrong size with no way back.
   */
  private sizeStack(settings: Snapshot['settings']): void {
    // With the English underneath, the Arabic gives up about a quarter of its
    // size to make room. Verse-independent, so it costs nothing on a move.
    const vw = (settings.arabicSize / 10) * (settings.showTranslation ? 0.74 : 1);
    this.elStack.style.fontSize = `clamp(24px, ${vw.toFixed(2)}vw, 160px)`;
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
    this.sizeStack(snap.settings);
  }

  paintClock(remainingSec: number): void {
    this.elClock.textContent = clockText(remainingSec);
  }
}
