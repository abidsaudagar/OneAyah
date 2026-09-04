/**
 * Build-time data pipeline.
 *
 *   node --experimental-strip-types scripts/build-data.ts
 *
 * Downloads the three licensed sources, verifies them against counts that act as
 * their own checksums, and emits the static JSON the app ships.
 *
 * The licensed text is never altered. Reshaping into JSON is permitted by both
 * licences; editing the glyph stream is not. Nothing here normalises, strips
 * diacritics, re-punctuates or "fixes" anything.
 *
 * Output is committed, so a normal `npm run build` needs no network.
 *
 * Requires `unzip` on PATH (ClearQuran ships a zip; Node has no built-in reader).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JuzMeta, QuranMeta, SurahMeta } from '../src/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache');
const DATA = join(ROOT, 'public', 'data');
const LICENSES = join(ROOT, 'public', 'licenses');

const TOTAL_AYAT = 6236;
const TOTAL_SURAHS = 114;
const TOTAL_JUZ = 30;

const SOURCES = {
  arabic: {
    url: 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2',
    file: 'tanzil-uthmani.txt',
  },
  meta: {
    url: 'https://tanzil.net/res/text/metadata/quran-data.xml',
    file: 'quran-data.xml',
  },
  english: {
    url: 'https://www.clearquran.com/downloads/quran-verse-by-verse-text.zip',
    file: 'clearquran.zip',
  },
} as const;

/* ------------------------------------------------------------------ fetching */

async function fetchCached(url: string, file: string): Promise<Buffer> {
  const path = join(CACHE, file);
  if (existsSync(path)) {
    console.log(`  cached  ${file}`);
    return readFileSync(path);
  }
  console.log(`  fetch   ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, buf);
  return buf;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/* ------------------------------------------------------------------- parsing */

/** Tanzil `outType=txt-2` is `sura|aya|text` per line, plus a `#` notice block. */
function parseArabic(raw: string): Map<number, string[]> {
  const bySurah = new Map<number, string[]>();
  let seen = 0;

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const first = line.indexOf('|');
    const second = line.indexOf('|', first + 1);
    if (first < 0 || second < 0) continue;

    const surah = Number(line.slice(0, first));
    const ayah = Number(line.slice(first + 1, second));
    const text = line.slice(second + 1);

    const list = bySurah.get(surah) ?? [];
    if (list.length !== ayah - 1) {
      throw new Error(`Arabic ${surah}:${ayah} arrived out of order`);
    }
    list.push(text);
    bySurah.set(surah, list);
    seen++;
  }

  if (seen !== TOTAL_AYAT) throw new Error(`Arabic: expected ${TOTAL_AYAT} ayat, got ${seen}`);
  return bySurah;
}

/**
 * ClearQuran ships one `SSS-AAA.txt` per verse. The `-000` files are the
 * basmala headers for the 112 surahs that carry one (all but 1 and 9); they are
 * not ayat and are skipped.
 */
function parseEnglish(dir: string): Map<number, string[]> {
  const bySurah = new Map<number, string[]>();
  const files = readdirSync(dir)
    .filter((f: string) => /^\d{3}-\d{3}\.txt$/.test(f))
    .sort();

  let seen = 0;
  for (const f of files) {
    const surah = Number(f.slice(0, 3));
    const ayah = Number(f.slice(4, 7));
    if (ayah === 0) continue;

    const text = readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim();
    const list = bySurah.get(surah) ?? [];
    if (list.length !== ayah - 1) {
      throw new Error(`English ${surah}:${ayah} arrived out of order`);
    }
    list.push(text);
    bySurah.set(surah, list);
    seen++;
  }

  if (seen !== TOTAL_AYAT) throw new Error(`English: expected ${TOTAL_AYAT} ayat, got ${seen}`);
  return bySurah;
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  if (!m || m[1] === undefined) throw new Error(`missing @${name} in ${tag}`);
  return m[1];
}

function parseMeta(xml: string): QuranMeta {
  const surahs: SurahMeta[] = (xml.match(/<sura [^>]*\/>/g) ?? []).map((tag) => ({
    n: Number(attr(tag, 'index')),
    ar: attr(tag, 'name'),
    en: attr(tag, 'ename'),
    tr: attr(tag, 'tname'),
    c: Number(attr(tag, 'ayas')),
    p: attr(tag, 'type').toLowerCase() === 'meccan' ? 'meccan' : 'medinan',
  }));

  const juz: JuzMeta[] = (xml.match(/<juz [^>]*\/>/g) ?? []).map((tag) => ({
    n: Number(attr(tag, 'index')),
    surah: Number(attr(tag, 'sura')),
    ayah: Number(attr(tag, 'aya')),
  }));

  if (surahs.length !== TOTAL_SURAHS) throw new Error(`meta: ${surahs.length} surahs`);
  if (juz.length !== TOTAL_JUZ) throw new Error(`meta: ${juz.length} juz`);
  return { surahs, juz };
}

/* -------------------------------------------------------------------- output */

function writeJson(path: string, value: unknown): number {
  mkdirSync(dirname(path), { recursive: true });
  const json = JSON.stringify(value);
  writeFileSync(path, json);
  return Buffer.byteLength(json);
}

function emitTexts(name: string, bySurah: Map<number, string[]>, meta: QuranMeta): number {
  let bytes = 0;
  for (const s of meta.surahs) {
    const ayat = bySurah.get(s.n);
    if (!ayat) throw new Error(`${name}: surah ${s.n} missing`);
    if (ayat.length !== s.c) {
      throw new Error(`${name}: surah ${s.n} has ${ayat.length} ayat, metadata says ${s.c}`);
    }
    // Array-indexed: the ayah number is the position + 1. Repeated object keys
    // would cost roughly 10% of the payload for information already implied.
    bytes += writeJson(join(DATA, name, `${s.n}.json`), ayat);
  }
  return bytes;
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

/* ---------------------------------------------------------------------- main */

async function main() {
  console.log('sources');
  const [arabicBuf, metaBuf, englishBuf] = await Promise.all([
    fetchCached(SOURCES.arabic.url, SOURCES.arabic.file),
    fetchCached(SOURCES.meta.url, SOURCES.meta.file),
    fetchCached(SOURCES.english.url, SOURCES.english.file),
  ]);

  const unpacked = join(CACHE, 'clearquran');
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  try {
    execFileSync('unzip', ['-q', join(CACHE, SOURCES.english.file), '-d', unpacked]);
  } catch {
    throw new Error('`unzip` is required on PATH to unpack the ClearQuran archive');
  }

  console.log('\nparsing');
  const meta = parseMeta(metaBuf.toString('utf8'));
  const arabic = parseArabic(arabicBuf.toString('utf8'));
  const english = parseEnglish(unpacked);
  console.log(`  ${TOTAL_SURAHS} surahs, ${TOTAL_JUZ} juz, ${TOTAL_AYAT} ayat x2 texts`);

  console.log('\nemitting');
  const metaBytes = writeJson(join(DATA, 'meta.json'), meta);
  const arBytes = emitTexts('ar-uthmani', arabic, meta);
  const enBytes = emitTexts('en-itani', english, meta);

  mkdirSync(LICENSES, { recursive: true });
  writeFileSync(join(LICENSES, 'tanzil.txt'), TANZIL_NOTICE);
  writeFileSync(join(LICENSES, 'clearquran.txt'), CLEARQURAN_NOTICE);
  writeFileSync(
    join(ROOT, 'scripts', 'sources.json'),
    `${JSON.stringify(
      {
        note: 'Checksums of the upstream sources this data was built from.',
        arabic: { ...SOURCES.arabic, bytes: arabicBuf.length, sha256: sha256(arabicBuf) },
        meta: { ...SOURCES.meta, bytes: metaBuf.length, sha256: sha256(metaBuf) },
        english: { ...SOURCES.english, bytes: englishBuf.length, sha256: sha256(englishBuf) },
      },
      null,
      2,
    )}\n`,
  );

  console.log(`  meta.json    ${kb(metaBytes)}`);
  console.log(`  ar-uthmani   ${kb(arBytes)} across ${TOTAL_SURAHS} files`);
  console.log(`  en-itani     ${kb(enBytes)} across ${TOTAL_SURAHS} files`);
  console.log(`  licenses     2 files\n`);
}

/* ------------------------------------------------------------------- notices */

const TANZIL_NOTICE = `Arabic Qur'an text
==================

Tanzil Qur'an Text (Uthmani, version 1.1)
Copyright (C) 2007-2021 Tanzil Project
License: Creative Commons Attribution 3.0
https://tanzil.net

This text has been reshaped into JSON for delivery. The text itself is
reproduced verbatim: no characters have been added, removed or altered.

Please check updates at: https://tanzil.net/updates/
`;

const CLEARQURAN_NOTICE = `English translation
===================

"Quran in English", modern English translation, verse by verse.
Translated by Talal Itani -- https://www.ClearQuran.com

The text is reproduced verbatim; it has only been reshaped into JSON.

NOTE ON THE LICENCE -- the two first-party statements disagree, so both are
recorded here verbatim and neither is paraphrased.

1. The current download page at https://blog.clearquran.com/download states:

     "These Quran files are free to use, share, and distribute -- including in
      commercial projects -- with no permission or authorization required. When
      sharing, please keep the files unmodified and credit the source as shown
      below. They are released under the Creative Commons
      Attribution-NoDerivatives 4.0 International License (CC BY-ND 4.0)."

2. The _readme.txt bundled inside the distributed archive (file dated
   2015-01-18) states:

     "These files can be shared and distributed
      Provided under the Creative Commons License
      Attribution-NonCommercial-NoDerivs"

The bundled readme is the older of the two and is demonstrably stale in another
respect: it describes the archive as the edition using "Allah", while the text
it accompanies uses "God". The download page is the current, prominent,
first-party grant. Both are recorded so the position can be re-examined.

The difference only bites on commercial use. Under either licence the text must
be distributed unmodified and credited.
`;

await main();
