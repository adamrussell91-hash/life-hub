import { ApiClientError } from '@/api/client';

/** Shared pieces of the peer feedback block: symbols, DOM helpers, device storage. */

/* ── Identities: six colours by six shapes, drawn rather than typed ──── */

const COLOURS = [
  { name: 'Blue', fill: 'var(--wave)' },
  { name: 'Green', fill: 'var(--success)' },
  { name: 'Orange', fill: 'var(--high-sea-ink)' },
  { name: 'Gold', fill: 'var(--pastel-gold-ink)' },
  { name: 'Purple', fill: 'var(--pastel-lilac-ink)' },
  { name: 'Red', fill: 'var(--danger)' }
] as const;

const SHAPES = [
  { name: 'star', path: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z' },
  { name: 'circle', path: 'M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z' },
  { name: 'square', path: 'M6.5 6.5h11v11h-11z' },
  { name: 'diamond', path: 'M12 4l8 8-8 8-8-8z' },
  { name: 'triangle', path: 'M12 5l8 14H4z' },
  { name: 'heart', path: 'M12 19.5s-7-4.3-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z' }
] as const;

function parts(id: string): [number, number] {
  const [c, s] = id.split('-').map(Number);
  return [c ?? 0, s ?? 0];
}

export function identityName(id: string): string {
  const [c, s] = parts(id);
  return `${COLOURS[c]?.name ?? ''} ${SHAPES[s]?.name ?? ''}`.trim();
}

export function token(id: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const [c, s] = parts(id);
  const node = el('span', `pf-token pf-token--${size}`);
  node.style.setProperty('--pf-token', COLOURS[c]?.fill ?? 'var(--orca)');
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPES[s]?.path ?? ''}"/></svg>`;
  return node;
}

/* ── Small DOM helpers ─────────────────────────────────────────────── */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  text: string,
  kind: 'primary' | 'secondary' | 'ghost',
  onClick: (this: HTMLButtonElement) => void
): HTMLButtonElement {
  const node = el('button', `btn btn--${kind}`, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

let fieldSeq = 0;
export function field(label: string, hint?: string): { wrap: HTMLElement; input: HTMLTextAreaElement } {
  const id = `pf-field-${++fieldSeq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const input = el('textarea', 'pf-field__input');
  input.id = id;
  wrap.append(lab);
  if (hint) wrap.append(el('p', 'pf-field__hint block-secondary', hint));
  wrap.append(input);
  return { wrap, input };
}

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the device won't store anything (private mode, full). */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The lesson or block isn't published yet, so there is no round to run. */
export function isNotPublished(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'not_published';
}

/** Calm stand-in for the teacher's controls until the lesson is published. */
export function notLivePanel(): HTMLElement {
  const box = el('div', 'pf-panel pf-panel--quiet');
  box.append(
    el('p', 'pf-panel__title block-subtitle', 'Not live yet'),
    el('p', 'pf-panel__text block-body', 'Publish this lesson and block, then Start activity appears here.')
  );
  return box;
}

export function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'network_error') return 'Couldn’t reach the server. Check your connection and try again. Your writing is still here.';
    if (error.message) return error.message;
  }
  return 'Something went wrong. Try again.';
}
