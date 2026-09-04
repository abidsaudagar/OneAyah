/**
 * localStorage that cannot throw.
 *
 * Firefox with dom.storage disabled throws on the PROPERTY ACCESS, not just on
 * setItem, so the guard has to wrap the access itself. Safari private mode has
 * historically reported a ~0 quota. Neither may take the app down.
 */
export type WriteResult = 'ok' | 'quota' | 'unavailable';

export interface Store {
  read(): string | null;
  write(value: string): WriteResult;
  remove(): void;
  readonly available: boolean;
}

function rawLocalStorage(): globalThis.Storage | null {
  try {
    const ls = window.localStorage;
    const probeKey = '__qread_probe__';
    ls.setItem(probeKey, '1');
    ls.removeItem(probeKey);
    return ls;
  } catch {
    return null;
  }
}

export function createMemoryStore(): Store {
  let value: string | null = null;
  return {
    read: () => value,
    write: (v) => { value = v; return 'unavailable'; },
    remove: () => { value = null; },
    available: false,
  };
}

export function createStore(key: string): Store {
  const ls = rawLocalStorage();
  if (!ls) return createMemoryStore();

  return {
    read() {
      try { return ls.getItem(key); } catch { return null; }
    },
    write(value) {
      try { ls.setItem(key, value); return 'ok'; } catch { return 'quota'; }
    },
    remove() {
      try { ls.removeItem(key); } catch { /* nothing useful to do */ }
    },
    available: true,
  };
}

/**
 * Moves an unparseable blob aside so a corrupt state cannot crash-loop the app.
 * An app that will not start and has eaten a 200-day streak is the worst
 * failure available in this product; this is the cheap guard against it.
 */
export function quarantine(key: string, blob: string, nowMs: number): void {
  const ls = rawLocalStorage();
  if (!ls) return;
  try { ls.setItem(`${key}.corrupt.${nowMs}`, blob); } catch { /* best effort */ }
}
