import { createSkipLink } from '@/app/failure';
import { CLASS_SITE_HOST, CLASS_SITE_ORIGIN, isClassSiteHost } from '@/app/class-site';
import { navigate } from '@/app/router';

/** Neutral name students see. Never a hub name: it would tell them the hubs exist. */
export const STUDENT_BRAND = 'Classroom';

const OWN_DOMAIN = 'adam-russell.com';

/**
 * Whether a student may follow this link. External sites and student pages
 * pass. Any other page on the owner's own domain (the umbrella, a hub, a
 * relative teacher path that resolves on the class host) does not, so a link
 * typed into lesson content can never lead a student to a sign-in screen.
 */
export function isStudentSafeHref(raw: string, base: string = typeof location !== 'undefined' ? location.href : `https://${CLASS_SITE_HOST}/`): boolean {
  const href = raw.trim();
  if (!href || href.startsWith('#')) return true;
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return false;
  }
  // Blob, data and about frames come from blocks and players, not from a host.
  if (url.protocol === 'javascript:' || url.protocol === 'vbscript:') return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const baseHost = new URL(base).hostname.toLowerCase();
  const own = host === OWN_DOMAIN || host.endsWith(`.${OWN_DOMAIN}`) || host === baseHost;
  if (!own) return true;
  if (host === CLASS_SITE_HOST || host === baseHost) {
    return /^\/s\/[^/]/.test(url.pathname) || url.pathname === '/line';
  }
  // Uploaded files and published media are served by the API host.
  if (host === `api.${OWN_DOMAIN}`) {
    return /^\/api\/(?:media|published)\//.test(url.pathname);
  }
  return false;
}

function disarmLink(link: HTMLAnchorElement): void {
  link.removeAttribute('href');
  link.removeAttribute('target');
  link.removeAttribute('download');
  link.classList.add('student-link--off');
}

function guardElement(el: Element): void {
  if (el instanceof HTMLAnchorElement) {
    const href = el.getAttribute('href');
    if (href !== null && !isStudentSafeHref(href)) disarmLink(el);
  } else if (el instanceof HTMLIFrameElement) {
    const src = el.getAttribute('src');
    if (src && !isStudentSafeHref(src)) el.remove();
  } else if (el instanceof HTMLFormElement) {
    const action = el.getAttribute('action');
    if (action && !isStudentSafeHref(action)) el.removeAttribute('action');
  }
}

function guardTree(root: Element): void {
  guardElement(root);
  root.querySelectorAll('a[href], iframe[src], form[action]').forEach(guardElement);
}

/**
 * Keeps every link on a student page pointing at a student page or an outside
 * site, including links rendered later by blocks and players.
 */
export function guardStudentLinks(root: HTMLElement): { dispose: () => void } {
  guardTree(root);
  if (typeof MutationObserver === 'undefined') return { dispose: () => undefined };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof Element) guardElement(record.target);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) guardTree(node);
      });
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'src', 'action'] });
  return { dispose: () => observer.disconnect() };
}

export function createStudentShell(contentExtraClass = ''): {
  surface: HTMLElement;
  header: HTMLElement;
  content: HTMLElement;
} {
  const surface = document.createElement('div');
  surface.className = 'student-surface';

  const content = document.createElement('div');
  content.className = ['student-surface__content', contentExtraClass].filter(Boolean).join(' ');
  content.id = 'student-main';

  const header = document.createElement('header');
  header.className = 'student-chrome';

  const brand = document.createElement('span');
  brand.className = 'student-surface__brand student-chrome__brand';
  brand.textContent = STUDENT_BRAND;
  header.append(brand);

  surface.append(createSkipLink('student-main'), header, content);
  if (isClassSiteHost()) {
    document.title = STUDENT_BRAND;
    guardStudentLinks(surface);
  }
  return { surface, header, content };
}

export function renderStudentStatus(content: HTMLElement, text: string): void {
  content.replaceChildren();
  const status = document.createElement('p');
  status.className = 'student-status';
  status.textContent = text;
  content.append(status);
}

export function studentAnchor(
  href: string,
  className: string,
  text?: string
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = className;
  if (text) link.textContent = text;
  return wireStudentAnchor(link, href);
}

/** Public student links always belong to the class site, including in previews. */
export function wireStudentAnchor(link: HTMLAnchorElement, href: string): HTMLAnchorElement {
  link.href = `${CLASS_SITE_ORIGIN}${href.startsWith('/') ? href : `/${href}`}`;
  link.addEventListener('click', (event) => {
    // Crossing from the umbrella must use normal navigation to the class host.
    // On the class host, plain clicks can retain the existing SPA routing.
    if (
      typeof location === 'undefined' || location.origin !== CLASS_SITE_ORIGIN ||
      event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      (link.target && link.target !== '_self')
    ) return;
    event.preventDefault();
    navigate(href);
  });
  return link;
}

export interface StudentChromeLink {
  href: string;
  label: string;
  className?: string;
}

export function renderStudentChrome(
  header: HTMLElement,
  options: { brand?: string; links?: StudentChromeLink[] }
): void {
  header.replaceChildren();
  header.className = 'student-chrome student-surface__header';

  const brand = document.createElement('span');
  brand.className = 'student-surface__brand student-chrome__brand';
  brand.textContent = options.brand ?? STUDENT_BRAND;
  header.append(brand);

  const links = options.links ?? [];
  if (links.length === 0) return;

  const nav = document.createElement('nav');
  nav.className = 'student-chrome__links student-surface__header-links';
  nav.setAttribute('aria-label', 'Student');
  for (const item of links) {
    const className = ['student-surface__back', 'student-chrome__link', item.className]
      .filter(Boolean)
      .join(' ');
    nav.append(studentAnchor(item.href, className, item.label));
  }
  header.append(nav);
}
