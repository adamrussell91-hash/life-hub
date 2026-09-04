import { listUmbrellaHubs } from '../../hub-switcher.js';

const MORE_ID = 'more';

function svgFromPaths(doc, paths, className) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  for (const d of paths) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function glyph(doc, item, className) {
  const wrap = doc.createElement('span');
  wrap.className = className;
  wrap.setAttribute('aria-hidden', 'true');
  if (item.iconHtml) {
    wrap.innerHTML = item.iconHtml;
    return wrap;
  }
  wrap.append(svgFromPaths(doc, item.paths ?? [], className === 'hub-mobile-nav__glyph' ? '' : 'hub-more-sheet__icon'));
  return wrap;
}

function wireSelect(el, item, closeSheet) {
  el.addEventListener('click', event => {
    if (item.href && !item.onSelect) return;
    event.preventDefault();
    item.onSelect?.(item);
    closeSheet?.();
  });
}

/**
 * Mount the locked mobile chrome: 4-slot bottom bar + More sheet.
 * Desktop rail stays; this is phones only (CSS hides/shows at 720px).
 *
 * @param {ParentNode & { querySelector: Function, append: Function }} host
 * @param {{
 *   currentHub: 'life' | 'teaching' | 'knowledge' | 'tasks',
 *   primary: Array<{ id: string, label: string, paths?: string[], iconHtml?: string, href?: string, onSelect?: Function, current?: boolean }>,
 *   more?: Array<{ id: string, label: string, paths?: string[], iconHtml?: string, href?: string, onSelect?: Function }>
 * }} options
 */
export function mountMobileChrome(host, options) {
  if (!host || !options?.currentHub) return null;
  const doc = host.ownerDocument ?? document;
  host.querySelectorAll?.('[data-hub-mobile-chrome]')?.forEach?.(node => node.remove());

  const primary = (options.primary ?? []).slice(0, 3);
  while (primary.length < 3) {
    primary.push({ id: `slot-${primary.length}`, label: '·', paths: [], href: '#' });
  }

  const sheet = doc.createElement('dialog');
  sheet.className = 'hub-more-sheet';
  sheet.dataset.hubMobileChrome = 'sheet';
  sheet.setAttribute('aria-label', 'More');

  const panel = doc.createElement('div');
  panel.className = 'hub-more-sheet__panel';

  const head = doc.createElement('header');
  head.className = 'hub-more-sheet__head';
  const title = doc.createElement('h2');
  title.textContent = 'More';
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hub-more-sheet__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = 'Close';
  head.append(title, closeBtn);

  const nav = doc.createElement('nav');
  nav.className = 'hub-more-sheet__nav';
  nav.setAttribute('aria-label', 'Secondary destinations');

  const closeSheet = () => {
    if (typeof sheet.close === 'function') sheet.close();
    else sheet.removeAttribute('open');
  };
  closeBtn.addEventListener('click', closeSheet);
  sheet.addEventListener('click', event => {
    if (event.target === sheet) closeSheet();
  });

  const moreItems = options.more ?? [];
  if (moreItems.length) {
    const section = doc.createElement('p');
    section.className = 'hub-more-sheet__section';
    section.textContent = 'In this hub';
    nav.append(section);
    for (const item of moreItems) {
      const el = item.href ? doc.createElement('a') : doc.createElement('button');
      if (item.href) el.href = item.href;
      else el.type = 'button';
      el.append(glyph(doc, item, 'hub-more-sheet__glyph'), doc.createTextNode(item.label));
      wireSelect(el, item, closeSheet);
      nav.append(el);
    }
  }

  const hubsSection = doc.createElement('p');
  hubsSection.className = 'hub-more-sheet__section';
  hubsSection.textContent = 'Hubs';
  nav.append(hubsSection);
  for (const hub of listUmbrellaHubs()) {
    if (hub.id === options.currentHub) continue;
    const link = doc.createElement('a');
    link.href = hub.origin;
    link.append(
      glyph(doc, { paths: hub.paths }, 'hub-more-sheet__glyph'),
      doc.createTextNode(hub.title)
    );
    nav.append(link);
  }

  panel.append(head, nav);
  sheet.append(panel);

  const bar = doc.createElement('nav');
  bar.className = 'hub-mobile-nav';
  bar.dataset.hubMobileChrome = 'nav';
  bar.setAttribute('aria-label', 'Mobile primary');

  for (const item of primary) {
    const el = item.href ? doc.createElement('a') : doc.createElement('button');
    if (item.href) el.href = item.href;
    else el.type = 'button';
    if (item.current) {
      el.setAttribute('aria-current', 'page');
      el.classList.add('is-current');
    }
    el.append(glyph(doc, item, 'hub-mobile-nav__glyph'), doc.createTextNode(item.label));
    wireSelect(el, item, null);
    bar.append(el);
  }

  const moreBtn = doc.createElement('button');
  moreBtn.type = 'button';
  moreBtn.dataset.hubMobileMore = 'true';
  moreBtn.append(
    glyph(
      doc,
      {
        paths: [],
        iconHtml:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.5" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="17.5" cy="12" r="1.15" fill="currentColor" stroke="none"/></svg>'
      },
      'hub-mobile-nav__glyph'
    ),
    doc.createTextNode('More')
  );
  moreBtn.addEventListener('click', () => {
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
  });
  bar.append(moreBtn);

  host.append(bar, sheet);
  return { bar, sheet, closeSheet };
}
