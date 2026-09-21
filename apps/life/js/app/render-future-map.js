import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';

/** Keep in sync with SOMEDAY_KINDS in apps/tasks/src/domain/someday.ts. Career is intentionally absent. */
const FUTURE_MAP_KINDS = new Set(['bucket_list', 'dreams_jar']);

const KIND_LABEL = {
  bucket_list: 'Bucket list',
  dreams_jar: 'Dreams jar'
};

export function futureMapItems(tasks, kind = 'all') {
  return (Array.isArray(tasks) ? tasks : [])
    .filter(task => {
      if (!task || task.bucket !== 'someday') return false;
      if (!FUTURE_MAP_KINDS.has(task.someday_kind)) return false;
      if (kind !== 'all' && task.someday_kind !== kind) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const originA = a.origin_date || '9999-99-99';
      const originB = b.origin_date || '9999-99-99';
      if (originA !== originB) return originA < originB ? -1 : 1;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function setText(node, text) {
  if (node) node.textContent = text ?? '';
}

export function renderFutureMap(root, {
  status = 'ready',
  tasks = [],
  kind = 'all',
  error = '',
  onKind
} = {}) {
  const list = root.querySelector?.('[data-future-map="list"]');
  if (!list) return;
  list.replaceChildren();

  for (const button of root.querySelectorAll?.('[data-future-map-filter]') ?? []) {
    const active = button.dataset.futureMapFilter === kind;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (!button.dataset.futureMapBound) {
      button.dataset.futureMapBound = 'true';
      button.addEventListener('click', () => onKind?.(button.dataset.futureMapFilter));
    }
  }

  if (status === 'loading') {
    setText(list, 'Loading…');
    return;
  }
  if (status === 'error') {
    setText(list, error || 'Could not load the future map.');
    return;
  }

  const items = futureMapItems(tasks, kind);
  if (!items.length) {
    setText(list, kind === 'all'
      ? 'Nothing from the bucket list or dreams jar yet. Add them in Tasks → Someday.'
      : 'Nothing in that category yet.');
    return;
  }

  const ul = root.createElement('ul');
  ul.className = 'shortcuts-list';
  for (const item of items) {
    const row = root.createElement('li');
    row.className = 'shortcuts-item';
    const copy = root.createElement('div');
    const heading = root.createElement('p');
    heading.className = 'shortcuts-item__title';
    heading.textContent = item.title;
    const detail = root.createElement('p');
    detail.className = 'shortcuts-item__detail';
    const origin = item.origin_date ? formatDisplayDate(item.origin_date) : '';
    detail.textContent = `${KIND_LABEL[item.someday_kind] || item.someday_kind} · ${origin ? `Origin ${origin}` : 'No origin date'}`;
    copy.append(heading, detail);
    row.append(copy);
    ul.append(row);
  }
  list.append(ul);
}
