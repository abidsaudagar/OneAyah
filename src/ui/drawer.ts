/**
 * The surah drawer. Surah list + search in v1; the JUZ and BOOKMARKS tabs are
 * shown disabled so the shape stays recognisable -- the app auto-resumes your
 * exact position, which is what a single bookmark would have been for.
 */
import { Coverage } from '../core/coverage.ts';
import { placeIn } from '../core/places.ts';
import { surahStart } from '../data/quran.ts';
import type { Places, QuranMeta, SurahMeta } from '../types.ts';
import { el } from './dom.ts';

let open: HTMLElement | null = null;

export function closeDrawer(): void {
  open?.remove();
  open = null;
}

export const isDrawerOpen = (): boolean => open !== null;

/** Case- and diacritic-insensitive, so "fatiha" finds "Al-Fātiḥah". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function openDrawer(
  meta: QuranMeta,
  current: number,
  coverageB64: string,
  places: Places,
  onPick: (surah: number) => void,
): void {
  closeDrawer();
  const cov = Coverage.fromBase64(coverageB64);

  const list = el('div', { class: 'drawer__list' });

  const row = (s: SurahMeta) => {
    const read = cov.countRange(surahStart(meta, s.n), s.c);
    // The kept place is worth naming: it is the difference between a jump that
    // restarts the surah and one that hands it back, and the reader cannot
    // otherwise tell which they are about to get.
    const at = placeIn(places, s.n);
    const meta2 = s.n === current
      ? `${s.c} VERSES · READING NOW`
      : at > 1 ? `${s.c} VERSES · RESUMES AT ${at}`
        : read > 0 ? `${s.c} VERSES · ${read} READ` : `${s.c} VERSES`;

    return el('button', {
      class: `surah${s.n === current ? ' surah--current' : ''}`,
      attrs: { type: 'button' },
      on: { click: () => { onPick(s.n); closeDrawer(); } },
    },
      el('span', { class: 'surah__n', text: String(s.n) }),
      el('span', { class: 'surah__body' },
        el('div', { class: 'surah__name', text: s.tr }),
        el('div', { class: 'surah__meta', text: meta2 })),
      el('span', { class: 'surah__ar', attrs: { dir: 'rtl', lang: 'ar' }, text: s.ar }),
    );
  };

  const render = (q: string) => {
    const needle = fold(q.trim());
    const hits = needle
      ? meta.surahs.filter((s) =>
        fold(s.tr).includes(needle) || fold(s.en).includes(needle)
        || s.ar.includes(q.trim()) || String(s.n) === needle)
      : meta.surahs;
    list.replaceChildren(...hits.map(row));
    if (hits.length === 0) {
      list.append(el('p', { style: 'padding:20px 24px;color:var(--muted)', text: 'No surah matches that.' }));
    }
  };

  const search = el('input', {
    class: 'drawer__search',
    attrs: { type: 'search', placeholder: 'Search surah or verse…', 'aria-label': 'Search surahs' },
    on: { input: (e: Event) => render((e.target as HTMLInputElement).value) },
  });

  const tab = (label: string, active: boolean, enabled: boolean) => el('button', {
    class: 'drawer__tab',
    text: label,
    attrs: { 'aria-selected': active, disabled: !enabled, title: enabled ? null : 'Coming soon' },
  });

  const panel = el('aside', { class: 'drawer', attrs: { role: 'dialog', 'aria-label': 'Surahs' } },
    el('div', { class: 'drawer__tabs' },
      tab('SURAH', true, true), tab('JUZ', false, false), tab('BOOKMARKS', false, false)),
    search,
    list,
    el('p', {
      style: 'padding:14px 24px;font:400 11.5px/1.5 var(--font-ui);color:var(--muted);border-top:1px solid var(--border);margin:0',
      text: 'Jumping surah keeps your place in the old one — come back and you land where you left it.',
    }),
  );

  const scrim = el('div', {
    class: 'scrim',
    style: 'justify-content:flex-end;padding:0',
    on: { pointerdown: (e: PointerEvent) => { if (e.target === scrim) closeDrawer(); } },
  }, panel);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeDrawer(); }
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('remove', () => document.removeEventListener('keydown', onKey, true));

  render('');
  document.body.append(scrim);
  open = scrim;
  search.focus();

  // Bring the current surah into view without animating a 114-row jump.
  list.querySelector('.surah--current')?.scrollIntoView({ block: 'center' });
}
