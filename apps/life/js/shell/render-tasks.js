const STATUS_COPY = {
  loading: 'Loading tasks…',
  unbound: 'Tasks content store is not bound on this API yet. The Pages app still works.',
  error: 'Could not load Tasks.',
  'link-only': '',
  ready: ''
};

function fillList(root, list, rows) {
  if (!list) return;
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

export function renderTasksDashboard(root, { status = 'ready', tasks = [], projects = [] } = {}) {
  const statusNode = root.querySelector?.('[data-tasks="status"]');
  const taskList = root.querySelector?.('#tasks-item-list');
  const projectList = root.querySelector?.('#tasks-project-list');
  if (statusNode) {
    statusNode.textContent = STATUS_COPY[status] ?? '';
    statusNode.hidden = !statusNode.textContent;
  }
  const ready = status === 'ready';
  fillList(root, taskList, ready && Array.isArray(tasks) ? tasks : []);
  fillList(root, projectList, ready && Array.isArray(projects) ? projects : []);
}
