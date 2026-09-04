/**
 * Lazy Qur'an text loading.
 *
 * The ONLY place that builds a data URL. Every path goes through `dataUrl()`,
 * which prefixes Vite's BASE_URL -- a leading-slash "/data/..." would resolve
 * against the domain root and 404 on GitHub Pages, which is the single most
 * common way a Pages deploy breaks.
 */
import type { QuranMeta, SurahMeta, SurahText } from '../types.ts';
import { wordCount } from '../core/dwell.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

export interface Surah {
  meta: SurahMeta;
  ar: SurahText;
  en: SurahText;
  /** Per-ayah word counts, for the dwell gate. Computed once on load. */
  words: Int16Array;
}

let metaPromise: Promise<QuranMeta> | null = null;

export function loadMeta(): Promise<QuranMeta> {
  metaPromise ??= fetch(dataUrl('meta.json')).then((r) => {
    if (!r.ok) throw new Error(`meta.json -> HTTP ${r.status}`);
    return r.json() as Promise<QuranMeta>;
  });
  return metaPromise;
}

/** Small LRU: the current surah, the one before, and whatever was prefetched. */
const CACHE_MAX = 4;
const cache = new Map<number, Promise<Surah>>();

export function loadSurah(n: number): Promise<Surah> {
  const hit = cache.get(n);
  if (hit) {
    cache.delete(n);
    cache.set(n, hit);
    return hit;
  }

  const p = (async (): Promise<Surah> => {
    const meta = await loadMeta();
    const info = meta.surahs.find((s) => s.n === n);
    if (!info) throw new Error(`no surah ${n}`);

    const [ar, en] = await Promise.all([
      fetch(dataUrl(`ar-uthmani/${n}.json`)).then((r) => r.json() as Promise<SurahText>),
      fetch(dataUrl(`en-itani/${n}.json`)).then((r) => r.json() as Promise<SurahText>),
    ]);

    const words = new Int16Array(ar.length);
    for (let i = 0; i < ar.length; i++) words[i] = wordCount(ar[i]!);

    return { meta: info, ar, en, words };
  })();

  cache.set(n, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return p;
}

/** Fire-and-forget, so stepping off the last ayah never waits on the network. */
export function prefetchSurah(n: number): void {
  if (n >= 1 && n <= 114) void loadSurah(n).catch(() => {});
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
