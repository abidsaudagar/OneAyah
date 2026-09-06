/**
 * Per-surah place memory.
 *
 * The drawer has always promised that jumping surah keeps your place in the
 * old one. `position` alone cannot keep that promise: it holds exactly one
 * verse, so the moment you land in the new surah the old one's place is gone
 * and coming back drops you on its first ayah. This is the smaller record that
 * makes the promise true -- one ayah per surah, written every time the reader
 * stands somewhere, read only when they jump.
 *
 * Pure and bounded: at most one entry per surah, ever.
 */
import { TOTAL_SURAHS, type Places, type Position } from '../types.ts';

const inRange = (surah: number) =>
  Number.isInteger(surah) && surah >= 1 && surah <= TOTAL_SURAHS;

/**
 * The ayah to resume `surah` on. An unvisited surah starts at its first ayah,
 * which is also what a place pointing past the end degrades to -- the caller
 * clamps against the real ayah count, which is not known here.
 */
export function placeIn(places: Places, surah: number): number {
  const ayah = places[surah];
  return typeof ayah === 'number' && ayah >= 1 ? Math.floor(ayah) : 1;
}

/**
 * Records where the reader is standing. Returns the SAME object when nothing
 * moved, so the reducer's identity check keeps holding and an unchanged
 * position still costs no write.
 */
export function rememberPlace(places: Places, p: Position): Places {
  if (!inRange(p.surah) || !Number.isInteger(p.ayah) || p.ayah < 1) return places;
  if (places[p.surah] === p.ayah) return places;
  return { ...places, [p.surah]: p.ayah };
}

/** Drops anything a hand-edited backup or an older build could have left. */
export function repairPlaces(raw: unknown, position: Position): Places {
  const out: Places = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const surah = Number(k);
      const ayah = Math.floor(Number(v));
      if (!inRange(surah) || !Number.isFinite(ayah) || ayah < 1) continue;
      out[surah] = ayah;
    }
  }
  // A state written before places existed still knows one place: the one the
  // reader is standing in. Seeding it means the very first jump away and back
  // already works, rather than costing the reader one lost place to learn it.
  out[position.surah] ??= position.ayah;
  return out;
}
