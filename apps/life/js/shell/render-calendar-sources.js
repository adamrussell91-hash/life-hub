const EMPTY_COPY = 'No shared sources yet.';

export function renderCalendarSources(root, sources = []) {
  const empty = root.querySelector('[data-calendar="sources-empty"]');
  const list = root.querySelector('#calendar-source-list');
  if (!empty || !list) return;

  const items = Array.isArray(sources) ? sources : [];
  if (items.length === 0) {
    empty.textContent = EMPTY_COPY;
    empty.hidden = false;
    empty.removeAttribute?.('hidden');
    list.replaceChildren();
    list.hidden = true;
    list.setAttribute?.('hidden', '');
    return;
  }

  empty.hidden = true;
  empty.setAttribute?.('hidden', '');
  list.hidden = false;
  list.removeAttribute?.('hidden');
  list.replaceChildren();
  for (const source of items) {
    const item = root.createElement('li');
    item.textContent = source.label ?? source.id ?? '';
    list.append(item);
  }
}
