/**
 * The rung gate. Rungs 1/3/5/10 are free; 20 must be earned with 7 consecutive
 * goal-met days at rung 10, and 30 the same at rung 20.
 *
 * Unlocks are STICKY: once earned, a missed day never takes a rung away. The
 * habit gate exists to slow the climb, not to punish a bad week.
 */
import { FREE_MAX_RUNG, RUNGS, UNLOCK_DAYS, type DayKey, type Rung, type UnlockProgress } from '../types.ts';
import { addDays } from './day.ts';
import { goalMetRun, type DayMap } from './streak.ts';

export interface UnlockRule { rung: Rung; requires: Rung }

export const UNLOCK_RULES: readonly UnlockRule[] = [
  { rung: 20, requires: 10 },
  { rung: 30, requires: 20 },
] as const;

/** Rungs a reader may pick right now. */
export const selectableRungs = (unlockedMax: Rung): Rung[] =>
  RUNGS.filter((r) => r <= unlockedMax);

/**
 * The highest rung earned so far. Monotonic: `current` is a floor, so a rung
 * already banked is never revoked.
 */
export function recomputeUnlockedMax(days: DayMap, todayKey: DayKey, current: Rung): Rung {
  let max: Rung = current > FREE_MAX_RUNG ? current : FREE_MAX_RUNG;
  for (const rule of UNLOCK_RULES) {
    if (max < rule.requires) break; // 30 cannot be earned before 20 is held
    if (rule.rung <= max) continue;
    if (goalMetRun(days, todayKey, rule.requires, UNLOCK_DAYS) >= UNLOCK_DAYS) {
      // One step per recompute. The seven days that earn rung 20 must not also
      // earn rung 30 -- climbing to 30 takes its own seven days at rung 20,
      // which can only be read once 20 is actually held.
      max = rule.rung;
      break;
    }
  }
  return max;
}

/** One dashed/filled box per day for the 7-box strip on screen 1d. */
export interface UnlockDay { key: DayKey; met: boolean; future: boolean }

export function unlockProgress(
  days: DayMap,
  todayKey: DayKey,
  unlockedMax: Rung,
): UnlockProgress & { recentDays: UnlockDay[] } {
  const rule = UNLOCK_RULES.find((r) => r.rung > unlockedMax);
  if (!rule) {
    return { target: null, requires: unlockedMax, progress: 0, needed: 0, recentDays: [] };
  }

  const progress = unlockedMax >= rule.requires
    ? goalMetRun(days, todayKey, rule.requires, UNLOCK_DAYS)
    : 0;

  // The strip runs from (UNLOCK_DAYS - 1) days ago through today, so the last
  // cell is today and everything after the run reads as still to come.
  const recentDays: UnlockDay[] = [];
  for (let i = UNLOCK_DAYS - 1; i >= 0; i--) {
    const key = addDays(todayKey, -i);
    const rec = days[key];
    recentDays.push({
      key,
      met: !!rec && rec.g >= rule.requires && rec.v >= rec.g,
      future: false,
    });
  }

  return { target: rule.rung, requires: rule.requires, progress, needed: UNLOCK_DAYS, recentDays };
}
