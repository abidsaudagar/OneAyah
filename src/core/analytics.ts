/**
 * Everything the streak-and-analytics screen needs, derived from the day map.
 *
 * PURE: takes a day map and a day key, returns plain data. Knows nothing about
 * SVG, colours, or the DOM.
 */
import type { DayKey, DayRecord, Rung } from '../types.ts';
import { addDays, daysBetween, weekdayOf } from './day.ts';
import {
  currentStreak, daysRead, daysSinceStart, didRead, firstDay, longestStreak,
  longestStreakSpan, type DayMap,
} from './streak.ts';
import { multiplier } from './scoring.ts';

export type Range = 'month' | 'year' | 'all';

/**
 * Heatmap intensity, matching the design's `MISSED ... 3x GOAL` legend.
 * 0 = nothing read, 4 = three times the goal or more.
 */
export function heatLevel(verses: number, rung: Rung): 0 | 1 | 2 | 3 | 4 {
  if (verses <= 0) return 0;
  const ratio = verses / rung;
  if (ratio < 1) return 1;
  if (ratio < 2) return 2;
  if (ratio < 3) return 3;
  return 4;
}

export interface HeatCell {
  key: DayKey;
  verses: number;
  seconds: number;
  rung: Rung;
  level: 0 | 1 | 2 | 3 | 4;
}

export function rangeBounds(range: Range, today: DayKey, first: DayKey | null): {
  from: DayKey;
  to: DayKey;
} {
  if (range === 'month') return { from: addDays(today, -29), to: today };
  if (range === 'year') return { from: addDays(today, -364), to: today };
  const start = first ?? addDays(today, -29);
  // Always show at least a month, so a brand-new reader sees a grid, not a dot.
  return { from: daysBetween(start, today) < 29 ? addDays(today, -29) : start, to: today };
}

/**
 * Column-major cells for the GitHub-style grid: seven rows, Sunday first,
 * padded with nulls so the first and last columns are whole weeks.
 */
export function weekGrid(days: DayMap, from: DayKey, to: DayKey): (HeatCell | null)[] {
  const cells: (HeatCell | null)[] = [];
  for (let i = 0; i < weekdayOf(from); i++) cells.push(null);

  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) {
    const key = addDays(from, i);
    const rec = days[key];
    cells.push({
      key,
      verses: rec?.v ?? 0,
      seconds: rec?.s ?? 0,
      rung: rec?.g ?? 5,
      level: heatLevel(rec?.v ?? 0, rec?.g ?? 5),
    });
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export interface Series {
  keys: DayKey[];
  verses: number[];
  minutes: number[];
  points: number[];
}

/** Dense and zero-filled: missing days are real zeroes, not gaps in the chart. */
export function series(days: DayMap, from: DayKey, to: DayKey): Series {
  const out: Series = { keys: [], verses: [], minutes: [], points: [] };
  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) {
    const key = addDays(from, i);
    const rec: DayRecord | undefined = days[key];
    out.keys.push(key);
    out.verses.push(rec?.v ?? 0);
    out.minutes.push(Math.round(((rec?.s ?? 0) / 60) * 10) / 10);
    out.points.push(rec?.p ?? 0);
  }
  return out;
}

export interface Tiles {
  currentStreak: number;
  multiplier: number;
  longest: number;
  longestSpan: [DayKey, DayKey] | null;
  daysRead: number;
  daysSinceStart: number;
  points: number;
  verses: number;
  seconds: number;
}

export function tiles(days: DayMap, today: DayKey): Tiles {
  const streak = currentStreak(days, today);
  let points = 0;
  let verses = 0;
  let seconds = 0;
  for (const rec of Object.values(days)) {
    points += rec.p;
    verses += rec.v;
    seconds += rec.s;
  }
  return {
    currentStreak: streak,
    multiplier: multiplier(streak),
    longest: longestStreak(days),
    longestSpan: longestStreakSpan(days),
    daysRead: daysRead(days),
    daysSinceStart: daysSinceStart(days, today),
    points,
    verses,
    seconds,
  };
}

/** Totals over a bounded window, for the range tabs. */
export function rangeTotals(days: DayMap, from: DayKey, to: DayKey): {
  verses: number;
  minutes: number;
  points: number;
  daysRead: number;
} {
  let verses = 0;
  let seconds = 0;
  let points = 0;
  let read = 0;
  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) {
    const key = addDays(from, i);
    const rec = days[key];
    if (!rec) continue;
    verses += rec.v;
    seconds += rec.s;
    points += rec.p;
    if (didRead(days, key)) read++;
  }
  return { verses, minutes: Math.round(seconds / 60), points, daysRead: read };
}

export { firstDay };
