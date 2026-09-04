/**
 * Lazy Qur'an text loading.
 *
 * The ONLY place that builds a data URL. Every path goes through `dataUrl()`,
 * which prefixes Vite's BASE_URL -- a leading-slash "/data/..." would resolve
 * against the domain root and 404 on GitHub Pages, which is the single most
 * common way a Pages deploy breaks.
 */
import { SCRIPT_DIR, type ArabicScript, type QuranMeta, type SurahMeta, type SurahText } from '../types.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

export interface Surah {
  meta: SurahMeta;
  ar: SurahText;
  en: SurahText;
  /** Which orthography `ar` is in, so a stale script can be spotted. */
  script: ArabicScript;
}

let metaPromise: Promise<QuranMeta> | null = null;

export function loadMeta(): Promise<QuranMeta> {
  metaPromise ??= fetch(dataUrl('meta.json')).then((r) => {
    if (!r.ok) throw new Error(`meta.json -> HTTP ${r.status}`);
    return r.json() as Promise<QuranMeta>;
  });
  return metaPromise;
}

/**
 * Small LRU: the current surah, the one before, and whatever was prefetched.
 * Keyed by script as well as number -- the two orthographies are different
 * text, and serving one where the other was asked for would be silent.
 */
const CACHE_MAX = 4;
const cache = new Map<string, Promise<Surah>>();

export function loadSurah(n: number, script: ArabicScript): Promise<Surah> {
  const key = `${script}:${n}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const p = (async (): Promise<Surah> => {
    const meta = await loadMeta();
    const info = meta.surahs.find((s) => s.n === n);
    if (!info) throw new Error(`no surah ${n}`);

    const [ar, en] = await Promise.all([
      fetch(dataUrl(`${SCRIPT_DIR[script]}/${n}.json`)).then((r) => r.json() as Promise<SurahText>),
      fetch(dataUrl(`en-itani/${n}.json`)).then((r) => r.json() as Promise<SurahText>),
    ]);

    return { meta: info, ar, en, script };
  })();

  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return p;
}

/** Fire-and-forget, so stepping off the last ayah never waits on the network. */
export function prefetchSurah(n: number, script: ArabicScript): void {
  if (n >= 1 && n <= 114) void loadSurah(n, script).catch(() => {});
}

/** 0-based index of an ayah across the whole Qur'an, for the coverage bitset. */
export function globalIndex(meta: QuranMeta, surah: number, ayah: number): number {
  let n = 0;
  for (const s of meta.surahs) {
    if (s.n === surah) return n + ayah - 1;
    n += s.c;
  }
  return -1;
}

export function surahStart(meta: QuranMeta, surah: number): number {
  let n = 0;
  for (const s of meta.surahs) {
    if (s.n === surah) return n;
    n += s.c;
  }
  return 0;
}
