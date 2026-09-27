import { formatDisplayDate } from '../../../../packages/design-kit/js/format-display-date.js';

/** Keep in sync with SOMEDAY_KINDS in apps/tasks/src/domain/someday.ts. Career is intentionally absent. */
const FUTURE_MAP_KINDS = new Set(['bucket_list', 'dreams_jar']);

const KIND_LABEL = {
  bucket_list: 'Bucket list',
  dreams_jar: 'Dreams jar'
};

function daysUntil(date) {
  const today = new Date().toISOString().slice(0, 10);
  const ms = new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function renderFutureMapTripsCard(root, { trips = null, error = '' } = {}) {
  const host = root.querySelector?.('[data-future-map="trips"]');
  if (!host) return;
  host.replaceChildren();
  if (error) {
    setText(host, error);
    return;
  }
  if (trips == null) {
    setText(host, 'Loading trips…');
    return;
  }
  const next = [...(Array.isArray(trips) ? trips : [])]
    .filter((t) => t?.start_date)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .find((t) => String(t.end_date || t.start_date) >= new Date().toISOString().slice(0, 10))
    || null;

  const link = root.createElement('a');
  link.href = '/travel/';
  link.className = 'shortcuts-item';
  link.style.display = 'block';
  link.style.textDecoration = 'none';
  const title = root.createElement('p');
  title.className = 'shortcuts-item__title';
  const detail = root.createElement('p');
  detail.className = 'shortcuts-item__detail';
  if (!next) {
    title.textContent = 'Plan a trip';
    detail.textContent = 'Open Travel to start planning.';
  } else {
    title.textContent = next.title || 'Next trip';
    const n = daysUntil(next.start_date);
    const when = n > 0 ? `Leaves in ${n} day${n === 1 ? '' : 's'}` : n === 0 ? 'Leaves today' : 'On now';
    detail.textContent = `${formatDisplayDate(next.start_date)} – ${formatDisplayDate(next.end_date)} · ${when}`;
  }
  link.append(title, detail);
  host.append(link);
}

export async function loadFutureMapTrips(root, { fetchImpl = fetch } = {}) {
  const host = root.querySelector?.('[data-future-map="trips"]');
  if (!host) return;
  renderFutureMapTripsCard(root, { trips: null });
  try {
    // fetchImpl is Life's apiFetch — path-only `/api/…`, base URL applied upstream.
    const response = await fetchImpl('/api/travel-trips', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const body = await response.json();
    if (!body?.ok) {
      renderFutureMapTripsCard(root, { error: 'Could not load trips.' });
      return;
    }
    renderFutureMapTripsCard(root, { trips: body.data?.trips || [] });
  } catch {
    renderFutureMapTripsCard(root, { error: 'Could not load trips.' });
  }
}

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
