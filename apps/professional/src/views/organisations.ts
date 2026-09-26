/**
 * Organisations redesign Phase 1 — crest wall.
 */

import {
  fetchOrganisationsDirectory,
  type DirectoryOrganisationRow,
  type OrganisationsDirectoryResponse
} from '@/api/organisations-directory';
import { organisationsRoute } from '@/app/router';
import {
  buildOrganisationModel,
  chipMatchesFilter,
  type OrganisationModel
} from '@/domain/organisation-model';
import {
  FILTER_LABELS,
  GROUP_LABELS,
  SORT_LABELS,
  activeOrgsFilterCount,
  defaultOrgsQuery,
  parseOrgsQuery,
  serializeOrgsQuery,
  type OrgsFilter,
  type OrgsGroup,
  type OrgsQueryState,
  type OrgsSort
} from '@/domain/organisations-query';
import { renderRelationshipArcSvg } from '@/domain/relationship-arc';
import { crestNode, el } from '@/components/org-ui';

export interface OrganisationsPageOptions {
  isCurrent?: () => boolean;
}

const PHONE_MQ = '(max-width: 719px)';

const FILTER_ORDER: OrgsFilter[] = ['all', 'work', 'study', 'events', 'bodies', 'prospects'];

function hashQuery(): string {
  const i = location.hash.indexOf('?');
  return i >= 0 ? location.hash.slice(i) : '';
}

function writeHash(query: OrgsQueryState): void {
  location.hash = organisationsRoute(null, serializeOrgsQuery(query));
}

function isPhone(): boolean {
  return window.matchMedia(PHONE_MQ).matches;
}

function chipClass(kind: string): string {
  switch (kind) {
    case 'workplace':
      return 'orgs-rchip orgs-rchip--work';
    case 'workplace_former':
      return 'orgs-rchip orgs-rchip--past';
    case 'event_venue':
      return 'orgs-rchip orgs-rchip--event';
    case 'pd_provider':
      return 'orgs-rchip orgs-rchip--pd';
    case 'placement':
      return 'orgs-rchip orgs-rchip--prac';
    case 'studied':
      return 'orgs-rchip orgs-rchip--study';
    case 'member':
    case 'accreditation':
      return 'orgs-rchip orgs-rchip--body';
    case 'you_presented':
      return 'orgs-rchip orgs-rchip--stage';
    case 'applied':
    case 'prospect':
      return 'orgs-rchip orgs-rchip--apply';
    default:
      return 'orgs-rchip';
  }
}

function rowToModel(row: DirectoryOrganisationRow): OrganisationModel {
  return buildOrganisationModel({
    id: row.id,
    ref: row.ref,
    displayName: row.display_name,
    legalName: row.legal_name,
    logoKey: row.logo_key,
    chips: row.chips,
    people: row.people.map((p) => ({
      id: p.id,
      warmthBand: p.warmth_band,
      firstLinkAt: p.first_link_at
    })),
    arcPoints: row.arc_points,
    timelineLanes: row.timeline_lanes,
    firstTouchAt: row.first_touch_at,
    lastActivityAt: row.last_activity_at
  });
}

function filterRows(models: OrganisationModel[], query: OrgsQueryState): OrganisationModel[] {
  let list = models.filter((m) => chipMatchesFilter(m.chips, query.filter));
  if (query.q.trim()) {
    const q = query.q.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.chips.some((c) => `${c.label} ${c.detail}`.toLowerCase().includes(q))
    );
  }
  const sorted = [...list];
  switch (query.sort) {
    case 'az':
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    case 'newest':
      sorted.sort(
        (a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? '')
      );
      break;
    case 'most_people':
      sorted.sort((a, b) => b.peopleCount - a.peopleCount);
      break;
    case 'most_active':
    default:
      sorted.sort((a, b) => {
        if (a.isCurrentWorkplace !== b.isCurrentWorkplace) {
          return a.isCurrentWorkplace ? -1 : 1;
        }
        return b.peopleCount - a.peopleCount;
      });
  }
  return sorted;
}

function groupModels(
  models: OrganisationModel[],
  group: OrgsGroup
): Array<{ key: string; label: string; rows: OrganisationModel[] }> {
  if (group === 'none') return [{ key: 'all', label: '', rows: models }];
  const buckets = new Map<string, OrganisationModel[]>();
  for (const m of models) {
    const keys = m.chips.length
      ? [...new Set(m.chips.map((c) => c.filterBucket))]
      : ['other'];
    for (const k of keys) {
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(m);
    }
  }
  const labels: Record<string, string> = {
    work: 'Work',
    study: 'Study & placement',
    events: 'Events & PD',
    bodies: 'Professional bodies',
    prospects: 'Prospects',
    other: 'Other'
  };
  return [...buckets.entries()].map(([key, rows]) => ({
    key,
    label: labels[key] ?? key,
    rows
  }));
}

function renderSpread(spread: OrganisationModel['warmthSpread']): HTMLElement {
  const bar = el('span', 'orgs-spread');
  bar.setAttribute(
    'aria-label',
    `${spread.warm} warm, ${spread.cooling} cooling, ${spread.cold} cold`
  );
  const total = Math.max(1, spread.total);
  for (const [cls, n] of [
    ['orgs-spread__w', spread.warm],
    ['orgs-spread__c', spread.cooling],
    ['orgs-spread__k', spread.cold]
  ] as const) {
    if (n <= 0) continue;
    const i = el('i', cls);
    i.style.flex = String(n / total);
    bar.append(i);
  }
  return bar;
}

function renderTile(model: OrganisationModel, query: OrgsQueryState): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = `orgs-tile${model.isCurrentWorkplace ? ' orgs-tile--home' : ''}`;
  a.href = organisationsRoute(model.id, serializeOrgsQuery(query));

  const head = el('div', 'orgs-tile__head');
  head.append(
    crestNode(model.monogram, model.isCurrentWorkplace ? 'lg' : 'md', {
      orgRef: model.ref,
      logoKey: model.logoKey
    })
  );
  const stack = el('div', 'orgs-tile__stack');
  stack.append(el('h3', 'orgs-tile__name', model.displayName));
  const chips = el('div', 'orgs-rchips');
  for (const c of model.chips) {
    const chip = el('span', chipClass(c.kind));
    chip.append(el('b', undefined, c.label));
    if (c.detail) chip.append(el('span', 'orgs-rchip__yr', c.detail));
    chips.append(chip);
  }
  stack.append(chips);
  head.append(stack);

  const count = el('div', 'orgs-tile__count');
  const peopleWord = model.peopleCount === 1 ? 'person' : 'people';
  count.append(el('b', undefined, `${model.peopleCount} ${peopleWord}`));
  count.append(renderSpread(model.warmthSpread));

  const spark = el('div', 'orgs-tile__spark');
  spark.append(renderRelationshipArcSvg(model.arcPoints));

  a.append(head, count, spark);
  return a;
}

/**
 * Real entry point for the Organisations route controller (W2).
 */
export async function renderOrganisationsView(
  canvas: HTMLElement,
  options: OrganisationsPageOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  let query = parseOrgsQuery(hashQuery());
  let directory: OrganisationsDirectoryResponse | null = null;
  let models: OrganisationModel[] = [];
  let phone = isPhone();

  canvas.replaceChildren();
  canvas.classList.add('orgs-page');

  const root = el('div', 'orgs-page__root');
  const titleRow = el('div', 'orgs-page__title-row');
  const h1 = el('h1', 'orgs-page__title', 'Organisations');
  const countEl = el('span', 'orgs-page__count', 'Loading…');
  const spacer = el('span', 'orgs-page__spacer');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'orgs-page__search';
  search.placeholder = 'Search organisations';
  search.value = query.q;
  search.setAttribute('aria-label', 'Search organisations');

  const filtersBtn = el('button', 'btn btn--secondary orgs-page__filters-btn', 'Filters') as HTMLButtonElement;
  filtersBtn.type = 'button';
  filtersBtn.hidden = !phone;

  const addBtn = el('button', 'btn btn--primary orgs-page__add', 'Add organisation') as HTMLButtonElement;
  addBtn.type = 'button';
  addBtn.title = 'Add organisation';

  titleRow.append(h1, countEl, spacer, search, filtersBtn, addBtn);

  const opps = el('section', 'orgs-opps');
  const oppsH = el('div', 'orgs-opps__h');
  oppsH.append(el('span', 'orgs-opps__title', 'Potential opportunities'));
  oppsH.append(
    el(
      'span',
      'orgs-opps__sub',
      'scholarships, programs, roles and calls from your organisations · next 6 weeks'
    )
  );
  const oppsBody = el('div', 'orgs-opps__body');
  oppsBody.append(
    el(
      'p',
      'orgs-opps__empty',
      "No opportunities yet. Add one, or they'll arrive once the sweep is built."
    )
  );
  opps.append(oppsH, oppsBody);

  const bar = el('div', 'orgs-page__bar');
  const seg = el('div', 'orgs-page__seg');
  seg.setAttribute('role', 'tablist');
  seg.setAttribute('aria-label', 'Relationship filter');

  const sortWrap = el('label', 'orgs-page__tool');
  sortWrap.append(document.createTextNode('Sort: '));
  const sortSelect = document.createElement('select');
  sortSelect.setAttribute('aria-label', 'Sort organisations');
  for (const [value, label] of Object.entries(SORT_LABELS)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sortSelect.append(opt);
  }
  sortWrap.append(sortSelect);

  const groupWrap = el('label', 'orgs-page__tool');
  groupWrap.append(document.createTextNode('Group: '));
  const groupSelect = document.createElement('select');
  groupSelect.setAttribute('aria-label', 'Group organisations');
  for (const [value, label] of Object.entries(GROUP_LABELS)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    groupSelect.append(opt);
  }
  groupWrap.append(groupSelect);

  const barSpacer = el('span', 'orgs-page__spacer');
  bar.append(seg, barSpacer, sortWrap, groupWrap);

  const wall = el('div', 'orgs-wall');
  wall.setAttribute('data-orgs-wall', '');

  root.append(titleRow, opps, bar, wall);
  canvas.append(root);

  // Filters sheet (phone) — opaque paper (S3)
  const sheet = el('div', 'orgs-page__sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Filters');
  const sheetInner = el('div', 'orgs-page__sheet-inner');
  const sheetTitle = el('h2', undefined, 'Filters');
  const sheetFilter = document.createElement('select');
  sheetFilter.setAttribute('aria-label', 'Relationship filter');
  for (const f of FILTER_ORDER) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = FILTER_LABELS[f];
    sheetFilter.append(opt);
  }
  const sheetSort = sortSelect.cloneNode(true) as HTMLSelectElement;
  const sheetGroup = groupSelect.cloneNode(true) as HTMLSelectElement;
  const applyBtn = el('button', 'btn btn--primary', 'Apply') as HTMLButtonElement;
  applyBtn.type = 'button';
  const closeBtn = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
  closeBtn.type = 'button';
  sheetInner.append(sheetTitle);
  {
    const lab = el('label', 'orgs-page__field');
    lab.append(document.createTextNode('Relationship'), sheetFilter);
    sheetInner.append(lab);
  }
  {
    const lab = el('label', 'orgs-page__field');
    lab.append(document.createTextNode('Sort'), sheetSort);
    sheetInner.append(lab);
  }
  {
    const lab = el('label', 'orgs-page__field');
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
    const n = activeOrgsFilterCount(query);
    filtersBtn.textContent = n > 0 ? `Filters (${n})` : 'Filters';

    seg.replaceChildren();
    for (const f of FILTER_ORDER) {
      const btn = el('button', `orgs-page__pill${query.filter === f ? ' is-active' : ''}`) as HTMLButtonElement;
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', query.filter === f ? 'true' : 'false');
      btn.textContent = FILTER_LABELS[f];
      const matching =
        f === 'all'
          ? models.length
          : models.filter((m) => chipMatchesFilter(m.chips, f)).length;
      const i = el('i', undefined, String(matching));
      btn.append(document.createTextNode(' '), i);
      btn.addEventListener('click', () => {
        query = { ...query, filter: f };
        writeHash(query);
        renderWall();
        syncControls();
      });
      seg.append(btn);
    }
  }

  function renderWall(): void {
    if (!isCurrent()) return;
    wall.replaceChildren();
    const filtered = filterRows(models, query);
    const groups = groupModels(filtered, query.group);
    if (filtered.length === 0) {
      wall.append(el('p', 'orgs-wall__empty', 'No organisations match these filters.'));
      return;
    }
    for (const g of groups) {
      if (g.label) wall.append(el('h2', 'orgs-wall__group', g.label));
      const grid = el('div', 'orgs-wall__grid');
      for (const m of g.rows) grid.append(renderTile(m, query));
      wall.append(grid);
    }
  }

  function applyPhoneChrome(): void {
    phone = isPhone();
    filtersBtn.hidden = !phone;
    bar.hidden = phone;
    search.hidden = false;
    addBtn.textContent = phone ? '+' : 'Add organisation';
    addBtn.classList.toggle('orgs-page__add--icon', phone);
  }

  sortSelect.addEventListener('change', () => {
    query = { ...query, sort: sortSelect.value as OrgsSort };
    writeHash(query);
    renderWall();
    syncControls();
  });
  groupSelect.addEventListener('change', () => {
    query = { ...query, group: groupSelect.value as OrgsGroup };
    writeHash(query);
    renderWall();
    syncControls();
  });

  let searchTimer: number | undefined;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = { ...query, q: search.value };
      writeHash(query);
      renderWall();
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
      filter: sheetFilter.value as OrgsFilter,
      sort: sheetSort.value as OrgsSort,
      group: sheetGroup.value as OrgsGroup
    };
    writeHash(query);
    sheet.hidden = true;
    renderWall();
    syncControls();
  });

  addBtn.addEventListener('click', () => {
    // Phase 1: reuse entity create via hash — keep minimal; full form later
    const name = window.prompt('Organisation name');
    if (!name?.trim()) return;
    void import('@/api/entities').then(async ({ createEntity }) => {
      try {
        const created = (await createEntity({
          kind: 'organisation',
          display_name: name.trim()
        })) as { id?: string };
        if (created?.id) location.hash = organisationsRoute(created.id);
        else await load();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not create organisation.');
      }
    });
  });

  const mq = window.matchMedia(PHONE_MQ);
  const onMq = () => {
    applyPhoneChrome();
    syncControls();
    renderWall();
  };
  mq.addEventListener('change', onMq);

  async function load(): Promise<void> {
    countEl.textContent = 'Loading…';
    try {
      directory = await fetchOrganisationsDirectory();
      if (!isCurrent()) return;
      models = directory.organisations.map(rowToModel);
      countEl.textContent = `${directory.counts.organisations} organisations · ${directory.counts.people} people`;
      syncControls();
      renderWall();
    } catch (err) {
      if (!isCurrent()) return;
      countEl.textContent = 'Could not load';
      wall.replaceChildren(
        el(
          'p',
          'orgs-wall__empty',
          err instanceof Error ? err.message : 'Could not load organisations.'
        )
      );
    }
  }

  applyPhoneChrome();
  syncControls();
  await load();

  // Re-read query when hash changes externally (V2)
  const onHash = () => {
    if (!isCurrent()) return;
    if (!location.hash.startsWith('#/organisations')) return;
    // Detail route
    if (/^#\/organisations\/[^?/]+/.test(location.hash)) return;
    query = parseOrgsQuery(hashQuery());
    syncControls();
    renderWall();
  };
  window.addEventListener('hashchange', onHash);
}

/** @deprecated Prefer renderOrganisationsView — kept for older imports. */
export function renderOrganisationsPage(
  canvas: HTMLElement,
  options?: OrganisationsPageOptions
): Promise<void> {
  return renderOrganisationsView(canvas, options);
}
