# One Ayah

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
| App shell (JS + CSS + HTML) | 20.3 KB |
| Fonts (Al Qalam, Amiri Quran, IBM Plex Mono) | 137 KB |
| First visit — shell + fonts + Al-Fātiḥah | **161 KB** |
| Complete Qur'an, all three texts, cached for offline | 973 KB |
| Everything, once fully offline | 1.10 MB |

Only the current surah is fetched; the service worker precaches the rest in the
background. Al-Baqarah, the largest surah, is 17.7 KB brotli on its own.

The Indo-Pak script is a second Arabic text, not a second font over the first,
so it costs a further 350 KB. It is precached with everything else, which is
what makes switching script work on a plane -- and what makes a reader who
never leaves Uthmani pay for it too.

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

A verse credits when you move forward off it. Going back never credits, and a
verse already banked today cannot be banked twice.

The reverse timer is there to pull you forward, not to stop you. At 0:00 it
rolls straight into another session -- there is no modal, and nothing is
banked at the boundary, because points land per verse as they are read.

## Feedback

No analytics, no account, no third-party script. The app asks once: a line
under the reader, after the third day the goal is met, that opens a single
panel -- three questions worth answering, and the reader's own numbers shown in
full with a button to copy them. It is also always reachable from the settings
panel. Nothing is sent by the app itself; what reaches me is what someone
chooses to paste.

Set `FEEDBACK_FORM_URL` in `src/config.ts` to wherever answers should land.
Empty is a supported state -- the panel drops the button and says there is no
form yet. Nothing is ever appended to that URL, so no reading data rides in a
query string.

Every build stamps the commit it came from. It shows under `SOURCES` and leads
the copied numbers, so a report names the code it came from.

## Sources and licences

| Asset | Source | Licence |
|---|---|---|
| Arabic text (Uthmani) | [Tanzil Project](https://tanzil.net) v1.1 | CC BY 3.0, verbatim only |
| Arabic text (Indo-Pak) | [Quran.com API v4](https://api.quran.com/api/v4/quran/verses/indopak) | none published; see `public/licenses/indopak.txt` |
| English translation | *Quran in English*, Talal Itani, [ClearQuran](https://www.clearquran.com) | see `public/licenses/clearquran.txt` |
| Amiri Quran | aliftype | SIL OFL 1.1 |
| Al Qalam Quran Majeed | Abdul Majeed Khan et al. | none published; see `public/licenses/fonts.txt` |

Every text is reproduced verbatim and only reshaped into JSON. The one exception
is recorded where it happens: the Indo-Pak source carries no basmala on the
opening ayah of a surah, so it is prefixed there from the text's own 1:1, which
is what the Uthmani text already does.

Two of the assets ship without a published licence -- the Indo-Pak text and the
Al Qalam face. Both are long-standing free downloads, redistributed unmodified
and credited, and both are named here rather than quietly folded into the OFL
line above. Full notices are in `public/licenses/` and shown in the app.
