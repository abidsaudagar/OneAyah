/**
 * The reader. One ayah, held still and centred, advanced by the reader.
 *
 * Hot-path updates (ayah text, counters, bars, timer) go through held element
 * references and textContent -- the same approach the design's own prototype
 * used. Nothing here diffs a tree sixty times a second.
 */
import type { Snapshot } from '../core/state.ts';
import { pointsPerVerse } from '../core/scoring.ts';
import { clockText, el, num, type Child } from './dom.ts';
import type { Surah } from '../data/quran.ts';

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
  onDismissNotice: () => void;
}

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

  // Held references for the hot path.
  private readonly elAyah: HTMLElement;
  private readonly elAyahBox: HTMLElement;
  private readonly elTrans: HTMLElement;
  private readonly elLocator: HTMLElement;
  private elLocAyah!: HTMLElement;
  private elLocInput!: HTMLInputElement;
  private elLocSurah!: HTMLButtonElement;
  private elLocTotal!: HTMLElement;
  /** Length of the surah on screen, so a typed ayah can be clamped to it. */
  private ayahCount = 1;
  private elHints!: HTMLElement;
  private readonly elGoalCount: HTMLElement;
  private readonly elGoalBar: HTMLElement;
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
  private elBannerText!: HTMLElement;

  constructor(cb: ReaderCallbacks) {
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

    const goalBtn = el('button', {
      class: 'goal-btn', attrs: { type: 'button', title: 'Change your daily goal' },
      on: { click: cb.onOpenGoal },
    },
      el('div', { class: 'metric__line' },
        el('span', { class: 'metric__label', text: 'DAILY GOAL' }),
        this.elGoalCount,
        el('span', { class: 'metric__unit', text: 'verses' })),
      el('div', { class: 'bar' }, this.elGoalBar),
      el('span', { class: 'metric__chip', text: 'GOAL MET' }),
    );

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
        el('div', { class: 'metric metric--goal' }, goalBtn),
        metric('metric--session', 'SESSION LEFT', [this.elTimer, this.elTimerOf],
          el('div', { class: 'bar' }, this.elTimerBar)),
        metric('metric--time', 'TIME READ', [this.elRead, this.elReadAll]),
        metric('metric--streak metric--accent', 'STREAK',
          [this.elStreak, el('span', { class: 'metric__unit', text: 'days' }), this.elMult]),
        metric('metric--points', 'POINTS', [this.elPoints, this.elPointsToday]),
      ),
      el('div', { class: 'hdr__menu' },
        icon('<path d="M2 4.5h14M2 9h14M2 13.5h14"/>', 'Surahs', cb.onOpenDrawer)),
    );

    this.elAyah = el('div', { class: 'ayah__text', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elAyahBox = el('div', { class: 'ayah' }, this.elAyah);
    this.elTrans = el('p', { class: 'translation__text' });
    this.elLocator = this.buildLocator(cb);
    this.elHints = el('div', { class: 'hints' },
      ...([['← →', 'ayah'], ['[ ]', 'text size'], ['T', 'translation'], ['F', 'fullscreen']] as const)
        .map(([k, what]) => el('span', {}, el('kbd', { text: k }), what)));

    this.elPrev = el('button', {
      class: 'nav__arrow', text: '←',
      attrs: { type: 'button', 'aria-label': 'Previous ayah' }, on: { click: cb.onPrev },
    });
    this.elNext = el('button', {
      class: 'nav__arrow', text: '→',
      attrs: { type: 'button', 'aria-label': 'Next ayah' }, on: { click: cb.onNext },
    });

    this.elBanner = el('div', { class: 'banner', attrs: { hidden: true } });

    this.root = el('div', { class: 'shell' },
      header,
      el('main', { class: 'reader' },
        this.elAyahBox,
        el('div', { class: 'translation' }, this.elTrans, this.elLocator),
        el('div', { class: 'nav' }, this.elPrev, this.elNext),
        this.elHints,
      ),
      this.elBanner,
    );

    this.buildBanner(cb);
  }

  /**
   * The line under the translation. It reads as plain text and keeps the same
   * type, but the surah name is a button onto the surah drawer, and the ayah
   * number opens a jump field on double-click -- deliberately double, so a
   * stray click while reading never turns the line into an input.
   */
  private buildLocator(cb: ReaderCallbacks): HTMLElement {
    this.elLocSurah = el('button', {
      class: 'locator__surah',
      attrs: { type: 'button', title: 'Browse surahs' },
      on: { click: cb.onOpenDrawer },
    });

    this.elLocAyah = el('span', {
      class: 'locator__ayah',
      attrs: { title: 'Double-click to jump to an ayah' },
      on: { dblclick: () => this.beginAyahEdit() },
    });

    this.elLocInput = el('input', {
      class: 'locator__input',
      attrs: {
        type: 'text', inputmode: 'numeric', hidden: true,
        'aria-label': 'Go to ayah', autocomplete: 'off',
      },
      on: {
        // The field is exactly as wide as what is in it, so the rest of the
        // line does not shift as digits are typed.
        input: () => this.sizeAyahInput(),
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') { e.preventDefault(); this.commitAyahEdit(cb); }
          else if (e.key === 'Escape') { e.preventDefault(); this.endAyahEdit(); }
        },
        // Clicking away abandons the edit; Enter is the only way to commit,
        // so a half-typed number can never move the reader on its own.
        blur: () => this.endAyahEdit(),
      },
    });

    this.elLocTotal = el('span', { class: 'locator__total' });

    return el('div', { class: 'locator' },
      this.elLocSurah, ' · ', this.elLocAyah, this.elLocInput, this.elLocTotal);
  }

  private sizeAyahInput(): void {
    this.elLocInput.style.width = `${Math.max(1, this.elLocInput.value.length)}ch`;
  }

  private beginAyahEdit(): void {
    this.elLocInput.value = this.elLocAyah.textContent ?? '';
    this.sizeAyahInput();
    this.elLocAyah.hidden = true;
    this.elLocInput.hidden = false;
    this.elLocInput.focus();
    this.elLocInput.select();
  }

  private endAyahEdit(): void {
    this.elLocInput.hidden = true;
    this.elLocAyah.hidden = false;
  }

  private commitAyahEdit(cb: ReaderCallbacks): void {
    const typed = Number.parseInt(this.elLocInput.value.trim(), 10);
    this.endAyahEdit();
    if (!Number.isFinite(typed)) return;
    cb.onJumpToAyah(Math.min(Math.max(1, typed), this.ayahCount));
  }

  private buildBanner(cb: ReaderCallbacks): void {
    this.elBannerText = el('span', {},
        'Saved in this browser only — clearing site data wipes it. ',
        el('button', { class: 'link', text: 'Back up your progress', on: { click: cb.onOpenBackup } }));
    this.elBanner.append(
      this.elBannerText,
      el('button', { class: 'banner__dismiss', text: 'DISMISS', on: { click: cb.onDismissNotice } }),
    );
  }

  /** Verse text and position. Called only when the ayah actually changes. */
  paintVerse(surah: Surah, index: number, settings: Snapshot['settings']): void {
    this.elAyah.textContent = surah.ar[index] ?? '';
    this.elAyah.dataset.font = settings.arabicFont;
    this.elAyah.style.fontSize = `${settings.arabicSize}px`;
    this.elTrans.textContent = surah.en[index] ?? '';
    this.elTrans.style.fontSize = `${settings.translationSize}px`;
    this.elTrans.hidden = !settings.showTranslation;
    this.ayahCount = surah.meta.c;
    this.elLocSurah.textContent = surah.meta.tr;
    this.elLocAyah.textContent = String(index + 1);
    this.elLocTotal.textContent = ` of ${surah.meta.c}`;
    // A jump lands here too, so an edit left hanging is closed by its result.
    this.endAyahEdit();
    this.elPrev.disabled = surah.meta.n === 1 && index === 0;
    this.elNext.disabled = surah.meta.n === 114 && index === surah.meta.c - 1;
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

    this.elTrans.hidden = !snap.settings.showTranslation;
    // The hints stop earning their place once the habit is underway.
    this.elHints.hidden = snap.totals.verses >= 20;

    // The warning earns its place only once there is progress worth losing --
    // or immediately if this browser is not saving anything at all.
    this.elBanner.classList.toggle('banner--warn', degraded);
    if (degraded) {
      this.elBannerText.textContent =
        'This browser is not saving your progress — a private window, or storage is full. '
        + 'Reading still works; export a backup to keep it.';
      this.elBanner.hidden = false;
    } else {
      this.elBanner.hidden = this.noticeDismissed || snap.totals.verses < 5;
    }
  }

  noticeDismissed = false;

  /** The session countdown and its bar; the only per-frame work. */
  paintClock(remainingSec: number, lengthSec: number, readSec: number): void {
    this.elTimer.textContent = clockText(remainingSec);
    this.elTimerBar.style.width = `${(2 + 98 * (1 - remainingSec / lengthSec)).toFixed(1)}%`;
    this.elRead.textContent = clockText(readSec);
  }

  /**
   * A brief, quiet acknowledgement when the daily goal lands. Deliberately
   * restrained -- this is a Qur'an reader, not a slot machine -- and it
   * reduces to nothing under prefers-reduced-motion.
   */
  celebrateGoal(): void {
    const goal = this.root.querySelector('.metric--goal');
    if (!goal) return;
    goal.classList.remove('is-celebrating');
    void (goal as HTMLElement).offsetWidth; // restart the animation
    goal.classList.add('is-celebrating');
    setTimeout(() => goal.classList.remove('is-celebrating'), 2100);
  }

  flashVerseChange(): void {
    this.elAyahBox.classList.add('ayah--changing');
    setTimeout(() => this.elAyahBox.classList.remove('ayah--changing'), 60);
  }
}

export { pointsPerVerse };
