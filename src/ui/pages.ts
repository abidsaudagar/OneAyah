/**
 * The DOM half of splitting a long ayah: it decides what "fits" means for a
 * real element, and caches the answer so the reader does not pay for it twice.
 *
 * This measures, which the sizing code here deliberately does not. The two are
 * not the same bet. A measure-and-shrink pass feeds its own input -- the size
 * it picks changes the height it then measures -- so it can oscillate, and one
 * that settles wrong leaves the reader staring at unreadable type with no way
 * back. Paging measures at a size nothing here will change: the question is
 * only how many words clear a fixed height, every answer is independent of the
 * last, and the worst a wrong one can do is break a line early.
 */
import { paginate } from '../core/paginate.ts';

/** Everything a split depends on. Same key, same pages -- so no re-measuring. */
const keyOf = (text: string, available: number, style: string): string =>
  `${available.toFixed(0)}|${style}|${text}`;

export class Pager {
  private key = '';
  private pages: string[] = [''];

  /**
   * Splits `text` to fill `available` px of height in `probe`, whose font is
   * already whatever the ayah will be painted with.
   *
   * The probe IS the element the ayah lands in. A detached clone would have to
   * be kept in step with the real one's face, size, line-height and width, and
   * the day it drifts the reader gets pages measured for type they are not
   * reading. Every candidate is written and measured inside one task, so the
   * browser paints once, at the end, and none of the trial runs is ever seen.
   */
  split(probe: HTMLElement, text: string, available: number): string[] {
    const style = `${probe.style.fontSize}|${probe.dataset.font}|${probe.clientWidth}`;
    const key = keyOf(text, available, style);
    if (key === this.key) return this.pages;

    // A box with no height yet -- painted before layout, or while the overlay
    // is off-screen -- would measure everything as overflowing and split the
    // ayah into one word per page. Show it whole and re-split once there is a
    // box to measure against.
    if (available <= 0) return [text];

    const restore = probe.textContent;
    this.pages = paginate(text, (run) => {
      probe.textContent = run;
      return probe.scrollHeight <= available;
    });
    probe.textContent = restore;
    this.key = key;
    return this.pages;
  }

  /** Drops the cache, so the next split measures again. */
  invalidate(): void {
    this.key = '';
  }
}
