/**
 * Scoring. Daily beats binge: the per-verse rate rises with the rung committed
 * to, a flat goal bonus lands on top, a streak multiplier scales the lot, and
 * anything past twice the goal is worth half.
 *
 * ALL ARITHMETIC IS INTEGER. Points are carried in half-points and multipliers
 * in tenths, because the float path is not exact -- `65 * 1.2` evaluates to
 * 78.00000000000001, which quietly fails every equality assertion and can show
 * a stray decimal in the UI.
 */
import {
  BINGE_CAP_MULTIPLE, GOAL_BONUS_FACTOR, POINTS_PER_VERSE, STREAK_TIERS,
  type Rung,
} from '../types.ts';

export const pointsPerVerse = (rung: Rung): number => POINTS_PER_VERSE[rung];

/** A flat 7x the per-verse rate: 21 / 28 / 35 / 49 / 63 / 70. */
export const goalBonus = (rung: Rung): number => GOAL_BONUS_FACTOR * POINTS_PER_VERSE[rung];

/** Multiplier in tenths, so 1.2 is carried as 12. Highest satisfied tier wins. */
export function multiplierTenths(streakDays: number): number {
  for (const [days, mult] of STREAK_TIERS) {
    if (streakDays >= days) return Math.round(mult * 10);
  }
  return 10;
}

export const multiplier = (streakDays: number): number => multiplierTenths(streakDays) / 10;

export interface DayScore {
  /** Verses paid at the full rate (up to 2x the goal). */
  fullVerses: number;
  /** Verses past 2x the goal, paid at half. */
  halfVerses: number;
  base: number;
  goalMet: boolean;
  goalBonus: number;
  multiplierTenths: number;
  /** Final integer points for the day. */
  total: number;
}

export function scoreDay(input: {
  verses: number;
  rung: Rung;
  streakDays: number;
}): DayScore {
  const { verses, rung, streakDays } = input;
  const rate = POINTS_PER_VERSE[rung];
  const cap = BINGE_CAP_MULTIPLE * rung;

  const fullVerses = Math.min(verses, cap);
  const halfVerses = Math.max(0, verses - cap);
  const baseHalves = 2 * rate * fullVerses + rate * halfVerses;

  const goalMet = verses >= rung;
  const bonusHalves = goalMet ? 2 * GOAL_BONUS_FACTOR * rate : 0;

  const tenths = multiplierTenths(streakDays);
  const total = Math.round(((baseHalves + bonusHalves) * tenths) / 20);

  return {
    fullVerses,
    halfVerses,
    base: baseHalves / 2,
    goalMet,
    goalBonus: bonusHalves / 2,
    multiplierTenths: tenths,
    total,
  };
}
