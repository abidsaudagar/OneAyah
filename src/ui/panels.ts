/**
 * Modal panels: the goal picker, the upgrade gate, settings, the local-data
 * warning, the analytics, the feedback ask and the sources note.
 *
 * Panels re-render their whole subtree when opened. They are cheap, they are
 * correct, and no diffing is needed for something the reader sees for a few
 * seconds at a time.
 */
import { reportText, type ReportRow } from '../core/feedback.ts';
import { goalBonus, pointsPerVerse } from '../core/scoring.ts';
import type { Snapshot } from '../core/state.ts';
import { copyText, selectText } from '../platform/clipboard.ts';
import { BUILD } from '../config.ts';
import { unlockProgress } from '../core/unlock.ts';
import {
  RUNGS, SCRIPT_OF, SESSION_LABELS, SESSION_LENGTHS, THEMES, UNLOCK_DAYS,
  type Accent, type ArabicFont, type Rung, type SessionLen, type Settings,
} from '../types.ts';
import { arabicWordsPerMinute, stepSpeed } from '../core/dwell.ts';
import { clockText, el, num, speedText } from './dom.ts';

export interface PanelHandle { close(): void }

let openPanel: PanelHandle | null = null;

export interface ModalOptions {
  /** Anchor the panel to a screen edge instead of centring it. */
  side?: 'left' | 'right';
}

/** Opens a modal, closing whatever was open. Esc and scrim-click dismiss it. */
export function openModal(
  build: (close: () => void) => HTMLElement,
  opts: ModalOptions = {},
): PanelHandle {
  openPanel?.close();

  const scrim = el('div', {
    class: 'scrim',
    style: opts.side
      ? `padding:0;align-items:stretch;justify-content:flex-${opts.side === 'left' ? 'start' : 'end'}`
      : '',
  });
  const close = () => {
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
    if (openPanel === handle) openPanel = null;
  };
  const handle: PanelHandle = { close };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };

  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey, true);

  scrim.append(build(close));
  document.body.append(scrim);
  scrim.querySelector<HTMLElement>('button, input, [tabindex]')?.focus();

  openPanel = handle;
  return handle;
}

export const closeAnyPanel = (): void => openPanel?.close();
export const isPanelOpen = (): boolean => openPanel !== null;

const btnRow = (...kids: HTMLElement[]) => el('div', { class: 'btns' }, ...kids);

/* ------------------------------------------------------------- goal picker */

const RUNG_BLURB: Record<Rung, string> = {
  1: 'verse — the never-miss floor',
  3: 'verses — under a minute',
  5: 'verses — a comfortable daily habit',
  10: 'verses — free to take, any time',
  20: 'verses — earned, not given',
  30: 'verses — the top rung',
};

export function openGoalPicker(snap: Snapshot, onPick: (r: Rung) => void): void {
  openModal((close) => {
    let choice: Rung = snap.goal;

    const rows = RUNGS.map((rung) => {
      const locked = rung > snap.unlockedMax;
      const isNext = locked && rung === RUNGS.find((r) => r > snap.unlockedMax);

      const row = el('button', {
        class: 'opt',
        attrs: { type: 'button', role: 'radio', 'aria-checked': rung === choice, disabled: locked },
        on: {
          click: () => {
            if (locked) return;
            choice = rung;
            for (const r of rows) r.setAttribute('aria-checked', String(Number(r.dataset.rung) === choice));
          },
        },
      },
        el('span', { class: 'opt__n', text: String(rung) }),
        el('span', {
          class: 'opt__label',
          text: locked ? `${RUNG_BLURB[rung]} — locked` : RUNG_BLURB[rung],
        }),
        locked
          ? (isNext
            ? el('span', { class: 'opt__badge', text: 'EARN IT' })
            : el('span', { class: 'opt__meta', text: `after ${RUNGS[RUNGS.indexOf(rung) - 1]}` }))
          : el('span', { class: 'opt__meta', text: `${pointsPerVerse(rung)} pts / verse` }),
      );
      row.dataset.rung = String(rung);
      return row;
    });

    return el('div', { class: 'panel', attrs: { role: 'dialog', 'aria-label': 'Daily goal' } },
      el('h2', { class: 'panel__title', text: 'Your daily goal' }),
      el('p', {
        class: 'panel__lede',
        text: 'Pick the number you can hit on your worst day, not your best. Higher rungs pay more per verse.',
      }),
      el('div', { class: 'opts', attrs: { role: 'radiogroup' } }, ...rows),
      btnRow(
        el('button', { class: 'btn', text: 'CANCEL', on: { click: close } }),
        el('button', {
          class: 'btn btn--primary', text: 'SET GOAL',
          on: { click: () => { onPick(choice); close(); } },
        }),
      ),
      el('p', {
        class: 'panel__note',
        text: 'Dropping down is always free and never breaks your streak. Raising it takes effect tomorrow, so today’s points cannot be rescored.',
      }),
    );
  });
}

/* ------------------------------------------------------------ upgrade gate */

export function openUpgradeGate(snap: Snapshot, days: Parameters<typeof unlockProgress>[0]): void {
  const p = unlockProgress(days, snap.today, snap.unlockedMax);
  if (p.target === null) return;

  openModal((close) => el('div', { class: 'panel', attrs: { role: 'dialog' } },
    el('h2', { class: 'panel__title', text: `${p.target} verses has to be earned` }),
    el('p', {
      class: 'panel__lede',
      text: `Hit your ${p.requires}-verse goal seven days in a row and the ${p.target}-verse rung unlocks itself. No streak, no jump — the habit comes before the volume.`,
    }),
    el('div', { class: 'week' }, ...p.recentDays.map((d, i) => el('div', {
      class: `week__day${d.met ? ' week__day--met' : ''}${i === p.recentDays.length - 1 && !d.met ? ' week__day--today' : ''}`,
      text: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${d.key}T12:00:00Z`).getUTCDay()]!,
    }))),
    el('p', {
      class: 'mono',
      style: 'font:500 11.5px/1 var(--font-mono);margin:0 0 22px',
      text: `${p.progress} / ${UNLOCK_DAYS} DAYS AT ${p.requires} VERSES — ${
        p.needed - p.progress === 1 ? 'ONE TO GO' : `${p.needed - p.progress} TO GO`}`,
    }),
    btnRow(el('button', { class: 'btn btn--primary', text: 'GOT IT', on: { click: close } })),
  ));
}

/* ----------------------------------------------------------------- settings */

/**
 * One face per script, so this choice is the script -- which is why it is
 * labelled that way and each option names the text it sets, not just the font.
 */
const FONTS: { id: ArabicFont; label: string; family: string; note: string }[] = [
  {
    id: 'al-qalam-indopak',
    label: 'INDO-PAK',
    family: 'var(--font-indopak)',
    note: 'Al Qalam Quran Majeed',
  },
  {
    id: 'amiri-quran',
    label: 'UTHMANI',
    family: 'var(--font-amiri)',
    note: 'Amiri Quran',
  },
];
const ACCENTS: { id: Accent; hex: string }[] = [
  { id: 'blue', hex: '#2a6fd6' }, { id: 'green', hex: '#1f7a5a' },
  { id: 'purple', hex: '#8a5cd6' }, { id: 'black', hex: '#141618' },
];

/**
 * Whether auto-advance is RUNNING is not a setting -- it is what the reader is
 * doing this minute, and it lives in the composition root next to the timer
 * that drives it. The panel reaches it through this rather than through
 * `patch`, and asks for the value with a function rather than taking a copy,
 * because the panel re-renders by reopening itself with the arguments it was
 * built from: a captured boolean would be one toggle out of date every time.
 */
export interface AutoAdvanceControl {
  isPlaying(): boolean;
  setPlaying(on: boolean): void;
}

export function openSettings(
  settings: Settings,
  patch: (p: Partial<Settings>) => void,
  showAbout: () => void,
  showFeedback: () => void,
  auto: AutoAdvanceControl,
): void {
  openModal((close) => {
    const rerender = () => { close(); openSettings(settings, patch, showAbout, showFeedback, auto); };
    const set = (p: Partial<Settings>) => { Object.assign(settings, p); patch(p); rerender(); };

    const stepper = (label: string, sub: string, dec: () => void, inc: () => void) =>
      el('div', { class: 'row' },
        el('div', {}, el('div', { class: 'row__label', text: label }), el('div', { class: 'row__sub', text: sub })),
        el('div', { class: 'stepper' },
          el('button', { text: '−', attrs: { 'aria-label': `Decrease ${label}` }, on: { click: dec } }),
          el('button', { text: '+', attrs: { 'aria-label': `Increase ${label}` }, on: { click: inc } }),
        ),
      );

    return el('div', {
      class: 'side side--left side--scroll', attrs: { role: 'dialog', 'aria-label': 'Settings' },
    },
      el('h2', { class: 'panel__title', style: 'margin-bottom:20px', text: 'Reading settings' }),

      el('div', { class: 'panel__section', text: 'ARABIC SCRIPT' }),
      el('div', { class: 'opts' }, ...FONTS.map((f) => el('button', {
        class: 'font-opt',
        attrs: { type: 'button', role: 'radio', 'aria-checked': settings.arabicFont === f.id },
        on: { click: () => set({ arabicFont: f.id }) },
      },
        el('div', {
          class: 'font-opt__sample',
          style: `font-family:${f.family}`,
          text: SCRIPT_OF[f.id] === 'indopak' ? 'بِسۡمِ اللهِ' : 'بِسْمِ ٱللَّهِ',
        }),
        el('div', { class: 'font-opt__name', text: f.label }),
        el('div', { class: 'font-opt__note', text: f.note }),
      ))),

      stepper('Arabic size', `${settings.arabicSize} px · or press [ and ]`,
        () => set({ arabicSize: Math.max(24, settings.arabicSize - 6) }),
        () => set({ arabicSize: Math.min(200, settings.arabicSize + 6) })),
      el('div', { class: 'row' },
        el('div', {},
          el('div', { class: 'row__label', text: 'Show translation' }),
          el('div', { class: 'row__sub', text: 'Or press T while reading' })),
        el('div', { class: 'tabs' },
          el('button', {
            text: 'OFF', attrs: { 'aria-selected': !settings.showTranslation },
            on: { click: () => set({ showTranslation: false }) },
          }),
          el('button', {
            text: 'ON', attrs: { 'aria-selected': settings.showTranslation },
            on: { click: () => set({ showTranslation: true }) },
          }))),
      stepper('Translation size', `${settings.translationSize} px · font is fixed`,
        () => set({ translationSize: Math.max(12, settings.translationSize - 1) }),
        () => set({ translationSize: Math.min(40, settings.translationSize + 1) })),

      el('div', { class: 'panel__section', text: 'SESSION LENGTH' }),
      el('div', { class: 'opts' }, ...SESSION_LENGTHS.map((len: SessionLen) => el('button', {
        class: 'opt',
        attrs: { type: 'button', role: 'radio', 'aria-checked': settings.sessionLen === len },
        on: { click: () => set({ sessionLen: len }) },
      },
        el('span', { class: 'opt__n', style: 'width:48px;font-size:13px', text: clockText(len) }),
        el('span', { class: 'opt__label', text: SESSION_LABELS[len] }),
      ))),

      el('div', { class: 'panel__section', text: 'AUTO-ADVANCE' }),
      el('div', { class: 'row', style: 'border-top:0;padding-top:0' },
        el('div', {},
          el('div', { class: 'row__label', text: 'Turn the ayah for me' }),
          el('div', { class: 'row__sub', text: 'Or press P while reading' })),
        el('div', { class: 'tabs' },
          el('button', {
            text: 'OFF', attrs: { 'aria-selected': !auto.isPlaying() },
            on: { click: () => { auto.setPlaying(false); rerender(); } },
          }),
          el('button', {
            text: 'ON', attrs: { 'aria-selected': auto.isPlaying() },
            on: { click: () => { auto.setPlaying(true); rerender(); } },
          }))),
      stepper('Reading speed',
        `${speedText(settings.autoAdvanceSpeed)} · about ${
          arabicWordsPerMinute(settings.autoAdvanceSpeed)} words a minute`,
        () => set({ autoAdvanceSpeed: stepSpeed(settings.autoAdvanceSpeed, -1) }),
        () => set({ autoAdvanceSpeed: stepSpeed(settings.autoAdvanceSpeed, 1) })),
      el('p', {
        class: 'panel__note', style: 'margin:2px 0 0',
        text: 'Every ayah is held for as long as its own words need, so a long verse '
          + 'gets a long hold and two words get two seconds. This dial scales that, and '
          + 'the line along the bottom of the screen shows how much of the hold is left.',
      }),

      el('div', { class: 'panel__section', text: 'APPEARANCE' }),
      el('div', { class: 'row', style: 'border-top:0;padding-top:0' },
        el('div', { class: 'row__label', text: 'Theme' }),
        el('div', { class: 'tabs tabs--theme' }, ...THEMES.map((t) => el('button', {
          text: t.toUpperCase(),
          attrs: { 'aria-selected': settings.theme === t },
          on: { click: () => set({ theme: t }) },
        }))),
      ),
      el('div', { class: 'row' },
        el('div', {},
          el('div', { class: 'row__label', text: 'Accent' }),
          // Paper pins the accent to its own ink, so the swatches would
          // otherwise sit there doing nothing with no word as to why. The
          // choice still registers -- it comes back on light or dark.
          settings.theme === 'paper'
            ? el('div', { class: 'row__sub', text: 'Paper uses its own ink' })
            : null),
        el('div', {
          class: settings.theme === 'paper' ? 'swatches swatches--muted' : 'swatches',
        }, ...ACCENTS.map((a) => el('button', {
          class: 'swatch',
          style: `background:${a.hex}`,
          attrs: { 'aria-checked': settings.accent === a.id, 'aria-label': a.id, role: 'radio' },
          on: { click: () => set({ accent: a.id }) },
        }))),
      ),

      el('div', { class: 'panel__section', text: 'FEEDBACK' }),
      el('div', { class: 'row', style: 'border-top:0;padding-top:0' },
        el('div', {},
          el('div', { class: 'row__label', text: 'Tell me what is wrong with it' }),
          el('div', { class: 'row__sub', text: 'Nothing is sent unless you send it' })),
        el('button', {
          class: 'btn', style: 'flex:none;padding:0 16px',
          text: 'FEEDBACK', on: { click: () => { close(); showFeedback(); } },
        }),
      ),

      btnRow(
        el('button', { class: 'btn', text: 'SOURCES', on: { click: () => { close(); showAbout(); } } }),
        el('button', { class: 'btn btn--primary', text: 'DONE', on: { click: close } }),
      ),
    );
  }, { side: 'left' });
}

/* ------------------------------------------------------- local-data warning */

export function openBackupPanel(
  snap: Snapshot,
  actions: { onExport: () => void; onImport: () => void; onDismiss: () => void },
): void {
  openModal((close) => el('div', { class: 'panel', attrs: { role: 'dialog' } },
    el('h2', {
      class: 'panel__title',
      text: snap.streak.current > 0
        ? `${snap.streak.current} ${snap.streak.current === 1 ? 'day' : 'days'} of streak live in this browser`
        : 'Your progress lives in this browser',
    }),
    el('p', {
      class: 'panel__lede',
      text: 'Everything is saved on this device, so it works offline and nobody sees your reading. But clearing site data, a private window, or a new laptop and it is gone for good. There is no account to fall back on.',
    }),
    el('div', {
      style: 'border:1px solid var(--border);border-radius:var(--r-lg);padding:14px 16px;background:var(--subtle);margin-bottom:20px;font:500 11px/1.9 var(--font-mono)',
    },
      ...([['STREAK', `${snap.streak.current} days`],
        ['VERSES', num(snap.totals.verses)],
        ['POINTS', num(snap.totals.points)]] as const).map(([k, v]) =>
        el('div', { style: 'display:flex;justify-content:space-between' },
          el('span', { style: 'color:var(--muted)', text: k }),
          el('span', { text: v }))),
    ),
    el('div', { class: 'opts' },
      el('button', {
        class: 'btn btn--primary', style: 'height:40px',
        text: 'EXPORT A BACKUP FILE', on: { click: () => { actions.onExport(); close(); } },
      }),
      el('button', {
        class: 'btn', style: 'height:40px',
        text: 'IMPORT A BACKUP FILE', on: { click: () => { actions.onImport(); close(); } },
      }),
      el('button', {
        class: 'btn btn--plain', style: 'height:40px',
        text: 'Keep it local, remind me later',
        on: { click: () => { actions.onDismiss(); close(); } },
      }),
    ),
  ));
}

/* -------------------------------------------------------------------- stats */

/**
 * Streak and analytics, moved off the reading screen and behind the header's
 * chart icon: the first screen should be the ayah, not a wall of numbers.
 */
export function openStatsPanel(render: (host: HTMLElement) => void): void {
  openModal((close) => {
    const host = el('div', {});
    render(host);
    return el('div', {
      class: 'panel panel--stats', attrs: { role: 'dialog', 'aria-label': 'Your reading' },
    },
      host,
      // .btns supplies the flex context the button's `flex: 1` needs; without
      // it the button collapses to its own text width.
      el('div', { class: 'btns', style: 'margin:0;padding:0 28px 24px' },
        el('button', { class: 'btn btn--primary', text: 'CLOSE', on: { click: close } })),
    );
  });
}

/* ----------------------------------------------------------------- feedback */

/**
 * The feedback ask. There is no backend, so this panel cannot send anything --
 * and does not pretend to. It asks three questions worth answering, points at
 * wherever feedback is being taken, and offers the reader's own numbers as a
 * block they can see in full and copy if they want to. Nothing is appended to
 * the form URL: what travels is what the reader pastes.
 */
export function openFeedbackPanel(rows: readonly ReportRow[], formUrl: string): void {
  openModal((close) => {
    const box = el('div', { class: 'report' }, ...rows.map(([label, value]) =>
      el('div', { class: 'report__row' },
        el('span', { class: 'report__key', text: label }),
        el('span', { class: 'report__val', text: value }))));

    const copy = el('button', {
      class: 'btn', text: 'COPY THESE NUMBERS',
      on: {
        click: () => {
          void copyText(reportText(rows)).then((ok) => {
            // A refused clipboard is not a dead end: select the block instead
            // and let the reader press the key they already know.
            if (!ok) selectText(box);
            copy.textContent = ok ? 'COPIED' : 'SELECTED — COPY IT';
            setTimeout(() => { copy.textContent = 'COPY THESE NUMBERS'; }, 2200);
          });
        },
      },
    });

    return el('div', { class: 'panel', attrs: { role: 'dialog', 'aria-label': 'Feedback' } },
      el('h2', { class: 'panel__title', text: 'Tell me how it is going' }),
      el('p', {
        class: 'panel__lede',
        text: 'Three answers help more than anything else: what made you stop reading, '
          + 'what surprised you, and whether you would miss this if it vanished tomorrow.',
      }),

      el('div', { class: 'panel__section', text: 'OPTIONAL — YOUR NUMBERS' }),
      el('p', {
        class: 'panel__lede',
        style: 'margin-bottom:12px',
        text: 'Everything below is already on your own screen somewhere. It is here so you '
          + 'do not have to transcribe it, and it travels only if you paste it.',
      }),
      box,

      formUrl
        ? btnRow(
          copy,
          el('a', {
            class: 'btn btn--primary', text: 'OPEN THE FORM',
            attrs: { href: formUrl, target: '_blank', rel: 'noreferrer' },
            on: { click: () => setTimeout(close, 0) },
          }),
        )
        : btnRow(copy, el('button', { class: 'btn btn--primary', text: 'CLOSE', on: { click: close } })),

      formUrl
        ? null
        : el('p', {
          class: 'panel__note',
          text: 'There is no feedback form wired up in this build yet. Send it however you '
            + 'reached One Ayah in the first place, and paste the numbers in if they help.',
        }),
    );
  });
}

/* -------------------------------------------------------------------- about */

export function openAbout(): void {
  const base = import.meta.env.BASE_URL;
  openModal((close) => el('div', { class: 'panel', attrs: { role: 'dialog' } },
    el('h2', { class: 'panel__title', text: 'Sources and licences' }),
    el('p', {
      class: 'panel__lede',
      text: 'Every text is reproduced verbatim and only reshaped into JSON. Nothing has been normalised, re-punctuated or corrected.',
    }),
    el('div', { style: 'font:400 12.5px/1.7 var(--font-ui);color:var(--secondary)' },
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'Arabic text · ' }),
        'Tanzil Qur’an Text (Uthmani) v1.1, © 2007–2021 Tanzil Project, licensed CC BY 3.0. ',
        el('a', { attrs: { href: 'https://tanzil.net', target: '_blank', rel: 'noreferrer' }, text: 'tanzil.net' })),
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'Indo-Pak text · ' }),
        'Indo-Pak (Hanafi) script as served by the Quran.com API; the basmala is prefixed to opening ayat, as in the Uthmani text. ',
        el('a', { attrs: { href: 'https://quran.com', target: '_blank', rel: 'noreferrer' }, text: 'quran.com' })),
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'English translation · ' }),
        '“Quran in English” by Talal Itani. ',
        el('a', { attrs: { href: 'https://www.clearquran.com', target: '_blank', rel: 'noreferrer' }, text: 'ClearQuran.com' })),
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'Fonts · ' }),
        'Amiri Quran and IBM Plex Mono under the SIL Open Font License 1.1. Al Qalam Quran Majeed publishes no licence; it is redistributed unmodified and credited.'),
      el('p', { style: 'margin:0' },
        el('a', { attrs: { href: `${base}licenses/tanzil.txt`, target: '_blank' }, text: 'Full notices' }),
        ' · ',
        el('a', { attrs: { href: `${base}licenses/indopak.txt`, target: '_blank' }, text: 'Indo-Pak text' }),
        ' · ',
        el('a', { attrs: { href: `${base}licenses/clearquran.txt`, target: '_blank' }, text: 'translation licence' }),
        ' · ',
        el('a', { attrs: { href: `${base}licenses/fonts.txt`, target: '_blank' }, text: 'fonts' })),
    ),
    // The build is here so a report from a reader can name the code it came
    // from -- there is no other way to tell two deploys apart from outside.
    el('p', { class: 'panel__note', text: `One Ayah · build ${BUILD} · runs entirely in this browser` }),
    btnRow(el('button', { class: 'btn btn--primary', text: 'CLOSE', on: { click: close } })),
  ));
}

export { goalBonus };
