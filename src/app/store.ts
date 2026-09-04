/** The one mutable cell in the app. Everything else reads a snapshot. */
import { reduce, select, type Action, type Snapshot } from '../core/state.ts';
import { createPersistence, type Persistence } from '../store/persist.ts';
import type { PersistedState } from '../types.ts';

export interface AppStore {
  get(): PersistedState;
  snapshot(): Snapshot;
  dispatch(a: Action): void;
  subscribe(fn: (s: Snapshot, state: PersistedState) => void): () => void;
  flush(): void;
  /** True when progress is not actually being saved anywhere durable. */
  readonly degraded: boolean;
}

/** Actions worth writing to disk the instant they happen. */
const IMMEDIATE = new Set<Action['t']>(['creditVerse', 'setRung', 'replaceState']);
const DEBOUNCE_MS = 250;

export function createAppStore(persistence: Persistence = createPersistence()): AppStore {
  let state = persistence.load(Date.now());
  let degraded = !persistence.store.available;
  const subs = new Set<(s: Snapshot, state: PersistedState) => void>();
  let timer: number | undefined;

  const write = () => {
    clearTimeout(timer);
    timer = undefined;
    if (persistence.save(state) !== 'ok') degraded = true;
  };

  const notify = () => {
    const snap = select(state, Date.now());
    for (const fn of subs) fn(snap, state);
  };

  // Never lose the tail of a session. pagehide fires reliably on mobile Safari
  // where beforeunload does not.
  window.addEventListener('pagehide', write);
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });

  return {
    get: () => state,
    snapshot: () => select(state, Date.now()),
    dispatch(a) {
      const next = reduce(state, a);
      if (next === state) return; // identity means nothing changed
      state = next;
      if (IMMEDIATE.has(a.t)) write();
      else if (timer === undefined) timer = setTimeout(write, DEBOUNCE_MS) as unknown as number;
      notify();
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    flush: write,
    get degraded() { return degraded; },
  };
}
