/**
 * The one place that asks the OS what "system" currently means.
 *
 * `system` is a preference, not a surface: it has to be resolved before the
 * header button can show what you are looking at or decide what a click moves
 * you to. Keeping the media query here means the reader and the composition
 * root agree on the answer instead of each guessing.
 */
import { CYCLE_THEMES, type Theme } from '../types.ts';

export type Surface = (typeof CYCLE_THEMES)[number];

/** The surface actually on screen. `system` resolves against the OS setting. */
export function resolveTheme(theme: Theme): Surface {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The next surface round light -> dark -> paper. Stepping from `system` starts
 * at whatever it currently resolves to, so the first click always changes the
 * screen rather than landing back on the surface already showing.
 */
export function nextTheme(theme: Theme): Surface {
  const i = CYCLE_THEMES.indexOf(resolveTheme(theme));
  return CYCLE_THEMES[(i + 1) % CYCLE_THEMES.length]!;
}
