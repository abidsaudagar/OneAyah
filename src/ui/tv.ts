/**
 * Fullscreen / TV mode. The timer shrinks to a corner and everything else goes.
 *
 * The design's screen 1b is manual-only, which leaves the case it was drawn for
 * -- reading from across a room, or by someone who cannot sit at a desk --
 * unserved, since nobody can reach the arrow keys from a sofa. So auto-advance
 * is offered as an opt-in, here and in the reader both. The ayah still SITS
 * STILL: it holds a screenful for as long as those words need (core/dwell.ts)
 * and then turns. It is not scrolling text.
 */
import type { Celebration } from '../core/celebrate.ts';
import { celebrationCopy } from '../core/celebrate.ts';
import type { Snapshot } from '../core/state.ts';
import { AutoLine } from './autoline.ts';
import { celebrationCard, type CelebrationCard } from './celebration.ts';
import { confetti } from './confetti.ts';
import { clockText, el, speedText, tapOnly } from './dom.ts';
import { Pager } from './pages.ts';
import { Slide } from './slide.ts';
import type { Surah } from '../data/quran.ts';
import { TRANSLATIONS, type Settings } from '../types.ts';
import { cycleOrder } from '../core/translation.ts';

export interface TvCallbacks {
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
}

export class TvView {
  readonly root: HTMLElement;
  /**
   * The frame a pinch and the ayah's own motion belong to. The overlay keeps
   * its existing tap halves -- they already point the RTL way this app's touch
   * gestures now speak -- so only swipe and pinch are added here.
   */
  readonly frame: HTMLElement;
  readonly slide: Slide;
  private readonly elClock: HTMLElement;
  private readonly elBar: HTMLElement;
  private readonly elCount: HTMLElement;
  private readonly elSurahTr: HTMLElement;
  private readonly elSurahAr: HTMLElement;
  /** Which ayah of the surah is on screen, alongside the name: "· 255 of 286". */
  private readonly elSurahNo: HTMLElement;
  private readonly elAyah: HTMLElement;
  private readonly elTrans: HTMLElement;
  private readonly elStack: HTMLElement;
  private readonly elAuto: HTMLElement;
  private readonly elPart: HTMLElement;
  /** An ayah too long for the frame, split into the parts it is read in. */
  private readonly pager = new Pager();
  private pages: string[] = [''];
  /** Which part is on screen, so auto-advance can time the words in front of it. */
  private shownPage = 0;
  /** The bar that fills while auto-advance holds this screenful. */
  private readonly autoLine = new AutoLine('autoline autoline--tv');
  private readonly elGoal: HTMLElement;
  private readonly elHintKeys: HTMLElement;
  private readonly elHintTouch: HTMLElement;
  /** The language of the text currently in `elTrans`; see `showsTranslation`. */
  private paintedLang: Surah['lang'] = 'en';
  /** Which translation is in the box, so a repaint of it keeps its place. */
  private transKey = '';
  private card: CelebrationCard | null = null;
  private stopConfetti: (() => void) | null = null;

  constructor(cb: TvCallbacks) {
    this.elClock = el('div', { class: 'tv__clock', text: '00:00' });
    this.elBar = el('div', { class: 'bar__fill' });
    this.elCount = el('div', { class: 'tv__count', text: '0/5' });
    // Named twice, transliteration then Arabic, the same pairing the reader's
    // locator and the drawer use, then the ayah's place in the surah -- so the
    // line reads as a full reference from across a room. The Arabic is its own
    // span so `dir` isolates it and the separators cannot be reordered into it.
    this.elSurahTr = el('span', { class: 'tv__surah-tr' });
    this.elSurahAr = el('span', { class: 'tv__surah-ar', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elSurahNo = el('span', { class: 'tv__surah-no' });
    this.elAyah = el('div', { class: 'tv__ayah', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elTrans = el('p', {
      class: 'tv__translation',
      on: { scroll: () => this.markTranslationOverflow() },
    });
    this.elStack = el('div', { class: 'tv__stack' }, this.elAyah, this.elTrans);
    this.elAuto = el('span', { class: 'tv__auto' });
    this.elPart = el('div', { class: 'tv__part', attrs: { hidden: true } });
    this.elGoal = el('div', { class: 'tv__goal' },
      el('div', { class: 'bar' }, this.elBar), this.elCount);
    this.elHintKeys = el('span', { class: 'tv__hint tv__hint--keys' });
    this.elHintTouch = el('span', { class: 'tv__hint tv__hint--touch' });

    this.root = el('div', { class: 'tv', attrs: { role: 'dialog', 'aria-label': 'Fullscreen reader' } },
      this.elClock,
      this.elGoal,
      // Outside the stack, and absolutely placed: the stack's height is the
      // frame the ayah is paged against, so anything added INSIDE it would
      // quietly shorten the box the split measures.
      el('div', { class: 'tv__surah' }, this.elSurahTr, ' · ', this.elSurahAr, ' · ', this.elSurahNo),
      // Ayah and translation ride in one stack, so the pair stays centred in
      // the frame instead of the Arabic jumping when T brings the English in.
      this.elStack,
      // Large invisible halves, so a propped-up tablet or a cast screen stays
      // usable without a keyboard. Same sides as the reader's tap zones: the
      // right half goes forward, the left goes back.
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
        // Same reasoning as the reader's hint row: the keys mean nothing to a
        // thumb and the gestures mean nothing to a keyboard, so both are built
        // and CSS shows whichever the device can actually do.
        // Both halves name this reader's own language order, so they are
        // filled in by `paintState` rather than written out here.
        this.elHintKeys,
        this.elHintTouch),
      // Along the very bottom edge, under everything: it is the one thing here
      // that has to stay readable from the far side of a room.
      this.autoLine.root,
    );

    this.frame = this.elStack;
    this.slide = new Slide(this.elAyah, this.elTrans);
  }

  /**
   * The same three steps the reader takes, in the same order: the faces and the
   * sizes go on first, then the ayah is split for the box those produce, then
   * the part is painted. The translation is whole and stays whole while the
   * parts turn under it -- it is the meaning of the ayah, not of the screenful.
   *
   * The language is settled before the sizes, not after: the translation's size
   * is scaled per script, so a size chosen against the language being replaced
   * would be the wrong one to measure the split against.
   */
  paintVerse(surah: Surah, index: number, page: number, settings: Snapshot['settings']): void {
    this.elAyah.dataset.font = settings.arabicFont;
    this.elSurahTr.textContent = surah.meta.tr;
    this.elSurahAr.textContent = surah.meta.ar;
    this.elSurahNo.textContent = `${index + 1} of ${surah.meta.c}`;
    // The translation is measured before the split, not after: it is painted
    // first so the height it takes is already out of what the Arabic can use.
    this.elTrans.textContent = surah.trans[index] ?? '';
    this.typeTranslation(surah.lang);
    this.sizeStack(settings);
    this.elTrans.hidden = !this.showsTranslation(settings);
    // A new ayah is a new translation, so the box starts at ITS first line.
    // Keyed on the ayah rather than on the paint: a size nudge repaints the
    // same translation, and it should keep the place the reader scrolled to.
    const key = `${surah.meta.n}:${index}:${surah.lang}`;
    if (key !== this.transKey) { this.transKey = key; this.elTrans.scrollTop = 0; }
    this.pages = this.pager.split(this.elAyah, surah.ar[index] ?? '', this.availableHeight());
    const shown = Math.min(Math.max(0, page), this.pages.length - 1);
    this.shownPage = shown;
    this.elAyah.textContent = this.pages[shown] ?? '';
    this.elPart.textContent = `PART ${shown + 1} OF ${this.pages.length}`;
    this.elPart.hidden = this.pages.length < 2;
    // Last, and after the split; see the reader's paint for why.
    this.markTranslationOverflow();
  }

  /**
   * Direction, language tag and the face CSS picks off `data-lang`. Driven by
   * the text that has actually arrived, never by the setting: a language change
   * is a fetch, and the two disagree until it lands.
   *
   * The size is not set here but in `sizeTranslation`, which is driven by
   * `paintedLang` -- so this has to run before it, and does.
   */
  private typeTranslation(lang: Surah['lang']): void {
    const t = TRANSLATIONS[lang];
    this.paintedLang = lang;
    this.elTrans.dataset.lang = lang;
    this.elTrans.dir = t.rtl ? 'rtl' : 'ltr';
    this.elTrans.lang = t.tag;
  }

  /**
   * Whether the translation box may be shown right now. Changing language is a
   * fetch, and until it lands the words in the box are still the old
   * language's -- so the ask alone is not enough. It matters more here than in
   * the reader: this view also gives up a quarter of the Arabic's size to make
   * room for the translation, and doing that for one the reader is not being
   * shown would resize the ayah for nothing.
   */
  private showsTranslation(s: Settings): boolean {
    return s.showTranslation && s.translationLang === this.paintedLang;
  }

  /** How many parts the ayah on screen is being read in; 1 when it fits. */
  pageCount(): number {
    return this.pages.length;
  }

  /** The Arabic actually on screen -- the current part, not the whole ayah. */
  pageText(): string {
    return this.pages[this.shownPage] ?? '';
  }

  /** The whole ayah's English, whether or not it is currently shown. */
  translationText(): string {
    return this.elTrans.textContent ?? '';
  }

  /** Fills the hairline over `ms`, or clears it when auto-advance is not running. */
  autoProgress(ms: number | null): void {
    this.autoLine.run(ms);
  }

  /** The auto-advance readout in the footer. */
  paintAuto(playing: boolean, speed: number): void {
    this.elAuto.textContent = playing ? `▸ AUTO · ${speedText(speed)}` : '';
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
   *
   * The translation does NOT enter into it. Bringing one in used to take about
   * a quarter off the Arabic to make room, which meant `T` resized the ayah --
   * the one thing this app holds still -- and resized it by a different amount
   * again when the language changed. The Arabic is now the size the reader
   * asked for, translation or no translation, in either language. What the
   * translation takes is room to PAGE in, the same trade the reader itself
   * makes: a long ayah is read in more parts, at the size it was set to.
   */
  private sizeStack(settings: Settings): void {
    const vw = settings.arabicSize / 10;
    this.elStack.style.fontSize = `clamp(24px, ${vw.toFixed(2)}vw, 160px)`;
    this.sizeTranslation(settings);
  }

  /**
   * The translation's own size, on the same rule the Arabic above it uses: the
   * reader's setting is what it is worth on a 1000px window, and it grows with
   * the screen from there because this mode is read from further away.
   *
   * It used to be a fraction of the ARABIC instead, which made entering
   * fullscreen jump an 18px translation to something near 48px -- a different
   * size from the one the reader had just set, arrived at by a route they had
   * no way to see. Now the same window shows the same size in both modes, and
   * the ceiling keeps a large screen from running away with it.
   */
  private sizeTranslation(settings: Settings): void {
    const t = TRANSLATIONS[this.paintedLang];
    const px = settings.translationSize * t.sizeScale;
    this.elStack.style.setProperty(
      '--tv-trans-size',
      `clamp(${px.toFixed(1)}px, ${(px / 10).toFixed(2)}vw, ${(px * 2).toFixed(1)}px)`,
    );
    // The leading the script is set at, from the one place that owns it, so the
    // box and the type cannot disagree about how tall a line of it is.
    this.elStack.style.setProperty('--tv-trans-lead', String(t.lead));
  }

  /**
   * Whether the translation runs past the bottom of its box, and which way.
   * CSS softens the edge it runs out at; the reasoning is the reader's own.
   * It matters more here -- across a room a hard stop at the third line reads
   * as a translation that ended there, and there is no scrollbar in view to
   * say otherwise.
   */
  private markTranslationOverflow(): void {
    const box = this.elTrans;
    // A hidden box measures zero, which would read as a perfect fit; it is only
    // one because none of the translation is there.
    const over = !box.hidden && box.scrollHeight - box.clientHeight > 1;
    const atEnd = over && box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    this.elStack.dataset.more = !over ? 'none'
      : atEnd ? 'above' : box.scrollTop > 1 ? 'both' : 'below';
  }

  paintState(snap: Snapshot): void {
    const goal = snap.effectiveRung;
    this.elCount.textContent = `${snap.versesToday}/${goal}`;
    this.elBar.style.width = `${Math.min(100, (snap.versesToday / goal) * 100)}%`;
    // The auto readout is NOT painted here. Whether it is running is not in the
    // settings and so is not in the snapshot -- see paintAuto.
    // T reaches the overlay through here as well as through paintVerse, so
    // toggling it -- from the key or from the settings panel -- never waits on
    // the next ayah to take effect, size included.
    this.elTrans.hidden = !this.showsTranslation(snap.settings);
    this.sizeStack(snap.settings);
    this.markTranslationOverflow();
    // The key and the gesture take the same step, so they name the same order.
    const order = `${cycleOrder(snap.settings.translationHome)
      .map((l) => TRANSLATIONS[l].label.toUpperCase()).join(', ')}, OFF`;
    this.elHintKeys.textContent = '← → TO MOVE · P TO PLAY OR PAUSE · [ ] FOR TEXT SIZE'
      + ` · T FOR ${order} · ESC TO EXIT`;
    this.elHintTouch.textContent = 'SWIPE OR TAP A SIDE TO MOVE · PINCH FOR TEXT SIZE'
      + ` · TWO-FINGER TAP FOR ${order}`;
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
    this.autoLine.run(null);
    this.card?.dismiss();
    this.card = null;
    this.stopConfetti?.();
    this.stopConfetti = null;
  }
}
