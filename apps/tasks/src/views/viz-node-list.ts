export type VizNode = {
  id: string;
  kind: string;
  label: string;
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

/** Searchable, collapsible alt list for graph-style canvases. */
export function createVizNodeList(
  ariaLabel: string,
  nodes: VizNode[],
  onSelect: (node: VizNode) => void,
  opts?: { selectedId?: string | null; collapsed?: boolean }
): HTMLElement {
  const wrap = el('div', 'viz-alt-panel');
  const head = el('button', 'viz-alt-panel__toggle');
  head.type = 'button';
  head.setAttribute('aria-expanded', opts?.collapsed ? 'false' : 'true');

  const title = el('span', 'viz-alt-panel__title', `Browse (${nodes.length})`);
  const chev = el('span', 'viz-alt-panel__chev', opts?.collapsed ? '▸' : '▾');
  head.append(title, chev);

  const body = el('div', 'viz-alt-panel__body');
  if (opts?.collapsed) body.hidden = true;

  const search = el('label', 'hub-search viz-alt-panel__search');
  const searchLabel = el('span', 'visually-hidden', 'Filter nodes');
  const input = el('input', 'hub-search__input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = 'Filter…';
  input.setAttribute('aria-label', 'Filter nodes');
  search.append(searchLabel, input);

  const list = el('ul', 'viz-alt');
  list.setAttribute('aria-label', ariaLabel);

  const paintList = (query: string) => {
    const q = query.trim().toLowerCase();
    list.replaceChildren();
    const filtered = q
      ? nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(q) ||
            node.kind.toLowerCase().includes(q) ||
            node.id.toLowerCase().includes(q)
        )
      : nodes;
    if (!filtered.length) {
      list.append(el('li', 'viz-alt__empty', q ? 'No matches.' : 'Nothing here.'));
      return;
    }
    for (const node of filtered) {
      const item = el('li');
      const btn = el(
        'button',
        `btn btn--ghost${opts?.selectedId === node.id ? ' is-active' : ''}`,
        `${node.kind}: ${node.label}`
      );
      btn.type = 'button';
      btn.addEventListener('click', () => onSelect(node));
      item.append(btn);
      list.append(item);
    }
  };

  input.addEventListener('input', () => paintList(input.value));
  paintList('');

  body.append(search, list);
  wrap.append(head, body);

  head.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    chev.textContent = open ? '▾' : '▸';
  });

  return wrap;
}
