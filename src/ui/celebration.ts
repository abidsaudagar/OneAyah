/**
 * The card that appears when a goal is worth more than the usual quiet pop.
 *
 * It is anchored to the goal metric itself rather than positioned against a
 * measured rectangle, so it needs no reflow handling and cannot drift: the
 * arrow points at the card's own parent.
 *
 * It never covers the ayah. That rule is stated twice in this codebase and
 * this is the feature most likely to break it.
 */
import type { CelebrationCopy } from '../core/celebrate.ts';
import { el } from './dom.ts';

/** The backstop. The reader's next move is the usual way this leaves. */
const LIFE_MS = 8000;
/**
 * How long before the card starts listening for that next move. Without it the
 * very keypress that credited the verse -- or the next one in a held-arrow
 * repeat -- would dismiss the card in the same breath that opened it.
 */
const ARM_MS = 900;
const FADE_MS = 260;

export interface CelebrationCard {
  readonly root: HTMLElement;
  dismiss(): void;
}

/**
 * Builds the card and starts its life. The caller appends `root` to whichever
 * anchor it wants -- the goal metric in the reader, the goal readout in
 * fullscreen -- and calls `dismiss` if that anchor is about to go away.
 */
export function celebrationCard(copy: CelebrationCopy, arrow: boolean): CelebrationCard {
  const root = el('div', {
    class: `celebrate${arrow ? ' celebrate--arrow' : ''}`,
    // status, not alert: this is worth saying once when the reader gets to it,
    // and never worth interrupting whatever a screen reader is already on.
    attrs: { role: 'status' },
  },
    arrow ? el('span', {
      class: 'celebrate__arrow', attrs: { 'aria-hidden': 'true' },
      html: '<svg width="22" height="26" viewBox="0 0 22 26" fill="none" stroke="currentColor"'
        + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M13.5 25c-4-4.6-6-9.4-6-14.2 0-3 .7-5.6 2-8"/>'
        + '<path d="M5.6 6.2 9.5 2.2l3.4 4.4"/></svg>',
    }) : null,
    el('p', { class: 'celebrate__head', text: copy.headline }),
    el('p', { class: 'celebrate__body', text: copy.body }),
    copy.teach ? el('p', { class: 'celebrate__teach', text: copy.teach }) : null,
  );

  let gone = false;
  let armTimer: number | undefined;
  let lifeTimer: number | undefined;

  const dismiss = (): void => {
    if (gone) return;
    gone = true;
    clearTimeout(armTimer);
    clearTimeout(lifeTimer);
    window.removeEventListener('keydown', dismiss);
    window.removeEventListener('pointerdown', dismiss);
    root.classList.add('celebrate--leaving');
    // Removed on a timer rather than on transitionend: under reduced motion the
    // global rule cuts the transition to 0.01ms and the event can be missed
    // entirely, which would leave the card on screen forever.
    setTimeout(() => root.remove(), FADE_MS);
  };

  armTimer = setTimeout(() => {
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
  }, ARM_MS) as unknown as number;
  lifeTimer = setTimeout(dismiss, LIFE_MS) as unknown as number;

  return { root, dismiss };
}
