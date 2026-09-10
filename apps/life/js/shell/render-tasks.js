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

function fillText(node, text, hiddenWhenEmpty = true) {
  if (!node) return;
  node.textContent = text ?? '';
  if (hiddenWhenEmpty) node.hidden = !node.textContent;
}

export function renderClareResult(root, { status = 'ready', dump = null, briefing = null } = {}) {
  const voice = root.querySelector?.('#clare-voice');
  const list = root.querySelector?.('#clare-proposals');
  const brief = root.querySelector?.('#clare-briefing');
  if (status === 'loading') {
    fillText(voice, 'Clare is sorting that…');
    fillList(root, list, []);
    fillText(brief, '');
    return;
  }
  if (status === 'error') {
    fillText(voice, 'Clare could not take that dump.');
    fillList(root, list, []);
    fillText(brief, '');
    return;
  }
  if (briefing) {
    const lines = [
      briefing.lead,
      ...(briefing.sections ?? []).flatMap(section => [section.heading, ...(section.lines ?? [])]),
      briefing.closer
    ].filter(Boolean);
    fillText(voice, '');
    fillList(root, list, []);
    fillText(brief, lines.join('\n'));
    return;
  }
  fillText(voice, dump?.voice ?? '');
  fillList(root, list, dump?.proposals ?? []);
  const extras = [...(dump?.questions ?? []), ...(dump?.notes ?? [])];
  if (dump?.toolkit?.title) extras.unshift(dump.toolkit.title);
  fillText(brief, extras.join('\n'));
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
