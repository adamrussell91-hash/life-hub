const STATUS_COPY = {
  loading: 'Loading pages…',
  unbound: 'Knowledge data repository is not bound on this API yet. The Pages app still works.',
  error: 'Could not load Knowledge pages.',
  'link-only': '',
  ready: ''
};

export function renderKnowledgeDashboard(root, { status = 'ready', pages = [] } = {}) {
  const statusNode = root.querySelector?.('[data-knowledge="status"]');
  const list = root.querySelector?.('#knowledge-page-list');
  if (statusNode) {
    statusNode.textContent = STATUS_COPY[status] ?? '';
    statusNode.hidden = !statusNode.textContent;
  }
  if (!list) return;

  const rows = status === 'ready' && Array.isArray(pages) ? pages : [];
  list.replaceChildren();
  for (const item of rows) {
    const title = item.title || item.id;
    if (!title) continue;
    const row = root.createElement('li');
    row.textContent = title;
    list.append(row);
  }
  list.hidden = rows.length === 0;
}
