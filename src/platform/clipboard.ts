/**
 * The clipboard, which is unavailable more often than it looks: no permission,
 * an insecure context, or a browser that has never had the API at all. Every
 * caller here has a visible fallback, so none of them may throw.
 */

/** True when the text is on the clipboard; false when the browser refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Puts a node's text under the reader's own selection, so ⌘C still works. */
export function selectText(node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
