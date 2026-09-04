/**
 * Export and import of progress as a file.
 *
 * This replaces the design's "SIGN IN & BACK UP" button: there is no backend,
 * so a file the reader owns is the honest form of a backup.
 */
import { repair } from './persist.ts';
import type { PersistedState } from '../types.ts';

export function exportBlob(s: PersistedState, nowMs: number): { filename: string; json: string } {
  const d = new Date(nowMs);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { filename: `qread-backup-${stamp}.json`, json: JSON.stringify(s, null, 2) };
}

export function download(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ImportResult =
  | { ok: true; state: PersistedState }
  | { ok: false; error: string };

export function parseBackup(text: string, nowMs: number): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const state = repair(raw, nowMs);
  if (!state) return { ok: false, error: 'That does not look like a qRead backup.' };
  return { ok: true, state };
}

export function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
