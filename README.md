# qRead

A Qur'an reading app built to make daily reading a habit. One ayah at a time,
held still. A short reverse timer, a daily goal you can actually hit, and a
streak that forgives a bad day but not a missing one.

Runs entirely in the browser. No account, no backend, no network after first
load. Progress is saved locally and can be exported to a file.

## Development

```
npm install
npm run dev        # dev server
npm test           # core logic tests
npm run build      # static output in dist/
```

`npm run data` rebuilds `public/data/` from the upstream sources. It is a rare
manual step -- the generated data is committed so ordinary builds need no
network. It requires `unzip` on PATH.

## What it weighs

Zero runtime dependencies. Measured gzipped, which is what GitHub Pages serves.

| | gzip |
|---|---|
| App shell (JS + CSS + HTML) | 19.7 KB |
| Fonts (Amiri Quran, Noto Naskh, IBM Plex Mono) | 126 KB |
| First visit — shell + fonts + Al-Fātiḥah | **148 KB** |
| Complete Qur'an, both texts, cached for offline | 622 KB |
| Everything, once fully offline | 767 KB |

Only the current surah is fetched; the service worker precaches the rest in the
background. Al-Baqarah, the largest surah, is 17.7 KB brotli on its own.

## Keyboard

| | |
|---|---|
| `←` `→` | previous / next ayah |
| `[` `]` | Arabic text size |
| `T` | show or hide the translation |
| `F` | fullscreen |
| `Esc` | leave fullscreen |

The translation is off by default. These hints sit under the ayah until you
have twenty verses behind you, then they stop earning their place.

## How the scoring works

| rung | pts/verse | goal bonus | a full-goal day |
|---|---|---|---|
| 1 | 3 | 21 | 24 |
| 3 | 4 | 28 | 40 |
| 5 | 5 | 35 | 60 |
| 10 | 7 | 49 | 119 |
| 20 | 9 | 63 | 243 |
| 30 | 10 | 70 | 370 |

Streak multipliers are ×1.2 at 7 days, ×1.5 at 30, ×2.0 at 100. Verses beyond
twice your goal earn half points -- bingeing is capped, showing up is not.

Reading one verse keeps a streak alive. Hitting the goal is what earns the
bonus, grows the multiplier, and counts toward unlocking rungs 20 and 30. The
day rolls over at 3am, so reading at 1am still counts for the night before.

A verse credits only when you move forward off it having spent
`clamp(0.6s x words, 2s, 30s)` of *active* time on it. Holding the arrow key
down advances the text and earns nothing.

## Sources and licences

| Asset | Source | Licence |
|---|---|---|
| Arabic text (Uthmani) | [Tanzil Project](https://tanzil.net) v1.1 | CC BY 3.0, verbatim only |
| English translation | *Quran in English*, Talal Itani, [ClearQuran](https://www.clearquran.com) | see `public/licenses/clearquran.txt` |
| Amiri Quran, Noto Naskh Arabic | aliftype / notofonts | SIL OFL 1.1 |

Both texts are reproduced verbatim and only reshaped into JSON. Full notices are
in `public/licenses/` and shown in the app.
