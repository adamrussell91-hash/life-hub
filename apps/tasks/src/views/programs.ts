import type { Program } from '@/schemas/program';
import type { Project } from '@/schemas/project';
import {
  PROGRAM_AGE_GROUPS,
  PROGRAM_COST_BASES,
  PROGRAM_ENTRIES,
  PROGRAM_ENTRY_ROUTES,
  PROGRAM_FORMATS,
  PROGRAM_LENGTHS,
  PROGRAM_LEVELS,
  PROGRAM_MONTHS,
  PROGRAM_PROVIDERS,
  PROGRAM_SETTINGS,
  PROGRAM_SUBJECTS,
  PROGRAM_TYPES
} from '@/schemas/program';
import { tasksApi } from '@/services/client-api';
import { parseHubPrefs, type SchoolYearTerms } from '@/domain/hub-prefs';
import {
  cataloguePlatforms,
  catalogueTimetable,
  itemStart,
  type PlatformGroup,
  type TimetableRows
} from '@/domain/catalogue-network';
import { catalogueItem, type LineItem } from '@/personal-line/model';
import { createDepartureCard } from '@/personal-line/render';
import { renderPlatforms, renderTimetable } from '@/views/programs-network';
import { lineTerms } from '@/views/personal-line';
import '@/personal-line/personal-line.css';
import '@/views/programs-network.css';
import {
  queryPrograms,
  uniqueSorted,
  type ProgramFilters,
  type ProgramSort
} from '@/domain/programs';
import { hashQuery } from '@/shell/shell';
import { projectPageHash } from '@/domain/cards';
import { showConfirmWrite } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubSearch,
  createHubTextarea,
  el,
  optionList
} from '@/views/hub-kit';

const SORT_OPTIONS: Array<{ value: ProgramSort; label: string }> = [
  { value: 'name', label: 'Title' },
  { value: 'month', label: 'Month' },
  { value: 'length', label: 'Length' },
  { value: 'organiser', label: 'Organiser' },
  { value: 'level', label: 'Level' },
  { value: 'cost', label: 'Cost' }
];
import { createPlusButton } from '@/views/plus-add';
import { createViewOnMap, isMappablePlace } from '../../design-kit/js/view-on-map.js';

type CatalogView = 'platforms' | 'timetable' | 'table';

interface CatalogState {
  programs: Program[];
  filters: ProgramFilters;
  sort: ProgramSort;
  view: CatalogView;
  group: PlatformGroup;
  rowsBy: TimetableRows;
}

/** The year level picked in the Year filter, as a number ("Year 10" → 10). */
function chosenYear(state: CatalogState): number | null {
  const year = Number((state.filters.age_group ?? '').replace(/^Year\s+/i, ''));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function allOption(label: string): { value: string; label: string } {
  return { value: '', label };
}

function optionsFrom(values: readonly string[] | string[], all: string) {
  return [allOption(all), ...values.map((value) => ({ value, label: value }))];
}

function chip(text: string, extra = ''): HTMLElement {
  return el('span', extra ? `chip ${extra}` : 'chip', text);
}

function visiblePrograms(state: CatalogState): Program[] {
  return queryPrograms(state.programs, state.filters, state.sort);
}

function renderToolbar(
  state: CatalogState,
  onChange: (rebuildToolbar?: boolean) => void,
  onAdd: () => void
): HTMLElement {
  const wrap = el('div', 'catalog-toolbar');
  const search = createHubSearch({
    placeholder: 'Search name, organiser, subject…',
    ariaLabel: 'Search programs',
    value: state.filters.query ?? '',
    onInput: (value) => {
      state.filters.query = value;
      onChange();
    }
  });

  const filters = el('div', 'catalog-filters');
  const subjects = uniqueSorted(state.programs.flatMap((item) => item.subjects));
  const types = uniqueSorted([
    ...PROGRAM_TYPES,
    ...state.programs.flatMap((item) => item.types)
  ]);
  const months = PROGRAM_MONTHS.filter((month) =>
    state.programs.some((item) => item.month === month)
  );
  const ages = PROGRAM_AGE_GROUPS.filter((age) =>
    state.programs.some((item) => item.age_groups.includes(age))
  );
  const levels = uniqueSorted(state.programs.map((item) => item.competition_level ?? ''));
  const lengths = uniqueSorted(state.programs.map((item) => item.competition_length ?? ''));
  const costs = uniqueSorted(state.programs.map((item) => item.cost_basis ?? ''));

  const specs: Array<{
    key: string;
    field: keyof ProgramFilters;
    options: Array<{ value: string; label: string }>;
  }> = [
    { key: 'Type', field: 'type', options: optionsFrom(types, 'All types') },
    { key: 'Format', field: 'format', options: optionsFrom(PROGRAM_FORMATS, 'All formats') },
    { key: 'Month', field: 'month', options: optionsFrom(months.length ? months : PROGRAM_MONTHS, 'All months') },
    { key: 'Level', field: 'level', options: optionsFrom(levels.length ? levels : PROGRAM_LEVELS, 'All levels') },
    { key: 'Length', field: 'length', options: optionsFrom(lengths.length ? lengths : PROGRAM_LENGTHS, 'All lengths') },
    { key: 'Cost', field: 'cost_basis', options: optionsFrom(costs.length ? costs : PROGRAM_COST_BASES, 'All costs') },
    {
      key: 'NSW',
      field: 'nsw',
      options: [
        { value: '', label: 'All NSW' },
        { value: 'available', label: 'Available' },
        { value: 'unavailable', label: 'Not available' }
      ]
    }
  ];

  const makeFilter = (spec: (typeof specs)[number]) =>
    createHubFilter({
      key: spec.key,
      label: spec.key,
      defaultValue: '',
      options: spec.options,
      value: String(state.filters[spec.field] ?? ''),
      onChange: (value: string) => {
        if (spec.field === 'nsw') {
          state.filters.nsw = (value as ProgramFilters['nsw']) || '';
        } else {
          state.filters[spec.field] = value;
        }
        onChange();
      }
    });
  for (const spec of specs) filters.append(makeFilter(spec).el);
  const visible = el('div', 'catalog-toolbar__visible');
  visible.append(
    makeFilter({ key: 'Year', field: 'age_group', options: optionsFrom(ages.length ? ages : PROGRAM_AGE_GROUPS, 'All years') }).el,
    makeFilter({ key: 'Subject', field: 'subject', options: optionsFrom(subjects.length ? subjects : PROGRAM_SUBJECTS, 'All subjects') }).el
  );

  const sortBy = createHubFilter({
    key: 'Sort by',
    label: 'Sort by',
    defaultValue: 'name',
    options: SORT_OPTIONS,
    value: state.sort,
    onChange: (value) => {
      state.sort = (value as ProgramSort) || 'name';
      onChange();
    }
  });

  const viewPills = createHubPills<CatalogView>({
    label: 'View',
    role: 'tablist',
    items: [
      { id: 'platforms', label: 'Platforms' },
      { id: 'timetable', label: 'Timetable' },
      { id: 'table', label: 'Table' }
    ],
    value: state.view,
    onSelect: (id) => {
      state.view = id;
      onChange(true);
    }
  });

  const groupBy =
    state.view === 'platforms'
      ? createHubFilter({
          key: 'Group by',
          label: 'Group by',
          defaultValue: 'line',
          options: [
            { value: 'line', label: 'Line' },
            { value: 'format', label: 'Format' }
          ],
          value: state.group,
          onChange: (value) => {
            state.group = value === 'format' ? 'format' : 'line';
            onChange();
          }
        }).el
      : state.view === 'timetable'
        ? createHubFilter({
            key: 'Rows by',
            label: 'Rows by',
            defaultValue: 'format',
            options: [
              { value: 'format', label: 'Format' },
              { value: 'line', label: 'Line' },
              { value: 'none', label: 'None' }
            ],
            value: state.rowsBy,
            onChange: (value) => {
              state.rowsBy = value === 'line' || value === 'none' ? value : 'format';
              onChange();
            }
          }).el
        : null;

  const add = createPlusButton('Add a program', onAdd);

  const collapsed = createCollapsibleFilters({
    id: 'programs',
    ariaLabel: 'Filters',
    active: Boolean(
      state.filters.type ||
        state.filters.format ||
        state.filters.month ||
        state.filters.level ||
        state.filters.length ||
        state.filters.cost_basis ||
        state.filters.nsw
    )
  });
  collapsed.panel.append(filters);
  const searchRow = el('div', 'catalog-toolbar__row');
  searchRow.append(search.el, collapsed.root);
  const controls = el('div', 'catalog-toolbar__row catalog-toolbar__row--controls');
  controls.append(viewPills, ...visible.childNodes);
  if (groupBy) controls.append(groupBy);
  controls.append(sortBy.el, add);
  wrap.append(searchRow, controls);
  return wrap;
}

function renderTable(programs: Program[], onOpen: (program: Program) => void): HTMLElement {
  const table = el('table', 'catalog-table');
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  for (const label of ['Name', 'Type', 'Month', 'Years', 'Level', 'Cost']) {
    header.append(el('th', undefined, label));
  }
  head.append(header);
  const body = document.createElement('tbody');
  for (const program of programs) {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.append(el('td', undefined, program.name));
    row.append(el('td', undefined, program.types.join(', ') || '—'));
    row.append(el('td', undefined, program.month || '—'));
    row.append(el('td', undefined, program.age_groups.join(', ') || '—'));
    row.append(el('td', undefined, program.competition_level || '—'));
    row.append(el('td', undefined, program.cost_basis || program.cost || '—'));
    const open = () => onOpen(program);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function renderLinkedExcursions(
  program: Program,
  excursions: Project[],
  onChange: (patch: { excursionId: string; linked: boolean }) => void
): HTMLElement {
  const host = el('section', 'catalog-links');
  host.append(el('p', 'page-header__eyebrow', 'Linked excursions'));

  const linked = excursions.filter((item) => item.linked_program_id === program.id);
  const unlinked = excursions.filter(
    (item) => item.type === 'excursion' && item.linked_program_id !== program.id
  );

  const list = el('ul', 'catalog-links__list');
  if (!linked.length) {
    list.append(el('li', 'empty-state empty-state--compact', 'No excursions linked yet.'));
  } else {
    for (const excursion of linked) {
      const item = el('li', 'catalog-links__item');
      const link = document.createElement('a');
      link.href = projectPageHash(excursion.id);
      link.textContent = excursion.title;
      const unlink = el('button', 'btn btn--ghost', 'Unlink');
      unlink.type = 'button';
      unlink.addEventListener('click', () => onChange({ excursionId: excursion.id, linked: false }));
      item.append(link, unlink);
      list.append(item);
    }
  }
  host.append(list);

  if (unlinked.length) {
    const picker = createHubFilter({
      key: 'Link excursion',
      label: 'Link excursion',
      defaultValue: '',
      options: [
        { value: '', label: 'Choose an excursion…' },
        ...unlinked.map((item) => ({ value: item.id, label: item.title }))
      ],
      value: '',
      onChange: (value) => {
        if (!value) return;
        onChange({ excursionId: value, linked: true });
      }
    });
    const pickerRow = el('div', 'catalog-links__picker');
    pickerRow.append(picker.el);
    host.append(pickerRow);
  }

  return host;
}

/** Hub-only extras under the departure card: linked excursions, map, delete. */
function cardExtras(
  program: Program,
  excursions: Project[],
  close: () => void,
  onDelete: () => void,
  onLinkChange: (patch: { excursionId: string; linked: boolean }) => void
): HTMLElement[] {
  const extra = el('div', 'pl-card__extra');
  extra.append(renderLinkedExcursions(program, excursions, onLinkChange));
  if (isMappablePlace(program.location)) {
    const map = createViewOnMap({ locationName: program.location, address: program.location });
    if (map) extra.append(map.el);
  }
  const actions = el('div', 'pl-card__foot');
  const del = el('button', 'pl-btn', 'Delete');
  del.type = 'button';
  del.addEventListener('click', () => {
    close();
    onDelete();
  });
  actions.append(del);
  extra.append(actions);
  return [extra];
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('div', 'catalog-form__field');
  wrap.append(el('span', 'catalog-form__label', label), control);
  return wrap;
}

function selectControl(key: string, options: readonly string[], value = '') {
  return createHubFilter({
    key,
    label: key,
    defaultValue: '',
    options: optionList(options, { value: '', label: '—' }),
    value
  });
}

function chipPicker(values: readonly string[]): { el: HTMLElement; get: () => string[] } {
  const selected = new Set<string>();
  const wrap = el('div', 'hub-chips');
  for (const value of values) {
    const btn = el('button', 'hub-chip', value);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      btn.classList.toggle('is-active', selected.has(value));
    });
    wrap.append(btn);
  }
  return { el: wrap, get: () => [...selected] };
}

function openOverlay(host: HTMLElement, content: HTMLElement): { close: () => void } {
  host.replaceChildren();
  host.className = 'catalog-overlay is-open';
  host.setAttribute('aria-hidden', 'false');
  host.append(content);
  const previous = document.activeElement;
  const focusable = content.querySelector<HTMLElement>('button, a, input, select, textarea');
  focusable?.focus();
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    host.classList.remove('is-open');
    host.setAttribute('aria-hidden', 'true');
    host.replaceChildren();
    if (previous instanceof HTMLElement) previous.focus();
  };
  return { close };
}

function renderAddForm(
  overlay: HTMLElement,
  confirmHost: HTMLElement,
  onCreated: () => void
): void {
  const card = el('section', 'catalog-overlay__card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Add program');
  card.append(el('p', 'page-header__eyebrow', 'New'));
  card.append(el('h2', 'page-header__title', 'Add a program'));
  card.append(
    el('p', 'page-header__supporting', 'Same properties as the competitions catalogue. Confirm before it is saved.')
  );

  const name = createHubField({ ariaLabel: 'Name', required: true });
  const organiser = createHubField({ ariaLabel: 'Organiser' });
  const location = createHubField({ ariaLabel: 'Location' });
  const cost = createHubField({ ariaLabel: 'Cost' });
  const registrationWindow = createHubField({ ariaLabel: 'Registration window' });
  const link = createHubField({ type: 'url', ariaLabel: 'Registration link' });
  const startsOn = createHubField({ type: 'date', ariaLabel: 'Starts' });
  const endsOn = createHubField({ type: 'date', ariaLabel: 'Ends' });
  const description = createHubTextarea({
    ariaLabel: 'Description',
    className: 'task-editor__notes'
  });
  const reason = createHubField({ ariaLabel: 'Not available reason' });
  const type = selectControl('Type', PROGRAM_TYPES, 'Competition');
  const month = selectControl('Month', PROGRAM_MONTHS);
  const level = selectControl('Level', PROGRAM_LEVELS);
  const length = selectControl('Length', PROGRAM_LENGTHS);
  const costBasis = selectControl('Cost', PROGRAM_COST_BASES);
  const format = selectControl('Format', PROGRAM_FORMATS);
  const provider = selectControl('Run by', PROGRAM_PROVIDERS);
  const entry = selectControl('Entry', PROGRAM_ENTRIES);
  const entryRoute = selectControl('How to enter', PROGRAM_ENTRY_ROUTES);
  const settings = chipPicker(PROGRAM_SETTINGS);
  const subjects = chipPicker(PROGRAM_SUBJECTS);
  const ages = chipPicker(PROGRAM_AGE_GROUPS);
  const nsw = document.createElement('input');
  nsw.type = 'checkbox';
  nsw.className = 'catalog-form__check';

  const form = el('form', 'catalog-form');
  form.append(
    field('Name', name.el),
    type.el,
    month.el,
    field('Starts', startsOn.el),
    field('Ends', endsOn.el),
    level.el,
    length.el,
    costBasis.el,
    format.el,
    provider.el,
    entry.el,
    entryRoute.el,
    field('Where', settings.el),
    field('Organiser', organiser.el),
    field('Location', location.el),
    field('Cost', cost.el),
    field('Registration window', registrationWindow.el),
    field('Registration link', link.el),
    field('Subjects', subjects.el),
    field('Age groups', ages.el),
    field('Description', description.el),
    field('Not available in NSW', nsw),
    field('Not available reason', reason.el)
  );

  const actions = el('div', 'catalog-detail__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const submit = el('button', 'btn btn--primary', 'Review');
  submit.type = 'submit';
  actions.append(cancel, submit);
  form.append(actions);
  card.append(form);

  const session = openOverlay(overlay, card);
  cancel.addEventListener('click', session.close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) session.close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!name.input.value.trim()) {
      name.input.focus();
      return;
    }
    session.close();
    const start = startsOn.input.value || null;
    const end = endsOn.input.value || null;
    const dated = Boolean(start && end && end >= start);
    const draft: Partial<Program> & { name: string } = {
      name: name.input.value.trim(),
      types: type.getValue() ? [type.getValue()] : [],
      subjects: subjects.get(),
      month: month.getValue() || null,
      age_groups: ages.get(),
      competition_level: level.getValue() || null,
      competition_length: length.getValue() || null,
      location: location.input.value.trim(),
      organiser: organiser.input.value.trim(),
      cost: cost.input.value.trim(),
      cost_basis: costBasis.getValue() || null,
      description: description.input.value.trim(),
      registration_link: link.input.value.trim() || null,
      registration_window: registrationWindow.input.value.trim(),
      format: (format.getValue() || null) as Program['format'],
      provider: (provider.getValue() || null) as Program['provider'],
      settings: settings.get() as Program['settings'],
      entry: (entry.getValue() || null) as Program['entry'],
      entry_route: (entryRoute.getValue() || null) as Program['entry_route'],
      not_available_nsw: nsw.checked,
      not_available_reason: reason.input.value.trim(),
      starts_on: dated ? start : null,
      ends_on: dated ? end : null
    };
    const kind = draft.types?.[0];
    showConfirmWrite(
      confirmHost,
      `Add ${draft.name}`,
      `Creates a catalogue entry${kind ? ` as a ${kind.toLowerCase()}` : ''}.`,
      async () => {
        await tasksApi.createProgram(draft);
        onCreated();
      }
    );
  });
}

async function applyLinkChange(
  program: Program,
  patch: { excursionId: string; linked: boolean },
  reload: () => void
): Promise<void> {
  await tasksApi.updateProject(patch.excursionId, {
    linked_program_id: patch.linked ? program.id : null
  });
  reload();
}

type CardHandle = ReturnType<typeof createDepartureCard>;

function paintList(
  host: HTMLElement,
  state: CatalogState,
  context: { card: CardHandle; terms: (year: number) => ReturnType<typeof lineTerms> }
): void {
  host.replaceChildren();
  const items = visiblePrograms(state);
  const studentYear = chosenYear(state);
  const onOpen = (item: LineItem, from: HTMLElement) => context.card.open(item, from);
  const today = new Date().toISOString().slice(0, 10);
  if (state.view === 'table') {
    if (!items.length) {
      host.append(el('p', 'empty-state', 'No programs match those filters.'));
      return;
    }
    host.append(renderTable(items, (program) => context.card.open(catalogueItem(program))));
    return;
  }
  if (state.view === 'timetable') {
    const year = new Date().getFullYear();
    renderTimetable(host, catalogueTimetable(items, state.rowsBy, year), {
      studentYear,
      onOpen,
      year,
      terms: context.terms(year),
      today
    });
    return;
  }
  renderPlatforms(host, cataloguePlatforms(items, state.group, today), { studentYear, onOpen });
}

export async function renderProgramsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const [programs, projects, prefs] = await Promise.all([
    tasksApi.listPrograms(),
    tasksApi.listProjects().catch(() => [] as Project[]),
    tasksApi.getHubPrefs().then(parseHubPrefs).catch(() => null)
  ]);
  const termYears: readonly SchoolYearTerms[] | null = prefs?.school_terms ?? null;
  const excursions = projects.filter((item) => item.type === 'excursion');
  const state: CatalogState = {
    programs,
    filters: {},
    sort: 'name',
    view: 'platforms',
    group: 'line',
    rowsBy: 'format'
  };
  const overlay = el('div', 'catalog-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  const confirmHost = el('div', 'catalog-confirm');
  const list = el('div', 'catalog-list');
  const status = el('p', 'view-lede');
  const reload = () => void renderProgramsView(canvas);
  const byId = new Map(programs.map((program) => [program.id, program]));

  const card = createDepartureCard({
    studentYear: null,
    nextTitle: 'Next on this line',
    following: (it) => {
      const line = it.on[0];
      const start = itemStart(it) ?? '';
      return visiblePrograms(state)
        .map((program) => catalogueItem(program))
        .filter((other) => other.id !== it.id && (line ? other.on.includes(line) : !other.on.length))
        .filter((other) => (itemStart(other) ?? '') > start)
        .sort((x, y) => (itemStart(x) ?? '').localeCompare(itemStart(y) ?? ''))
        .slice(0, 2);
    },
    extras: (it, close) => {
      const program = byId.get(it.id);
      if (!program) return [];
      return cardExtras(
        program,
        excursions,
        close,
        () =>
          showConfirmWrite(
            confirmHost,
            `Delete ${program.name}`,
            'Removes this catalogue entry. Tasks and excursions are untouched.',
            async () => {
              await tasksApi.deleteProgram(program.id);
              reload();
            },
            'Delete'
          ),
        (patch) => void applyLinkChange(program, patch, reload)
      );
    }
  });

  let toolbar: HTMLElement;
  const paint = (rebuildToolbar = false) => {
    if (rebuildToolbar) {
      const next = renderToolbar(state, paint, onAdd);
      toolbar.replaceWith(next);
      toolbar = next;
    }
    const items = visiblePrograms(state);
    status.textContent = `${items.length} of ${state.programs.length} in the catalogue.`;
    paintList(list, state, { card, terms: (year) => lineTerms(year, termYears) });
  };
  const onAdd = () => renderAddForm(overlay, confirmHost, reload);
  toolbar = renderToolbar(state, paint, onAdd);
  canvas.append(status, toolbar, confirmHost, list, overlay, card.scrim);
  paint();

  const deepLink = hashQuery().get('id');
  const match = deepLink ? byId.get(deepLink) : undefined;
  if (match) card.open(catalogueItem(match));
}
