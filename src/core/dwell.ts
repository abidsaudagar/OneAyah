/**
 * The anti-skim gate. A verse credits only when the reader moved forward off it
 * having spent a plausible reading time on it.
 *
 * Dwell is measured on the ACTIVE clock, the same one that feeds TIME READ, so
 * a tab parked on one ayah for an hour accrues nothing.
 */
import { DWELL_CAP_MS, DWELL_FLOOR_MS, DWELL_PER_WORD_MS } from '../types.ts';

/** Runs of non-whitespace. Arabic and English both split the same way. */
export function wordCount(text: string): number {
  let n = 0;
  let inWord = false;
  for (const ch of text) {
    const ws = ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === ' ';
    if (ws) inWord = false;
    else if (!inWord) { inWord = true; n++; }
  }
  return n;
}

export function requiredDwellMsForWords(words: number): number {
  return Math.min(DWELL_CAP_MS, Math.max(DWELL_FLOOR_MS, DWELL_PER_WORD_MS * words));
}

export const requiredDwellMs = (text: string): number =>
  requiredDwellMsForWords(wordCount(text));

export type DwellReason = 'ok' | 'too-fast' | 'already-credited' | 'backward';

export interface DwellVerdict {
  credit: boolean;
  dwelledMs: number;
  requiredMs: number;
  reason: DwellReason;
}

export function evaluateDwell(input: {
  enteredAtActiveMs: number;
  leftAtActiveMs: number;
  requiredMs: number;
  alreadyCredited: boolean;
  direction: 'forward' | 'backward';
}): DwellVerdict {
  const dwelledMs = Math.max(0, input.leftAtActiveMs - input.enteredAtActiveMs);
  const base = { dwelledMs, requiredMs: input.requiredMs };

  if (input.direction === 'backward') return { ...base, credit: false, reason: 'backward' };
  if (input.alreadyCredited) return { ...base, credit: false, reason: 'already-credited' };
  if (dwelledMs < input.requiredMs) return { ...base, credit: false, reason: 'too-fast' };
  return { ...base, credit: true, reason: 'ok' };
}
