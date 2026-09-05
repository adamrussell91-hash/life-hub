/** Shared command palette. Tokens only. Does not replace Teaching's search-palette markup. */

import { buildHubEntityIndex, filterCommandGroups } from './hub-entity-search.js';

function ownerDoc(root) {
  return root?.ownerDocument ?? root ?? globalThis.document;
}

function addClass(el, name) {
  if (el.classList?.add) el.classList.add(name);
  else el.className = `${el.className || ''} ${name}`.trim();
}

/** @type {{ close: () => void } | null} */
let openPalette = null;

/**
 * @param {{
 *   root?: Document,
 *   placeholder?: string,
 *   groups?: Array<{ heading: string, items: Array<{ id: string, label: string, hint?: string, onSelect?: () => void }> }>,
 *   onClose?: () => void
 * }} [options]
 */
export function openHubCommandSearch(options = {}) {
  const doc = ownerDoc(options.root);
  if (openPalette) openPalette.close();

  const backdrop = doc.createElement('div');
  addClass(backdrop, 'hub-command');
  addClass(backdrop, 'search-palette-backdrop');
  backdrop.setAttribute('role', 'presentation');

  const panel = doc.createElement('div');
  addClass(panel, 'hub-command__panel');
  addClass(panel, 'search-palette');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', options.placeholder ?? 'Search');

  const input = doc.createElement('input');
  addClass(input, 'hub-command__input');
  addClass(input, 'search-palette__input');
  input.type = 'search';
  input.placeholder = options.placeholder ?? 'Search…';
  input.setAttribute('aria-label', options.placeholder ?? 'Search');

  const list = doc.createElement('div');
  addClass(list, 'hub-command__list');
  addClass(list, 'search-palette__list');

  const groups = options.groups ?? [];
  const entityIndex = buildHubEntityIndex(
    groups.flatMap((group, groupIndex) =>
      (group.items ?? []).map((item, itemIndex) => ({
        id: String(item.id ?? `${groupIndex}:${itemIndex}`),
        label: item.label,
        hint: item.hint,
        groupId: String(groupIndex)
      }))
    )
  );
  let active = 0;

  const visibleItems = () => [...(list.querySelectorAll?.('.hub-command__row') ?? [])];

  const paintActive = () => {
    const rows = visibleItems();
    rows.forEach((row, index) => row.classList?.toggle?.('is-active', index === active));
  };

  const render = (query = '') => {
    list.replaceChildren?.();
    if (!list.replaceChildren) list.textContent = '';
    let index = 0;
    const visibleGroups = filterCommandGroups(groups, query, { index: entityIndex });
    for (const group of visibleGroups) {
      const items = group.items ?? [];
      if (!items.length) continue;
      const heading = doc.createElement('p');
      addClass(heading, 'hub-command__heading');
      addClass(heading, 'search-palette__heading');
      heading.textContent = group.heading;
      list.append(heading);
      for (const item of items) {
        const row = doc.createElement('button');
        row.type = 'button';
        addClass(row, 'hub-command__row');
        addClass(row, 'search-palette__row');
        row.dataset.index = String(index++);
        const title = doc.createElement('span');
        title.textContent = item.label;
        row.append(title);
        if (item.hint) {
          const hint = doc.createElement('span');
          addClass(hint, 'hub-command__hint');
          hint.textContent = item.hint;
          row.append(hint);
        }
        row.addEventListener('click', () => {
          item.onSelect?.();
          close();
        });
        list.append(row);
      }
    }
    active = 0;
    paintActive();
  };

  const close = () => {
    backdrop.remove?.();
    if (backdrop.parentNode?.removeChild) backdrop.parentNode.removeChild(backdrop);
    doc.removeEventListener?.('keydown', onKey);
    if (openPalette?.el === backdrop) openPalette = null;
    options.onClose?.();
  };

  const onKey = (event) => {
    const rows = visibleItems();
    if (event.key === 'Escape') {
      event.preventDefault?.();
      close();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault?.();
      active = Math.min(rows.length - 1, active + 1);
      paintActive();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault?.();
      active = Math.max(0, active - 1);
      paintActive();
    }
    if (event.key === 'Enter') {
      event.preventDefault?.();
      rows[active]?.click?.();
    }
  };

  input.addEventListener('input', () => render(input.value));
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  doc.addEventListener?.('keydown', onKey);

  panel.append(input, list);
  backdrop.append(panel);
  (doc.body ?? options.root)?.append?.(backdrop);
  render('');
  input.focus?.();

  openPalette = { el: backdrop, close };
  return { el: backdrop, panel, input, list, close };
}

export function enhanceSearchPalette(panel) {
  if (!panel) return panel;
  addClass(panel, 'hub-command__panel');
  const rows = panel.querySelectorAll?.('.search-palette__row') ?? [];
  let delay = 0;
  for (const row of rows) {
    addClass(row, 'hub-list-item');
    row.style?.setProperty?.('--hub-list-delay', `${delay}ms`);
    delay += 45;
  }
  return panel;
}

export function resetHubCommandSearchForTests() {
  if (openPalette) openPalette.close();
  openPalette = null;
}
