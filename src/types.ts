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

/** Countdown and time-read stop accruing after this long with no input. */
export const IDLE_TIMEOUT_MS = 60_000;

/* ---------- auto-advance ---------- */

/**
 * The speeds the auto-advance dial offers, as multipliers on the dwell each
 * screenful earns from its own length (see core/dwell.ts).
 *
 * A ladder rather than a free number, and a coarse one: every `+` has to be a
 * change the reader can actually feel, or they press it four times and conclude
 * the control does nothing. Roughly 20% a rung, which is about the smallest
 * step in pace anyone notices.
 */
export const AUTO_SPEEDS: readonly number[] = [0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2, 2.5] as const;

export const DEFAULT_AUTO_SPEED = 1;

/** The day flips at 03:00 local, so late-night reading credits to the day before. */
export const DAY_ROLLOVER_HOUR = 3;

/* ---------- settings ---------- */

export type ArabicFont = 'al-qalam-indopak' | 'amiri-quran';

/** In the order the settings panel offers them; the default leads. */
export const ARABIC_FONTS: readonly ArabicFont[] = ['al-qalam-indopak', 'amiri-quran'] as const;

/**
 * Fonts that were once shipped and no longer are, and what a reader holding one
 * should get instead. Never the default: `noto-naskh` set Uthmani text, and
 * moving that reader to Indo-Pak would change the orthography under them, which
 * is a bigger change than the face they actually lost.
 */
export const RETIRED_FONTS: Readonly<Record<string, ArabicFont>> = {
  'noto-naskh': 'amiri-quran',
};

/**
 * The orthography a face is cut for. Indo-Pak is a different text, not a
 * restyling of the same one -- `ٱلْحَمْدُ` in Uthmani is `اَ لۡحَمۡدُ` in
 * Indo-Pak -- so choosing that font also switches which text is fetched.
 */
export type ArabicScript = 'uthmani' | 'indopak';

export const SCRIPT_OF: Readonly<Record<ArabicFont, ArabicScript>> = {
  'al-qalam-indopak': 'indopak',
  'amiri-quran': 'uthmani',
};

/** Data directory per script. */
export const SCRIPT_DIR: Readonly<Record<ArabicScript, string>> = {
  uthmani: 'ar-uthmani',
  indopak: 'ar-indopak',
};

/**
 * The languages a translation can be read in. One at a time: the reader shows
 * ONE ayah, and stacking two translations under it would take the room from
 * the thing the app exists to hold still.
 */
export type TranslationLang = 'en' | 'ur';

/** In the order `T` cycles through them, and the order the panel offers them. */
export const TRANSLATION_LANGS: readonly TranslationLang[] = ['en', 'ur'] as const;

export interface TranslationMeta {
  /** Data directory. */
  dir: string;
  /** What the panel calls it, in the language itself. */
  label: string;
  /** The translator, named under the choice. */
  credit: string;
  /** For the `lang` attribute, so a screen reader picks the right voice. */
  tag: string;
  /** Urdu is right-to-left; English is not. */
  rtl: boolean;
  /**
   * What `translationSize` means in this script. Nastaliq hangs its words on a
   * steep diagonal and sets a much smaller x-height than Latin, so the same px
   * value is a comfortable read in one and a squint in the other. The locator
   * already makes the same correction for the Arabic surah name at 11px mono.
   * The reader still chooses ONE number; this is what it buys per language.
   */
  sizeScale: number;
}

export const TRANSLATIONS: Readonly<Record<TranslationLang, TranslationMeta>> = {
  en: {
    dir: 'en-itani', label: 'English', credit: 'Talal Itani',
    tag: 'en', rtl: false, sizeScale: 1,
  },
  ur: {
    dir: 'ur-jalandhry', label: 'اردو', credit: 'Fateh Muhammad Jalandhry',
    tag: 'ur', rtl: true, sizeScale: 1.45,
  },
};

export type Theme = 'light' | 'dark' | 'paper' | 'system';
/** The three surfaces the header button cycles through; `system` is panel-only. */
export const CYCLE_THEMES = ['light', 'dark', 'paper'] as const;
export const THEMES: readonly Theme[] = [...CYCLE_THEMES, 'system'];
export type Accent = 'blue' | 'green' | 'purple' | 'black';

/** In the order the settings panel offers them; the default leads. */
export const ACCENTS: readonly Accent[] = ['blue', 'green', 'purple', 'black'] as const;

export interface Settings {
  arabicFont: ArabicFont;
  /**
   * Off by default: the ayah alone is the point. `T` cycles English, then
   * Urdu, then off -- see `cycleTranslation`, which owns that order.
   */
  showTranslation: boolean;
  /** Which translation is shown when `showTranslation` is on. */
  translationLang: TranslationLang;
  /**
   * The reader's OWN language -- what the panel sets, and what `T` opens on and
   * returns to when its turn closes. It is separate from `translationLang`
   * because the cycle moves through the others in between, and a choice that
   * the second press spent would not be a choice. See `cycleTranslation`.
   */
  translationHome: TranslationLang;
  /** px */
  arabicSize: number;
  /** px. The translation's family is fixed; only size is adjustable. */
  translationSize: number;
  sessionLen: SessionLen;
  theme: Theme;
  accent: Accent;
  /**
   * How fast auto-advance reads, as a multiplier on the dwell each screenful
   * earns from its own length. One of AUTO_SPEEDS.
   *
   * Whether auto-advance is RUNNING is deliberately not here. That is not a
   * preference, it is what the reader is doing this minute, and an app that
   * began turning pages by itself the moment a tab opened -- before anyone had
   * touched anything -- would be wrong in the same way an autoplaying video is.
   * It starts paused, every time, and `P` is how it starts.
   */
  autoAdvanceSpeed: number;
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

/**
 * The ayah last stood on in each surah, keyed by surah number.
 *
 * `position` answers "where was I?" across a reload; this answers the smaller
 * question the drawer asks -- "where was I in THAT one?" -- so jumping to a
 * surah you have read before returns you to it rather than to its first ayah.
 * Sparse, and bounded at 114 entries by construction.
 */
export type Places = Record<number, number>;

export interface PersistedState {
  version: 1;
  days: Record<DayKey, DayRecord>;
  goal: Rung;
  /** Highest rung the reader has earned the right to pick. */
  unlockedMax: Rung;
  position: Position;
  /** Per-surah bookmarks; see `Places`. Always holds `position`'s own surah. */
  places: Places;
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
  /**
   * Whether the feedback ask has been answered or waved off. Set the moment
   * the reader opens the panel OR dismisses the line, so the ask is made once
   * and never again -- a reader who has already told me what they think should
   * not be asked a second time for showing up a fourth day.
   */
  feedbackDismissed: boolean;
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
