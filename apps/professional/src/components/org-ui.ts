/**
 * Shared crest + section-host helpers (People Phase 1 pattern, reused by Orgs).
 */

import { fetchOrgCrestUrl } from '@/api/organisations-directory';

const crestUrlCache = new Map<string, string | null>();

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export async function resolveCrestUrl(
  orgRef: string | null | undefined,
  logoKey: string | null | undefined
): Promise<string | null> {
  if (!orgRef || !logoKey) return null;
  if (crestUrlCache.has(orgRef)) return crestUrlCache.get(orgRef) ?? null;
  try {
    const res = await fetchOrgCrestUrl(orgRef);
    crestUrlCache.set(orgRef, res.url);
    return res.url;
  } catch {
    crestUrlCache.set(orgRef, null);
    return null;
  }
}

export function crestNode(
  monogram: string | null,
  size: 'sm' | 'md' | 'lg' | 'xl' = 'sm',
  opts: { orgRef?: string | null; logoKey?: string | null; onUpload?: (file: File) => void } = {}
): HTMLElement {
  const crest = el(
    'span',
    `people-crest people-crest--${size}${monogram ? '' : ' people-crest--empty'}`
  );
  crest.setAttribute('aria-hidden', 'true');
  const label = el('span', 'people-crest__mono', monogram ?? '');
  crest.append(label);
  if (opts.orgRef && opts.logoKey) {
    void resolveCrestUrl(opts.orgRef, opts.logoKey).then((url) => {
      if (!url) return;
      label.hidden = true;
      const img = document.createElement('img');
      img.className = 'people-crest__img';
      img.alt = '';
      img.src = url;
      crest.prepend(img);
    });
  }
  if (opts.onUpload) {
    crest.classList.add('people-crest--upload');
    crest.title = 'Upload crest (PNG or SVG, ≤512KB)';
    crest.tabIndex = 0;
    crest.setAttribute('role', 'button');
    crest.setAttribute('aria-label', 'Upload organisation crest');
    const pick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/svg+xml,.png,.svg';
      input.hidden = true;
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) opts.onUpload?.(file);
        input.remove();
      });
      document.body.append(input);
      input.click();
    };
    crest.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pick();
    });
    crest.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
  }
  return crest;
}

export function sectionHost(
  className: string,
  title: string
): { root: HTMLElement; heading: HTMLElement; body: HTMLElement } {
  const root = el('section', `people-pane__box ${className}`);
  const heading = el('div', 'people-pane__h2', title);
  const body = el('div', 'people-pane__section-body');
  body.setAttribute('data-section-body', '');
  root.append(heading, body);
  return { root, heading, body };
}

export function setSectionState(
  body: HTMLElement,
  state: 'loading' | 'empty' | 'error' | 'ready',
  message?: string
): void {
  body.replaceChildren();
  if (state === 'ready') return;
  const p = el(
    'p',
    `people-pane__${state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'empty'}`
  );
  p.textContent =
    message ??
    (state === 'loading'
      ? 'Loading…'
      : state === 'error'
        ? 'Could not load this section.'
        : 'Nothing here yet.');
  body.append(p);
}
