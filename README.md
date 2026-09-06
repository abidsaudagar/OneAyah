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
| App shell (JS + CSS + HTML) | 29.0 KB |
| Fonts (Al Qalam, Amiri Quran, IBM Plex Mono) | 137 KB |
| First visit — shell + fonts + Al-Fātiḥah | **170 KB** |
| Noto Nastaliq Urdu, fetched only if you read the Urdu | 156 KB |
| Complete Qur'an, all four texts, cached for offline | 1.33 MB |
| Everything, once fully offline | 1.65 MB |

Only the current surah is fetched; the service worker precaches the rest in the
background. Al-Baqarah, the largest surah, is 17.7 KB brotli on its own.

The Indo-Pak script is a second Arabic text, not a second font over the first,
so it costs a further 350 KB. The Urdu translation costs 396 KB on the same
terms. Both are precached with everything else, which is what makes switching
script or language work on a plane -- and what makes a reader who never leaves
Uthmani and English pay for them too.

The Urdu FACE is the one thing here that is not paid for by everyone. Nastaliq
is a 156 KB file, and a browser fetches a face only when something on the page
is actually set in it, so a reader who never presses T past English never asks
for it. It is in the precache, so going offline does not take it away from
someone who does.

## Keyboard

| | |
|---|---|
| `←` `→` | previous / next ayah |
| `P` | start or pause auto-advance |
| `[` `]` | Arabic text size |
| `T` | your translation, then the other, then off |
| `F` | fullscreen |
| `Esc` | leave fullscreen |

The translation is off by default, and `T` is a cycle rather than a toggle, so
both translations are reachable from the keyboard without opening a panel. A
two-finger tap over the ayah is the touch counterpart and takes the same step
through the same cycle -- one function serves both, so the key and the gesture
cannot drift into meaning different things.

The cycle starts from YOUR language -- the one chosen in settings -- and comes
home to it:

| settings | `T` | `T` | `T` | `T` |
|---|---|---|---|---|
| English | English | Urdu | off | English |
| اردو | Urdu | English | off | Urdu |

A fixed order would have been simpler and was wrong: it spent the reader's own
choice on the first press. Someone who had picked Urdu got English, found Urdu
only on the second press, and lost it on the third. So the turn opens on the
language they chose and hands it back when it closes, which is why `Settings`
carries `translationHome` as well as `translationLang` -- the language the
cycle is walking through is not the language the reader picked, and the second
must survive the first. The hint under the ayah names each reader's own order.

One translation is on screen at a time. Two stacked under the ayah would take
the room from the thing this app exists to hold still.

These hints sit under the ayah until you have twenty verses behind you, then
they stop earning their place.

Neither the translation nor its language changes the size of the Arabic, in
either mode. Turning one on used to take about a quarter off the ayah in
fullscreen, and switching to Urdu moved the frame in the reader, because Urdu
is set larger and looser. The ayah is now the size you asked for, and what the
translation costs is paging: a long ayah is read in more parts, at that size.
The reserved box is measured from the unscaled setting so it is the same height
in both languages; turning the translation off still hands its room back to the
ayah, which is the point of reading without one.

The fullscreen translation is sized from the same `translationSize` the reader
uses, grown for the distance on the same rule the Arabic follows -- the setting
is what it is worth on a 1000px window. It used to be a fraction of the ARABIC
instead, which made entering fullscreen jump an 18px translation to nearly 48px
and made `[` and `]` resize the translation too.

## Auto-advance

`P` hands the page turns to the app, so a phone propped on a shelf or a laptop
at the far end of a table can be read without reaching it. It works in the
reader and in fullscreen alike -- having to press `F` first would put the one
gesture such a reader cannot make in front of the one thing they need. A hairline
along the bottom edge fills as the hold runs down, so a turn is never a surprise.

Each screenful is held for as long as its own words need. The time is built from
the words on screen and the letters in them -- `مِن` and `وَٱلْمُسْتَغْفِرِينَ`
are one word each and nothing like the same amount of reading -- plus the English
when the translation is showing, and the marks over the letters are not counted,
so the same verse takes the same time in either orthography. At the default pace
the basmala is held five seconds and Al-Fātiḥah's last ayah eleven. A long ayah
is still read in parts, and each part earns its own hold.

Settings has the dial: ten rungs from `0.5×` to `2.5×`, labelled in Arabic words
a minute so the number means something. Whether it is RUNNING is not a setting
and is never persisted -- every reload starts paused, because an app that began
turning pages by itself the moment a tab opened would be wrong in the way an
autoplaying video is.

It pauses itself for a hidden tab, and holds its place rather than turning the
page behind an open panel or the surah drawer. It stops at 114:6, and nowhere
else: a surah ending is not a reason to make someone reach for the keyboard they
were trying to avoid. Turns credit verses exactly as reading by hand does, and
count as activity for the session clock -- otherwise `TIME READ` would freeze a
minute in while verses went on banking, and the two halves of the same session
would disagree about whether anyone was there.

The arithmetic is a pure function in `src/core/dwell.ts` with its own tests;
`src/main.ts` holds only the timer and the guards.

## Touch

| | |
|---|---|
| swipe right | next ayah |
| swipe left | previous ayah |
| tap the right of the ayah | next ayah |
| tap the left of the ayah | previous ayah |
| pinch | Arabic text size |
| two-finger tap | the same translation cycle `T` walks |
| press and hold the ayah number | jump to an ayah |

Forward is rightward, on every input that has a side to it: the right half of
the frame, the right nav button, `ArrowRight`, and a rightward flick. The middle
sixth of the frame is dead, so a resting thumb costs nothing and a pinch has
somewhere safe to start.

The book turns the other way, and the tap zones once followed the book rather
than the phone. A tap zone has no page edge to give the game away -- the only
thing a reader has to go on is the side, and every other app on their phone has
already taught them which side is forward -- so the sides follow the phone.

The nav controls keep those sides on a touch screen, `BACK` left and `NEXT`
right, over the zones that mean the same. They say the words rather than drawing
arrows: there is no key to point at, and a word names the half of the frame
behind it in a way an arrowhead does not.

The one place the book still shows is the animation. Next sends the ayah out to
the right and brings the new one in from the left, which is what a mushaf does
under a thumb, and it is 34px rather than a page width.

Swipe and pinch go to any coarse pointer. Tap zones are held back to phones and
tablets: a tap forward credits the verse it leaves, permanently, and on a
touchscreen laptop a stray click in the reading area would do it silently.

The decision itself -- was that a swipe, a tap, a pinch, or nothing -- is a pure
function in `src/core/gesture.ts` with its own tests. `src/ui/gestures.ts` holds
only the listeners.

There is no gesture for auto-advance, and there should not be: a thumb that can
reach the screen does not need it. Settings turns it on and off instead.

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
| Urdu translation | Fateh Muhammad Jalandhry, via [Tanzil](https://tanzil.net/trans/) | non-commercial; see `public/licenses/jalandhry.txt` |
| Amiri Quran | aliftype | SIL OFL 1.1 |
| Noto Nastaliq Urdu | Google | SIL OFL 1.1 |
| Al Qalam Quran Majeed | Abdul Majeed Khan et al. | none published; see `public/licenses/fonts.txt` |

Every text is reproduced verbatim and only reshaped into JSON. The one exception
is recorded where it happens: the Indo-Pak source carries no basmala on the
opening ayah of a surah, so it is prefixed there from the text's own 1:1, which
is what the Uthmani text already does.

Two of the assets ship without a published licence -- the Indo-Pak text and the
Al Qalam face. Both are long-standing free downloads, redistributed unmodified
and credited, and both are named here rather than quietly folded into the OFL
line above. Full notices are in `public/licenses/` and shown in the app.

The Urdu translation is the one asset under a narrower grant than the rest:
Tanzil provides its translations for non-commercial use only, where the Arabic
text beside it is CC BY 3.0 with no such condition. This app is free, sells
nothing and carries no advertising, so the condition is met -- but it is a
condition, and it is recorded rather than folded in. Jalandhry was chosen over
the seven other Urdu texts Tanzil serves partly for that reason: it is the only
one Tanzil does not mark as copyrighted, and the translator died in 1954.
