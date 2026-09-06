/**
 * Composition root. Wiring only -- every rule lives in core/, every effect in
 * platform/ or store/.
 */
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/app.css';

import { createAppStore } from './app/store.ts';
import { Session } from './app/session.ts';
import type { Range } from './core/analytics.ts';
import { celebrationFor } from './core/celebrate.ts';
import { report, shouldAsk } from './core/feedback.ts';
import { pointsPerVerse } from './core/scoring.ts';
import { BUILD, FEEDBACK_FORM_URL } from './config.ts';
import { download, exportBlob, parseBackup, pickFile } from './store/backup.ts';
import { globalIndex, loadMeta, loadSurah, prefetchSurah, type Surah } from './data/quran.ts';
import { closeDrawer, isDrawerOpen, openDrawer } from './ui/drawer.ts';
import { attachGestures, tapZonesWanted, touchCapable } from './ui/gestures.ts';
import { clampSize } from './core/gesture.ts';
import type { Slide, SlideDir } from './ui/slide.ts';
import { el, qs } from './ui/dom.ts';
import {
  closeAnyPanel, isPanelOpen, openAbout, openBackupPanel, openFeedbackPanel,
  openGoalPicker, openSettings, openStatsPanel, openUpgradeGate,
} from './ui/panels.ts';
import { nextTheme } from './platform/theme.ts';
import { ReaderView } from './ui/reader.ts';
import { renderStats } from './ui/stats.ts';
import { TvView } from './ui/tv.ts';
import { SCRIPT_OF, type ArabicFont, type ArabicScript, type QuranMeta, type Rung, type Settings } from './types.ts';

const store = createAppStore();
const app = qs<HTMLElement>('#app');

let meta: QuranMeta;
let surah: Surah;
let index = 0;
/**
 * Which part of the ayah is on screen. An ayah too long for the frame is read
 * a screenful at a time, so the arrows turn parts first and only move to the
 * next ayah once the last part has been read.
 */
let page = 0;
let range: Range = 'year';

/**
 * The presentation the ayah on screen was last painted with, and the font that
 * produced it. Settings reach the reader through `paintState`, which paints
 * everything except the verse -- so a change made in the panel used to sit
 * unapplied until the reader moved on. It cannot now: choosing the Indo-Pak
 * face also changes which text is fetched.
 */
let shownKey = '';
let shownFont: ArabicFont = store.get().settings.arabicFont;

let tv: TvView | null = null;
let autoTimer: number | undefined;
/** Set while the stats panel is open, so live updates reach it. */
let statsHost: HTMLElement | null = null;
/** Seeded at boot, so arriving with the goal already met does not celebrate. */
let goalWasMet = false;
/**
 * Set only across a `creditVerse` dispatch.
 *
 * The crossing alone is not enough to celebrate. Lowering the rung can also
 * flip `goalMet` from false to true -- read three verses against a goal of
 * five, then drop to three -- and the reader has not hit anything; they have
 * moved the line. This is the difference between the two, and it is what the
 * old guard's comment claimed to do without actually doing it.
 */
let creditingVerse = false;

/* --------------------------------------------------------------- appearance */

function applyAppearance(s: Settings): void {
  const root = document.documentElement;
  root.dataset.accent = s.accent;
  if (s.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
}

/* ------------------------------------------------------------------ reading */

const globalId = () => globalIndex(meta, surah.meta.n, index + 1);

/** Uthmani or Indo-Pak, decided by the chosen face. */
const scriptNow = (): ArabicScript => SCRIPT_OF[store.get().settings.arabicFont];

async function goToSurah(n: number, ayahIndex = 0): Promise<void> {
  surah = await loadSurah(n, scriptNow());
  index = Math.min(Math.max(0, ayahIndex), surah.meta.c - 1);
  page = 0;
  paintVerse();
  store.dispatch({ t: 'setPosition', position: { surah: n, ayah: index + 1 } });
  prefetchSurah(n + 1, scriptNow());
}

/**
 * Whether a step in `direction` would move anything at all.
 *
 * Asked BEFORE the animation, never after: `step` returns silently at the two
 * ends of the Qur'an, and playing an exit for a step that then does not happen
 * would slide 1:1 off the screen and bring it straight back.
 */
function canStep(direction: 1 | -1): boolean {
  const parts = activeView().pageCount();
  if (direction === 1 ? page < parts - 1 : page > 0) return true;
  const next = index + direction;
  if (next < 0) return surah.meta.n !== 1;
  if (next >= surah.meta.c) return surah.meta.n !== 114;
  return true;
}

/** The slide belonging to whichever view the reader is actually looking at. */
const activeSlide = (): Slide => (tv ?? view).slide;

/**
 * Every way of moving through the Qur'an goes through here -- arrow keys, the
 * nav buttons, the overlay's tap halves, auto-advance, and every touch gesture.
 * There is exactly one place a step is animated, so the motion cannot drift
 * apart between the paths that cause it.
 *
 * The two halves sandwich the repaint: the ayah leaves, `step` swaps the text
 * while the frame is empty, the new one arrives. Only the exit is awaited. The
 * entry is fired and left to run, so a reader swiping faster than the animation
 * is not made to wait for it -- the next step's exit cancels the entry still
 * playing, which reads as the pages being turned quickly rather than as a queue
 * draining.
 */
async function move(direction: 1 | -1): Promise<void> {
  session.start();
  if (!canStep(direction)) return;

  const dir: SlideDir = direction === 1 ? 'next' : 'prev';
  const from = globalId();
  await activeSlide().out(dir);
  await step(direction);
  // Asked again rather than reused: entering or leaving fullscreen across the
  // await would leave the first answer painting a detached overlay.
  // `globalId` moving is what separates a new ayah from another part of the
  // same one, which is the only thing the translation's fade turns on.
  activeSlide().enter(dir, globalId() !== from);
}

/**
 * Moving forward credits the verse you are leaving. Going back never credits,
 * and a verse already banked today cannot be banked twice -- that dedupe lives
 * in the reducer.
 *
 * A long ayah is read in parts, and a part is not a verse. So the arrow turns
 * the part first, and only the step off the LAST part leaves the ayah and
 * credits it -- otherwise 2:282 alone would fill a five-verse goal. Going back
 * off the first part lands on the last part of the ayah before, which is the
 * screen the reader last saw.
 */
async function step(direction: 1 | -1): Promise<void> {
  const parts = activeView().pageCount();
  if (direction === 1 ? page < parts - 1 : page > 0) {
    page += direction;
    paintVerse();
    return;
  }

  if (direction === 1) {
    creditingVerse = true;
    try {
      store.dispatch({ t: 'creditVerse', id: globalId(), nowMs: Date.now() });
    } finally {
      // The store notifies synchronously, so paintState has already run and
      // read the flag by the time this lands.
      creditingVerse = false;
    }
  }

  const next = index + direction;
  if (next < 0) {
    if (surah.meta.n === 1) return;
    const prev = await loadSurah(surah.meta.n - 1, scriptNow());
    await goToSurah(prev.meta.n, prev.meta.c - 1);
    landOnLastPart();
  } else if (next >= surah.meta.c) {
    if (surah.meta.n === 114) return;
    await goToSurah(surah.meta.n + 1, 0);
  } else {
    index = next;
    page = 0;
    paintVerse();
    if (direction === -1) landOnLastPart();
    store.dispatch({ t: 'setPosition', position: { surah: surah.meta.n, ayah: index + 1 } });
    if (index >= surah.meta.c - 5) prefetchSurah(surah.meta.n + 1, scriptNow());
  }
}

/**
 * The view can only report how many parts an ayah has once it has laid one out,
 * so arriving backwards takes a paint to find the count and a second to show
 * the last part. Only ayat that actually split pay for it.
 */
function landOnLastPart(): void {
  const last = activeView().pageCount() - 1;
  if (last <= 0) return;
  page = last;
  paintVerse();
}

/** Whichever view the reader is actually looking at owns the split. */
const activeView = (): { pageCount: () => number } => tv ?? view;

/* -------------------------------------------------------------------- views */

const view = new ReaderView({
  onPrev: () => void move(-1),
  onNext: () => void move(1),
  // A typed jump stays inside the surah on screen, and never credits a verse:
  // only moving forward through the reader banks anything.
  onJumpToAyah: (ayah) => void goToSurah(surah.meta.n, ayah - 1),
  onOpenGoal: () => {
    const snap = store.snapshot();
    openGoalPicker(snap, (r: Rung) => store.dispatch({ t: 'setRung', rung: r, nowMs: Date.now() }));
  },
  onOpenSettings: () => openSettings(
    { ...store.get().settings },
    (patch) => store.dispatch({ t: 'patchSettings', patch }),
    openAbout,
    openFeedback,
  ),
  onOpenDrawer: () => openDrawer(meta, surah.meta.n, store.get().coverage,
    (n) => void goToSurah(n, 0)),
  onOpenFullscreen: () => void enterFullscreen(),
  onOpenBackup: () => openBackup(),
  onOpenStats: () => openStatsPanel(paintStats),
  onOpenFeedback: () => openFeedback(),
  onDismissNotice: () => {
    view.noticeDismissed = true;
    store.dispatch({ t: 'dismissNotice' });
    paintState();
  },
  onDismissFeedback: () => store.dispatch({ t: 'dismissFeedback' }),
  // The header button only ever names a surface, so cycling off `system`
  // pins the theme. The panel is where you hand the choice back to the OS.
  onCycleTheme: () => store.dispatch({
    t: 'patchSettings', patch: { theme: nextTheme(store.get().settings.theme) },
  }),
});

function openBackup(): void {
  openBackupPanel(store.snapshot(), {
    onExport: () => {
      const { filename, json } = exportBlob(store.get(), Date.now());
      download(filename, json);
    },
    onImport: async () => {
      const text = await pickFile();
      if (text === null) return;
      const result = parseBackup(text, Date.now());
      if (!result.ok) { alert(result.error); return; }
      store.dispatch({ t: 'replaceState', next: result.state });
      applyAppearance(result.state.settings);
      await goToSurah(result.state.position.surah, result.state.position.ayah - 1);
      paintState();
    },
    onDismiss: () => {
      view.noticeDismissed = true;
      store.dispatch({ t: 'dismissNotice' });
      paintState();
    },
  });
}

/**
 * Opening the ask is itself an answer to it. Whether the reader writes anything
 * or not, they have now been asked, so the line does not come back a second
 * time -- and the numbers are gathered here, at the moment they are about to
 * be looked at, rather than being kept anywhere.
 */
function openFeedback(): void {
  const rows = report(store.get(), store.snapshot(), {
    build: BUILD,
    agent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  });
  store.dispatch({ t: 'dismissFeedback' });
  openFeedbackPanel(rows, FEEDBACK_FORM_URL);
}

/* ------------------------------------------------------------------ session */

const session = new Session({
  lengthSec: () => store.get().settings.sessionLen,
  onFlushSeconds: (seconds) => store.dispatch({ t: 'addSeconds', seconds, nowMs: Date.now() }),
  // The countdown exists to pull the reader forward, not to stop them. At 0:00
  // it rolls straight into another session rather than interrupting with a
  // modal. Nothing is banked here -- points land per verse as they are read.
  onComplete: () => session.restart(),
  onFrame: () => paintClock(),
});

/* --------------------------------------------------------------- fullscreen */

async function enterFullscreen(): Promise<void> {
  // Entering twice would leak the first overlay and leave the visible one
  // orphaned from `tv`, so its counters would never update again.
  if (tv !== null) return;

  // A card anchored in the header is about to be covered by the overlay.
  view.clearCelebration();

  tv = new TvView({
    onPrev: () => void move(-1),
    onNext: () => void move(1),
    onExit: () => void exitFullscreen(),
  });
  document.body.append(tv.root);
  // The overlay keeps its own tap halves, which already send the right of the
  // screen forward, on the same sides as the reader's, so only swipe and pinch
  // are added here.
  if (touchCapable()) {
    detachTvGestures = attachGestures(
      { surface: tv.root, frame: tv.frame, taps: () => false }, gestureCallbacks);
  }
  tv.paintVerse(surah, index, page, store.get().settings);
  tv.paintState(store.snapshot());
  // The overlay's frame is not the reader's, so the ayah may split differently
  // in it. Painting again with the clamped part keeps a reader who was on part
  // 3 of 4 from landing past the end of a two-part split.
  paintVerse(false);
  scheduleAuto();

  try {
    // Must be called synchronously enough to still count as a user gesture.
    await document.documentElement.requestFullscreen();
  } catch {
    // Fullscreen refused (iOS Safari, permissions). The overlay still works.
  }
}

async function exitFullscreen(): Promise<void> {
  clearTimeout(autoTimer);
  autoTimer = undefined;
  detachTvGestures?.();
  detachTvGestures = null;
  tv?.slide.settle();
  tv?.teardown();
  tv?.root.remove();
  tv = null;
  paintVerse(false);
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignore */ } }
}

/** Holds each ayah for the chosen dwell, then moves on. */
function scheduleAuto(): void {
  clearTimeout(autoTimer);
  const chosen = store.get().settings.autoAdvanceSec;
  if (tv === null || chosen === null) return;
  autoTimer = setTimeout(() => {
    // Re-arm even if the step was a no-op -- at the last ayah of the Qur'an
    // move() returns early, and chaining off it alone would stop the loop.
    void move(1).finally(scheduleAuto);
  }, chosen * 1000) as unknown as number;
}

// The Arabic faces load after the first paint, and a split measured against a
// fallback face is measured against the wrong metrics -- the parts come out the
// wrong length and nothing would ever recompute them. Re-split once the real
// faces are in. Failure here is not worth handling: it means the fallback is
// what the reader is going to see anyway, so the split already matches it.
document.fonts?.ready.then(() => paintVerse(false)).catch(() => {});

// A resize changes the frame the ayah was split for, so the split is stale.
// Repainting re-measures it -- the pager keys its cache on the box it measured
// against, so a size that has not actually changed costs nothing -- and
// paintVerse clamps the part in case the new frame holds fewer of them.
// `moved` is false: a window drag is not a step through the ayah and must not
// re-arm the auto-advance dwell.
window.addEventListener('resize', () => paintVerse(false));

// Browsers swallow Escape during native fullscreen, so the exit signal is the
// fullscreenchange event, never a key handler.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && tv !== null) void exitFullscreen();
});

/* ---------------------------------------------------------------- rendering */

/**
 * `moved` is false when the ayah on screen has not changed and only its
 * presentation has -- a size nudge, translation on or off. Re-arming the
 * auto-advance dwell there would let someone hold the overlay still by
 * toggling, so the timer is left to run.
 */
function paintVerse(moved = true): void {
  const settings = store.get().settings;
  // Every caller that passes `false` is a repaint the reader did not step for
  // -- a resize, the real faces landing, a size or translation change. None of
  // them is a move, so any slide still in the air belongs to a step that is now
  // being painted over, and it is put back rather than left half-travelled.
  // Both views, because the one not on screen can be holding a stale transform.
  if (!moved) { view.slide.settle(); tv?.slide.settle(); }
  // Both views are painted, but they split independently: the overlay's frame
  // and type are not the reader's, so the same ayah can be two parts in one and
  // four in the other. `page` is then clamped to whichever is on screen, which
  // is what keeps it in range across entering and leaving fullscreen.
  view.paintVerse(surah, index, page, settings);
  tv?.paintVerse(surah, index, page, settings);
  page = Math.min(page, activeView().pageCount() - 1);
  shownKey = presentationKey(settings);
  shownFont = settings.arabicFont;
  if (tv && moved) scheduleAuto();
}

/** Everything about the settings that the verse itself is painted from. */
const presentationKey = (s: Settings): string => [
  s.arabicFont, s.arabicSize, s.translationSize, s.showTranslation,
].join('|');

/**
 * Re-fetches the ayah on screen in the other orthography. If it cannot be had
 * -- offline, before the service worker has cached it -- the font choice is put
 * back rather than rendering Uthmani glyphs in a face cut for Indo-Pak.
 */
async function showScript(script: ArabicScript, fallback: ArabicFont): Promise<void> {
  // Claim the change before awaiting: every store notification during the fetch
  // comes back through paintState, and a stale key there would start the same
  // load again on each one.
  shownKey = presentationKey(store.get().settings);
  const n = surah.meta.n;

  let next: Surah;
  try {
    next = await loadSurah(n, script);
  } catch {
    store.dispatch({ t: 'patchSettings', patch: { arabicFont: fallback } });
    return;
  }

  // The reader can move while this is in flight; landing the old surah on top
  // of the new one would silently rewind them.
  if (surah.meta.n !== n) return;
  surah = next;
  paintVerse(false);
  prefetchSurah(n + 1, script);
}

function paintState(): void {
  // If the overlay ever leaves the document without going through
  // exitFullscreen, `tv` would keep painting a detached node and the reader
  // would watch a frozen counter. Drop it instead.
  if (tv !== null && !tv.root.isConnected) tv = null;

  const snap = store.snapshot();
  applyAppearance(snap.settings);

  // A settings change reaches the ayah here, and only here.
  if (presentationKey(snap.settings) !== shownKey) {
    const script = SCRIPT_OF[snap.settings.arabicFont];
    if (script === surah.script) paintVerse(false);
    else void showScript(script, shownFont);
  }

  // The ask is a rule, not a stored flag: three goal-met days and not yet
  // answered. It can only turn itself off, never back on.
  view.feedbackAsk = shouldAsk(store.get().days, store.get().feedbackDismissed);
  view.paintState(snap, store.degraded);
  tv?.paintState(snap);
  if (statsHost !== null) paintStats(statsHost);

  // Only on the crossing, only upward, and only when a VERSE carried it over.
  if (snap.goalMet && !goalWasMet && creditingVerse) {
    // Non-null only for a first goal or a newly crossed streak tier; every
    // other day gets the quiet pop and nothing else.
    const earned = celebrationFor(store.get().days, snap.today);
    // Fullscreen has no goal button, so the card goes there without an arrow
    // rather than pointing at a control that is not on screen.
    if (tv !== null && earned !== null) tv.celebrateGoal(earned);
    else view.celebrateGoal(earned);
  }
  goalWasMet = snap.goalMet;
}

/** Renders the analytics into whichever host the stats panel handed us. */
function paintStats(host: HTMLElement): void {
  statsHost = host;
  const snap = store.snapshot();
  renderStats(host, store.get().days, snap.today, range, (r) => { range = r; paintStats(host); });
}

function paintClock(): void {
  const lengthSec = store.get().settings.sessionLen;
  const remaining = session.isRunning || session.elapsedMs() > 0
    ? session.remainingMs() / 1000
    : lengthSec;
  view.paintClock(remaining, lengthSec, session.activeMs() / 1000);
  tv?.paintClock(remaining);

}

/* ----------------------------------------------------------------- gestures */

/**
 * What a touch is allowed to do, wherever it lands. The same object serves the
 * reader and the fullscreen overlay -- only the surface it is attached to and
 * whether that surface wants tap zones differ.
 */
const gestureCallbacks = {
  onMove: (m: 'next' | 'prev' | 'none') => { if (m !== 'none') void move(m === 'next' ? 1 : -1); },
  onDrag: (px: number | null) => activeSlide().offset(px),
  onSize: (px: number) => setArabicSize(px),
  // The store debounces settings writes by 250ms, which is right while the
  // fingers are still moving and wrong the moment they stop -- a reader who
  // sets a size and immediately backgrounds the app should not lose it.
  onSizeSettled: () => store.flush(),
  arabicSize: () => store.get().settings.arabicSize,
  // The same guard the keyboard uses: with a panel or the drawer open, the
  // reader is not reading, and a swipe over a scrim must not turn the ayah
  // underneath it.
  blocked: () => isPanelOpen() || isDrawerOpen(),
};

/** Torn down with the overlay, so a removed node is never left listening. */
let detachTvGestures: (() => void) | null = null;

/* ----------------------------------------------------------------- keyboard */

const ARABIC_SIZE_STEP = 6;

/**
 * The one way the Arabic size ever changes. `[` and `]` nudge it by a step, a
 * pinch lands on an arbitrary value, and both clamp through the same core
 * helper -- so the two controls cannot drift into disagreeing about the range.
 */
function setArabicSize(px: number): void {
  const current = store.get().settings.arabicSize;
  const next = clampSize(px);
  if (next === current) return;
  store.dispatch({ t: 'patchSettings', patch: { arabicSize: next } });
  paintVerse(false);
}

const nudgeArabicSize = (delta: number): void =>
  setArabicSize(store.get().settings.arabicSize + delta);

function toggleTranslation(): void {
  const on = !store.get().settings.showTranslation;
  store.dispatch({ t: 'patchSettings', patch: { showTranslation: on } });
  paintVerse(false);
}

window.addEventListener('keydown', (e) => {
  if (isPanelOpen() || isDrawerOpen()) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
  // Leave browser and OS chords alone; these are bare keys only.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  // A held key auto-repeats at the OS rate, which is far faster than anyone
  // can read an ayah. Every key here is a discrete act -- move, toggle, leave
  // -- and wants one tap per step, so the repeats are dropped. Text size is
  // the one exception below: holding [ or ] to scale smoothly is the point.
  if (e.repeat && e.key !== '[' && e.key !== ']') {
    // Still swallow the key so the page does not scroll under a held arrow.
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') e.preventDefault();
    return;
  }

  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); void move(1); break;
    case 'ArrowLeft': e.preventDefault(); void move(-1); break;
    case '[': e.preventDefault(); nudgeArabicSize(-ARABIC_SIZE_STEP); break;
    case ']': e.preventDefault(); nudgeArabicSize(ARABIC_SIZE_STEP); break;
    case 't': case 'T': e.preventDefault(); toggleTranslation(); break;
    case 'f': case 'F':
      if (tv === null) { e.preventDefault(); void enterFullscreen(); }
      break;
    case 'Escape':
      if (tv !== null) { e.preventDefault(); void exitFullscreen(); }
      break;
    default: break;
  }
});

/* --------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  applyAppearance(store.get().settings);
  app.append(view.root);

  // Stamped before the first paint, so a phone never shows a frame of the
  // desktop layout on its way to the touch one. It is the same `pointer:
  // coarse` question the gestures are attached behind, asked once and written
  // down, so the CSS and the listeners can never disagree about the answer.
  const touch = touchCapable();
  if (touch) document.documentElement.dataset.touch = 'on';

  meta = await loadMeta();
  const pos = store.get().position;
  await goToSurah(pos.surah, pos.ayah - 1);

  // Attached only now. A gesture is a step, and a step reads `meta` and the
  // surah on screen -- neither of which exists until the two awaits above have
  // returned. Nothing here runs on a desktop; tap zones are asked for again at
  // every tap, because the width they turn on changes when a phone is rotated.
  if (touch) {
    attachGestures(
      { surface: view.surface, frame: view.frame, taps: tapZonesWanted },
      gestureCallbacks);
  }

  const snap = store.snapshot();
  view.noticeDismissed = store.get().noticeDismissed;
  goalWasMet = snap.goalMet;

  store.subscribe(() => paintState());
  paintState();

  // The session clock starts on the first real interaction, not on load, so
  // opening the tab and walking away costs nothing.
  const startOnce = () => {
    session.restart();
    window.removeEventListener('keydown', startOnce);
    window.removeEventListener('pointerdown', startOnce);
  };
  window.addEventListener('keydown', startOnce);
  window.addEventListener('pointerdown', startOnce);
}

if (import.meta.env.DEV) {
  // Dev-only handle for driving the app from the console or a test harness.
  // Stripped from production builds by the bundler's dead-code elimination.
  (window as unknown as Record<string, unknown>).__oneAyah = {
    store, session,
    step: (d: 1 | -1) => move(d),
    // What one animation frame does. Exposed so the frame path can be driven
    // in environments where requestAnimationFrame is throttled to zero.
    paintClock: () => paintClock(),
    state: () => ({
      active: session.activity.active,
      running: session.isRunning,
      activeMs: session.activeMs(),
      remainingMs: session.remainingMs(),
      index, surah: surah?.meta.n,
      snapshot: store.snapshot(),
    }),
  };
}

boot().catch((err: unknown) => {
  app.replaceChildren(el('div', {
    style: 'padding:40px;max-width:520px;margin:0 auto;font:400 14px/1.6 var(--font-ui)',
  },
    el('h1', { style: 'font-size:17px;margin:0 0 8px', text: 'One Ayah could not start' }),
    el('p', { style: 'color:var(--muted);margin:0', text: String(err) }),
  ));
});

export { closeAnyPanel, closeDrawer, openUpgradeGate, pointsPerVerse };
