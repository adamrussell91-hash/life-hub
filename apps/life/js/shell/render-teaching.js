const STATUS_COPY = {
  loading: 'Loading classes…',
  unbound: 'Teaching content store is not bound on this API yet. The Pages app still works.',
  error: 'Could not load Teaching classes.',
  'link-only': '',
  ready: ''
};

export function renderTeachingDashboard(root, { status = 'ready', classes = [] } = {}) {
  const statusNode = root.querySelector?.('[data-teaching="status"]');
  const list = root.querySelector?.('#teaching-class-list');
  if (statusNode) {
    statusNode.textContent = STATUS_COPY[status] ?? '';
    statusNode.hidden = !statusNode.textContent;
  }
  if (!list) return;

  const rows = status === 'ready' && Array.isArray(classes) ? classes : [];
  list.replaceChildren();
  for (const item of rows) {
    const title = item.display_name || item.title || item.code || item.id;
    if (!title) continue;
    const row = root.createElement('li');
    row.textContent = item.code && item.title && item.code !== item.title
      ? `${item.code} · ${item.title}`
      : title;
    list.append(row);
  }
  list.hidden = rows.length === 0;
}
