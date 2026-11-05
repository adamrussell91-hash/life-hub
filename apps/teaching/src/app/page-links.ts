import { appBasePath, withAppBase } from './base-path';
import { match } from './router';

/** True for a root-relative link to one of this app's own pages. */
function isAppPage(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return match(href)?.name !== 'not-found';
}

/**
 * The address a link needs to work outside the app's own click handling, such
 * as Open in New Tab. On the umbrella site `/classes` has to be `/teaching/classes`.
 * Other hubs, the API and anything external come back unchanged.
 */
export function pageLinkHref(href: string): string {
  const base = appBasePath();
  if (!base || !isAppPage(href)) return href;
  const [path, rest] = splitPath(href);
  if (path === base || path.startsWith(`${base}/`)) return href;
  return `${withAppBase(path)}${rest}`;
}

function splitPath(href: string): [string, string] {
  const end = href.search(/[?#]/);
  return end < 0 ? [href, ''] : [href.slice(0, end), href.slice(end)];
}

function fixLink(link: Element): void {
  // Links inside an editor are saved with the lesson, so they keep what was typed.
  if (link.closest('[contenteditable]:not([contenteditable="false"])')) return;
  const href = link.getAttribute('href');
  if (!href) return;
  const next = pageLinkHref(href);
  if (next !== href) link.setAttribute('href', next);
}

function fixLinksIn(node: Element): void {
  if (node.localName === 'a') fixLink(node);
  node.querySelectorAll('a[href^="/"]').forEach(fixLink);
}

/**
 * Keeps every link on the page openable in its own tab, wherever it was built.
 * Pages set `link.href = '/classes'` and navigate in a click handler, so the
 * address only matters once the browser opens the link itself.
 */
export function startPageLinks(root: Document = document): () => void {
  if (root.documentElement) fixLinksIn(root.documentElement);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if ((record.target as Element).localName === 'a') fixLink(record.target as Element);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) fixLinksIn(node as Element);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  // Cmd or Ctrl click is the browser's new-tab gesture. Stop here, before the
  // link's own handler turns it into a move inside this tab.
  const onClick = (event: MouseEvent): void => {
    if (!event.metaKey && !event.ctrlKey) return;
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (link && isAppPage(link.getAttribute('href') ?? '')) event.stopImmediatePropagation();
  };
  root.addEventListener('click', onClick, true);

  return () => {
    observer.disconnect();
    root.removeEventListener('click', onClick, true);
  };
}
