import type { Program } from '@/schemas/program';
import {
  PROGRAM_AGE_GROUPS,
  PROGRAM_COST_BASES,
  PROGRAM_LENGTHS,
  PROGRAM_LEVELS,
  PROGRAM_MONTHS,
  PROGRAM_SUBJECTS,
  PROGRAM_TYPES
} from '@/schemas/program';
import { tasksApi } from '@/services/client-api';
import {
  queryPrograms,
  uniqueSorted,
  type ProgramFilters,
  type ProgramSort
} from '@/domain/programs';
import { hashQuery } from '@/shell/shell';
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
import { createPlusButton } from '@/views/plus-add';
import { createViewOnMap, isMappablePlace } from '../../design-kit/js/view-on-map.js';

type CatalogView = 'cards' | 'table';

interface CatalogState {
  programs: Program[];
  filters: ProgramFilters;
  sort: ProgramSort;
  view: CatalogView;
}

const SORTS: Array<{ id: ProgramSort; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'month', label: 'Month' },
  { id: 'organiser', label: 'Organiser' },
  { id: 'level', label: 'Level' },
  { id: 'cost', label: 'Cost' }
];

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
  onChange: () => void,
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
    { key: 'Subject', field: 'subject', options: optionsFrom(subjects.length ? subjects : PROGRAM_SUBJECTS, 'All subjects') },
    { key: 'Month', field: 'month', options: optionsFrom(months.length ? months : PROGRAM_MONTHS, 'All months') },
    { key: 'Year', field: 'age_group', options: optionsFrom(ages.length ? ages : PROGRAM_AGE_GROUPS, 'All years') },
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

  for (const spec of specs) {
    const filter = createHubFilter({
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
    filters.append(filter.el);
  }

  const sortPills = createHubPills({
    label: 'Sort',
    items: SORTS.map((sort) => ({ id: sort.id, label: sort.label })),
    value: state.sort,
    onSelect: (id) => {
      state.sort = id;
      onChange();
    }
  });

  const viewPills = createHubPills({
    label: 'View',
    role: 'tablist',
    items: [
      { id: 'cards', label: 'Cards' },
      { id: 'table', label: 'Table' }
    ],
    value: state.view,
    onSelect: (id) => {
      state.view = id;
      onChange();
    }
  });

  const add = createPlusButton('Add a program', onAdd);

  const collapsed = createCollapsibleFilters({
    id: 'programs',
    ariaLabel: 'Filters',
    active: Boolean(
      state.filters.query?.trim() ||
        state.filters.type ||
        state.filters.subject ||
        state.filters.month ||
        state.filters.age_group ||
        state.filters.level ||
        state.filters.length ||
        state.filters.cost_basis ||
        state.filters.nsw
    )
  });
  collapsed.panel.append(search.el, filters);
  const controls = el('div', 'catalog-toolbar__row');
  controls.append(sortPills, viewPills, add);
  wrap.append(collapsed.root, controls);
  return wrap;
}

function renderMeta(program: Program): HTMLElement {
  const meta = el('div', 'task-row__meta');
  for (const type of program.types) meta.append(chip(type));
  if (program.month) meta.append(chip(program.month, 'chip--muted'));
  if (program.cost_basis) meta.append(chip(program.cost_basis, 'chip--muted'));
  if (program.competition_level) meta.append(chip(program.competition_level, 'chip--muted'));
  if (program.not_available_nsw) meta.append(chip('Not available NSW', 'chip--muted'));
  return meta;
}

function renderCard(program: Program, onOpen: () => void): HTMLElement {
  const card = el('article', 'task-row catalog-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', program.name);
  card.append(el('h3', 'task-row__title', program.name));
  if (program.organiser) card.append(el('p', 'task-row__desc', program.organiser));
  else if (program.description) {
    card.append(el('p', 'task-row__desc', program.description));
  }
  card.append(renderMeta(program));
  const open = () => onOpen();
  card.addEventListener('click', open);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
  return card;
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

function propertyRow(label: string, value: string | HTMLElement | null | undefined): HTMLElement | null {
  if (!value || (typeof value === 'string' && !value.trim())) return null;
  const row = el('div', 'catalog-detail__row');
  row.append(el('dt', 'catalog-detail__key', label));
  if (typeof value === 'string') row.append(el('dd', 'catalog-detail__value', value));
  else {
    const dd = el('dd', 'catalog-detail__value');
    dd.append(value);
    row.append(dd);
  }
  return row;
}

function renderDetail(
  program: Program,
  overlay: HTMLElement,
  onClose: () => void,
  onDelete: () => void
): HTMLElement {
  const card = el('section', 'catalog-overlay__card task-row');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', program.name);
  card.append(el('p', 'page-header__eyebrow', program.types[0] || 'Program'));
  card.append(el('h2', 'page-header__title', program.name));
  if (program.description) card.append(el('p', 'page-header__supporting', program.description));

  const dl = el('dl', 'catalog-detail');
  const rows = [
    propertyRow('Organiser', program.organiser),
    propertyRow('Location', program.location),
    propertyRow('Month', program.month),
    propertyRow('Age group', program.age_groups.join(', ')),
    propertyRow('Subjects', program.subjects.join(', ')),
    propertyRow('Level', program.competition_level),
    propertyRow('Length', program.competition_length),
    propertyRow('Cost', [program.cost_basis, program.cost].filter(Boolean).join(' · ')),
    propertyRow('Registration window', program.registration_window),
    propertyRow(
      'NSW',
      program.not_available_nsw
        ? program.not_available_reason
          ? `Not available — ${program.not_available_reason}`
          : 'Not available'
        : 'Available'
    )
  ].filter((row): row is HTMLElement => Boolean(row));
  for (const row of rows) dl.append(row);
  card.append(dl);

  if (isMappablePlace(program.location)) {
    const map = createViewOnMap({
      locationName: program.location,
      address: program.location
    });
    if (map) card.append(map.el);
  }

  const actions = el('div', 'catalog-detail__actions');
  if (program.registration_link) {
    const link = document.createElement('a');
    link.className = 'btn btn--primary';
    link.href = program.registration_link;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Registration';
    actions.append(link);
  }
  const close = el('button', 'btn btn--ghost', 'Close');
  close.type = 'button';
  close.addEventListener('click', onClose);
  const del = el('button', 'btn btn--decisive', 'Delete');
  del.type = 'button';
  del.addEventListener('click', onDelete);
  actions.append(close, del);
  card.append(actions);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) onClose();
  });
  return card;
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
  const card = el('section', 'catalog-overlay__card task-row');
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
    level.el,
    length.el,
    costBasis.el,
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
      not_available_nsw: nsw.checked,
      not_available_reason: reason.input.value.trim()
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

function paintList(
  host: HTMLElement,
  state: CatalogState,
  overlay: HTMLElement,
  confirmHost: HTMLElement,
  reload: () => void
): void {
  host.replaceChildren();
  const items = visiblePrograms(state);
  if (!items.length) {
    host.append(el('p', 'empty-state', 'No programs match those filters.'));
    return;
  }
  const open = (program: Program) => {
    const card = renderDetail(
      program,
      overlay,
      () => session.close(),
      () => {
        session.close();
        showConfirmWrite(
          confirmHost,
          `Delete ${program.name}`,
          'Removes this catalogue entry. Tasks and excursions are untouched.',
          async () => {
            await tasksApi.deleteProgram(program.id);
            reload();
          },
          'Delete'
        );
      }
    );
    const session = openOverlay(overlay, card);
  };
  if (state.view === 'table') {
    host.append(renderTable(items, open));
    return;
  }
  const grid = el('div', 'catalog-grid');
  for (const program of items) grid.append(renderCard(program, () => open(program)));
  host.append(grid);
}

export async function renderProgramsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const programs = await tasksApi.listPrograms();
  const state: CatalogState = {
    programs,
    filters: {},
    sort: 'name',
    view: 'cards'
  };
  const overlay = el('div', 'catalog-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  const confirmHost = el('div', 'catalog-confirm');
  const list = el('div', 'catalog-list');
  const status = el('p', 'view-lede');

  const paint = () => {
    const items = visiblePrograms(state);
    status.textContent = `${items.length} of ${state.programs.length} in the catalogue.`;
    paintList(list, state, overlay, confirmHost, () => void renderProgramsView(canvas));
  };

  const toolbar = renderToolbar(
    state,
    paint,
    () => renderAddForm(overlay, confirmHost, () => void renderProgramsView(canvas))
  );
  canvas.append(status, toolbar, confirmHost, list, overlay);
  paint();

  const deepLink = hashQuery().get('id');
  if (deepLink) {
    const match = programs.find((item) => item.id === deepLink);
    if (match) {
      const card = renderDetail(
        match,
        overlay,
        () => session.close(),
        () => {
          session.close();
          showConfirmWrite(
            confirmHost,
            `Delete ${match.name}`,
            'Removes this catalogue entry. Tasks and excursions are untouched.',
            async () => {
              await tasksApi.deleteProgram(match.id);
              void renderProgramsView(canvas);
            },
            'Delete'
          );
        }
      );
      const session = openOverlay(overlay, card);
    }
  }
}
