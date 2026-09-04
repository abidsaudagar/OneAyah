/**
 * FROZEN CONTRACT. Every other module depends on this file; change it deliberately.
 */

/* ---------- goals & scoring ---------- */

/** Daily goal, in verses. 20 and 30 must be earned (see `unlockedMax`). */
export type Rung = 1 | 3 | 5 | 10 | 20 | 30;

export const RUNGS: readonly Rung[] = [1, 3, 5, 10, 20, 30] as const;

/** Rungs a reader may pick without earning them. */
export const FREE_MAX_RUNG: Rung = 10;

/** Points earned per verse, by the rung committed to. */
export const POINTS_PER_VERSE: Readonly<Record<Rung, number>> = {
  1: 3, 3: 4, 5: 5, 10: 7, 20: 9, 30: 10,
};

/** Goal bonus is a flat 7x the rung's per-verse value: 21/28/35/49/63/70. */
export const GOAL_BONUS_FACTOR = 7;

/** Consecutive goal-met days at `unlockRequiresRung` needed to unlock the next rung. */
export const UNLOCK_DAYS = 7;

/** Streak length -> points multiplier. Highest satisfied threshold wins. */
export const STREAK_TIERS: readonly (readonly [days: number, multiplier: number])[] = [
  [100, 2.0], [30, 1.5], [7, 1.2],
] as const;

/** Verses read beyond this multiple of the daily goal earn half points. */
export const BINGE_CAP_MULTIPLE = 2;

/* ---------- session & reading ---------- */

/** The only three session lengths, in seconds. */
export type SessionLen = 30 | 70 | 140;

export const SESSION_LENGTHS: readonly SessionLen[] = [30, 70, 140] as const;

/** Everyday acts that make the session cost feel trivially small. */
export const SESSION_LABELS: Readonly<Record<SessionLen, string>> = {
  30: 'a glass of water',
  70: 'boiling the kettle',
  140: 'frying an egg',
};

/**
 * Anti-skim: a verse credits only after
 *   clamp(0.6s x wordCount, 2s, 30s)
 * of *active* dwell -- paused and idle time never counts toward it.
 *
 * The cap matters: 2:282 runs to ~128 words, which uncapped would demand 76.8s
 * of dwell -- longer than the 140s session's own budget allows for one verse,
 * and longer than the entire 70s session. Without a cap the longest ayah in the
 * Qur'an is literally uncreditable. 30s is the natural ceiling.
 */
export const DWELL_FLOOR_MS = 2_000;
export const DWELL_PER_WORD_MS = 600;
export const DWELL_CAP_MS = 30_000;

/** Countdown and time-read stop accruing after this long with no input. */
export const IDLE_TIMEOUT_MS = 60_000;

/** The day flips at 03:00 local, so late-night reading credits to the day before. */
export const DAY_ROLLOVER_HOUR = 3;

/* ---------- settings ---------- */

export type ArabicFont = 'amiri-quran' | 'noto-naskh';
export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'blue' | 'green' | 'purple' | 'black';

export interface Settings {
  arabicFont: ArabicFont;
  /** Off by default: the ayah alone is the point. Toggle with T. */
  showTranslation: boolean;
  /** px */
  arabicSize: number;
  /** px. The translation's family is fixed; only size is adjustable. */
  translationSize: number;
  sessionLen: SessionLen;
  theme: Theme;
  accent: Accent;
  /** Fullscreen auto-advance dwell in seconds; null = manual only. */
  autoAdvanceSec: number | null;
}

/* ---------- persisted state ---------- */

/** Rollover-adjusted local date, "YYYY-MM-DD". */
export type DayKey = string;

/** `surah:ayah`, both 1-based. */
export type VerseKey = string;

/** Total ayat in the Qur'an; the coverage bitset is sized from it. */
export const TOTAL_AYAT = 6236;
export const TOTAL_SURAHS = 114;
export const COVERAGE_BYTES = 780; // ceil(6236 / 8)

export interface DayRecord {
  /** verses credited */
  v: number;
  /** seconds actually read, idle-gated */
  s: number;
  /**
   * The rung in force for this day, stamped when its first verse is credited.
   * A later settings change may only LOWER it -- which keeps "dropping a rung
   * is always free" true, while closing the exploit where a reader banks
   * verses at rung 1 and then raises to rung 10 to rescore the whole day.
   * Raising takes effect tomorrow.
   */
  g: Rung;
  /** points earned that day; a pure function of (v, g, streak) */
  p: number;
}

export interface Position {
  surah: number;
  ayah: number;
}

export interface PersistedState {
  version: 1;
  days: Record<DayKey, DayRecord>;
  goal: Rung;
  /** Highest rung the reader has earned the right to pick. */
  unlockedMax: Rung;
  position: Position;
  totals: { points: number; verses: number; seconds: number };
  settings: Settings;
  /**
   * Global ayah ids credited today, sorted. A reload cannot re-credit them.
   * Cleared on rollover, so it is bounded twice over: never more than one
   * day's reading, and never more than TOTAL_AYAT entries.
   */
  credited: { day: DayKey; ids: number[] };
  /**
   * Lifetime per-verse read set, as base64 of a TOTAL_AYAT-bit field.
   * Constant 780 bytes forever, versus an unbounded list of ids -- and it
   * answers per-surah progress for the drawer by popcount over a byte range.
   */
  coverage: string;
  /** Whether the local-data warning has been dismissed. */
  noticeDismissed: boolean;
}

/* ---------- derived (never persisted) ---------- */

export interface StreakInfo {
  current: number;
  longest: number;
  daysRead: number;
  /** Days elapsed since the first recorded day, inclusive. */
  daysSinceStart: number;
  multiplier: number;
}

export interface UnlockProgress {
  /** The rung being worked toward, or null when everything is unlocked. */
  target: Rung | null;
  /** The rung that must be hit to make progress. */
  requires: Rung;
  /** Consecutive goal-met days so far, 0..UNLOCK_DAYS. */
  progress: number;
  needed: number;
}

export interface SessionResult {
  verses: number;
  perVerse: number;
  goal: Rung;
  goalMet: boolean;
  goalBonus: number;
  multiplier: number;
  earned: number;
}

/* ---------- Qur'an data ---------- */

export interface SurahMeta {
  /** 1-based surah number */
  n: number;
  /** Arabic name, e.g. "الفاتحة" */
  ar: string;
  /** English name, e.g. "The Opening" */
  en: string;
  /** Transliteration, e.g. "Al-Fatihah" */
  tr: string;
  /** Number of ayat */
  c: number;
  /** Revelation place */
  p: 'meccan' | 'medinan';
}

export interface JuzMeta {
  n: number;
  surah: number;
  ayah: number;
}

export interface QuranMeta {
  surahs: SurahMeta[];
  juz: JuzMeta[];
}

/** A surah's text: array-indexed, ayah number is position + 1. */
export type SurahText = string[];
