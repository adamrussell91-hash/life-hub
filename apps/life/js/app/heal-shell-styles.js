/**
 * A stale cached index.html (an old service worker, or a cache that missed a deploy)
 * can lack stylesheets that the fresh JS needs. The Day dial then paints unstyled:
 * a black disc, unanchored labels, empty arrow buttons. Compare the page's stylesheets
 * with the live index.html and add whatever is missing. Best effort and quiet.
 */
const LINK = /<link\b[^>]*>/gi;

function stylesheetHrefs(html) {
  const out = [];
  for (const tag of String(html ?? '').match(LINK) ?? []) {
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    if (href && !/^[a-z]+:/i.test(href) && !href.startsWith('//')) out.push(href);
  }
  return out;
}

export async function healShellStyles(doc, { fetchImpl = globalThis.fetch } = {}) {
  if (!doc?.head || typeof fetchImpl !== 'function') return [];
  const base = doc.baseURI;
  const pathOf = href => new URL(href, base).pathname;
  const present = new Set([...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => pathOf(link.getAttribute('href') ?? '')));
  let html;
  try {
    const response = await fetchImpl(new URL('index.html', base).href, { cache: 'no-store' });
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  }
  const added = [];
  for (const href of stylesheetHrefs(html)) {
    if (present.has(pathOf(href))) continue;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.append(link);
    present.add(pathOf(href));
    added.push(href);
  }
  return added;
}
