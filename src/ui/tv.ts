/**
 * Fullscreen / TV mode. The timer shrinks to a corner and everything else goes.
 *
 * The design's screen 1b is manual-only, which leaves the case it was drawn for
 * -- reading from across a room, or by someone who cannot sit at a desk --
 * unserved, since nobody can reach the arrow keys from a sofa. So auto-advance
 * is offered as an opt-in. The ayah still SITS STILL: this holds each verse for
 * a fixed dwell and then moves on. It is not scrolling text.
 */
import type { Celebration } from '../core/celebrate.ts';
import { celebrationCopy } from '../core/celebrate.ts';
import type { Snapshot } from '../core/state.ts';
import { celebrationCard, type CelebrationCard } from './celebration.ts';
import { confetti } from './confetti.ts';
import { clockText, el, tapOnly } from './dom.ts';
import { Pager } from './pages.ts';
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
  private readonly elSurahTr: HTMLElement;
  private readonly elSurahAr: HTMLElement;
  private readonly elAyah: HTMLElement;
  private readonly elTrans: HTMLElement;
  private readonly elStack: HTMLElement;
  private readonly elAuto: HTMLElement;
  private readonly elPart: HTMLElement;
  /** An ayah too long for the frame, split into the parts it is read in. */
  private readonly pager = new Pager();
  private pages: string[] = [''];
  private readonly elGoal: HTMLElement;
  private card: CelebrationCard | null = null;
  private stopConfetti: (() => void) | null = null;

  constructor(cb: TvCallbacks) {
    this.elClock = el('div', { class: 'tv__clock', text: '00:00' });
    this.elBar = el('div', { class: 'bar__fill' });
    this.elCount = el('div', { class: 'tv__count', text: '0/5' });
    // Named twice, transliteration then Arabic, the same pairing the reader's
    // locator and the drawer use. The Arabic is its own span so `dir` isolates
    // it and the separator between the two names cannot be reordered into it.
    this.elSurahTr = el('span', { class: 'tv__surah-tr' });
    this.elSurahAr = el('span', { class: 'tv__surah-ar', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elAyah = el('div', { class: 'tv__ayah', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elTrans = el('p', { class: 'tv__translation' });
    this.elStack = el('div', { class: 'tv__stack' }, this.elAyah, this.elTrans);
    this.elAuto = el('span', { class: 'tv__auto' });
    this.elPart = el('div', { class: 'tv__part', attrs: { hidden: true } });
    this.elGoal = el('div', { class: 'tv__goal' },
      el('div', { class: 'bar' }, this.elBar), this.elCount);

    this.root = el('div', { class: 'tv', attrs: { role: 'dialog', 'aria-label': 'Fullscreen reader' } },
      this.elClock,
      this.elGoal,
      // Outside the stack, and absolutely placed: the stack's height is the
      // frame the ayah is paged against, so anything added INSIDE it would
      // quietly shorten the box the split measures.
      el('div', { class: 'tv__surah' }, this.elSurahTr, ' · ', this.elSurahAr),
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
      this.elPart,
      el('div', { class: 'tv__foot' },
        this.elAuto,
        el('span', { text: '← → TO MOVE THROUGH THE AYAT · [ ] FOR TEXT SIZE · T FOR TRANSLATION · ESC TO EXIT' })),
    );
  }

  /**
   * The same three steps the reader takes, in the same order: the face and the
   * size go on first, then the ayah is split for the box those produce, then
   * the part is painted. The translation is whole and stays whole while the
   * parts turn under it -- it is the meaning of the ayah, not of the screenful.
   */
  paintVerse(surah: Surah, index: number, page: number, settings: Snapshot['settings']): void {
    this.elAyah.dataset.font = settings.arabicFont;
    this.elSurahTr.textContent = surah.meta.tr;
    this.elSurahAr.textContent = surah.meta.ar;
    this.sizeStack(settings);
    // The translation is measured before the split, not after: it is painted
    // first so the height it takes is already out of what the Arabic can use.
    this.elTrans.textContent = surah.en[index] ?? '';
    this.elTrans.hidden = !settings.showTranslation;
    this.pages = this.pager.split(this.elAyah, surah.ar[index] ?? '', this.availableHeight());
    const shown = Math.min(Math.max(0, page), this.pages.length - 1);
    this.elAyah.textContent = this.pages[shown] ?? '';
    this.elPart.textContent = `PART ${shown + 1} OF ${this.pages.length}`;
    this.elPart.hidden = this.pages.length < 2;
  }

  /** How many parts the ayah on screen is being read in; 1 when it fits. */
  pageCount(): number {
    return this.pages.length;
  }

  /**
   * What the Arabic has to fit: the frame, less whatever the translation and
   * the gap above it are already taking. Measured rather than assumed, because
   * the translation wraps to a different number of lines per ayah -- it is the
   * one thing in this box whose height the verse still moves.
   */
  private availableHeight(): number {
    const gap = Number.parseFloat(getComputedStyle(this.elStack).rowGap) || 0;
    const trans = this.elTrans.hidden ? 0 : this.elTrans.offsetHeight + gap;
    return this.elStack.clientHeight - trans;
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

  /**
   * The same moment as in the reader, minus the arrow: fullscreen has a goal
   * readout but no goal button, so there is nothing to point at. The teaching
   * survives as the card's own last line, which is where it says the useful
   * part anyway.
   */
  celebrateGoal(earned: Celebration): void {
    this.stopConfetti?.();
    this.stopConfetti = confetti(earned.particles);
    this.card?.dismiss();
    this.card = celebrationCard(celebrationCopy(earned), false);
    this.elGoal.append(this.card.root);
  }

  /** Called on the way out, so nothing is left painting over a removed overlay. */
  teardown(): void {
    this.card?.dismiss();
    this.card = null;
    this.stopConfetti?.();
    this.stopConfetti = null;
  }
}
