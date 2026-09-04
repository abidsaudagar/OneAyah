/**
 * The pure reducer. Every rule that is expensive to get wrong lives behind this
 * function, and none of it can touch the DOM, storage, or the ambient clock --
 * every action carries the instant it happened at.
 */
import {
  DAY_ROLLOVER_HOUR, FREE_MAX_RUNG, type DayKey, type DayRecord, type PersistedState,
  type Position, type Rung, type Settings, type StreakInfo,
} from '../types.ts';
import { Coverage } from './coverage.ts';
import { dayKeyOf, type OffsetFn } from './day.ts';
import { multiplier, scoreDay } from './scoring.ts';
import { currentStreak, daysRead, daysSinceStart, longestStreak, type DayMap } from './streak.ts';
import { recomputeUnlockedMax, selectableRungs } from './unlock.ts';

export const DEFAULT_SETTINGS: Settings = {
  arabicFont: 'al-qalam-indopak',
  showTranslation: false,
  arabicSize: 64,
  translationSize: 18,
  sessionLen: 70,
  theme: 'system',
  accent: 'blue',
  autoAdvanceSec: null,
};

export function initialState(nowMs: number, offset?: OffsetFn): PersistedState {
  const day = dayKeyOf(nowMs, offset, DAY_ROLLOVER_HOUR);
  return {
    version: 1,
    days: {},
    goal: 5,
    unlockedMax: FREE_MAX_RUNG,
    position: { surah: 1, ayah: 1 },
    totals: { points: 0, verses: 0, seconds: 0 },
    settings: { ...DEFAULT_SETTINGS },
    credited: { day, ids: [] },
    coverage: Coverage.empty().toBase64(),
    noticeDismissed: false,
    feedbackDismissed: false,
  };
}

export type Action =
  /** Nudges the rollover check; changes nothing else. */
  | { t: 'heartbeat'; nowMs: number }
  | { t: 'creditVerse'; id: number; nowMs: number }
  | { t: 'addSeconds'; seconds: number; nowMs: number }
  | { t: 'setRung'; rung: Rung; nowMs: number }
  | { t: 'setPosition'; position: Position }
  | { t: 'patchSettings'; patch: Partial<Settings> }
  | { t: 'dismissNotice' }
  | { t: 'dismissFeedback' }
  | { t: 'replaceState'; next: PersistedState };

const EMPTY_DAY = (g: Rung): DayRecord => ({ v: 0, s: 0, g, p: 0 });

/** Totals are recomputed, never accumulated -- drift is then impossible. */
function retotal(days: DayMap): PersistedState['totals'] {
  let points = 0;
  let verses = 0;
  let seconds = 0;
  for (const rec of Object.values(days)) {
    points += rec.p;
    verses += rec.v;
    seconds += rec.s;
  }
  return { points, verses, seconds };
}

/**
 * Clears today's credited set when the day has rolled over.
 *
 * Called at the top of every action, which is what makes it structurally
 * impossible to credit a verse into a stale day even if every timer in the app
 * has failed or the laptop slept through 03:00.
 */
function ensureDay(s: PersistedState, nowMs: number, offset?: OffsetFn): PersistedState {
  const today = dayKeyOf(nowMs, offset, DAY_ROLLOVER_HOUR);
  if (s.credited.day === today) return s;
  return { ...s, credited: { day: today, ids: [] } };
}

export function reduce(state: PersistedState, a: Action, offset?: OffsetFn): PersistedState {
  if (a.t === 'replaceState') {
    // Totals are always rebuilt from the day records, never taken on trust.
    // An imported backup with hand-edited totals cannot inject points the
    // days do not support, and no caller has to remember to recompute.
    return { ...a.next, totals: retotal(a.next.days) };
  }
  if (a.t === 'dismissNotice') {
    return state.noticeDismissed ? state : { ...state, noticeDismissed: true };
  }
  if (a.t === 'dismissFeedback') {
    return state.feedbackDismissed ? state : { ...state, feedbackDismissed: true };
  }
  if (a.t === 'setPosition') {
    const p = state.position;
    if (p.surah === a.position.surah && p.ayah === a.position.ayah) return state;
    return { ...state, position: { ...a.position } };
  }
  if (a.t === 'patchSettings') {
    return { ...state, settings: { ...state.settings, ...a.patch } };
  }

  const s = ensureDay(state, a.nowMs, offset);
  const today = s.credited.day;

  switch (a.t) {
    case 'heartbeat':
      return s;

    case 'addSeconds': {
      if (a.seconds <= 0) return s;
      // A day record may exist with v = 0: time starts accruing the moment the
      // reader opens the app, before any verse has been credited. Such a day
      // still counts as unread for streak and heatmap purposes.
      const day = s.days[today] ?? EMPTY_DAY(s.goal);
      const days = { ...s.days, [today]: { ...day, s: day.s + a.seconds } };
      return { ...s, days, totals: retotal(days) };
    }

    case 'creditVerse': {
      if (s.credited.ids.includes(a.id)) return s;

      const prev = s.days[today] ?? EMPTY_DAY(s.goal);
      // The rung is stamped on the day's FIRST credited verse and thereafter
      // may only be lowered (see setRung). Without this, reading ten verses at
      // rung 1 and then switching to rung 10 would rescore the day 39 -> 119.
      const rung: Rung = prev.v === 0 ? s.goal : prev.g;
      const day: DayRecord = { ...prev, v: prev.v + 1, g: rung };

      const days = { ...s.days, [today]: day };
      day.p = scoreDay({
        verses: day.v,
        rung,
        streakDays: currentStreak(days, today),
      }).total;

      const cov = Coverage.fromBase64(s.coverage);
      cov.add(a.id);

      return {
        ...s,
        days,
        totals: retotal(days),
        coverage: cov.toBase64(),
        credited: { day: today, ids: [...s.credited.ids, a.id].sort((x, y) => x - y) },
        unlockedMax: recomputeUnlockedMax(days, today, s.unlockedMax),
      };
    }

    case 'setRung': {
      if (a.rung > s.unlockedMax) return s;
      const next: PersistedState = { ...s, goal: a.rung };

      const day = s.days[today];
      // Dropping a rung is free and takes effect immediately. Raising it takes
      // effect tomorrow, so a day cannot be rescored upward after the fact.
      if (day && day.v > 0 && a.rung < day.g) {
        const rescored: DayRecord = { ...day, g: a.rung };
        const days = { ...s.days, [today]: rescored };
        rescored.p = scoreDay({
          verses: rescored.v,
          rung: a.rung,
          streakDays: currentStreak(days, today),
        }).total;
        next.days = days;
        next.totals = retotal(days);
      }
      return next;
    }
  }
}

/* -------------------------------------------------------------- projections */

export interface Snapshot {
  today: DayKey;
  versesToday: number;
  secondsToday: number;
  pointsToday: number;
  goal: Rung;
  /** The rung actually in force today, which may lag a raised goal. */
  effectiveRung: Rung;
  goalMet: boolean;
  streak: StreakInfo;
  totals: PersistedState['totals'];
  unlockedMax: Rung;
  selectable: Rung[];
  position: Position;
  settings: Settings;
}

export function select(s: PersistedState, nowMs: number, offset?: OffsetFn): Snapshot {
  const today = dayKeyOf(nowMs, offset, DAY_ROLLOVER_HOUR);
  const day = s.days[today];
  const streakDays = currentStreak(s.days, today);
  const effectiveRung = day && day.v > 0 ? day.g : s.goal;

  return {
    today,
    versesToday: day?.v ?? 0,
    secondsToday: day?.s ?? 0,
    pointsToday: day?.p ?? 0,
    goal: s.goal,
    effectiveRung,
    goalMet: (day?.v ?? 0) >= effectiveRung,
    streak: {
      current: streakDays,
      longest: longestStreak(s.days),
      daysRead: daysRead(s.days),
      daysSinceStart: daysSinceStart(s.days, today),
      multiplier: multiplier(streakDays),
    },
    totals: s.totals,
    unlockedMax: s.unlockedMax,
    selectable: selectableRungs(s.unlockedMax),
    position: s.position,
    settings: s.settings,
  };
}
