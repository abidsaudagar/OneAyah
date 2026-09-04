/**
 * Modal panels: the goal picker, the upgrade gate, settings, the local-data
 * warning, and the session-complete card.
 *
 * Panels re-render their whole subtree when opened. They are cheap, they are
 * correct, and no diffing is needed for something the reader sees for a few
 * seconds at a time.
 */
import { goalBonus, pointsPerVerse } from '../core/scoring.ts';
import type { Snapshot } from '../core/state.ts';
import { unlockProgress } from '../core/unlock.ts';
import {
  RUNGS, SESSION_LABELS, SESSION_LENGTHS, UNLOCK_DAYS,
  type Accent, type ArabicFont, type Rung, type SessionLen, type Settings, type Theme,
} from '../types.ts';
import { clockText, el, num } from './dom.ts';

export interface PanelHandle { close(): void }

let openPanel: PanelHandle | null = null;

/** Opens a modal, closing whatever was open. Esc and scrim-click dismiss it. */
export function openModal(build: (close: () => void) => HTMLElement): PanelHandle {
  openPanel?.close();

  const scrim = el('div', { class: 'scrim' });
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

const FONTS: { id: ArabicFont; label: string }[] = [
  { id: 'amiri-quran', label: 'AMIRI QURAN' },
  { id: 'noto-naskh', label: 'NOTO NASKH ARABIC' },
];
const ACCENTS: { id: Accent; hex: string }[] = [
  { id: 'blue', hex: '#2a6fd6' }, { id: 'green', hex: '#1f7a5a' },
  { id: 'purple', hex: '#8a5cd6' }, { id: 'black', hex: '#141618' },
];
const THEMES: Theme[] = ['light', 'dark', 'system'];

export function openSettings(
  settings: Settings,
  patch: (p: Partial<Settings>) => void,
  showAbout: () => void,
): void {
  openModal((close) => {
    const rerender = () => { close(); openSettings(settings, patch, showAbout); };
    const set = (p: Partial<Settings>) => { Object.assign(settings, p); patch(p); rerender(); };

    const stepper = (label: string, sub: string, dec: () => void, inc: () => void) =>
      el('div', { class: 'row' },
        el('div', {}, el('div', { class: 'row__label', text: label }), el('div', { class: 'row__sub', text: sub })),
        el('div', { class: 'stepper' },
          el('button', { text: '−', attrs: { 'aria-label': `Decrease ${label}` }, on: { click: dec } }),
          el('button', { text: '+', attrs: { 'aria-label': `Increase ${label}` }, on: { click: inc } }),
        ),
      );

    return el('div', { class: 'panel panel--narrow', attrs: { role: 'dialog', 'aria-label': 'Settings' } },
      el('h2', { class: 'panel__title', style: 'margin-bottom:20px', text: 'Reading settings' }),

      el('div', { class: 'panel__section', text: 'ARABIC FONT' }),
      el('div', { class: 'opts' }, ...FONTS.map((f) => el('button', {
        class: 'font-opt',
        attrs: { type: 'button', role: 'radio', 'aria-checked': settings.arabicFont === f.id },
        on: { click: () => set({ arabicFont: f.id }) },
      },
        el('div', {
          class: 'font-opt__sample',
          style: `font-family:${f.id === 'amiri-quran' ? 'var(--font-amiri)' : 'var(--font-naskh)'}`,
          text: 'بِسْمِ ٱللَّهِ',
        }),
        el('div', { class: 'font-opt__name', text: f.label }),
      ))),

      stepper('Arabic size', `${settings.arabicSize} px`,
        () => set({ arabicSize: Math.max(24, settings.arabicSize - 6) }),
        () => set({ arabicSize: Math.min(200, settings.arabicSize + 6) })),
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

      el('div', { class: 'panel__section', text: 'FULLSCREEN AUTO-ADVANCE' }),
      el('div', { class: 'row', style: 'border-top:0;padding-top:0' },
        el('div', {},
          el('div', { class: 'row__label', text: settings.autoAdvanceSec === null ? 'Off — advance by hand' : `On — ${settings.autoAdvanceSec}s per ayah` }),
          el('div', { class: 'row__sub', text: 'For reading from across the room' })),
        el('div', { class: 'stepper' },
          el('button', {
            text: '−',
            on: { click: () => set({ autoAdvanceSec: settings.autoAdvanceSec === null ? null : settings.autoAdvanceSec <= 5 ? null : settings.autoAdvanceSec - 1 }) },
          }),
          el('button', {
            text: '+',
            on: { click: () => set({ autoAdvanceSec: settings.autoAdvanceSec === null ? 5 : Math.min(30, settings.autoAdvanceSec + 1) }) },
          }),
        ),
      ),

      el('div', { class: 'panel__section', text: 'APPEARANCE' }),
      el('div', { class: 'row', style: 'border-top:0;padding-top:0' },
        el('div', { class: 'row__label', text: 'Theme' }),
        el('div', { class: 'tabs' }, ...THEMES.map((t) => el('button', {
          text: t.toUpperCase(),
          attrs: { 'aria-selected': settings.theme === t },
          on: { click: () => set({ theme: t }) },
        }))),
      ),
      el('div', { class: 'row' },
        el('div', { class: 'row__label', text: 'Accent' }),
        el('div', { class: 'swatches' }, ...ACCENTS.map((a) => el('button', {
          class: 'swatch',
          style: `background:${a.hex}`,
          attrs: { 'aria-checked': settings.accent === a.id, 'aria-label': a.id, role: 'radio' },
          on: { click: () => set({ accent: a.id }) },
        }))),
      ),

      btnRow(
        el('button', { class: 'btn', text: 'SOURCES', on: { click: () => { close(); showAbout(); } } }),
        el('button', { class: 'btn btn--primary', text: 'DONE', on: { click: close } }),
      ),
    );
  });
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

/* --------------------------------------------------------- session complete */

export interface SessionSummary {
  lengthSec: SessionLen;
  verses: number;
  rung: Rung;
  goalMet: boolean;
  bonus: number;
  multiplier: number;
  earned: number;
  streakDay: number;
  goalDelta: number;
}

export function openSessionComplete(
  s: SessionSummary,
  actions: { onAgain: () => void; onDone: () => void },
): void {
  const headline = s.verses === 0
    ? 'No verses this time.'
    : s.goalDelta > 0
      ? `${s.verses} ${s.verses === 1 ? 'verse' : 'verses'}. Goal beaten by ${s.goalDelta}.`
      : s.goalMet
        ? `${s.verses} ${s.verses === 1 ? 'verse' : 'verses'}. Goal met.`
        : `${s.verses} ${s.verses === 1 ? 'verse' : 'verses'}. ${s.rung - s.verses} to go.`;

  const cell = (label: string, value: string, accent = false) => el('div', {
    style: `flex:1;padding:15px 0;${accent ? 'background:var(--subtle);' : 'border-right:1px solid var(--border);'}`,
  },
    el('div', { style: 'color:var(--muted);font-size:9.5px;letter-spacing:.08em;margin-bottom:8px', text: label }),
    el('div', { style: `font-size:17px${accent ? ';color:var(--accent)' : ''}`, text: value }),
  );

  openModal((close) => el('div', {
    class: 'panel panel--wide', style: 'text-align:center', attrs: { role: 'dialog' },
  },
    el('div', {
      class: 'mono',
      style: 'font:500 11px/1 var(--font-mono);letter-spacing:.12em;color:var(--accent);margin-bottom:20px',
      text: '00:00 — SESSION DONE',
    }),
    el('div', { style: 'max-width:420px;margin:0 auto 26px' },
      el('div', { class: 'bar', style: 'height:10px;border-radius:5px;margin:0' },
        el('div', { class: 'bar__fill', style: 'width:100%' })),
      el('div', {
        style: 'display:flex;justify-content:space-between;font:500 10px/1 var(--font-mono);letter-spacing:.08em;color:var(--muted);margin-top:9px',
      },
        el('span', { text: `${clockText(s.lengthSec)} SESSION` }),
        el('span', { text: 'FULL' })),
    ),
    el('h2', { style: 'font:600 19px/1.35 var(--font-ui);margin:0 0 8px', text: headline }),
    el('p', {
      style: 'font:400 12.5px/1.6 var(--font-ui);color:var(--muted);margin:0 0 22px',
      text: `Day ${s.streakDay}. ${s.goalMet ? 'Your streak holds.' : 'Reading even one more verse keeps the streak alive.'}`,
    }),
    el('div', {
      class: 'mono',
      style: 'display:flex;border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:22px;font:500 11px/1 var(--font-mono)',
    },
      cell('VERSES', `${s.verses} × ${pointsPerVerse(s.rung)}`),
      cell('GOAL BONUS', s.bonus > 0 ? `+${s.bonus}` : '—'),
      cell('STREAK', `×${s.multiplier.toFixed(1)}`),
      cell('EARNED', `+${num(s.earned)}`, true),
    ),
    btnRow(
      el('button', { class: 'btn', text: 'DONE FOR TODAY', on: { click: () => { actions.onDone(); close(); } } }),
      el('button', {
        class: 'btn btn--primary', text: 'ONE MORE ROUND',
        on: { click: () => { actions.onAgain(); close(); } },
      }),
    ),
  ));
}

/* -------------------------------------------------------------------- about */

export function openAbout(): void {
  const base = import.meta.env.BASE_URL;
  openModal((close) => el('div', { class: 'panel', attrs: { role: 'dialog' } },
    el('h2', { class: 'panel__title', text: 'Sources and licences' }),
    el('p', {
      class: 'panel__lede',
      text: 'Both texts are reproduced verbatim and only reshaped into JSON. Nothing has been normalised, re-punctuated or corrected.',
    }),
    el('div', { style: 'font:400 12.5px/1.7 var(--font-ui);color:var(--secondary)' },
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'Arabic text · ' }),
        'Tanzil Qur’an Text (Uthmani) v1.1, © 2007–2021 Tanzil Project, licensed CC BY 3.0. ',
        el('a', { attrs: { href: 'https://tanzil.net', target: '_blank', rel: 'noreferrer' }, text: 'tanzil.net' })),
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'English translation · ' }),
        '“Quran in English” by Talal Itani. ',
        el('a', { attrs: { href: 'https://www.clearquran.com', target: '_blank', rel: 'noreferrer' }, text: 'ClearQuran.com' })),
      el('p', { style: 'margin:0 0 12px' },
        el('strong', { text: 'Fonts · ' }),
        'Amiri Quran, Noto Naskh Arabic and IBM Plex Mono, all under the SIL Open Font License 1.1.'),
      el('p', { style: 'margin:0' },
        el('a', { attrs: { href: `${base}licenses/tanzil.txt`, target: '_blank' }, text: 'Full notices' }),
        ' · ',
        el('a', { attrs: { href: `${base}licenses/clearquran.txt`, target: '_blank' }, text: 'translation licence' }),
        ' · ',
        el('a', { attrs: { href: `${base}licenses/fonts.txt`, target: '_blank' }, text: 'fonts' })),
    ),
    btnRow(el('button', { class: 'btn btn--primary', text: 'CLOSE', on: { click: close } })),
  ));
}

export { goalBonus };
