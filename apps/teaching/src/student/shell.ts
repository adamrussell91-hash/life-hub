import { createSkipLink } from '@/app/failure';
import { navigate } from '@/app/router';

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
  brand.textContent = 'Teaching Hub';
  header.append(brand);

  surface.append(createSkipLink('student-main'), header, content);
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
  link.href = href;
  if (text) link.textContent = text;
  link.addEventListener('click', (event) => {
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
  brand.textContent = options.brand ?? 'Teaching Hub';
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
