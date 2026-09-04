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
import { pointsPerVerse } from './core/scoring.ts';
import { download, exportBlob, parseBackup, pickFile } from './store/backup.ts';
import { globalIndex, loadMeta, loadSurah, prefetchSurah, type Surah } from './data/quran.ts';
import { closeDrawer, isDrawerOpen, openDrawer } from './ui/drawer.ts';
import { el, qs } from './ui/dom.ts';
import {
  closeAnyPanel, isPanelOpen, openAbout, openBackupPanel, openGoalPicker,
  openSettings, openStatsPanel, openUpgradeGate,
} from './ui/panels.ts';
import { ReaderView } from './ui/reader.ts';
import { renderStats } from './ui/stats.ts';
import { TvView } from './ui/tv.ts';
import type { QuranMeta, Rung, Settings } from './types.ts';

const store = createAppStore();
const app = qs<HTMLElement>('#app');

let meta: QuranMeta;
let surah: Surah;
let index = 0;
let range: Range = 'year';

let tv: TvView | null = null;
let autoTimer: number | undefined;
/** Set while the stats panel is open, so live updates reach it. */
let statsHost: HTMLElement | null = null;
/** Seeded at boot, so arriving with the goal already met does not celebrate. */
let goalWasMet = false;

/* --------------------------------------------------------------- appearance */

function applyAppearance(s: Settings): void {
  const root = document.documentElement;
  root.dataset.accent = s.accent;
  if (s.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
}

/* ------------------------------------------------------------------ reading */

const globalId = () => globalIndex(meta, surah.meta.n, index + 1);

async function goToSurah(n: number, ayahIndex = 0): Promise<void> {
  surah = await loadSurah(n);
  index = Math.min(Math.max(0, ayahIndex), surah.meta.c - 1);
  paintVerse();
  store.dispatch({ t: 'setPosition', position: { surah: n, ayah: index + 1 } });
  prefetchSurah(n + 1);
}

/**
 * Moving forward credits the verse you are leaving. Going back never credits,
 * and a verse already banked today cannot be banked twice -- that dedupe lives
 * in the reducer.
 */
async function step(direction: 1 | -1): Promise<void> {
  session.start();

  if (direction === 1) {
    store.dispatch({ t: 'creditVerse', id: globalId(), nowMs: Date.now() });
  }

  const next = index + direction;
  if (next < 0) {
    if (surah.meta.n === 1) return;
    const prev = await loadSurah(surah.meta.n - 1);
    await goToSurah(prev.meta.n, prev.meta.c - 1);
  } else if (next >= surah.meta.c) {
    if (surah.meta.n === 114) return;
    await goToSurah(surah.meta.n + 1, 0);
  } else {
    index = next;
    paintVerse();
    store.dispatch({ t: 'setPosition', position: { surah: surah.meta.n, ayah: index + 1 } });
    if (index >= surah.meta.c - 5) prefetchSurah(surah.meta.n + 1);
  }
}

/* -------------------------------------------------------------------- views */

const view = new ReaderView({
  onPrev: () => void step(-1),
  onNext: () => void step(1),
  onOpenGoal: () => {
    const snap = store.snapshot();
    openGoalPicker(snap, (r: Rung) => store.dispatch({ t: 'setRung', rung: r, nowMs: Date.now() }));
  },
  onOpenSettings: () => openSettings(
    { ...store.get().settings },
    (patch) => store.dispatch({ t: 'patchSettings', patch }),
    openAbout,
  ),
  onOpenDrawer: () => openDrawer(meta, surah.meta.n, store.get().coverage,
    (n) => void goToSurah(n, 0)),
  onOpenFullscreen: () => void enterFullscreen(),
  onOpenBackup: () => openBackup(),
  onOpenStats: () => openStatsPanel(paintStats),
  onDismissNotice: () => {
    view.noticeDismissed = true;
    store.dispatch({ t: 'dismissNotice' });
    paintState();
  },
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
  tv = new TvView({
    onPrev: () => void step(-1),
    onNext: () => void step(1),
    onExit: () => void exitFullscreen(),
  });
  document.body.append(tv.root);
  tv.paintVerse(surah, index, store.get().settings);
  tv.paintState(store.snapshot());
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
  tv?.root.remove();
  tv = null;
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* ignore */ } }
}

/** Holds each ayah for the chosen dwell, then moves on. */
function scheduleAuto(): void {
  clearTimeout(autoTimer);
  const chosen = store.get().settings.autoAdvanceSec;
  if (tv === null || chosen === null) return;
  autoTimer = setTimeout(
    () => { void step(1).then(scheduleAuto); }, chosen * 1000,
  ) as unknown as number;
}

// Browsers swallow Escape during native fullscreen, so the exit signal is the
// fullscreenchange event, never a key handler.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && tv !== null) void exitFullscreen();
});

/* ---------------------------------------------------------------- rendering */

function paintVerse(): void {
  const settings = store.get().settings;
  view.paintVerse(surah, index, settings);
  tv?.paintVerse(surah, index, settings);
  if (tv) scheduleAuto();
}

function paintState(): void {
  const snap = store.snapshot();
  applyAppearance(snap.settings);
  view.paintState(snap, store.degraded);
  tv?.paintState(snap);
  if (statsHost !== null) paintStats(statsHost);

  // Only on the crossing, and only upward: dropping a rung can make goalMet
  // true again, and re-celebrating that would be hollow.
  if (snap.goalMet && !goalWasMet) view.celebrateGoal();
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

/* ----------------------------------------------------------------- keyboard */

const ARABIC_SIZE_STEP = 6;

function nudgeArabicSize(delta: number): void {
  const current = store.get().settings.arabicSize;
  const next = Math.min(200, Math.max(24, current + delta));
  if (next === current) return;
  store.dispatch({ t: 'patchSettings', patch: { arabicSize: next } });
  paintVerse();
}

function toggleTranslation(): void {
  const on = !store.get().settings.showTranslation;
  store.dispatch({ t: 'patchSettings', patch: { showTranslation: on } });
  paintVerse();
}

window.addEventListener('keydown', (e) => {
  if (isPanelOpen() || isDrawerOpen()) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
  // Leave browser and OS chords alone; these are bare keys only.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case 'ArrowRight': e.preventDefault(); void step(1); break;
    case 'ArrowLeft': e.preventDefault(); void step(-1); break;
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

  meta = await loadMeta();
  const pos = store.get().position;
  await goToSurah(pos.surah, pos.ayah - 1);

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
  (window as unknown as Record<string, unknown>).__qread = {
    store, session,
    step: (d: 1 | -1) => step(d),
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
    el('h1', { style: 'font-size:17px;margin:0 0 8px', text: 'qRead could not start' }),
    el('p', { style: 'color:var(--muted);margin:0', text: String(err) }),
  ));
});

export { closeAnyPanel, closeDrawer, openUpgradeGate, pointsPerVerse };
