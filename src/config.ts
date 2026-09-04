/**
 * The handful of values that are deployment, not behaviour.
 */

/**
 * Where FEEDBACK sends readers -- a form, an issue tracker, anything that
 * takes words. Empty until one exists, and the app is built to be honest
 * about that: with no URL the panel drops the button and says where to write
 * instead, rather than offering a link that goes nowhere.
 *
 * Nothing is ever appended to this URL. The reader copies their own numbers
 * and pastes them in, so no reading data rides in a query string.
 */
export const FEEDBACK_FORM_URL: string = 'https://forms.gle/WHuJYDvNFnZKaejo9';

/** The commit this bundle was built from; 'unknown' outside a git checkout. */
export const BUILD: string = __BUILD__;
