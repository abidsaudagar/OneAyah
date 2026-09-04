/**
 * Fullscreen / TV mode. The timer shrinks to a corner and everything else goes.
 *
 * The design's screen 1b is manual-only, which leaves the case it was drawn for
 * -- reading from across a room, or by someone who cannot sit at a desk --
 * unserved, since nobody can reach the arrow keys from a sofa. So auto-advance
 * is offered as an opt-in. The ayah still SITS STILL: this holds each verse for
 * a fixed dwell and then moves on. It is not scrolling text.
 *
 * Auto-advance holds for max(chosen dwell, required dwell), so verses credit
 * normally instead of the whole mode being decorative.
 */
import type { Snapshot } from '../core/state.ts';
import { clockText, el } from './dom.ts';
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
  private readonly elAuto: HTMLElement;

  constructor(cb: TvCallbacks) {
    this.elClock = el('div', { class: 'tv__clock', text: '00:00' });
    this.elBar = el('div', { class: 'bar__fill' });
    this.elCount = el('div', { class: 'tv__count', text: '0/5' });
    this.elAyah = el('div', { class: 'tv__ayah', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elAuto = el('span', { class: 'tv__auto' });

    this.root = el('div', { class: 'tv', attrs: { role: 'dialog', 'aria-label': 'Fullscreen reader' } },
      this.elClock,
      el('div', { class: 'tv__goal' }, el('div', { class: 'bar' }, this.elBar), this.elCount),
      this.elAyah,
      // Large invisible halves, so a propped-up tablet or a cast screen stays
      // usable without a keyboard. RTL: the right half goes back.
      el('button', { class: 'tv__tap tv__tap--prev', attrs: { 'aria-label': 'Previous ayah' }, on: { click: cb.onPrev } }),
      el('button', { class: 'tv__tap tv__tap--next', attrs: { 'aria-label': 'Next ayah' }, on: { click: cb.onNext } }),
      el('div', { class: 'tv__foot' },
        this.elAuto,
        el('span', { text: '← → TO MOVE THROUGH THE AYAT · ESC TO EXIT' })),
    );
  }

  paintVerse(surah: Surah, index: number, settings: Snapshot['settings']): void {
    const text = surah.ar[index] ?? '';
    this.elAyah.textContent = text;
    this.elAyah.dataset.font = settings.arabicFont;
    // Scale with the viewport and inversely with length, so a long ayah still
    // fits without the nowrap overflow the design mock would have had.
    const len = text.length;
    const vw = len > 220 ? 3.4 : len > 120 ? 4.6 : len > 60 ? 6.2 : 8.4;
    this.elAyah.style.fontSize = `clamp(28px, ${vw}vw, 160px)`;
  }

  paintState(snap: Snapshot): void {
    const goal = snap.effectiveRung;
    this.elCount.textContent = `${snap.versesToday}/${goal}`;
    this.elBar.style.width = `${Math.min(100, (snap.versesToday / goal) * 100)}%`;
    this.elAuto.textContent = snap.settings.autoAdvanceSec === null
      ? '' : `▸ AUTO · ${snap.settings.autoAdvanceSec}s`;
  }

  paintClock(remainingSec: number): void {
    this.elClock.textContent = clockText(remainingSec);
  }
}
