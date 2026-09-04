/**
 * Lifetime per-verse read set, as a fixed bitset.
 *
 * A list of read verse ids would grow to 6236 numbers (~40 KB of JSON); this is
 * 780 bytes forever, and answers "how much of Al-Baqarah have I read" by
 * popcount over a byte range.
 */
import { COVERAGE_BYTES, TOTAL_AYAT } from '../types.ts';

const BITS = new Uint8Array(256);
for (let i = 0; i < 256; i++) BITS[i] = (i & 1) + BITS[i >> 1]!;

export class Coverage {
  // Declared explicitly, not as a parameter property: Node's type-stripping
  // runtime cannot erase those, and `erasableSyntaxOnly` bans them for exactly
  // this reason.
  private readonly bytes: Uint8Array;

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static empty(): Coverage {
    return new Coverage(new Uint8Array(COVERAGE_BYTES));
  }

  /** Tolerant by design: anything unparseable yields an empty set, never a throw. */
  static fromBase64(s: string): Coverage {
    try {
      const bin = atob(s);
      const out = new Uint8Array(COVERAGE_BYTES);
      const n = Math.min(bin.length, COVERAGE_BYTES);
      for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
      return new Coverage(out);
    } catch {
      return Coverage.empty();
    }
  }

  toBase64(): string {
    let s = '';
    for (const b of this.bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  /** `id` is a 0-based global ayah index. */
  has(id: number): boolean {
    if (id < 0 || id >= TOTAL_AYAT) return false;
    return (this.bytes[id >> 3]! & (1 << (id & 7))) !== 0;
  }

  /** Returns true when this call was the one that set the bit. */
  add(id: number): boolean {
    if (id < 0 || id >= TOTAL_AYAT) return false;
    const i = id >> 3;
    const mask = 1 << (id & 7);
    if ((this.bytes[i]! & mask) !== 0) return false;
    this.bytes[i] = this.bytes[i]! | mask;
    return true;
  }

  count(): number {
    let n = 0;
    for (const b of this.bytes) n += BITS[b]!;
    return n;
  }

  /** Verses read within `[start, start + len)`, for per-surah drawer progress. */
  countRange(start: number, len: number): number {
    let n = 0;
    const end = Math.min(start + len, TOTAL_AYAT);
    for (let id = start; id < end; id++) if (this.has(id)) n++;
    return n;
  }

  clone(): Coverage {
    return new Coverage(new Uint8Array(this.bytes));
  }
}
