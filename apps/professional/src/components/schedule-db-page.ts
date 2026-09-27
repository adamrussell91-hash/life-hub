/**
 * Shared database-list shell for Comms / Meetings / Events.
 * Shell owns the Professional Hub eyebrow (People Network pattern); this page
 * owns h1 · search · filter pills · sort/group · rows.
 * Does not reuse People row rendering (warmth rings, crest, Notion fields).
 */

import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  FILTER_LABELS,
  FILTER_ORDER,
  GROUP_LABELS,
  GROUP_ORDER,
  SORT_LABELS,
  activeScheduleFilterCount,
  defaultScheduleDbQuery,
  parseScheduleDbQuery,
  serializeScheduleDbQuery,
  type ScheduleDbKind,
  type ScheduleDbQueryState,
  type ScheduleGroup,
  type ScheduleSort
} from '@/domain/schedule-db-query';
import { renderLoadError, showViewLoading } from '@/views/feedback';

const PHONE_MQ = '(max-width: 719px)';

export interface ScheduleDbRow {
  id: string;
  title: string;
  href: string;
  /** Primary sort/display instant (ISO). */
  when: string;
  meta: string[];
  /** Values used for filter matching (lowercase tokens). */
  filterTokens: string[];
  /** Group key when grouping by channel / state / type. */
  facetKey: string;
  facetLabel: string;
}

export interface ScheduleDbPageConfig {
  kind: ScheduleDbKind;
  title: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  emptyMessage: string;
  primaryAction: { label: string; href: string };
  listHash: string;
  loadRows: () => Promise<ScheduleDbRow[]>;
  isCurrent?: () => boolean;
}

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

function isPhone(): boolean {
  return window.matchMedia(PHONE_MQ).matches;
}

function hashQuery(): string {
  const hash = location.hash;
  const i = hash.indexOf('?');
  return i >= 0 ? hash.slice(i) : '';
}

function writeHash(listHash: string, query: ScheduleDbQueryState): void {
  location.hash = `${listHash}${serializeScheduleDbQuery(query)}`;
}

function monthKey(iso: string): { key: string; label: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: 'unknown', label: 'Unknown date' };
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const label = d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { key, label };
}

function matchesFilter(row: ScheduleDbRow, filter: string): boolean {
  if (filter === 'all') return true;
  return row.filterTokens.includes(filter);
}

function matchesSearch(row: ScheduleDbRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [row.title, ...row.meta, ...row.filterTokens].join(' ').toLowerCase();
  return hay.includes(needle);
}

function sortRows(rows: ScheduleDbRow[], sort: ScheduleSort): ScheduleDbRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'az') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    const at = Date.parse(a.when) || 0;
    const bt = Date.parse(b.when) || 0;
    return sort === 'oldest' ? at - bt : bt - at;
  });
  return copy;
}

function groupRows(
  rows: ScheduleDbRow[],
  group: ScheduleGroup
): Array<{ key: string; label: string; rows: ScheduleDbRow[] }> {
  if (group === 'none') return [{ key: 'all', label: '', rows }];
  const map = new Map<string, { label: string; rows: ScheduleDbRow[] }>();
  for (const row of rows) {
    let key: string;
    let label: string;
    if (group === 'month') {
      const m = monthKey(row.when);
      key = m.key;
      label = m.label;
    } else {
      key = row.facetKey || 'none';
      label = row.facetLabel || 'Other';
    }
    if (!map.has(key)) map.set(key, { label, rows: [] });
    map.get(key)!.rows.push(row);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ key, label: v.label, rows: v.rows }));
}

export async function renderScheduleDbPage(
  canvas: HTMLElement,
  config: ScheduleDbPageConfig
): Promise<void> {
  const isCurrent = config.isCurrent ?? (() => true);
  let query = parseScheduleDbQuery(hashQuery(), config.kind);
  let rows: ScheduleDbRow[] = [];
  let phone = isPhone();

  showViewLoading(canvas, `Loading ${config.title.toLowerCase()}…`);

  async function load(): Promise<void> {
    showViewLoading(canvas, `Loading ${config.title.toLowerCase()}…`);
    try {
      rows = await config.loadRows();
      if (!isCurrent()) return;
      paint();
    } catch (err) {
      if (!isCurrent()) return;
      renderLoadError(canvas, err, () => void load());
    }
  }

  function filtered(): ScheduleDbRow[] {
    return sortRows(
      rows.filter((r) => matchesFilter(r, query.filter) && matchesSearch(r, query.q)),
      query.sort
    );
  }

  function paint(): void {
    canvas.replaceChildren();
    canvas.classList.add('schedule-db');

    const root = el('div', 'schedule-db__root');
    const titleRow = el('div', 'schedule-db__title-row');
    const h1 = el('h1', 'schedule-db__title', config.title);
    const countEl = el('span', 'schedule-db__count', 'Loading…');
    const spacer = el('span', 'schedule-db__spacer');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'schedule-db__search';
    search.placeholder = config.searchPlaceholder;
    search.value = query.q;
    search.setAttribute('aria-label', config.searchAriaLabel);

    const filtersBtn = el('button', 'btn btn--secondary schedule-db__filters-btn', 'Filters') as HTMLButtonElement;
    filtersBtn.type = 'button';

    const add = document.createElement('a');
    add.className = 'btn btn--primary schedule-db__add';
    add.href = config.primaryAction.href;
    add.textContent = config.primaryAction.label;

    titleRow.append(h1, countEl, spacer, search, filtersBtn, add);

    const bar = el('div', 'schedule-db__bar');
    const seg = el('div', 'schedule-db__seg');
    seg.setAttribute('role', 'tablist');
    seg.setAttribute('aria-label', `${config.title} filter`);

    const sortWrap = el('label', 'schedule-db__tool');
    sortWrap.append(document.createTextNode('Sort: '));
    const sortSelect = document.createElement('select');
    sortSelect.setAttribute('aria-label', `Sort ${config.title.toLowerCase()}`);
    for (const [value, label] of Object.entries(SORT_LABELS)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      sortSelect.append(opt);
    }
    sortWrap.append(sortSelect);

    const groupWrap = el('label', 'schedule-db__tool');
    groupWrap.append(document.createTextNode('Group: '));
    const groupSelect = document.createElement('select');
    groupSelect.setAttribute('aria-label', `Group ${config.title.toLowerCase()}`);
    for (const g of GROUP_ORDER[config.kind]) {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = GROUP_LABELS[config.kind][g] ?? g;
      groupSelect.append(opt);
    }
    groupWrap.append(groupSelect);

    const barSpacer = el('span', 'schedule-db__spacer');
    bar.append(seg, barSpacer, sortWrap, groupWrap);

    const list = el('div', 'schedule-db__list');
    root.append(titleRow, bar, list);
    canvas.append(root);

    const sheet = el('div', 'schedule-db__sheet');
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Filters');
    const sheetInner = el('div', 'schedule-db__sheet-inner');
    sheetInner.append(el('h2', undefined, 'Filters'));
    const sheetFilter = document.createElement('select');
    sheetFilter.setAttribute('aria-label', 'Filter');
    for (const f of FILTER_ORDER[config.kind]) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = FILTER_LABELS[config.kind][f] ?? f;
      sheetFilter.append(opt);
    }
    const sheetSort = sortSelect.cloneNode(true) as HTMLSelectElement;
    const sheetGroup = groupSelect.cloneNode(true) as HTMLSelectElement;
    const applyBtn = el('button', 'btn btn--primary', 'Apply') as HTMLButtonElement;
    applyBtn.type = 'button';
    const closeBtn = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
    closeBtn.type = 'button';
    {
      const lab = el('label', 'schedule-db__field');
      lab.append(document.createTextNode('Filter'), sheetFilter);
      sheetInner.append(lab);
    }
    {
      const lab = el('label', 'schedule-db__field');
      lab.append(document.createTextNode('Sort'), sheetSort);
      sheetInner.append(lab);
    }
    {
      const lab = el('label', 'schedule-db__field');
      lab.append(document.createTextNode('Group'), sheetGroup);
      sheetInner.append(lab);
    }
    sheetInner.append(applyBtn, closeBtn);
    sheet.append(sheetInner);
    root.append(sheet);

    function syncControls(): void {
      sortSelect.value = query.sort;
      groupSelect.value = query.group;
      sheetFilter.value = query.filter;
      sheetSort.value = query.sort;
      sheetGroup.value = query.group;
      search.value = query.q;
      const n = activeScheduleFilterCount(query);
      filtersBtn.textContent = n > 0 ? `Filters (${n})` : 'Filters';

      seg.replaceChildren();
      for (const f of FILTER_ORDER[config.kind]) {
        const btn = el(
          'button',
          `schedule-db__pill${query.filter === f ? ' is-active' : ''}`
        ) as HTMLButtonElement;
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', query.filter === f ? 'true' : 'false');
        btn.textContent = FILTER_LABELS[config.kind][f] ?? f;
        const matching =
          f === 'all' ? rows.length : rows.filter((r) => matchesFilter(r, f)).length;
        const i = el('i', undefined, String(matching));
        btn.append(document.createTextNode(' '), i);
        btn.addEventListener('click', () => {
          query = { ...query, filter: f };
          writeHash(config.listHash, query);
          renderList();
          syncControls();
        });
        seg.append(btn);
      }
    }

    function renderList(): void {
      if (!isCurrent()) return;
      list.replaceChildren();
      const visible = filtered();
      const word =
        config.kind === 'comms'
          ? visible.length === 1
            ? 'comm'
            : 'comms'
          : config.kind === 'meetings'
            ? visible.length === 1
              ? 'meeting'
              : 'meetings'
            : visible.length === 1
              ? 'event'
              : 'events';
      countEl.textContent = `${visible.length} ${word}`;

      if (visible.length === 0) {
        list.append(el('p', 'schedule-db__empty', rows.length ? 'No rows match these filters.' : config.emptyMessage));
        return;
      }

      for (const g of groupRows(visible, query.group)) {
        if (g.label) list.append(el('h2', 'schedule-db__group', g.label));
        for (const row of g.rows) {
          const a = document.createElement('a');
          a.className = 'schedule-db__row';
          a.href = row.href;
          const stack = el('div', 'schedule-db__row-stack');
          stack.append(el('span', 'schedule-db__row-title', row.title));
          const whenLabel =
            formatDisplayDate(row.when) ??
            (row.when && row.when !== '1970-01-01T00:00:00.000Z' ? row.when.slice(0, 10) : '');
          const metaParts = [...row.meta, whenLabel].filter(Boolean);
          stack.append(el('span', 'schedule-db__row-meta', metaParts.join(' · ')));
          a.append(stack);
          list.append(a);
        }
      }
    }

    function applyPhoneChrome(): void {
      phone = isPhone();
      filtersBtn.hidden = !phone;
      bar.hidden = phone;
      add.textContent = phone ? '+' : config.primaryAction.label;
      add.classList.toggle('schedule-db__add--icon', phone);
      add.setAttribute('aria-label', config.primaryAction.label);
    }

    sortSelect.addEventListener('change', () => {
      query = { ...query, sort: sortSelect.value as ScheduleSort };
      writeHash(config.listHash, query);
      renderList();
      syncControls();
    });
    groupSelect.addEventListener('change', () => {
      query = { ...query, group: groupSelect.value as ScheduleGroup };
      writeHash(config.listHash, query);
      renderList();
      syncControls();
    });

    let searchTimer: number | undefined;
    search.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        query = { ...query, q: search.value };
        writeHash(config.listHash, query);
        renderList();
      }, 150);
    });

    filtersBtn.addEventListener('click', () => {
      sheet.hidden = false;
    });
    closeBtn.addEventListener('click', () => {
      sheet.hidden = true;
    });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) sheet.hidden = true;
    });
    applyBtn.addEventListener('click', () => {
      query = {
        ...query,
        filter: sheetFilter.value,
        sort: sheetSort.value as ScheduleSort,
        group: sheetGroup.value as ScheduleGroup
      };
      writeHash(config.listHash, query);
      sheet.hidden = true;
      renderList();
      syncControls();
    });

    const mq = window.matchMedia(PHONE_MQ);
    const onMq = () => {
      applyPhoneChrome();
      syncControls();
    };
    mq.addEventListener('change', onMq);

    applyPhoneChrome();
    syncControls();
    renderList();
  }

  await load();
}

/** @internal exported for unit tests */
export const __scheduleDbTest = {
  matchesFilter,
  matchesSearch,
  sortRows,
  groupRows,
  defaultScheduleDbQuery
};
