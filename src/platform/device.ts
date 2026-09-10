/**
 * What kind of screen this is. Kept out of the reducer, which is not allowed to
 * ask the DOM anything -- the shell answers the question once and hands the
 * answer in.
 */

/**
 * A phone, by the same 767px breakpoint the stylesheet reserves its phone
 * layout for. The two must agree: a reader who gets the phone type size should
 * be the same reader who gets the phone padding around it.
 */
export const isPhone = (): boolean =>
  window.matchMedia?.('(max-width: 767px)').matches ?? false;
