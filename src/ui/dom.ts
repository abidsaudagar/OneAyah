/** The whole view framework. There is not enough UI here to justify more. */
export type Child = Node | string | number | false | null | undefined;

type Props = {
  class?: string;
  text?: string;
  html?: string;
  style?: string;
  attrs?: Record<string, string | number | boolean | null>;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: never) => void>>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.style) node.setAttribute('style', props.style);
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    // ARIA states are STRING enumerations: aria-checked must be "true"/"false",
    // never the empty string that a real boolean HTML attribute uses. Setting
    // "" here silently breaks every [aria-checked='true'] style rule.
    if (k.startsWith('aria-')) {
      if (v === null) node.removeAttribute(k);
      else node.setAttribute(k, String(v));
    } else if (v === null || v === false) {
      node.removeAttribute(k);
    } else {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const [k, fn] of Object.entries(props.on ?? {})) {
    node.addEventListener(k, fn as EventListener);
  }
  append(node, children);
  return node;
}

/**
 * A keydown guard for buttons that move the reader. Holding Enter on a focused
 * button makes the browser fire keydown -- and therefore click -- at the OS
 * repeat rate; swallowing the repeats keeps every arrow a one-tap-one-ayah
 * control, matching how the same buttons behave under a held finger or mouse.
 */
export const tapOnly = (e: KeyboardEvent): void => { if (e.repeat) e.preventDefault(); };

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: Child[]) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  append(node, children);
  return node;
}

function append(node: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
}

export const clear = (node: Element): void => { node.replaceChildren(); };

export const qs = <T extends Element>(sel: string, root: ParentNode = document): T => {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`missing element: ${sel}`);
  return found;
};

/** mm:ss, or h:mm:ss once it runs past an hour. */
export function clockText(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const num = (n: number): string => n.toLocaleString('en-US');

/**
 * A speed multiplier as the reader sees it: 1.0x, 0.85x, 2.5x. Always at least
 * one decimal, so the ladder does not read as `1x, 1.2x` with the whole numbers
 * jumping a character narrower than their neighbours.
 */
export const speedText = (n: number): string =>
  `${Number.isInteger(n * 10) ? n.toFixed(1) : n.toFixed(2)}×`;
