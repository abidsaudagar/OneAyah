/**
 * Day identity. The day flips at 03:00 local, so late-night reading credits to
 * the day before.
 *
 * PURE: no ambient time, no globals. The local UTC offset arrives through an
 * injected `OffsetFn`, which is what makes the DST tests hermetic -- they do
 * not need a process-level TZ.
 */
import { DAY_ROLLOVER_HOUR, type DayKey } from '../types.ts';

/** Minutes east of UTC at a given instant. */
export type OffsetFn = (epochMs: number) => number;

export const systemOffset: OffsetFn = (ms) => -new Date(ms).getTimezoneOffset();

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export interface DayParts { y: number; m: number; d: number }

export function keyParts(key: DayKey): DayParts {
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)), d: Number(key.slice(8, 10)) };
}

const format = (y: number, m: number, d: number): DayKey => `${y}-${pad(m)}-${pad(d)}`;

/**
 * The rollover-adjusted local date for an instant.
 *
 * Shifts into local wall-clock time and back by the rollover hour, then reads
 * calendar fields. Never divides the epoch by 86_400_000 -- that is wrong twice
 * a year and wrong everywhere off a whole-hour offset.
 */
export function dayKeyOf(
  epochMs: number,
  offset: OffsetFn = systemOffset,
  rolloverHour: number = DAY_ROLLOVER_HOUR,
): DayKey {
  const wall = epochMs + offset(epochMs) * 60_000 - rolloverHour * 3_600_000;
  const d = new Date(wall);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Add (or subtract) whole days. Anchored at noon UTC, so DST cannot shift it. */
export function addDays(key: DayKey, n: number): DayKey {
  const { y, m, d } = keyParts(key);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + n * DAY_MS);
  return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const pa = keyParts(a);
  const pb = keyParts(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d, 12) - Date.UTC(pa.y, pa.m - 1, pa.d, 12)) / DAY_MS,
  );
}

/** 0 = Sunday, matching the heatmap's row order. */
export function weekdayOf(key: DayKey): number {
  const { y, m, d } = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The instant the current day key stops being current. */
export function nextRolloverMs(
  epochMs: number,
  offset: OffsetFn = systemOffset,
  rolloverHour: number = DAY_ROLLOVER_HOUR,
): number {
  const { y, m, d } = keyParts(addDays(dayKeyOf(epochMs, offset, rolloverHour), 1));
  const wall = Date.UTC(y, m - 1, d, rolloverHour);
  // Solve epoch + offset(epoch) === wall. One refinement settles any DST step.
  const first = wall - offset(epochMs) * 60_000;
  return wall - offset(first) * 60_000;
}
