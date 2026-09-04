/**
 * Streak queries over the day map.
 *
 * The rule that matters: reading >=1 verse keeps a streak alive. Hitting the
 * goal is what earns the bonus and drives unlocks -- that lives in unlock.ts.
 * A day key exists if and only if at least one verse was credited that day, so
 * "did I read" is `key in days`, and a missed day is an absent key.
 */
import type { DayKey, DayRecord, Rung } from '../types.ts';
import { addDays, daysBetween } from './day.ts';

export type DayMap = Readonly<Record<DayKey, DayRecord>>;

export const sortedKeys = (days: DayMap): DayKey[] => Object.keys(days).sort();

/**
 * Did the reader actually read on this day?
 *
 * A record can exist with `v: 0` -- time accrues from the moment the reader
 * opens the app, before any verse has cleared the dwell gate. Such a day is
 * NOT a read day: it breaks the streak and shows grey on the heatmap, which is
 * the honest reading of "the day passed empty".
 */
export const didRead = (days: DayMap, key: DayKey): boolean => (days[key]?.v ?? 0) >= 1;

const readKeys = (days: DayMap): DayKey[] => sortedKeys(days).filter((k) => didRead(days, k));

/**
 * Days read in an unbroken run ending today.
 *
 * If today has no record yet -- 04:00, nothing read -- counting starts at
 * yesterday, so the header still shows the streak the reader went to bed with
 * rather than dropping to 0 until they read again.
 */
export function currentStreak(days: DayMap, todayKey: DayKey): number {
  let cursor = didRead(days, todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (didRead(days, cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(days: DayMap): number {
  const keys = readKeys(days);
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const k of keys) {
    run = prev !== null && daysBetween(prev, k) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

/** The span of the longest run, for the "Feb-Mar 2026" caption on the tile. */
export function longestStreakSpan(days: DayMap): [DayKey, DayKey] | null {
  const keys = readKeys(days);
  if (keys.length === 0) return null;
  let best = 0;
  let bestEnd: DayKey = keys[0]!;
  let run = 0;
  let prev: DayKey | null = null;
  for (const k of keys) {
    run = prev !== null && daysBetween(prev, k) === 1 ? run + 1 : 1;
    if (run > best) { best = run; bestEnd = k; }
    prev = k;
  }
  return [addDays(bestEnd, -(best - 1)), bestEnd];
}

export const daysRead = (days: DayMap): number => readKeys(days).length;

export function firstDay(days: DayMap): DayKey | null {
  const keys = readKeys(days);
  return keys.length ? keys[0]! : null;
}

/** Days elapsed since the first recorded day, inclusive of both ends. */
export function daysSinceStart(days: DayMap, todayKey: DayKey): number {
  const first = firstDay(days);
  return first === null ? 0 : daysBetween(first, todayKey) + 1;
}

/**
 * Length of the run of consecutive goal-met days at a rung of at least
 * `minRung`, ending at `endingAt`. Stops early once `limit` is reached.
 */
export function goalMetRun(
  days: DayMap,
  endingAt: DayKey,
  minRung: Rung,
  limit = Number.MAX_SAFE_INTEGER,
): number {
  let cursor = endingAt;
  let n = 0;
  while (n < limit) {
    const rec = days[cursor];
    if (!rec || rec.g < minRung || rec.v < rec.g) break;
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
