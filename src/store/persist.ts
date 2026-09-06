/**
 * Loading, repair and persistence of the reader's progress.
 */
import { repairPlaces } from '../core/places.ts';
import { initialState } from '../core/state.ts';
import { createStore, quarantine, type Store, type WriteResult } from '../platform/storage.ts';
import { DEFAULT_SETTINGS } from '../core/state.ts';
import {
  ACCENTS, ARABIC_FONTS, RETIRED_FONTS, RUNGS, SESSION_LENGTHS, THEMES,
  type Accent, type ArabicFont, type PersistedState, type Position, type Rung,
  type Settings, type Theme,
} from '../types.ts';

export const STORAGE_KEY = 'qread.state.v1';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isDayKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

/**
 * Coerces anything into a usable state. Never throws, never trusts the input:
 * an imported backup and a corrupted localStorage blob take the same path.
 */
export function repair(raw: unknown, nowMs: number): PersistedState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<PersistedState>;
  if (r.version !== 1) return null;

  const base = initialState(nowMs);
  const s: Settings = { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) };

  s.arabicSize = clamp(Number(s.arabicSize) || DEFAULT_SETTINGS.arabicSize, 24, 200);
  s.translationSize = clamp(Number(s.translationSize) || DEFAULT_SETTINGS.translationSize, 12, 40);
  if (!SESSION_LENGTHS.includes(s.sessionLen)) s.sessionLen = DEFAULT_SETTINGS.sessionLen;
  if (!ARABIC_FONTS.includes(s.arabicFont as ArabicFont)) {
    // A font that was dropped hands its readers on to its nearest survivor;
    // anything else -- junk, a typo, a hand-edited backup -- takes the default.
    s.arabicFont = RETIRED_FONTS[s.arabicFont as string] ?? DEFAULT_SETTINGS.arabicFont;
  }
  if (s.autoAdvanceSec !== null) s.autoAdvanceSec = clamp(Number(s.autoAdvanceSec) || 12, 5, 30);
  // An unknown theme would be stamped straight onto data-theme, where it
  // matches no rule and leaves the app on the light palette silently.
  if (!THEMES.includes(s.theme as Theme)) s.theme = DEFAULT_SETTINGS.theme;
  // Same failure one attribute over: data-accent is what every accented rule
  // keys off, so a junk value there loses the accent with nothing said.
  if (!ACCENTS.includes(s.accent as Accent)) s.accent = DEFAULT_SETTINGS.accent;
  s.showTranslation = s.showTranslation === true;

  const days: PersistedState['days'] = {};
  for (const [k, v] of Object.entries(r.days ?? {})) {
    if (!isDayKey(k) || typeof v !== 'object' || v === null) continue;
    const d = v as Partial<PersistedState['days'][string]>;
    const g = RUNGS.includes(d.g as Rung) ? (d.g as Rung) : 5;
    days[k] = {
      v: Math.max(0, Math.floor(Number(d.v) || 0)),
      s: Math.max(0, Math.floor(Number(d.s) || 0)),
      g,
      p: Math.max(0, Math.floor(Number(d.p) || 0)),
    };
  }

  let points = 0;
  let verses = 0;
  let seconds = 0;
  for (const d of Object.values(days)) { points += d.p; verses += d.v; seconds += d.s; }

  const goal = RUNGS.includes(r.goal as Rung) ? (r.goal as Rung) : base.goal;
  const unlockedMax = RUNGS.includes(r.unlockedMax as Rung) ? (r.unlockedMax as Rung) : 10;

  const position: Position = {
    surah: clamp(Math.floor(Number(r.position?.surah) || 1), 1, 114),
    ayah: Math.max(1, Math.floor(Number(r.position?.ayah) || 1)),
  };

  return {
    version: 1,
    days,
    goal: goal > unlockedMax ? unlockedMax : goal,
    unlockedMax,
    position,
    places: repairPlaces(r.places, position),
    // Totals are always rebuilt, never trusted -- a hand-edited backup cannot
    // inject a points total that the day records do not support.
    totals: { points, verses, seconds },
    settings: s,
    credited: {
      day: typeof r.credited?.day === 'string' && isDayKey(r.credited.day)
        ? r.credited.day : base.credited.day,
      ids: Array.isArray(r.credited?.ids)
        ? r.credited.ids.filter((n) => Number.isInteger(n)).sort((a, b) => a - b)
        : [],
    },
    coverage: typeof r.coverage === 'string' ? r.coverage : base.coverage,
    noticeDismissed: r.noticeDismissed === true,
    // Absent in backups written before the ask existed, which is exactly the
    // reader who has never been asked -- so the default has to be false.
    feedbackDismissed: r.feedbackDismissed === true,
  };
}

export interface Persistence {
  load(nowMs: number): PersistedState;
  save(s: PersistedState): WriteResult;
  readonly store: Store;
}

export function createPersistence(key = STORAGE_KEY): Persistence {
  const store = createStore(key);
  return {
    store,
    load(nowMs) {
      const blob = store.read();
      if (blob === null) return initialState(nowMs);
      try {
        const repaired = repair(JSON.parse(blob), nowMs);
        if (repaired) return repaired;
        quarantine(key, blob, nowMs);
      } catch {
        quarantine(key, blob, nowMs);
      }
      return initialState(nowMs);
    },
    save: (s) => store.write(JSON.stringify(s)),
  };
}
