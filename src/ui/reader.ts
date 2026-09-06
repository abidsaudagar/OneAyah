/**
 * The reader. One ayah, held still and centred, advanced by the reader.
 *
 * Hot-path updates (ayah text, counters, bars, timer) go through held element
 * references and textContent -- the same approach the design's own prototype
 * used. Nothing here diffs a tree sixty times a second.
 */
import type { Celebration } from '../core/celebrate.ts';
import { celebrationCopy, firstVisitChip } from '../core/celebrate.ts';
import type { Snapshot } from '../core/state.ts';
import { resolveTheme } from '../platform/theme.ts';
import type { Theme } from '../types.ts';
import { SIZE_MIN } from '../core/gesture.ts';
import { fittedSize } from '../core/paginate.ts';
import { pointsPerVerse } from '../core/scoring.ts';
import { AutoLine } from './autoline.ts';
import { celebrationCard, type CelebrationCard } from './celebration.ts';
import { confetti } from './confetti.ts';
import { clockText, el, num, speedText, tapOnly, type Child } from './dom.ts';
import { Pager } from './pages.ts';
import { Slide } from './slide.ts';
import type { Surah } from '../data/quran.ts';

/** What the line under the reader is currently asking for, if anything. */
type BannerMode = 'degraded' | 'feedback' | 'notice';

/** How long a finger rests on the ayah number before it becomes a jump field. */
const LONG_PRESS_MS = 500;
/** And how far it may drift while it does, before it is a swipe instead. */
const LONG_PRESS_SLOP_PX = 10;

export interface ReaderCallbacks {
  onPrev: () => void;
  onNext: () => void;
  /** Jump within the current surah; 1-based, already clamped to its length. */
  onJumpToAyah: (ayah: number) => void;
  onOpenGoal: () => void;
  onOpenSettings: () => void;
  onOpenDrawer: () => void;
  onOpenFullscreen: () => void;
  onOpenBackup: () => void;
  onOpenStats: () => void;
  onOpenFeedback: () => void;
  onDismissNotice: () => void;
  onDismissFeedback: () => void;
  /** Advance one step around light -> dark -> paper. */
  onCycleTheme: () => void;
}

/**
 * The header button's face: the surface you are ON, plus the one a click moves
 * you to. `system` never appears here -- the button resolves it to whichever
 * surface is actually on screen and steps on from there, so a click always
 * visibly changes something.
 */
const THEME_FACE: Record<'light' | 'dark' | 'paper', { paths: string; label: string; next: string }> = {
  light: {
    paths: '<circle cx="9" cy="9" r="3.2"/><path d="M9 1.6v2.2M9 14.2v2.2M1.6 9h2.2M14.2 9h2.2'
      + 'M3.7 3.7l1.6 1.6M12.7 12.7l1.6 1.6M14.3 3.7l-1.6 1.6M5.3 12.7l-1.6 1.6"/>',
    label: 'Light', next: 'Dark',
  },
  dark: {
    paths: '<path d="M14.6 10.7A6.2 6.2 0 0 1 7.3 3.4 6.2 6.2 0 1 0 14.6 10.7z"/>',
    label: 'Dark', next: 'Paper',
  },
  paper: {
    paths: '<path d="M4 2.5h5.8L14 6.7v8.8H4z"/><path d="M9.8 2.5v4.2H14"/>'
      + '<path d="M6.4 9.6h5.2M6.4 12.2h5.2"/>',
    label: 'Paper', next: 'Light',
  },
};

/** Icons are inline SVG: three icons is not worth a sprite sheet or a library. */
const icon = (paths: string, label: string, onClick: () => void) => el('button', {
  class: 'icon-btn',
  attrs: { type: 'button', 'aria-label': label, title: label },
  html: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${paths}</svg>`,
  on: { click: onClick },
});

export class ReaderView {
  readonly root: HTMLElement;
  /** Where a swipe is read: the whole reading column. Set in the constructor. */
  readonly surface: HTMLElement;
  /** What the tap zones divide, and the only place native zoom is refused. */
  readonly frame: HTMLElement;
  /** The motion a step makes here; owned by the view that holds the elements. */
  readonly slide: Slide;

  // Held references for the hot path.
  private readonly elAyah: HTMLElement;
  private readonly elAyahBox: HTMLElement;
  private readonly elTrans: HTMLElement;
  private readonly elLocator: HTMLElement;
  private elLocAyah!: HTMLElement;
  private elLocSurah!: HTMLButtonElement;
  private elLocSurahTr!: HTMLElement;
  private elLocSurahAr!: HTMLElement;
  private elLocTotal!: HTMLElement;
  /** Length of the surah on screen, so a typed ayah can be clamped to it. */
  private ayahCount = 1;
  /** The ayah the locator is showing, restored when an edit is abandoned. */
  private ayahShown = 1;
  private elLocPart!: HTMLElement;
  /** An ayah too long for the frame, split into the parts it is read in. */
  private readonly pager = new Pager();
  private pages: string[] = [''];
  /** Which part is on screen, so auto-advance can time the words in front of it. */
  private shownPage = 0;
  /** The bar that fills while auto-advance holds this screenful. */
  private readonly autoLine = new AutoLine('autoline');
  private readonly elAuto: HTMLElement;
  private elHints!: HTMLElement;
  private readonly elGoalCount: HTMLElement;
  private readonly elGoalBar: HTMLElement;
  /** The chip above the goal bar. Says GOAL MET, or the ask on a first visit. */
  private readonly elGoalChip: HTMLElement;
  /** The card's anchor, and what the arrow points at. */
  private readonly elGoalMetric: HTMLElement;
  private card: CelebrationCard | null = null;
  private stopConfetti: (() => void) | null = null;
  private readonly elTimer: HTMLElement;
  private readonly elTimerOf: HTMLElement;
  private readonly elTimerBar: HTMLElement;
  private readonly elRead: HTMLElement;
  private readonly elReadAll: HTMLElement;
  private readonly elStreak: HTMLElement;
  private readonly elMult: HTMLElement;
  private readonly elPoints: HTMLElement;
  private readonly elPointsToday: HTMLElement;
  private readonly elPrev: HTMLButtonElement;
  private readonly elNext: HTMLButtonElement;
  private readonly elBanner: HTMLElement;
  /** Rebuilt only when the ask changes, not on every paint. */
  private bannerMode: BannerMode | null = null;
  private readonly cb: ReaderCallbacks;
  private readonly elTheme: HTMLButtonElement;
  /** The face already painted, so the hot path skips a needless innerHTML write. */
  private themeFace = '';

  constructor(cb: ReaderCallbacks) {
    this.cb = cb;

    /** Label, value and any trailing detail on a single line, optionally underlined by a bar. */
    const metric = (cls: string, label: string, parts: Child[], bar?: HTMLElement) =>
      el('div', { class: `metric ${cls}` },
        el('div', { class: 'metric__line' },
          el('span', { class: 'metric__label', text: label }), ...parts),
        bar);

    this.elGoalCount = el('span', { class: 'metric__value', text: '0/5' });
    this.elGoalBar = el('div', { class: 'bar__fill' });
    this.elTimer = el('span', { class: 'metric__value', text: '01:10' });
    this.elTimerOf = el('span', { class: 'metric__unit', text: 'of 1:10' });
    this.elTimerBar = el('div', { class: 'bar__fill bar__fill--instant' });
    this.elRead = el('span', { class: 'metric__value', text: '00:00' });
    this.elReadAll = el('span', { class: 'metric__sub', text: '' });
    this.elStreak = el('span', { class: 'metric__value', text: '0' });
    this.elMult = el('span', { class: 'metric__sub', text: '×1.0' });
    this.elPoints = el('span', { class: 'metric__value', text: '0' });
    this.elPointsToday = el('span', { class: 'metric__sub', text: '' });

    this.elGoalChip = el('span', { class: 'metric__chip', text: 'GOAL MET' });

    const goalBtn = el('button', {
      class: 'goal-btn', attrs: { type: 'button', title: 'Change your daily goal' },
      on: { click: cb.onOpenGoal },
    },
      el('div', { class: 'metric__line' },
        el('span', { class: 'metric__label', text: 'DAILY GOAL' }),
        this.elGoalCount,
        el('span', { class: 'metric__unit', text: 'verses' })),
      el('div', { class: 'bar' }, this.elGoalBar),
      this.elGoalChip,
    );
    this.elGoalMetric = el('div', { class: 'metric metric--goal' }, goalBtn);

    this.elTheme = icon('', 'Theme', cb.onCycleTheme);

    const header = el('header', { class: 'hdr' },
      el('div', { class: 'hdr__tools' },
        // A slider pair, matching the design canvas's own settings glyph --
        // the previous eight-rayed circle read as a sun, not as settings.
        icon('<path d="M2.5 6.5h13M2.5 11.5h13"/>'
          + '<circle cx="6.5" cy="6.5" r="2.4" fill="var(--surface)"/>'
          + '<circle cx="11.5" cy="11.5" r="2.4" fill="var(--surface)"/>',
        'Settings', cb.onOpenSettings),
        // Three bars, not another pair of corner arrows -- the previous glyph
        // was near-indistinguishable from the fullscreen icon beside it.
        icon('<path d="M3.5 15.5v-4M9 15.5V4.5M14.5 15.5v-7"/>', 'Your reading', cb.onOpenStats),
        icon('<path d="M2 6.5V2h4.5M11.5 2H16v4.5M16 11.5V16h-4.5M6.5 16H2v-4.5"/>',
          'Fullscreen', cb.onOpenFullscreen),
      ),
      el('div', { class: 'hdr__metrics' },
        this.elGoalMetric,
        metric('metric--session', 'SESSION LEFT', [this.elTimer, this.elTimerOf],
          el('div', { class: 'bar' }, this.elTimerBar)),
        metric('metric--time', 'TIME READ', [this.elRead, this.elReadAll]),
        metric('metric--streak metric--accent', 'STREAK',
          [this.elStreak, el('span', { class: 'metric__unit', text: 'days' }), this.elMult]),
        metric('metric--points', 'POINTS', [this.elPoints, this.elPointsToday]),
      ),
      el('div', { class: 'hdr__menu' },
        this.elTheme,
        icon('<path d="M2 4.5h14M2 9h14M2 13.5h14"/>', 'Surahs', cb.onOpenDrawer)),
    );

    this.elAyah = el('div', { class: 'ayah__text', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elAyahBox = el('div', { class: 'ayah' }, this.elAyah);
    this.elTrans = el('p', { class: 'translation__text' });
    this.elLocator = this.buildLocator(cb);
    // Both sets are built and one is shown, chosen in CSS by `pointer: coarse`
    // rather than here: the keyboard hints are useless on a phone and the
    // gesture hints are unreachable without a touchscreen, and neither the
    // reader nor the window can change which of those is true mid-session.
    const hintSet = (cls: string, pairs: readonly (readonly [string, string])[]) =>
      el('div', { class: `hints__set ${cls}` },
        ...pairs.map(([k, what]) => el('span', {}, el('kbd', { text: k }), what)));
    this.elHints = el('div', { class: 'hints' },
      hintSet('hints__set--keys',
        [['← →', 'ayah'], ['P', 'auto-advance'], ['[ ]', 'text size'],
          ['T', 'translation'], ['F', 'fullscreen']]),
      // The order a thumb will discover them in: the one that moves you, the
      // one that moves you without moving, then the ones you go looking for.
      hintSet('hints__set--touch',
        [['SWIPE', 'ayah'], ['TAP', 'left or right'], ['PINCH', 'text size'],
          ['TWO-FINGER TAP', 'translation']]));

    // Back on the left, next on the right, on both inputs -- the same sides the
    // arrow keys and the tap zones use, so there is one direction to learn
    // rather than one per way of asking.
    //
    // Each control still carries two faces and CSS shows one, because on touch
    // the arrow is not what is worth drawing. There is no key to point at; what
    // is behind the button is a tap zone occupying that half of the frame, and
    // a word names the half in a way an arrowhead does not. So the touch face
    // is BACK and NEXT, sitting over the sides they stand for.
    //
    // `aria-label` never changes with the face: the button's MEANING is fixed.
    const glyphs = (keyboard: string, touch: string) => [
      el('span', { class: 'nav__glyph nav__glyph--keys', text: keyboard }),
      el('span', { class: 'nav__glyph nav__glyph--touch', text: touch }),
    ];
    this.elPrev = el('button', {
      class: 'nav__arrow',
      attrs: { type: 'button', 'aria-label': 'Previous ayah' },
      on: { click: cb.onPrev, keydown: tapOnly },
    }, ...glyphs('←', 'BACK'));
    this.elNext = el('button', {
      class: 'nav__arrow',
      attrs: { type: 'button', 'aria-label': 'Next ayah' },
      on: { click: cb.onNext, keydown: tapOnly },
    }, ...glyphs('→', 'NEXT'));

    this.elBanner = el('div', { class: 'banner', attrs: { hidden: true } });

    // Empty, and therefore invisible, until auto-advance is actually running.
    // A permanent "AUTO: OFF" would be one more thing on a screen whose whole
    // argument is that there is nothing on it but the ayah.
    this.elAuto = el('span', { class: 'nav__auto', attrs: { role: 'status' } });

    this.surface = el('main', { class: 'reader' },
      this.elAyahBox,
      el('div', { class: 'translation' }, this.elTrans, this.elLocator),
      el('div', { class: 'nav' }, this.elPrev, this.elNext, this.elAuto),
      this.elHints,
      // Last in the column, so it sits on the bottom edge of the reading area
      // whether or not the hints above it have retired.
      this.autoLine.root,
    );
    this.frame = this.elAyahBox;
    this.slide = new Slide(this.elAyah, this.elTrans);

    this.root = el('div', { class: 'shell' }, header, this.surface, this.elBanner);
  }

  /**
   * The line under the translation. It reads as plain text and keeps the same
   * type, but the surah name is a button onto the surah drawer, and the ayah
   * number opens a jump field on double-click -- deliberately double, so a
   * stray click while reading never turns the line into an input.
   *
   * The surah is named twice, transliteration then Arabic, the same pairing and
   * the same order the drawer lists it in. The Arabic is a separate span rather
   * than more text in the button: `dir` isolates it, so the neutral " · " on
   * either side stays put instead of being pulled into the Arabic's run and
   * reordered -- the whole line would otherwise rearrange around the name.
   */
  private buildLocator(cb: ReaderCallbacks): HTMLElement {
    this.elLocSurahTr = el('span', { class: 'locator__tr' });
    this.elLocSurahAr = el('span', {
      class: 'locator__ar',
      attrs: { dir: 'rtl', lang: 'ar' },
    });
    this.elLocSurah = el('button', {
      class: 'locator__surah',
      attrs: { type: 'button', title: 'Browse surahs' },
      on: { click: cb.onOpenDrawer },
    }, this.elLocSurahTr, ' · ', this.elLocSurahAr);

    // The number is edited in place rather than swapped for an input: an input
    // is a replaced box and cannot be made to sit on the same baseline as the
    // text around it, so opening one nudged the whole line. This way the box
    // never changes at all.
    // A long press is the touch half of the double-click below. Both are
    // deliberately awkward for the same reason: this line sits under the ayah
    // the reader is looking at, and a single tap on it must never turn it into
    // an input. Double-tap could not be that gesture -- it is the browser's own
    // zoom, and on a page that has just taken pinch away from the reader,
    // taking double-tap too would leave them with no way to magnify anything.
    let pressTimer: number | undefined;
    let pressFrom: { x: number; y: number } | null = null;
    const endPress = () => { clearTimeout(pressTimer); pressTimer = undefined; pressFrom = null; };

    this.elLocAyah = el('span', {
      class: 'locator__ayah',
      attrs: { title: 'Double-click, or press and hold, to jump to an ayah' },
      on: {
        dblclick: () => this.beginAyahEdit(),
        touchstart: (e: TouchEvent) => {
          const t = e.touches[0];
          if (!t || e.touches.length !== 1) { endPress(); return; }
          pressFrom = { x: t.clientX, y: t.clientY };
          pressTimer = setTimeout(() => {
            pressTimer = undefined;
            this.beginAyahEdit();
          }, LONG_PRESS_MS) as unknown as number;
        },
        // A finger that wandered was on its way somewhere else -- a swipe that
        // happened to start on the number, most often.
        touchmove: (e: TouchEvent) => {
          const t = e.touches[0];
          if (!t || pressFrom === null) return;
          if (Math.hypot(t.clientX - pressFrom.x, t.clientY - pressFrom.y) > LONG_PRESS_SLOP_PX) {
            endPress();
          }
        },
        touchend: endPress,
        touchcancel: endPress,
        // Only digits, however they arrive -- typed, pasted or dropped. A mixed
        // paste is stripped down rather than rejected whole, and three digits
        // is the ceiling: no surah runs past 286 ayat.
        input: () => {
          const text = this.elLocAyah.textContent ?? '';
          const digits = text.replace(/\D/g, '').slice(0, 3);
          if (digits === text) return;
          this.elLocAyah.textContent = digits;
          this.selectAyahText(true);
        },
        keydown: (e: KeyboardEvent) => {
          if (!this.isEditingAyah()) return;
          if (e.key === 'Enter') { e.preventDefault(); this.commitAyahEdit(cb); }
          else if (e.key === 'Escape') { e.preventDefault(); this.endAyahEdit(); }
        },
        // Clicking away abandons the edit; Enter is the only way to commit, so
        // a half-typed number can never move the reader on its own.
        blur: () => this.endAyahEdit(),
      },
    });

    this.elLocTotal = el('span', { class: 'locator__total' });
    this.elLocPart = el('span', { class: 'locator__part', attrs: { hidden: true } });

    return el('div', { class: 'locator' },
      this.elLocSurah, ' · ', this.elLocAyah, this.elLocTotal, this.elLocPart);
  }

  private isEditingAyah = (): boolean => this.elLocAyah.isContentEditable;

  private beginAyahEdit(): void {
    // plaintext-only keeps pasted markup out. Browsers that do not know the
    // value throw on it, so fall back to plain editing -- the input handler
    // above still strips whatever lands here back down to digits.
    try {
      this.elLocAyah.contentEditable = 'plaintext-only';
    } catch {
      this.elLocAyah.contentEditable = 'true';
    }
    this.elLocAyah.focus();
    this.selectAyahText(false);
  }

  /** Selects the number, or drops the caret at its end once `collapse` is set. */
  private selectAyahText(collapse: boolean): void {
    const range = document.createRange();
    range.selectNodeContents(this.elLocAyah);
    if (collapse) range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private endAyahEdit(): void {
    if (!this.isEditingAyah()) return;
    this.elLocAyah.contentEditable = 'false';
    this.elLocAyah.textContent = String(this.ayahShown);
    window.getSelection()?.removeAllRanges();
  }

  private commitAyahEdit(cb: ReaderCallbacks): void {
    const typed = Number.parseInt(this.elLocAyah.textContent?.trim() ?? '', 10);
    this.endAyahEdit();
    if (!Number.isFinite(typed)) return;
    cb.onJumpToAyah(Math.min(Math.max(1, typed), this.ayahCount));
  }

  /**
   * The one line under the reader, and the only place the app ever asks for
   * anything. At most one ask is live at a time, in this order: a browser that
   * is not saving at all, then the feedback ask, then the back-up notice.
   *
   * The feedback ask goes here rather than into a modal on purpose. A reader
   * who has just hit their goal is in the middle of reading the Qur'an; a
   * dialog over the ayah to ask them how the app is going would be the single
   * most intrusive thing in it.
   */
  private paintBanner(mode: BannerMode | null): void {
    if (mode === this.bannerMode) return;
    this.bannerMode = mode;
    this.elBanner.hidden = mode === null;
    this.elBanner.classList.toggle('banner--warn', mode === 'degraded');
    if (mode === null) return;

    const dismiss = (onClick: () => void) =>
      el('button', { class: 'banner__dismiss', text: 'DISMISS', on: { click: onClick } });

    if (mode === 'degraded') {
      this.elBanner.replaceChildren(el('span', {
        text: 'This browser is not saving your progress — a private window, or storage is full. '
          + 'Reading still works; export a backup to keep it.',
      }));
      return;
    }

    if (mode === 'feedback') {
      this.elBanner.replaceChildren(
        el('span', {},
          'Three days on your goal. ',
          el('button', {
            class: 'link', text: 'Tell me how it is going',
            on: { click: this.cb.onOpenFeedback },
          }),
          ' — it is one screen, and nothing is sent unless you send it.'),
        dismiss(this.cb.onDismissFeedback),
      );
      return;
    }

    this.elBanner.replaceChildren(
      el('span', {},
        'Saved in this browser only — clearing site data wipes it. ',
        el('button', { class: 'link', text: 'Back up your progress', on: { click: this.cb.onOpenBackup } })),
      dismiss(this.cb.onDismissNotice),
    );
  }

  /**
   * Verse text and position. The face and the size are set BEFORE the split,
   * because the split is measured against them -- pages found for the old type
   * would be the wrong length for the new.
   *
   * The translation is not split. It is the whole ayah's meaning and it does
   * not divide at the point the Arabic happens to run out of room, so it is
   * painted whole and held there while the parts turn under it.
   */
  paintVerse(surah: Surah, index: number, page: number, settings: Snapshot['settings']): void {
    // The translation is settled BEFORE the split, not after. The ayah frame is
    // what the rest of the column leaves, and both of these move it: the size
    // sets how tall the translation box reserves, and hiding it hands that room
    // back. Split first and the pages would be measured against the frame the
    // PREVIOUS setting left.
    this.elTrans.textContent = surah.en[index] ?? '';
    this.elTrans.hidden = !settings.showTranslation;
    this.root.style.setProperty('--trans-size', `${settings.translationSize}px`);

    this.elAyah.dataset.font = settings.arabicFont;
    // Measured BEFORE the size goes on, and used for both the cap and the
    // split, so the two cannot disagree about the frame they are fitting. The
    // order is free: the frame is what the column leaves, and neither the type
    // nor the verse inside it has a vote in that.
    const available = this.availableHeight();
    this.elAyah.style.fontSize = `${fittedSize(settings.arabicSize, available, SIZE_MIN)}px`;
    // Zero for the pager, which has one answer for a box it cannot measure and
    // does not need the distinction the cap above turns on.
    this.pages = this.pager.split(this.elAyah, surah.ar[index] ?? '', available ?? 0);
    const shown = Math.min(Math.max(0, page), this.pages.length - 1);
    this.shownPage = shown;
    this.elAyah.textContent = this.pages[shown] ?? '';
    this.elLocPart.textContent = ` · part ${shown + 1} of ${this.pages.length}`;
    this.elLocPart.hidden = this.pages.length < 2;
    this.ayahCount = surah.meta.c;
    this.ayahShown = index + 1;
    this.elLocSurahTr.textContent = surah.meta.tr;
    this.elLocSurahAr.textContent = surah.meta.ar;
    this.elLocAyah.textContent = String(this.ayahShown);
    this.elLocTotal.textContent = ` of ${surah.meta.c}`;
    // A jump lands here too, so an edit left hanging is closed by its result.
    this.endAyahEdit();
    // Disabled only at the two ends of the Qur'an, and only on the part that
    // would actually leave it: the first part of 1:1 back, the last part of
    // 114:6 on. In between there is always somewhere to go.
    this.elPrev.disabled = surah.meta.n === 1 && index === 0 && shown === 0;
    this.elNext.disabled = surah.meta.n === 114 && index === surah.meta.c - 1
      && shown === this.pages.length - 1;
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

  /** The auto-advance readout beside the arrows. */
  paintAuto(playing: boolean, speed: number): void {
    this.elAuto.textContent = playing ? `▸ AUTO · ${speedText(speed)}` : '';
  }

  /**
   * The height a part has to fit, which is the frame minus its own padding.
   * The frame is fixed by the layout, so this does not move with the verse.
   *
   * Null, not zero, for a box that has not been laid out -- painted before it
   * reached the document, or while fullscreen has the screen. A box that HAS
   * been measured and has nothing left to give is a different answer, and the
   * callers have to be able to tell the two apart: one is the absence of a
   * measurement, the other is a real one of a window too short to read in.
   */
  private availableHeight(): number | null {
    if (this.elAyahBox.clientHeight === 0) return null;
    const cs = getComputedStyle(this.elAyahBox);
    return this.elAyahBox.clientHeight
      - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom);
  }

  /** Everything derived from state. Cheap enough to call on every change. */
  paintState(snap: Snapshot, degraded: boolean): void {
    const goal = snap.effectiveRung;
    this.elGoalCount.textContent = `${snap.versesToday}/${goal}`;
    this.elGoalBar.style.width = `${Math.min(100, (snap.versesToday / goal) * 100)}%`;

    this.elStreak.textContent = String(snap.streak.current);
    this.elMult.textContent = `×${snap.streak.multiplier.toFixed(1)}`;
    this.elPoints.textContent = num(snap.totals.points);
    this.elPointsToday.textContent = snap.pointsToday > 0 ? `+${num(snap.pointsToday)}` : '';
    this.elReadAll.textContent = snap.totals.seconds > 0
      ? `${(snap.totals.seconds / 3600).toFixed(snap.totals.seconds >= 36_000 ? 0 : 1)}h total` : '';
    this.elTimerOf.textContent = `of ${clockText(snap.settings.sessionLen)}`;

    this.paintTheme(snap.settings.theme);

    this.elTrans.hidden = !snap.settings.showTranslation;
    // The hints stop earning their place once the habit is underway.
    this.elHints.hidden = snap.totals.verses >= 20;

    // A reader who has never credited a verse is told what today asks for, in
    // the chip that otherwise only ever says GOAL MET. The two can never
    // collide: one needs no verses read, the other needs a goal's worth. It
    // clears itself on the first verse, which is the one dismissal that
    // cannot be got wrong.
    const firstVisit = snap.totals.verses === 0;
    this.elGoalChip.textContent = firstVisit
      ? firstVisitChip(snap.effectiveRung) : 'GOAL MET';
    this.elGoalMetric.classList.toggle('is-first-visit', firstVisit);

    // The warning earns its place only once there is progress worth losing --
    // or immediately if this browser is not saving anything at all.
    this.paintBanner(
      degraded ? 'degraded'
        : this.feedbackAsk ? 'feedback'
        : this.noticeDismissed || snap.totals.verses < 5 ? null
        : 'notice',
    );
  }

  /** The theme button's glyph and its tooltip, both driven by the resolved surface. */
  private paintTheme(theme: Theme): void {
    const resolved = resolveTheme(theme);
    if (resolved === this.themeFace) return;
    this.themeFace = resolved;
    const face = THEME_FACE[resolved];
    this.elTheme.querySelector('svg')!.innerHTML = face.paths;
    const title = `${face.label} — switch to ${face.next.toLowerCase()}`;
    this.elTheme.title = title;
    this.elTheme.setAttribute('aria-label', title);
  }

  noticeDismissed = false;
  /** Whether the feedback ask is owed; decided in core, set before a paint. */
  feedbackAsk = false;

  /** The session countdown and its bar; the only per-frame work. */
  paintClock(remainingSec: number, lengthSec: number, readSec: number): void {
    this.elTimer.textContent = clockText(remainingSec);
    this.elTimerBar.style.width = `${(2 + 98 * (1 - remainingSec / lengthSec)).toFixed(1)}%`;
    this.elRead.textContent = clockText(readSec);
  }

  /**
   * The daily goal landing.
   *
   * The quiet part is unconditional and is still the whole of an ordinary day:
   * the counter pops, the bar rings, the chip says GOAL MET. This is a Qur'an
   * reader, not a slot machine, and 364 days out of 365 that is all it does.
   *
   * `earned` is non-null only on the two moments that are worth more than that
   * -- a reader's first goal ever, and the first goal met after crossing a
   * streak multiplier tier -- and only then does the screen fill.
   */
  celebrateGoal(earned: Celebration | null = null): void {
    const goal = this.elGoalMetric;
    goal.classList.remove('is-celebrating');
    void goal.offsetWidth; // restart the animation
    goal.classList.add('is-celebrating');
    setTimeout(() => goal.classList.remove('is-celebrating'), 2100);

    if (earned === null) return;

    // A second burst landing on the first is possible only through the dev
    // handle, but a leaked canvas would paint over the ayah forever.
    this.stopConfetti?.();
    this.stopConfetti = confetti(earned.particles);

    this.card?.dismiss();
    this.card = celebrationCard(celebrationCopy(earned), earned.firstGoal !== null);
    goal.append(this.card.root);
  }

  /** Takes the card down when the reader leaves for fullscreen mid-celebration. */
  clearCelebration(): void {
    this.card?.dismiss();
    this.card = null;
  }
}

export { pointsPerVerse };
