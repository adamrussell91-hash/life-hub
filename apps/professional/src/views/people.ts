/**
 * People redesign Phase 1 — directory + person pane on one page.
 * Agents (Clare/Ann/Ask/Today) fill later-phase slots; empty states are visible (I3).
 */

import { fetchEntityOverview } from '@/api/entities';
import { fetchPersonBrief } from '@/api/people-brief';
import {
  fetchOrgCrestUrl,
  fetchPeopleDirectory,
  signOrgCrest,
  updateOrganisation,
  uploadSignedCrest,
  type DirectoryPersonRow,
  type PeopleDirectoryResponse
} from '@/api/people-directory';
import { mountAddPersonForm } from '@/components/add-person-form';
import { peopleRoute } from '@/app/router';
import { personRef } from '@/domain/ids';
import {
  activeFilterCount,
  defaultDirectoryQuery,
  GROUP_LABELS,
  parseDirectoryQuery,
  serializeDirectoryQuery,
  SORT_LABELS,
  type DirectoryGroup,
  type DirectoryQueryState,
  type DirectorySort
} from '@/domain/directory-query';
import { buildPersonModel, type PersonModel } from '@/domain/person-model';
import { renderRelationshipArcSvg } from '@/domain/relationship-arc';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export interface PeoplePageOptions {
  selectedId?: string | null;
  isCurrent?: () => boolean;
}

const PHONE_MQ = '(max-width: 719px)';

const ROLE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any relationship' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'former_colleague', label: 'Former colleague' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'mentee', label: 'Mentee' },
  { value: 'academic_contact', label: 'Academic contact' },
  { value: 'research_collaborator', label: 'Research collaborator' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'referee', label: 'Referee' },
  { value: 'conference_contact', label: 'Conference contact' },
  { value: 'introduction', label: 'Introduction' },
  { value: 'other', label: 'Other' }
];

const crestUrlCache = new Map<string, string | null>();

async function resolveCrestUrl(orgRef: string | null | undefined, logoKey: string | null | undefined): Promise<string | null> {
  if (!orgRef || !logoKey) return null;
  if (crestUrlCache.has(orgRef)) return crestUrlCache.get(orgRef) ?? null;
  try {
    const res = await fetchOrgCrestUrl(orgRef);
    crestUrlCache.set(orgRef, res.url);
    return res.url;
  } catch {
    crestUrlCache.set(orgRef, null);
    return null;
  }
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

function hashQuery(): string {
  const hash = location.hash;
  const i = hash.indexOf('?');
  return i >= 0 ? hash.slice(i) : '';
}

function writeHash(selectedId: string | null, query: DirectoryQueryState): void {
  location.hash = peopleRoute(selectedId, serializeDirectoryQuery(query));
}

function isPhone(): boolean {
  return window.matchMedia(PHONE_MQ).matches;
}

function matchesFilters(row: DirectoryPersonRow, query: DirectoryQueryState): boolean {
  if (query.q.trim()) {
    const q = query.q.trim().toLowerCase();
    const hay = [
      row.display_name,
      row.role_line,
      row.organisation?.display_name ?? '',
      ...row.organisations.map((o) => o.display_name)
    ]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (query.role) {
    if (!row.relationship_roles.some((r) => r.role === query.role && r.current)) return false;
  }
  if (query.org) {
    if (!row.organisations.some((o) => o.ref === query.org)) return false;
  }
  if (query.orgScope === 'current') {
    if (!row.organisation?.current) return false;
  }
  if (query.orgScope === 'former') {
    if (row.organisation?.current !== false && !row.organisations.some((o) => !o.current)) return false;
  }
  if (query.warmth !== 'all' && row.warmth_band !== query.warmth) return false;
  if (query.hasOpen && row.open_item_count <= 0 && row.you_owe_count <= 0) return false;
  return true;
}

function sortRows(rows: DirectoryPersonRow[], sort: DirectorySort): DirectoryPersonRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sort) {
      case 'needs_attention': {
        const ao = a.open_item_count + a.you_owe_count;
        const bo = b.open_item_count + b.you_owe_count;
        if (bo !== ao) return bo - ao;
        return a.warmth - b.warmth;
      }
      case 'seeing_soon':
        return (a.next_label ? 0 : 1) - (b.next_label ? 0 : 1) || a.display_name.localeCompare(b.display_name);
      case 'going_cold':
        return a.warmth - b.warmth;
      case 'recently_in_touch':
        return Date.parse(b.updated_at) - Date.parse(a.updated_at);
      case 'newest':
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      case 'organisation':
        return (a.organisation?.display_name ?? 'ZZZ').localeCompare(
          b.organisation?.display_name ?? 'ZZZ'
        ) || a.display_name.localeCompare(b.display_name);
      case 'az':
      default:
        return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
    }
  });
  return copy;
}

function groupRows(
  rows: DirectoryPersonRow[],
  group: DirectoryGroup
): Array<{ key: string; label: string; monogram: string | null; rows: DirectoryPersonRow[] }> {
  if (group === 'none') {
    return [{ key: 'all', label: 'Everyone', monogram: null, rows }];
  }
  const map = new Map<string, { label: string; monogram: string | null; rows: DirectoryPersonRow[] }>();
  for (const row of rows) {
    let key: string;
    let label: string;
    let monogram: string | null;
    if (group === 'organisation') {
      key = row.organisation?.ref ?? 'none';
      label = row.organisation
        ? `${row.organisation.display_name}${row.organisation.current ? '' : ' · former'}`
        : 'No organisation';
      monogram = row.organisation?.monogram ?? null;
    } else {
      const role = row.relationship_roles.find((r) => r.current) ?? row.relationship_roles[0];
      key = role?.role ?? 'none';
      label = role?.label ?? 'No relationship type';
      monogram = null;
    }
    if (!map.has(key)) map.set(key, { label, monogram, rows: [] });
    map.get(key)!.rows.push(row);
  }
  return [...map.entries()].map(([key, v]) => ({ key, label: v.label, monogram: v.monogram, rows: v.rows }));
}

function crestNode(
  monogram: string | null,
  size: 'sm' | 'md' = 'sm',
  opts: { orgRef?: string | null; logoKey?: string | null; onUpload?: (file: File) => void } = {}
): HTMLElement {
  const crest = el('span', `people-crest people-crest--${size}${monogram ? '' : ' people-crest--empty'}`);
  crest.setAttribute('aria-hidden', 'true');
  const label = el('span', 'people-crest__mono', monogram ?? '');
  crest.append(label);
  if (opts.orgRef && opts.logoKey) {
    void resolveCrestUrl(opts.orgRef, opts.logoKey).then((url) => {
      if (!url) return;
      label.hidden = true;
      const img = document.createElement('img');
      img.className = 'people-crest__img';
      img.alt = '';
      img.src = url;
      crest.prepend(img);
    });
  }
  if (opts.onUpload) {
    crest.classList.add('people-crest--upload');
    crest.title = 'Upload crest (PNG or SVG, ≤512KB)';
    crest.tabIndex = 0;
    crest.setAttribute('role', 'button');
    crest.setAttribute('aria-label', 'Upload organisation crest');
    const pick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/svg+xml,.png,.svg';
      input.hidden = true;
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) opts.onUpload?.(file);
        input.remove();
      });
      document.body.append(input);
      input.click();
    };
    crest.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pick();
    });
    crest.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
  }
  return crest;
}

function warmthRing(
  warmth: number,
  initials: string,
  size: 'sm' | 'lg' = 'sm',
  badge?: { monogram: string | null; orgRef?: string | null; logoKey?: string | null }
): HTMLElement {
  const wrap = el('span', `people-ring people-ring--${size}${warmth < 30 ? ' people-ring--cool' : ''}`);
  wrap.style.setProperty('--w', String(Math.max(0, Math.min(100, warmth))));
  const av = el('span', 'people-avatar', initials);
  wrap.append(av);
  if (badge) {
    const badgeEl = crestNode(badge.monogram, 'sm', {
      orgRef: badge.orgRef,
      logoKey: badge.logoKey
    });
    badgeEl.classList.add('people-crest--badge');
    wrap.append(badgeEl);
  }
  return wrap;
}

function sectionHost(className: string, title: string): { root: HTMLElement; body: HTMLElement } {
  const root = el('section', `people-pane__box ${className}`);
  const h = el('div', 'people-pane__h2', title);
  const body = el('div', 'people-pane__section-body');
  body.setAttribute('data-section-body', '');
  root.append(h, body);
  return { root, body };
}

function setSectionState(body: HTMLElement, state: 'loading' | 'empty' | 'error' | 'ready', message?: string): void {
  body.replaceChildren();
  if (state === 'ready') return;
  const p = el('p', `people-pane__${state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'empty'}`);
  p.textContent =
    message ??
    (state === 'loading' ? 'Loading…' : state === 'error' ? 'Could not load this section.' : 'Nothing here yet.');
  body.append(p);
}

/**
 * Real entry point for the People route controller (W2).
 */
export async function renderPeoplePage(
  canvas: HTMLElement,
  options: PeoplePageOptions = {}
): Promise<void> {
  const isCurrent = options.isCurrent ?? (() => true);
  let selectedId = options.selectedId ?? null;
  let query = parseDirectoryQuery(hashQuery());
  let directory: PeopleDirectoryResponse | null = null;
  let personModels = new Map<string, PersonModel>();
  let phone = isPhone();

  canvas.replaceChildren();
  canvas.classList.add('people-page');

  const root = el('div', 'people-page__root');
  const titleRow = el('div', 'people-page__title-row');
  const h1 = el('h1', 'people-page__title', 'People');
  const count = el('span', 'people-page__count', 'Loading…');
  const spacer = el('span', 'people-page__spacer');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'people-page__search';
  search.placeholder = 'Search name or organisation';
  search.value = query.q;
  search.setAttribute('aria-label', 'Search people');
  const addBtn = el('button', 'btn btn--primary', 'Add person') as HTMLButtonElement;
  addBtn.type = 'button';
  titleRow.append(h1, count, spacer, search, addBtn);

  const addHost = el('div', 'people-page__add-host');
  addHost.hidden = true;

  const split = el('div', 'people-page__split');
  const dir = el('section', 'people-page__dir card');
  const pane = el('section', 'people-page__pane card');
  split.append(dir, pane);
  root.append(titleRow, addHost, split);
  canvas.append(root);

  const tools = el('div', 'people-page__tools');
  const filterBtn = el('button', 'people-page__tool', 'Filter') as HTMLButtonElement;
  filterBtn.type = 'button';
  const filterCount = el('span', 'people-page__tool-n', '0');
  filterBtn.append(document.createTextNode(' '), filterCount);
  const sortBtn = el('button', 'people-page__tool people-page__tool--sort', '') as HTMLButtonElement;
  sortBtn.type = 'button';
  const groupBtn = el('button', 'people-page__tool', '') as HTMLButtonElement;
  groupBtn.type = 'button';
  const phoneFiltersBtn = el('button', 'people-page__tool people-page__filters-phone', 'Filters') as HTMLButtonElement;
  phoneFiltersBtn.type = 'button';
  const addIcon = el('button', 'people-page__add-icon btn btn--primary', '+') as HTMLButtonElement;
  addIcon.type = 'button';
  addIcon.setAttribute('aria-label', 'Add person');
  tools.append(filterBtn, sortBtn, groupBtn, phoneFiltersBtn, addIcon);
  const pills = el('div', 'people-page__pills');
  const listHost = el('div', 'people-page__list');
  dir.append(tools, pills, listHost);

  const sheet = el('div', 'people-page__sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Filters');
  const sheetInner = el('div', 'people-page__sheet-inner');
  sheet.append(sheetInner);
  dir.append(sheet);

  const sortMenu = el('div', 'people-page__menu');
  sortMenu.hidden = true;
  dir.append(sortMenu);

  function syncControlLabels(): void {
    sortBtn.textContent = `${SORT_LABELS[query.sort]} ▾`;
    groupBtn.textContent = `${GROUP_LABELS[query.group]} ▾`;
    filterCount.textContent = String(activeFilterCount(query));
    search.value = query.q;
  }

  function applyQueryToHash(): void {
    writeHash(selectedId, query);
  }

  function filteredSorted(): DirectoryPersonRow[] {
    if (!directory) return [];
    return sortRows(directory.people.filter((r) => matchesFilters(r, query)), query.sort);
  }

  function renderPills(): void {
    pills.replaceChildren();
    if (query.role) {
      const pill = el('button', 'people-page__pill', `Relationship: ${query.role} ✕`) as HTMLButtonElement;
      pill.type = 'button';
      pill.addEventListener('click', () => {
        query = { ...query, role: null };
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      pills.append(pill);
    }
    if (query.orgScope !== 'all' || query.org) {
      const label = query.org
        ? `Organisation: selected ✕`
        : `Organisation: ${query.orgScope} ✕`;
      const pill = el('button', 'people-page__pill', label) as HTMLButtonElement;
      pill.type = 'button';
      pill.addEventListener('click', () => {
        query = { ...query, org: null, orgScope: 'all' };
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      pills.append(pill);
    }
    if (query.warmth !== 'all') {
      const pill = el('button', 'people-page__pill', `Warmth: ${query.warmth} ✕`) as HTMLButtonElement;
      pill.type = 'button';
      pill.addEventListener('click', () => {
        query = { ...query, warmth: 'all' };
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      pills.append(pill);
    }
    if (query.hasOpen) {
      const pill = el('button', 'people-page__pill', 'Has open items ✕') as HTMLButtonElement;
      pill.type = 'button';
      pill.addEventListener('click', () => {
        query = { ...query, hasOpen: false };
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      pills.append(pill);
    }
  }

  function rowSignal(row: DirectoryPersonRow): { primary: string; secondary: string } {
    const model = personModels.get(row.id);
    const youOwe = model?.youOweCount ?? row.you_owe_count;
    const open = model?.openItemCount ?? row.open_item_count;
    if (youOwe > 0 || open > 0) {
      return { primary: `You owe ${youOwe || open}`, secondary: model?.next?.title ?? row.next_label ?? '' };
    }
    if (row.warmth_band === 'cold') return { primary: '', secondary: 'cold' };
    if (row.warmth_band === 'cooling') return { primary: '', secondary: 'cooling' };
    return { primary: '', secondary: row.next_label ?? '' };
  }

  function renderDirectory(): void {
    if (!isCurrent()) return;
    syncControlLabels();
    renderPills();
    listHost.replaceChildren();
    const rows = filteredSorted();
    if (!directory) {
      listHost.append(el('p', 'people-pane__loading', 'Loading directory…'));
      return;
    }
    if (rows.length === 0) {
      listHost.append(el('p', 'people-pane__empty', 'No people match these filters.'));
      return;
    }
    const groups = groupRows(rows, query.group);
    for (const g of groups) {
      const gh = el('div', 'people-page__group');
      const sample = g.rows[0]?.organisation;
      if (g.monogram || sample) {
        const orgId = sample?.ref?.split(':')[2] ?? null;
        gh.append(
          crestNode(g.monogram ?? sample?.monogram ?? null, 'sm', {
            orgRef: sample?.ref,
            logoKey: sample?.logo_key ?? null,
            onUpload:
              orgId && sample?.ref
                ? (file) => {
                    void uploadCrest(sample.ref, orgId, file);
                  }
                : undefined
          })
        );
      }
      gh.append(el('span', 'people-page__group-label', g.label));
      gh.append(el('span', 'people-page__group-n', String(g.rows.length)));
      listHost.append(gh);
      for (const row of g.rows) {
        const model = personModels.get(row.id);
        const warmth = model?.warmth ?? row.warmth;
        const roleLine = model?.roleLine ?? row.role_line;
        const a = document.createElement('a');
        a.className = `people-page__row${row.id === selectedId ? ' is-on' : ''}`;
        a.href = peopleRoute(row.id, serializeDirectoryQuery(query));
        const org = row.organisation;
        a.append(
          warmthRing(warmth, row.initials, 'sm', org
            ? { monogram: org.monogram, orgRef: org.ref, logoKey: org.logo_key }
            : undefined)
        );
        const stack = el('div', 'people-page__row-stack');
        stack.append(el('span', 'people-page__row-name', row.display_name));
        stack.append(el('span', 'people-page__row-sub', roleLine));
        a.append(stack);
        const end = el('div', 'people-page__row-end');
        const sig = rowSignal(row);
        if (sig.primary) end.append(el('span', 'people-page__owe', sig.primary));
        if (sig.secondary) end.append(el('span', 'people-page__row-sub', sig.secondary));
        a.append(end);
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          selectedId = row.id;
          applyQueryToHash();
          void paintSelection();
          renderDirectory();
        });
        listHost.append(a);
      }
    }
  }

  async function uploadCrest(orgRef: string, organisationId: string, file: File): Promise<void> {
    try {
      const signed = await signOrgCrest({
        organisation_id: organisationId,
        filename: file.name,
        content_type: file.type || (file.name.endsWith('.svg') ? 'image/svg+xml' : 'image/png'),
        byte_size: file.size
      });
      await uploadSignedCrest(signed.put_url, file, signed.attachment.content_type);
      await updateOrganisation(orgRef, { logo_key: signed.attachment.r2_key });
      crestUrlCache.delete(orgRef);
      if (directory) {
        for (const p of directory.people) {
          if (p.organisation?.ref === orgRef) p.organisation.logo_key = signed.attachment.r2_key;
          for (const o of p.organisations) {
            if (o.ref === orgRef) o.logo_key = signed.attachment.r2_key;
          }
        }
        for (const o of directory.organisations) {
          if (o.ref === orgRef) o.logo_key = signed.attachment.r2_key;
        }
      }
      renderDirectory();
      if (selectedId) void paintSelection();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Crest upload failed.');
    }
  }

  async function loadPersonSections(id: string): Promise<void> {
    const headerHost = pane.querySelector('[data-section="header"]') as HTMLElement | null;
    const nextHost = pane.querySelector('[data-section="next"] .people-pane__section-body') as HTMLElement | null;
    const ledgerHost = pane.querySelector('[data-section="ledger"] .people-pane__section-body') as HTMLElement | null;
    const rememberHost = pane.querySelector(
      '[data-section="remember"] .people-pane__section-body'
    ) as HTMLElement | null;
    const arcHost = pane.querySelector('[data-section="arc"] .people-pane__section-body') as HTMLElement | null;
    const fullHost = pane.querySelector('[data-section="full"] .people-pane__section-body') as HTMLElement | null;

    if (nextHost) setSectionState(nextHost, 'loading');
    if (ledgerHost) setSectionState(ledgerHost, 'loading');
    if (rememberHost) setSectionState(rememberHost, 'loading');
    if (arcHost) setSectionState(arcHost, 'loading');

    try {
      const [overview, brief] = await Promise.all([
        fetchEntityOverview(personRef(id)),
        fetchPersonBrief(id).catch(() => null)
      ]);
      if (!isCurrent() || selectedId !== id) return;
      const model = buildPersonModel({ overview, brief });
      personModels.set(id, model);

      // Patch directory open counts from the same model (V4).
      if (directory) {
        const row = directory.people.find((p) => p.id === id);
        if (row) {
          row.open_item_count = model.openItemCount;
          row.you_owe_count = model.youOweCount;
          row.they_owe_count = model.theyOweCount;
          row.role_line = model.roleLine;
          row.warmth = model.warmth;
          row.warmth_band = model.warmthBand;
        }
      }

      if (headerHost) {
        headerHost.replaceChildren();
        const row = el('div', 'people-pane__header');
        row.append(
          warmthRing(
            model.warmth,
            model.initials,
            'lg',
            model.organisation
              ? {
                  monogram: model.organisation.monogram,
                  orgRef: model.organisation.ref,
                  logoKey:
                    directory?.organisations.find((o) => o.ref === model.organisation?.ref)?.logo_key ??
                    null
                }
              : undefined
          )
        );
        const stack = el('div', 'people-pane__header-stack');
        stack.append(el('h2', 'people-pane__name', model.displayName));
        const chips = el('div', 'people-pane__chips');
        for (const chip of model.chips) {
          const c = el('span', `people-pane__chip people-pane__chip--${chip.kind}`, chip.label);
          if (chip.orgMonogram) {
            c.prepend(crestNode(chip.orgMonogram, 'sm'));
          }
          chips.append(c);
        }
        stack.append(chips);
        row.append(stack);
        const edit = el('button', 'btn btn--secondary', 'Edit') as HTMLButtonElement;
        edit.type = 'button';
        edit.addEventListener('click', () => {
          const disc = pane.querySelector('.people-pane__full') as HTMLDetailsElement | null;
          if (disc) disc.open = true;
        });
        row.append(edit);
        headerHost.append(row);
      }

      if (nextHost) {
        nextHost.replaceChildren();
        if (!model.next) {
          setSectionState(nextHost, 'empty', 'No upcoming meeting or event with them.');
        } else {
          const card = el('div', 'people-pane__next');
          const when = formatDisplayDate(model.next.detail);
          card.append(
            el(
              'p',
              undefined,
              `${model.next.title}${when ? ` · ${when}` : ''}`
            )
          );
          nextHost.append(card);
        }
      }

      if (ledgerHost) {
        ledgerHost.replaceChildren();
        const grid = el('div', 'people-pane__ledger');
        const you = el('div');
        you.append(el('div', 'people-pane__ledger-h people-pane__ledger-h--you', 'You owe them'));
        if (model.ledgerYouOwe.length === 0) {
          you.append(el('p', 'people-pane__empty', 'Nothing open.'));
        } else {
          for (const item of model.ledgerYouOwe) {
            const li = el('div', 'people-pane__li');
            li.append(el('div', undefined, item.text));
            li.append(el('div', 'people-pane__row-sub', item.sourceLabel));
            you.append(li);
          }
        }
        const them = el('div');
        them.append(el('div', 'people-pane__ledger-h people-pane__ledger-h--them', 'They owe you'));
        them.append(el('p', 'people-pane__empty', 'Nothing to confirm'));
        grid.append(you, them);
        ledgerHost.append(grid);
      }

      if (rememberHost) {
        setSectionState(rememberHost, 'empty', "Ann hasn't found anything yet. Run now");
        const run = rememberHost.querySelector('p');
        // "Run now" is Phase 5 — keep the empty copy visible (I3).
        void run;
      }

      if (arcHost) {
        arcHost.replaceChildren();
        if (model.arcPoints.length === 0) {
          setSectionState(arcHost, 'empty', 'No dated touchpoints linked yet.');
        } else {
          arcHost.append(
            renderRelationshipArcSvg(
              model.arcPoints.map((p) => ({
                id: p.id,
                at: p.at,
                label: p.label
              }))
            )
          );
        }
      }

      if (fullHost) {
        fullHost.replaceChildren();
        const ul = el('ul', 'people-pane__full-list');
        for (const entry of overview.current_relationships ?? []) {
          const li = el('li');
          li.textContent = `${entry.link.relationship_type}: ${entry.endpoint.display_label}`;
          ul.append(li);
        }
        if (!ul.childElementCount) {
          fullHost.append(el('p', 'people-pane__empty', 'No current relationships in the full record.'));
        } else {
          fullHost.append(ul);
        }
      }

      renderDirectory();
    } catch (err) {
      if (!isCurrent() || selectedId !== id) return;
      const msg = err instanceof Error ? err.message : 'Could not load this person.';
      if (nextHost) setSectionState(nextHost, 'error', msg);
      if (ledgerHost) setSectionState(ledgerHost, 'error', msg);
      if (rememberHost) setSectionState(rememberHost, 'error', msg);
      if (arcHost) setSectionState(arcHost, 'error', msg);
    }
  }

  function mountPaneSkeleton(): void {
    pane.replaceChildren();
    if (!selectedId) {
      pane.append(el('p', 'people-pane__empty', 'Select someone from the directory.'));
      return;
    }
    if (phone) {
      const back = el('button', 'btn btn--ghost people-pane__back', '← People') as HTMLButtonElement;
      back.type = 'button';
      back.addEventListener('click', () => {
        selectedId = null;
        applyQueryToHash();
        paintLayout();
      });
      pane.append(back);
    }
    const header = el('div');
    header.setAttribute('data-section', 'header');
    header.append(el('p', 'people-pane__loading', 'Loading…'));
    pane.append(header);

    const next = sectionHost('people-pane__next-wrap', 'Next');
    next.root.setAttribute('data-section', 'next');
    setSectionState(next.body, 'loading');
    pane.append(next.root);

    const ledger = sectionHost('', 'The ledger');
    ledger.root.setAttribute('data-section', 'ledger');
    const sub = el('span', 'people-pane__h2-sub', 'from tasks, notes, emails');
    ledger.root.querySelector('.people-pane__h2')?.append(sub);
    setSectionState(ledger.body, 'loading');
    pane.append(ledger.root);

    const remember = sectionHost('', 'Remember');
    remember.root.setAttribute('data-section', 'remember');
    remember.root.querySelector('.people-pane__h2')?.append(el('span', 'people-pane__h2-sub', 'pulled from your notes'));
    setSectionState(remember.body, 'loading');
    pane.append(remember.root);

    const arc = sectionHost('people-pane__arc', 'Your relationship so far');
    arc.root.setAttribute('data-section', 'arc');
    arc.root.querySelector('.people-pane__h2')?.append(
      el('span', 'people-pane__h2-sub', 'every touchpoint')
    );
    setSectionState(arc.body, 'loading');
    pane.append(arc.root);

    const details = document.createElement('details');
    details.className = 'people-pane__full';
    details.setAttribute('data-section', 'full');
    const summary = document.createElement('summary');
    summary.textContent = 'Full record';
    details.append(summary);
    const fullBody = el('div', 'people-pane__section-body');
    fullBody.setAttribute('data-section-body', '');
    details.append(fullBody);
    pane.append(details);
  }

  async function paintSelection(): Promise<void> {
    mountPaneSkeleton();
    root.classList.toggle('people-page--person', Boolean(selectedId) && phone);
    root.classList.toggle('people-page--dir', !selectedId || !phone);
    if (selectedId) await loadPersonSections(selectedId);
  }

  function paintLayout(): void {
    phone = isPhone();
    root.classList.toggle('is-phone', phone);
    syncControlLabels();
    renderDirectory();
    void paintSelection();
  }

  // Menus
  sortBtn.addEventListener('click', () => {
    sortMenu.hidden = !sortMenu.hidden;
    if (sortMenu.hidden) return;
    sortMenu.replaceChildren();
    (Object.keys(SORT_LABELS) as DirectorySort[]).forEach((key) => {
      const item = el('button', `people-page__menu-item${query.sort === key ? ' is-on' : ''}`, SORT_LABELS[key]) as HTMLButtonElement;
      item.type = 'button';
      item.addEventListener('click', () => {
        query = { ...query, sort: key };
        sortMenu.hidden = true;
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      sortMenu.append(item);
    });
  });

  groupBtn.addEventListener('click', () => {
    sortMenu.hidden = !sortMenu.hidden;
    if (sortMenu.hidden) return;
    sortMenu.replaceChildren();
    (Object.keys(GROUP_LABELS) as DirectoryGroup[]).forEach((key) => {
      const item = el('button', `people-page__menu-item${query.group === key ? ' is-on' : ''}`, GROUP_LABELS[key]) as HTMLButtonElement;
      item.type = 'button';
      item.addEventListener('click', () => {
        query = { ...query, group: key };
        sortMenu.hidden = true;
        syncControlLabels();
        applyQueryToHash();
        renderDirectory();
      });
      sortMenu.append(item);
    });
  });

  function openFilterSheet(): void {
    const onPhone = isPhone();
    sheet.hidden = false;
    sheetInner.replaceChildren();
    sheetInner.append(el('h2', 'people-pane__name', 'Filters'));

    let sortSelect: HTMLSelectElement | null = null;
    let groupSelect: HTMLSelectElement | null = null;
    // Phone Filters sheet owns sort + group (1.6 / L5); desktop keeps toolbar menus.
    if (onPhone) {
      const sortField = el('label', 'people-page__field', 'Sort');
      sortSelect = document.createElement('select');
      for (const key of Object.keys(SORT_LABELS) as DirectorySort[]) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = SORT_LABELS[key];
        if (query.sort === key) opt.selected = true;
        sortSelect.append(opt);
      }
      sortField.append(sortSelect);
      const groupField = el('label', 'people-page__field', 'Group');
      groupSelect = document.createElement('select');
      for (const key of Object.keys(GROUP_LABELS) as DirectoryGroup[]) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = GROUP_LABELS[key];
        if (query.group === key) opt.selected = true;
        groupSelect.append(opt);
      }
      groupField.append(groupSelect);
      sheetInner.append(sortField, groupField);
    }

    const roleField = el('label', 'people-page__field', 'Relationship');
    const roleSelect = document.createElement('select');
    for (const optDef of ROLE_FILTER_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = optDef.value;
      opt.textContent = optDef.label;
      if ((query.role ?? '') === optDef.value) opt.selected = true;
      roleSelect.append(opt);
    }
    roleField.append(roleSelect);

    const orgScopeField = el('label', 'people-page__field', 'Organisation');
    const orgScopeSelect = document.createElement('select');
    for (const [value, label] of [
      ['all', 'Current & former'],
      ['current', 'Current only'],
      ['former', 'Former only']
    ] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (query.orgScope === value) opt.selected = true;
      orgScopeSelect.append(opt);
    }
    orgScopeField.append(orgScopeSelect);

    const orgField = el('label', 'people-page__field', 'Specific organisation');
    const orgSelect = document.createElement('select');
    const anyOrg = document.createElement('option');
    anyOrg.value = '';
    anyOrg.textContent = 'Any';
    orgSelect.append(anyOrg);
    for (const org of directory?.organisations ?? []) {
      const opt = document.createElement('option');
      opt.value = org.ref;
      opt.textContent = org.display_name;
      if (query.org === org.ref) opt.selected = true;
      orgSelect.append(opt);
    }
    orgField.append(orgSelect);

    const warmth = el('label', 'people-page__field', 'Warmth');
    const warmthSelect = document.createElement('select');
    for (const w of ['all', 'warm', 'cooling', 'cold'] as const) {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = w;
      if (query.warmth === w) opt.selected = true;
      warmthSelect.append(opt);
    }
    warmth.append(warmthSelect);

    const open = document.createElement('label');
    open.className = 'people-page__field';
    const openCb = document.createElement('input');
    openCb.type = 'checkbox';
    openCb.checked = query.hasOpen;
    open.append(openCb, document.createTextNode(' Has open items'));

    const apply = el('button', 'btn btn--primary', 'Apply') as HTMLButtonElement;
    apply.type = 'button';
    apply.addEventListener('click', () => {
      query = {
        ...query,
        role: roleSelect.value || null,
        org: orgSelect.value || null,
        orgScope: orgScopeSelect.value as DirectoryQueryState['orgScope'],
        warmth: warmthSelect.value as DirectoryQueryState['warmth'],
        hasOpen: openCb.checked,
        sort: (sortSelect?.value as DirectorySort | undefined) ?? query.sort,
        group: (groupSelect?.value as DirectoryGroup | undefined) ?? query.group
      };
      sheet.hidden = true;
      syncControlLabels();
      applyQueryToHash();
      renderDirectory();
    });
    const close = el('button', 'btn btn--ghost', 'Close') as HTMLButtonElement;
    close.type = 'button';
    close.addEventListener('click', () => {
      sheet.hidden = true;
    });
    sheetInner.append(roleField, orgScopeField, orgField, warmth, open, apply, close);
    sheetInner.scrollTop = 0;
  }

  filterBtn.addEventListener('click', openFilterSheet);
  phoneFiltersBtn.addEventListener('click', openFilterSheet);

  let searchTimer = 0;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = { ...query, q: search.value };
      applyQueryToHash();
      renderDirectory();
    }, 150);
  });

  addBtn.addEventListener('click', () => {
    addHost.hidden = !addHost.hidden;
    if (!addHost.hidden && !addHost.dataset.mounted) {
      mountAddPersonForm(addHost, {
        onCreated: () => {
          void reloadDirectory();
        }
      });
      addHost.dataset.mounted = '1';
    }
  });
  addIcon.addEventListener('click', () => addBtn.click());

  const mq = window.matchMedia(PHONE_MQ);
  const onMq = () => {
    if (!isCurrent()) return;
    paintLayout();
  };
  mq.addEventListener('change', onMq);

  async function reloadDirectory(): Promise<void> {
    try {
      directory = await fetchPeopleDirectory();
      if (!isCurrent()) return;
      count.textContent = `${directory.counts.people} ${directory.counts.people === 1 ? 'person' : 'people'} · ${directory.counts.organisations} ${directory.counts.organisations === 1 ? 'organisation' : 'organisations'}`;
      if (!selectedId && directory.people[0] && !phone) {
        // Desktop: leave unselected until click — mockup shows a selection; pick first for empty hash? Plan: `#/people` is directory; selection optional.
      }
      paintLayout();
    } catch (err) {
      if (!isCurrent()) return;
      count.textContent = 'Unavailable';
      listHost.replaceChildren(
        el('p', 'people-pane__error', err instanceof Error ? err.message : 'Directory failed to load.')
      );
    }
  }

  syncControlLabels();
  await reloadDirectory();
}

/** @deprecated Use renderPeoplePage — kept for import compatibility during migration. */
export async function renderPeopleHomeView(
  canvas: HTMLElement,
  options: PeoplePageOptions = {}
): Promise<void> {
  return renderPeoplePage(canvas, options);
}
