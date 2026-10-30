/**
 * Shared crest + section-host helpers (People Phase 1 pattern, reused by Orgs).
 */

import { fetchCrestImage, fetchCrestRefs, fetchOrgCrestUrl } from '@/api/organisations-directory';

const crestUrlCache = new Map<string, string | null>();

/*
 * Researched crests (the fallback when no crest was uploaded) live in the private data repo
 * and arrive through /api/organisations/crest-image. The list of organisations that have one
 * is read once; each image is fetched once and kept as an object URL for the session.
 */
let researchedRefs: Promise<Set<string>> | null = null;
const researchedUrls = new Map<string, Promise<string | null>>();

function researchedCrestRefs(): Promise<Set<string>> {
  researchedRefs ??= Promise.resolve()
    .then(() => fetchCrestRefs())
    .then((res) => new Set(Array.isArray(res?.refs) ? res.refs : []))
    .catch(() => {
      researchedRefs = null; // try again on the next crest
      return new Set<string>();
    });
  return researchedRefs;
}

async function researchedCrestUrl(orgRef: string): Promise<string | null> {
  if (!(await researchedCrestRefs()).has(orgRef)) return null;
  let pending = researchedUrls.get(orgRef);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => fetchCrestImage(orgRef))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
      .then((url) => {
        if (!url) researchedUrls.delete(orgRef);
        return url;
      });
    researchedUrls.set(orgRef, pending);
  }
  return pending;
}

/** Tests only: forget the researched-crest list and images. */
export function resetResearchedCrests(): void {
  researchedRefs = null;
  researchedUrls.clear();
}

export function invalidateCrestUrl(orgRef: string): void {
  for (const key of crestUrlCache.keys()) {
    if (key.startsWith(`${orgRef}|`)) crestUrlCache.delete(key);
  }
}

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
  if (!orgRef) return null;
  const fallback = () => researchedCrestUrl(orgRef);
  if (!logoKey) return fallback();
  const cacheKey = `${orgRef}|${logoKey}`;
  if (crestUrlCache.has(cacheKey)) return crestUrlCache.get(cacheKey) ?? fallback();
  try {
    const res = await fetchOrgCrestUrl(orgRef);
    crestUrlCache.set(cacheKey, res.url);
    return res.url ?? fallback();
  } catch {
    return fallback();
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
  if (opts.orgRef) {
    void resolveCrestUrl(opts.orgRef, opts.logoKey).then((url) => {
      if (!url) return;
      label.hidden = true;
      const img = document.createElement('img');
      img.className = 'people-crest__img';
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        label.hidden = false;
      }, { once: true });
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
