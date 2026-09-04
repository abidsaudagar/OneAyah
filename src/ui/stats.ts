/**
 * Streak and analytics, screen 1e -- extended with a verses-per-day bar chart
 * and a minutes-read trend, which the design listed as a to-do.
 *
 * Charts are hand-rolled SVG. A charting library would outweigh the entire
 * rest of the app.
 */
import {
  rangeBounds, rangeTotals, series, tiles, weekGrid, type Range,
} from '../core/analytics.ts';
import { firstDay, type DayMap } from '../core/streak.ts';
import type { DayKey } from '../types.ts';
import { clockText, el, num, svg } from './dom.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pretty = (key: DayKey): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const hours = (seconds: number): string => {
  const h = seconds / 3600;
  if (h >= 10) return `${Math.round(h)}h`;
  if (h >= 1) return `${h.toFixed(1)}h`;
  return `${Math.round(seconds / 60)}m`;
};

/** Bars, one per day, scaled to the busiest day in the window. */
function barChart(values: number[], keys: DayKey[], label: string, fmt: (n: number) => string) {
  const W = 1000;
  const H = 90;
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const slot = W / n;
  const barW = Math.max(1, Math.min(slot - 1, slot * 0.75));

  const bars = values.map((v, i) => {
    const h = v === 0 ? 0 : Math.max(2, (v / max) * H);
    return svg('rect', {
      x: (i * slot + (slot - barW) / 2).toFixed(2),
      y: (H - h).toFixed(2),
      width: barW.toFixed(2),
      height: h.toFixed(2),
      rx: Math.min(1.5, barW / 2).toFixed(2),
      fill: v === 0 ? 'var(--track)' : 'var(--accent)',
      'fill-opacity': v === 0 ? '1' : '0.85',
    }, svg('title', {}, `${pretty(keys[i]!)} — ${fmt(v)}`));
  });

  return el('div', { class: 'chart' },
    el('div', { class: 'chart__title', text: `${label} · PEAK ${fmt(max)}` }),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img' }, ...bars),
  );
}

/** A filled area, because minutes read is a trend rather than a set of events. */
function trendChart(values: number[], keys: DayKey[], label: string) {
  const W = 1000;
  const H = 70;
  const max = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (v / max) * H;

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${W},${H}L0,${H}Z`;

  return el('div', { class: 'chart' },
    el('div', { class: 'chart__title', text: `${label} · PEAK ${max.toFixed(max >= 10 ? 0 : 1)} MIN` }),
    svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img' },
      svg('path', { d: area, fill: 'var(--accent)', 'fill-opacity': '0.12' }),
      svg('path', {
        d: line, fill: 'none', stroke: 'var(--accent)', 'stroke-width': '2',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
      }),
      ...values.map((v, i) => svg('circle', { cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: 0, fill: 'none' },
        svg('title', {}, `${pretty(keys[i]!)} — ${v} min`))),
    ),
  );
}

export function renderStats(host: HTMLElement, days: DayMap, today: DayKey, range: Range,
  onRange: (r: Range) => void): void {
  const t = tiles(days, today);
  const { from, to } = rangeBounds(range, today, firstDay(days));
  const grid = weekGrid(days, from, to);
  const s = series(days, from, to);
  const win = rangeTotals(days, from, to);

  const tile = (label: string, value: string, sub: string, accent = false) =>
    el('div', { class: `tile${accent ? ' tile--accent' : ''}` },
      el('div', { class: 'tile__label', text: label }),
      el('div', { class: 'tile__value', text: value }),
      el('div', { class: 'tile__sub', text: sub }));

  const tab = (id: Range, label: string) => el('button', {
    text: label,
    attrs: { 'aria-selected': range === id, type: 'button' },
    on: { click: () => onRange(id) },
  });

  host.replaceChildren(
    el('div', { class: 'stats' },
      el('div', { class: 'stats__head' },
        el('div', {},
          el('h2', { style: 'font:600 15px/1.3 var(--font-ui);margin:0 0 4px', text: 'Your reading' }),
          el('p', {
            style: 'font:400 12.5px/1.5 var(--font-ui);color:var(--muted);margin:0',
            text: 'Darker means more verses than your goal that day. Grey means the day passed empty.',
          })),
        el('div', { class: 'tabs' }, tab('month', 'MONTH'), tab('year', 'YEAR'), tab('all', 'ALL TIME'))),

      el('div', { class: 'tiles' },
        tile('CURRENT STREAK', String(t.currentStreak),
          `days · multiplier ×${t.multiplier.toFixed(1)}`, true),
        tile('LONGEST', String(t.longest),
          t.longestSpan ? `days · ${pretty(t.longestSpan[0])} → ${pretty(t.longestSpan[1])}` : 'days'),
        tile('DAYS READ', num(t.daysRead),
          t.daysSinceStart > 0 ? `of ${num(t.daysSinceStart)} since you started` : 'no days yet'),
        tile('POINTS', num(t.points), `${num(t.verses)} verses · ${hours(t.seconds)} read`)),

      el('div', { class: 'heat__wrap' },
        el('div', { class: 'heat' }, ...grid.map((c) => el('span', {
          attrs: {
            'data-l': c === null ? 'pad' : String(c.level),
            title: c === null ? null
              : `${pretty(c.key)} — ${c.verses === 0 ? 'missed'
                : `${c.verses} ${c.verses === 1 ? 'verse' : 'verses'}, ${clockText(c.seconds)}`}`,
          },
        })))),

      el('div', { class: 'legend' },
        el('span', { text: 'MISSED' }),
        ...[0, 1, 2, 3, 4].map((l) => el('i', { style: `background:var(--heat-${l})` })),
        el('span', { text: '3× GOAL' }),
        el('span', {
          style: 'margin-left:auto',
          text: `${pretty(from).toUpperCase()} → ${pretty(to).toUpperCase()}`,
        })),

      barChart(s.verses, s.keys, 'VERSES PER DAY', (n) => `${n}`),
      trendChart(s.minutes, s.keys, 'MINUTES READ'),

      el('p', {
        style: 'font:400 11.5px/1.6 var(--font-ui);color:var(--muted);margin:22px 0 0',
        text: `In this window: ${num(win.verses)} verses over ${num(win.daysRead)} days, `
          + `${num(win.minutes)} minutes, ${num(win.points)} points.`,
      }),
    ),
  );
}
