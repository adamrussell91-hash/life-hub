import { ApiClientError } from '@/api/client';

/** Small DOM helpers shared by the quiz builder, player and panels. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  text: string,
  kind: 'primary' | 'secondary' | 'ghost',
  onClick: (this: HTMLButtonElement, event: MouseEvent) => void
): HTMLButtonElement {
  const node = el('button', `btn btn--${kind}`, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** A small square icon button with an accessible name. */
export function iconButton(symbol: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', 'qz-icon-btn', symbol);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  node.title = label;
  node.addEventListener('click', onClick);
  return node;
}

let seq = 0;
export function uid(prefix = 'qz'): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A labelled control. The label is tied to the control for screen readers. */
export function labelled<T extends HTMLElement>(label: string, control: T, hint?: string): HTMLElement {
  const wrap = el('div', 'qz-field');
  const id = control.id || uid('qz-field');
  control.id = id;
  const lab = el('label', 'qz-field__label', label);
  lab.htmlFor = id;
  wrap.append(lab);
  if (hint) wrap.append(el('p', 'qz-field__hint', hint));
  wrap.append(control);
  return wrap;
}

export function textInput(value: string, max: number, placeholder = ''): HTMLInputElement {
  const input = el('input', 'qz-input');
  input.type = 'text';
  input.value = value;
  input.maxLength = max;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  return input;
}

export function textArea(value: string, max: number, rows = 3, placeholder = ''): HTMLTextAreaElement {
  const input = el('textarea', 'qz-input qz-input--area');
  input.value = value;
  input.maxLength = max;
  input.rows = rows;
  input.placeholder = placeholder;
  return input;
}

export function select(options: Array<{ value: string; label: string }>, value: string, placeholder?: string): HTMLSelectElement {
  const node = el('select', 'qz-select');
  if (placeholder !== undefined) {
    const blank = el('option', '', placeholder);
    blank.value = '';
    node.append(blank);
  }
  for (const o of options) {
    const option = el('option', '', o.label);
    option.value = o.value;
    node.append(option);
  }
  node.value = value;
  return node;
}

export function checkbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const wrap = el('label', 'qz-check');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, el('span', '', label));
  return wrap;
}

export function errorText(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'network_error') return 'Couldn’t reach the server. Check your connection and try again.';
    if (error.message) return error.message;
  }
  return fallback;
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

/** A random secret that identifies this device to one activity. Never a name. */
export function newDeviceToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The device token for a scope, made on first use. Null when the browser can't store it. */
export function deviceToken(scope: string): string | null {
  const key = `quiz-device:${scope}`;
  const existing = readJSON<string>(key);
  if (existing && /^[a-f0-9]{48}$/.test(existing)) return existing;
  const token = newDeviceToken();
  return writeJSON(key, token) ? token : null;
}

export function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Two strands crossing: the interleaved mark on a practice question. */
export function practiceIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('qz-practice__icon');
  for (const d of ['M2 4c4 0 8 8 12 8', 'M2 12c4 0 8-8 12-8']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** The "Practice for you" chip. */
export function practiceChip(): HTMLElement {
  const chip = el('span', 'qz-practice', 'Practice for you');
  chip.prepend(practiceIcon());
  return chip;
}
