/**
 * The reader. One ayah, held still and centred, advanced by the reader.
 *
 * Hot-path updates (ayah text, counters, bars, timer) go through held element
 * references and textContent -- the same approach the design's own prototype
 * used. Nothing here diffs a tree sixty times a second.
 */
import type { Snapshot } from '../core/state.ts';
import { requiredDwellMsForWords } from '../core/dwell.ts';
import { evaluateDwell } from '../core/dwell.ts';
import { pointsPerVerse } from '../core/scoring.ts';
import { clockText, el, num } from './dom.ts';
import type { Surah } from '../data/quran.ts';

export interface ReaderCallbacks {
  onPrev: () => void;
  onNext: () => void;
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
  private readonly elDwell: HTMLElement;
  private readonly elPrev: HTMLButtonElement;
  private readonly elNext: HTMLButtonElement;
  private readonly elBanner: HTMLElement;
  private elBannerText!: HTMLElement;

  constructor(cb: ReaderCallbacks) {
    const metric = (
      cls: string, label: string, value: HTMLElement, tail: HTMLElement,
    ) => el('div', { class: `metric ${cls}` },
      el('div', { class: 'metric__label', text: label }), value, tail);

    this.elGoalCount = el('span', { text: '0/5' });
    this.elGoalBar = el('div', { class: 'bar__fill' });
    this.elTimer = el('span', { text: '01:10' });
    this.elTimerOf = el('span', { class: 'metric__unit', text: 'of 1:10' });
    this.elTimerBar = el('div', { class: 'bar__fill bar__fill--instant' });
    this.elRead = el('span', { text: '00:00' });
    this.elReadAll = el('div', { class: 'metric__sub', text: '' });
    this.elStreak = el('span', { text: '0' });
    this.elMult = el('div', { class: 'metric__sub', text: 'multiplier ×1.0' });
    this.elPoints = el('span', { text: '0' });
    this.elPointsToday = el('div', { class: 'metric__sub', text: '' });

    const goalBtn = el('button', {
      class: 'goal-btn', attrs: { type: 'button', title: 'Change your daily goal' },
      on: { click: cb.onOpenGoal },
    },
      el('div', { class: 'metric__label', text: 'DAILY GOAL' }),
      el('div', { class: 'metric__value' }, this.elGoalCount, el('span', { class: 'metric__unit', text: 'verses' })),
      el('div', { class: 'bar' }, this.elGoalBar),
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
      el('div', { class: 'metric metric--goal' }, goalBtn),
      metric('metric--session', 'SESSION LEFT',
        el('div', { class: 'metric__value' }, this.elTimer, this.elTimerOf),
        el('div', { class: 'bar' }, this.elTimerBar)),
      metric('metric--time', 'TIME READ', el('div', { class: 'metric__value' }, this.elRead), this.elReadAll),
      metric('metric--streak metric--accent', 'STREAK',
        el('div', { class: 'metric__value' }, this.elStreak, el('span', { class: 'metric__unit', text: 'days' })),
        this.elMult),
      metric('metric--points', 'POINTS', el('div', { class: 'metric__value' }, this.elPoints), this.elPointsToday),
      el('div', { class: 'hdr__menu' },
        icon('<path d="M2 4.5h14M2 9h14M2 13.5h14"/>', 'Surahs', cb.onOpenDrawer)),
    );

    this.elAyah = el('div', { class: 'ayah__text', attrs: { dir: 'rtl', lang: 'ar' } });
    this.elAyahBox = el('div', { class: 'ayah' }, this.elAyah);
    this.elDwell = el('div', { class: 'dwell__fill' });
    this.elTrans = el('p', { class: 'translation__text' });
    this.elLocator = el('div', { class: 'locator' });

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
        el('div', { class: 'dwell' }, this.elDwell),
        el('div', { class: 'translation' }, this.elTrans, this.elLocator),
        el('div', { class: 'nav' },
          this.elPrev,
          el('div', { class: 'nav__hint', text: 'ARROW KEYS FOR PREVIOUS / NEXT AYAH' }),
          this.elNext),
      ),
      this.elBanner,
    );

    this.buildBanner(cb);
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
    this.elLocator.textContent = `${surah.meta.tr} · ${index + 1} of ${surah.meta.c}`;
    this.elPrev.disabled = surah.meta.n === 1 && index === 0;
    this.elNext.disabled = surah.meta.n === 114 && index === surah.meta.c - 1;
  }

  /** Everything derived from state. Cheap enough to call on every change. */
  paintState(snap: Snapshot, degraded: boolean): void {
    const goal = snap.effectiveRung;
    this.elGoalCount.textContent = `${snap.versesToday}/${goal}`;
    this.elGoalBar.style.width = `${Math.min(100, (snap.versesToday / goal) * 100)}%`;

    this.elStreak.textContent = String(snap.streak.current);
    this.elMult.textContent = `multiplier ×${snap.streak.multiplier.toFixed(1)}`;
    this.elPoints.textContent = num(snap.totals.points);
    this.elPointsToday.textContent = snap.pointsToday > 0 ? `+${num(snap.pointsToday)} today` : '';
    this.elReadAll.textContent = snap.totals.seconds > 0
      ? `${(snap.totals.seconds / 3600).toFixed(snap.totals.seconds >= 36_000 ? 0 : 1)}h all time` : '';
    this.elTimerOf.textContent = `of ${clockText(snap.settings.sessionLen)}`;

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

  /** A hairline that fills as the current ayah earns its credit. */
  paintDwell(fraction: number, credited: boolean): void {
    this.elDwell.style.width = credited ? '0%' : `${Math.min(100, fraction * 100).toFixed(1)}%`;
  }

  flashVerseChange(): void {
    this.elAyahBox.classList.add('ayah--changing');
    setTimeout(() => this.elAyahBox.classList.remove('ayah--changing'), 60);
  }
}

export { evaluateDwell, requiredDwellMsForWords, pointsPerVerse };
