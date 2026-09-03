const STATUS_COPY = {
  loading: 'Loading tasks…',
  unbound: 'Tasks content store is not bound on this API yet. The Pages app still works.',
  error: 'Could not load Tasks.',
  'link-only': '',
  ready: ''
};

export function renderTasksDashboard(root, { status = 'ready', tasks = [] } = {}) {
  const statusNode = root.querySelector?.('[data-tasks="status"]');
  const list = root.querySelector?.('#tasks-item-list');
  if (statusNode) {
    statusNode.textContent = STATUS_COPY[status] ?? '';
    statusNode.hidden = !statusNode.textContent;
  }
  if (!list) return;

  const rows = status === 'ready' && Array.isArray(tasks) ? tasks : [];
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
