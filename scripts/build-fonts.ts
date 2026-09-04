/**
 * Fetches the webfonts and self-hosts them.
 *
 *   node --experimental-strip-types scripts/build-fonts.ts
 *
 * Self-hosting is not optional: the app must work offline, and a cross-origin
 * font request is a hard failure on a plane.
 *
 * We take Google's already-subset woff2 rather than subsetting the upstream TTF
 * ourselves. That deliberately avoids a Python + fontTools + brotli build
 * prerequisite -- on this machine `pyftsubset` and the default `python3` come
 * from different installs, which is a trap for anyone cloning the repo. The
 * bytes are identical to what a correct local subset would produce, and both
 * families are SIL OFL 1.1, which permits redistribution.
 *
 * Output is committed, so an ordinary build needs no network.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'fonts');

// Google serves different CSS per User-Agent; this one gets woff2.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Want {
  /** Google Fonts `family=` value. */
  family: string;
  /** The `/* subset *\/` label to keep. */
  subset: string;
  /** Output basename per weight, in the order the weights are requested. */
  files: { weight: number; name: string }[];
}

const WANT: Want[] = [
  { family: 'Amiri+Quran', subset: 'arabic', files: [{ weight: 400, name: 'amiri-quran-arabic' }] },
  {
    family: 'Noto+Naskh+Arabic:wght@400',
    subset: 'arabic',
    files: [{ weight: 400, name: 'noto-naskh-arabic' }],
  },
  {
    family: 'IBM+Plex+Mono:wght@400;500;600',
    subset: 'latin',
    files: [
      { weight: 400, name: 'ibm-plex-mono-400' },
      { weight: 500, name: 'ibm-plex-mono-500' },
      { weight: 600, name: 'ibm-plex-mono-600' },
    ],
  },
];

interface Face { subset: string; weight: number; url: string }

/** Google emits `/* subset *\/` immediately before each @font-face. */
function parseFaces(css: string): Face[] {
  const out: Face[] = [];
  const re = /\/\*\s*([a-z0-9-\[\]]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/gi;
  for (const m of css.matchAll(re)) {
    const body = m[2] ?? '';
    const url = body.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1] ?? '400');
    if (url) out.push({ subset: m[1] ?? '', weight, url });
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let total = 0;

  for (const want of WANT) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${want.family}&display=swap`;
    const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => r.text());
    const faces = parseFaces(css).filter((f) => f.subset === want.subset);

    for (const file of want.files) {
      const face = faces.find((f) => f.weight === file.weight);
      if (!face) throw new Error(`${want.family}: no ${want.subset} face at weight ${file.weight}`);

      const ab = await fetch(face.url).then((r) => r.arrayBuffer());
      const buf = new Uint8Array(ab as ArrayBuffer);
      // woff2 files start with the signature "wOF2".
      const sig = String.fromCharCode(...buf.slice(0, 4));
      if (sig !== 'wOF2') throw new Error(`${file.name}: not a woff2 (got ${sig})`);

      writeFileSync(join(OUT, `${file.name}.woff2`), buf);
      total += buf.length;
      console.log(`  ${file.name}.woff2  ${(buf.length / 1024).toFixed(1)} KB`);
    }
  }

  writeFileSync(join(ROOT, 'public', 'licenses', 'fonts.txt'), OFL_NOTICE);
  console.log(`\n  total ${(total / 1024).toFixed(1)} KB\n`);
}

const OFL_NOTICE = `Fonts
=====

All fonts here are licensed under the SIL Open Font License, Version 1.1.
https://openfontlicense.org

Amiri Quran
  Copyright (c) 2010-2021, Khaled Hosny and contributors
  https://github.com/aliftype/amiri

Noto Naskh Arabic
  Copyright (c) 2022, Google LLC
  https://github.com/notofonts/arabic

IBM Plex Mono
  Copyright (c) 2017, IBM Corp.
  https://github.com/IBM/plex

The files shipped here are the Arabic and Latin subsets as served by Google
Fonts. They are redistributed unmodified. The OFL permits this; it forbids
selling the fonts on their own, which is not what is happening here.
`;

await main();
