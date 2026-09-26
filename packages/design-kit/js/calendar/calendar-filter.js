/**
 * Shared calendar source filter. One state across Day / Week / Term / Year / Almanac.
 * Governs items only — never capacity, vitals, load, walls, bands, or lane heights.
 */

export const FILTER_CHIPS = Object.freeze([
  Object.freeze({ id: 'classes', label: 'Classes', group: 'teaching' }),
  Object.freeze({ id: 'comms', label: 'Comms', group: 'shared' }),
  Object.freeze({ id: 'meetings', label: 'Meetings', group: 'professional' }),
  Object.freeze({ id: 'events', label: 'Events', group: 'shared' }),
  Object.freeze({ id: 'pd', label: 'PD', group: 'professional' }),
  Object.freeze({ id: 'promises', label: 'Promises', group: 'shared' }),
  Object.freeze({ id: 'tasks', label: 'Tasks', group: 'tasks' }),
  Object.freeze({ id: 'health', label: 'Health', group: 'life' }),
  Object.freeze({ id: 'fitness', label: 'Fitness', group: 'life' }),
  Object.freeze({ id: 'corey', label: 'Corey', group: 'life' })
]);

const ALL_IDS = FILTER_CHIPS.map((chip) => chip.id);

const HUB_DEFAULTS = Object.freeze({
  teaching: ['classes', 'comms', 'promises'],
  professional: ['comms', 'meetings', 'events', 'pd', 'promises'],
  tasks: ['tasks', 'promises']
});

/** @param {string} hub */
export function defaultFilterForHub(hub = 'life') {
  const onIds = HUB_DEFAULTS[hub] ?? ALL_IDS;
  return Object.fromEntries(ALL_IDS.map((id) => [id, onIds.includes(id)]));
}

function storageKey(hub) {
  return `${hub || 'life'}.calendar.filter`;
}

/** @param {string} hub @param {Record<string, boolean>} state */
export function writeFilterState(hub, state) {
  try {
    globalThis.sessionStorage?.setItem?.(storageKey(hub), JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

/** @param {string} hub @returns {Record<string, boolean>} */
export function readFilterState(hub) {
  const fallback = defaultFilterForHub(hub);
  try {
    const raw = globalThis.sessionStorage?.getItem?.(storageKey(hub));
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...fallback };
    const next = { ...fallback };
    for (const id of ALL_IDS) {
      if (typeof parsed[id] === 'boolean') next[id] = parsed[id];
    }
    return next;
  } catch {
    return { ...fallback };
  }
}

/**
 * Map a calendar item (Tideline chip, due, ghost, river point, dial arc, almanac bead) to a filter id.
 * Returns null when the item is not governed by the filter (always visible), e.g. study.
 */
export function filterKeyForItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.filterKey && ALL_IDS.includes(item.filterKey)) return item.filterKey;
  const kind = item.kind || item.chip?.kind;
  const source = item.source || item.type || item.record?.type || item.chip?.source;
  const isClass = item.isClass === true || item.chip?.isClass === true || source === 'scheduled_lesson';
  if (kind === 'teaching' || source === 'scheduled_lesson' || isClass) {
    return isClass || source === 'scheduled_lesson' ? 'classes' : 'events';
  }
  if (kind === 'comm' || source === 'professional_communication') return 'comms';
  if (kind === 'promise' || source === 'ledger_item') return 'promises';
  if (kind === 'professional' || source === 'professional_meeting' || source === 'professional_event') {
    if (source === 'professional_meeting') return 'meetings';
    const eventType = item.event_type ?? item.record?.event_type ?? item.chip?.event_type ?? null;
    return eventType && eventType !== 'professional_development' ? 'events' : 'pd';
  }
  if (kind === 'task' || source === 'task' || source === 'work_block' || source === 'deadline') return 'tasks';
  if (kind === 'health' || source === 'medical') return 'health';
  if (kind === 'fitness' || source === 'workout') return 'fitness';
  if (kind === 'corey') return 'corey';
  if (item.ghost && item.chip) return filterKeyForItem(item.chip);
  return null;
}

/** @param {unknown} item @param {Record<string, boolean>} state */
export function isItemVisible(item, state) {
  const key = filterKeyForItem(item);
  if (!key) return true;
  return state[key] !== false;
}

/** @param {Iterable<unknown>} items @param {Record<string, boolean>} state */
export function countHidden(items, state) {
  let n = 0;
  for (const item of items) {
    if (!isItemVisible(item, state)) n += 1;
  }
  return n;
}

/** Live counts for the filter chips over a list of items. */
export function countByFilterKey(items) {
  const counts = Object.fromEntries(ALL_IDS.map((id) => [id, 0]));
  for (const item of items) {
    const key = filterKeyForItem(item);
    if (key) counts[key] += 1;
  }
  return counts;
}

/**
 * Paint the shared source strip into `host`.
 * @param {Document} doc
 * @param {HTMLElement} host
 * @param {{ hub?: string, state: Record<string, boolean>, counts: Record<string, number>, hidden: number, ambient?: string, onChange: (next: Record<string, boolean>) => void }} opts
 */
function attach(parent, ...nodes) {
  if (typeof parent?.append === 'function') parent.append(...nodes);
  else for (const node of nodes) parent?.appendChild?.(node);
}

export function paintSourceFilter(doc, host, opts) {
  const { hub = 'life', state, counts, hidden, ambient, onChange } = opts;
  if (typeof host.replaceChildren === 'function') host.replaceChildren();
  else host.children = [];
  host.classList?.add?.('cal__sources');
  if (host.dataset) host.dataset.part = 'sources';
  else host.setAttribute?.('data-part', 'sources');

  const summary = doc.createElement('span');
  summary.className = 'cal-src-summary';
  if (summary.dataset) summary.dataset.part = 'filter-summary';
  else summary.setAttribute?.('data-part', 'filter-summary');
  summary.textContent = hidden > 0 ? `Filters · ${hidden} hidden` : 'Filters';
  attach(host, summary);

  const row = doc.createElement('div');
  row.className = 'cal__sources-row';
  if (row.dataset) row.dataset.part = 'sources-row';
  attach(host, row);

  const addBtn = (id, label, pressed, count, extraClass = '') => {
    const shortcut = extraClass.includes('cal-src--shortcut');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = `cal-src k-${id}${pressed ? '' : ' is-off'}${id === 'corey' ? ' cal-src--corey' : ''}${extraClass}`;
    btn.setAttribute('aria-pressed', String(pressed));
    if (btn.dataset) btn.dataset.filter = id;
    else btn.setAttribute('data-filter', id);
    if (!shortcut) {
      const mark = doc.createElement(id === 'corey' ? 'span' : 'i');
      if (id === 'corey') mark.className = 'cal-mark';
      attach(btn, mark);
    }
    const text = doc.createElement('span');
    text.textContent = `${label}${count != null ? ` ${count}` : ''}`;
    attach(btn, text);
    btn.addEventListener('click', () => {
      if (id === 'all') {
        const next = Object.fromEntries(ALL_IDS.map((k) => [k, true]));
        writeFilterState(hub, next);
        onChange(next);
        return;
      }
      if (id === 'hub') {
        const next = defaultFilterForHub(hub);
        writeFilterState(hub, next);
        onChange(next);
        return;
      }
      const next = { ...state, [id]: !state[id] };
      writeFilterState(hub, next);
      onChange(next);
    });
    attach(row, btn);
  };

  addBtn('all', 'All', ALL_IDS.every((id) => state[id]), null, ' cal-src--shortcut');
  addBtn('hub', 'This hub only', false, null, ' cal-src--shortcut');

  for (const chip of FILTER_CHIPS) {
    addBtn(chip.id, chip.label, state[chip.id] !== false, counts[chip.id] ?? 0);
  }

  if (ambient) {
    const amb = doc.createElement('span');
    amb.className = 'cal-src cal-src--ambient';
    if (amb.dataset) amb.dataset.part = 'ambient';
    else amb.setAttribute?.('data-part', 'ambient');
    amb.textContent = `Ambient: ${ambient}`;
    attach(row, amb);
  }

  const line = doc.createElement('button');
  line.type = 'button';
  line.className = 'cal-src-hidden';
  if (line.dataset) line.dataset.part = 'filter-hidden';
  else line.setAttribute?.('data-part', 'filter-hidden');
  if (hidden > 0) {
    line.hidden = false;
    line.textContent = `${hidden} hidden · Show all`;
    line.addEventListener('click', () => {
      const next = Object.fromEntries(ALL_IDS.map((k) => [k, true]));
      writeFilterState(hub, next);
      onChange(next);
    });
  } else {
    line.hidden = true;
    line.textContent = '';
  }
  attach(host, line);
}

/**
 * Apply visibility to mounted item nodes without remounting.
 * @param {Map<string, HTMLElement>} nodes
 * @param {Iterable<{ id: string, item: unknown }>} entries
 * @param {Record<string, boolean>} state
 * @param {{ reducedMotion?: boolean, engine?: { to?: Function } }} [motion]
 */
export function applyItemVisibility(nodes, entries, state, motion = {}) {
  for (const { id, item } of entries) {
    const node = nodes.get(id);
    if (!node) continue;
    const visible = isItemVisible(item, state);
    node.hidden = !visible;
    node.classList.toggle('is-filter-hidden', !visible);
    if (motion.engine?.to && !motion.reducedMotion) {
      motion.engine.to(id, { opacity: visible ? 1 : 0 }, { duration: 160 });
    } else if (node.style) {
      node.style.opacity = visible ? '' : '0';
    }
  }
}
