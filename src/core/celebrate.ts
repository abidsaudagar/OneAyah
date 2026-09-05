/**
 * When the app is allowed to make a noise, and what noise.
 *
 * The app is quiet by design: hitting the goal on an ordinary day gets the
 * small pop in the header and nothing more. Two moments earn more than that,
 * and only two -- the first goal a reader ever meets, and the first goal met
 * after crossing a streak multiplier tier. Everything else is a Tuesday.
 *
 * Nothing here is stored. Both moments are read back out of the day records,
 * which means a cleared browser replays them (a reader genuinely starting over
 * gets the welcome again) and an imported backup with history correctly stays
 * silent -- with no field to add to PersistedState, and so no backup migration
 * and no version bump.
 */
import { STREAK_TIERS, type DayKey, type Rung } from '../types.ts';
import { daysBetween } from './day.ts';
import { multiplier } from './scoring.ts';
import { currentStreak, sortedKeys, type DayMap } from './streak.ts';

/** Particle counts. The first goal and a 7-day streak weigh the same. */
const PARTICLES_BASE = 90;
const PARTICLES_BY_TIER: Readonly<Record<number, number>> = { 7: 90, 30: 140, 100: 200 };

export interface Celebration {
  /** The streak tier being marked, when this goal crossed one. */
  milestone: { days: number; multiplier: number } | null;
  /** The rung met, set only when this is the first goal the reader has met. */
  firstGoal: Rung | null;
  particles: number;
}

const goalMet = (days: DayMap, key: DayKey): boolean => {
  const rec = days[key];
  return rec !== undefined && rec.v > 0 && rec.v >= rec.g;
};

/** The highest streak tier at or below `streakDays`, or 0 below the first. */
function tierOf(streakDays: number): number {
  // STREAK_TIERS runs highest-first, so the first match is the highest.
  for (const [days] of STREAK_TIERS) if (streakDays >= days) return days;
  return 0;
}

/**
 * The highest tier already marked on a goal-met day before `before`.
 *
 * Walks the day keys once, carrying the consecutive run, rather than asking
 * `currentStreak` per day: this runs on the goal-met crossing, which is once a
 * day, but a reader with years of history should not pay a quadratic walk for
 * a number the same pass can carry.
 */
function tierAlreadyMarked(days: DayMap, before: DayKey): number {
  let highest = 0;
  let run = 0;
  let prev: DayKey | null = null;

  for (const key of sortedKeys(days)) {
    if ((days[key]?.v ?? 0) < 1) {
      // A day record can exist with no verses read -- time accrues from the
      // moment the app opens. That day breaks the run exactly as an absent
      // one does.
      run = 0;
      prev = null;
      continue;
    }
    run = prev !== null && daysBetween(prev, key) === 1 ? run + 1 : 1;
    prev = key;
    if (key >= before) break;
    if (goalMet(days, key)) {
      const tier = tierOf(run);
      if (tier > highest) highest = tier;
    }
  }
  return highest;
}

/**
 * What today's goal-met crossing has earned, or null for an ordinary day.
 *
 * The caller must only ask on the crossing itself, and only when a credited
 * verse caused it: a reader who lowers their rung until the goal is behind
 * them has not hit anything, and the app must not tell them they have.
 */
export function celebrationFor(days: DayMap, today: DayKey): Celebration | null {
  const rec = days[today];
  if (!rec || rec.v < 1 || rec.v < rec.g) return null;

  const firstEver = !sortedKeys(days).some((k) => k !== today && goalMet(days, k));

  const streak = currentStreak(days, today);
  const tier = tierOf(streak);
  // A tier missed on its own day is not lost: it lands on the next goal-met
  // day instead, worded for the streak the reader actually has by then. What
  // makes that safe is comparing against tiers already MARKED, not against the
  // tier this day happens to sit on.
  const crossed = tier > 0 && tier > tierAlreadyMarked(days, today);

  if (!firstEver && !crossed) return null;

  return {
    milestone: crossed ? { days: streak, multiplier: multiplier(streak) } : null,
    firstGoal: firstEver ? rec.g : null,
    particles: crossed ? (PARTICLES_BY_TIER[tier] ?? PARTICLES_BASE) : PARTICLES_BASE,
  };
}

/** Rungs are a closed set, so the headline can spell its number. */
const SPELLED: Readonly<Record<Rung, string>> = {
  1: 'One', 3: 'Three', 5: 'Five', 10: 'Ten', 20: 'Twenty', 30: 'Thirty',
};

export interface CelebrationCopy {
  headline: string;
  body: string;
  /** The goal-picker line, shown only alongside the arrow. */
  teach: string | null;
}

/**
 * The card's three lines. A milestone owns the headline when there is one,
 * even on a reader's first goal -- the streak is the bigger fact, and the
 * teaching line survives underneath it either way, because it has still never
 * been shown.
 */
export function celebrationCopy(c: Celebration): CelebrationCopy {
  const teach = c.firstGoal === null
    ? null
    : 'The goal is yours to set. Change it whenever it stops fitting.';

  if (c.milestone) {
    return {
      headline: `${c.milestone.days} days.`,
      body: `Every verse now earns ×${c.milestone.multiplier.toFixed(1)} while the streak holds.`,
      teach,
    };
  }

  const rung = c.firstGoal!;
  return {
    headline: `${SPELLED[rung]} ${rung === 1 ? 'verse' : 'verses'}. Your first goal met.`,
    body: 'Come back tomorrow and it becomes a streak.',
    teach,
  };
}

/** The chip above the goal bar before a reader has read anything at all. */
export const firstVisitChip = (rung: Rung): string =>
  `${rung} ${rung === 1 ? 'VERSE' : 'VERSES'} TODAY`;
