import { createMapIndexSearch, createMapIndexShell } from '@/views/map-chrome';

export type PickerGroup = { label: string; options: Array<{ value: string; label: string }> };

export type MapIndexItem = {
  id: string;
  kind: 'station' | 'event';
  label: string;
  group: string;
  y: number;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Compact searchable picker — replaces long native selects in map edit forms. */
export function createFilteredPicker(
  groups: PickerGroup[],
  selected: string,
  opts: { ariaLabel: string; blankLabel?: string; placeholder?: string }
): { root: HTMLElement; getValue: () => string; setSelected: (value: string) => void } {
  let current = selected;
  const root = el('div', 'map-picker');

  const search = el('label', 'hub-search map-picker__search');
  const searchLabel = el('span', 'visually-hidden', opts.placeholder ?? 'Search');
  const input = el('input', 'hub-search__input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = opts.placeholder ?? 'Search…';
  input.setAttribute('aria-label', opts.ariaLabel);
  search.append(searchLabel, input);

  const list = el('div', 'map-picker__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', opts.ariaLabel);

  const paint = (query: string) => {
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    let any = false;

    if (opts.blankLabel !== undefined) {
      const blankBtn = el(
        'button',
        `map-picker__opt${current === '' ? ' is-active' : ''}`,
        opts.blankLabel
      );
      blankBtn.type = 'button';
      blankBtn.setAttribute('role', 'option');
      blankBtn.setAttribute('aria-selected', current === '' ? 'true' : 'false');
      blankBtn.addEventListener('click', () => {
        current = '';
        paint(input.value);
      });
      if (!q || opts.blankLabel.toLowerCase().includes(q)) {
        list.append(blankBtn);
        any = true;
      }
    }

    for (const group of groups) {
      const matches = group.options.filter(
        (opt) =>
          !q ||
          opt.label.toLowerCase().includes(q) ||
          opt.value.toLowerCase().includes(q) ||
          group.label.toLowerCase().includes(q)
      );
      if (!matches.length) continue;
      any = true;
      const head = el('p', 'map-picker__group', group.label);
      list.append(head);
      for (const opt of matches) {
        const btn = el(
          'button',
          `map-picker__opt${current === opt.value ? ' is-active' : ''}`,
          opt.label
        );
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', current === opt.value ? 'true' : 'false');
        btn.addEventListener('click', () => {
          current = opt.value;
          paint(input.value);
        });
        list.append(btn);
      }
    }

    if (!any) list.append(el('p', 'map-picker__empty', 'No matches.'));
  };

  input.addEventListener('input', () => paint(input.value));
  paint('');

  root.append(search, list);
  return {
    root,
    getValue: () => current,
    setSelected: (value: string) => {
      current = value;
      paint(input.value);
    }
  };
}

/** Overlay index for jumping to stations and competitions without scrolling the canvas. */
export function createMapIndex(
  items: MapIndexItem[],
  selectedId: string | null,
  onPick: (item: MapIndexItem) => void,
  open = false
): HTMLElement {
  const shell = createMapIndexShell({ open });
  const search = createMapIndexSearch({
    placeholder: 'Programs & competitions…',
    ariaLabel: 'Search map items',
    onInput: (value) => paint(value)
  });

  const list = el('div', 'map-index__list');

  const paint = (query: string) => {
    list.replaceChildren();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.group.toLowerCase().includes(q) ||
            item.kind.toLowerCase().includes(q)
        )
      : items;

    if (!filtered.length) {
      list.append(el('p', 'map-index__empty', q ? 'No matches.' : 'Nothing on this map yet.'));
      return;
    }

    let group = '';
    for (const item of filtered) {
      if (item.group !== group) {
        group = item.group;
        list.append(el('p', 'map-index__group', group));
      }
      const btn = el(
        'button',
        `map-index__item${selectedId === item.id ? ' is-active' : ''}`,
        item.label
      );
      btn.type = 'button';
      btn.addEventListener('click', () => onPick(item));
      list.append(btn);
    }
  };

  paint('');
  shell.inner.append(search.root, list);
  return shell.root;
}
