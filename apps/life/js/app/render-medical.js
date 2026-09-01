import { formatDisplayDate } from '../core/time.js';
import { createHubFilter } from '../../../../packages/design-kit/js/hub-filter-menu.js';

const filterCache = new WeakMap();

export function renderMedical(root, model, {
  onSelect,
  onSearch,
  onTypeChange,
  onProviderChange,
  onDensityChange,
  onToggleYear,
  onToday,
  onAdd,
  onClose,
  onEdit,
  onSave,
  onCancel,
  renderLabSnapshot
} = {}) {
  const dashboard = root.querySelector('#body-medical-dashboard');
  if (!dashboard || !model) return;

  bindOnce(root, '#medical-search', 'input', event => onSearch?.(event.target.value));
  bindOnce(root, '#medical-density', 'click', event => {
    const target = event.target;
    const btn = target?.closest?.('[data-medical-density]')
      || (target?.dataset?.medicalDensity ? target : null);
    const value = btn?.dataset?.medicalDensity;
    if (value) onDensityChange?.(value);
  });
  bindOnce(root, '#medical-today', 'click', () => onToday?.());
  bindOnce(root, '#medical-add', 'click', () => onAdd?.());
  bindOnce(root, '#medical-sheet-close', 'click', () => onClose?.());

  const search = root.querySelector('#medical-search');
  if (search && search.value !== model.query) search.value = model.query ?? '';
  paintFilters(root, model, { onTypeChange, onProviderChange });
  paintDensity(root, model.density);

  renderChips(root, model, { onSearch, onTypeChange, onProviderChange });
  renderEmpty(root, model);
  renderTimeline(root, model, { onSelect, onToggleYear });
  renderSheet(root, model, { onEdit, onSave, onCancel, onClose, renderLabSnapshot });
  dashboard.hidden = false;
  dashboard.removeAttribute?.('hidden');
}

function bindOnce(root, selector, type, handler) {
  const node = root.querySelector(selector);
  if (!node || node.dataset.bound) return;
  node.dataset.bound = '1';
  node.addEventListener(type, handler);
}

function canUseKitFilter() {
  try {
    return typeof document !== 'undefined'
      && typeof document.createElement === 'function'
      && !!document.body;
  } catch {
    return false;
  }
}

function paintFilters(root, model, { onTypeChange, onProviderChange }) {
  let cache = filterCache.get(root);
  if (!cache) {
    cache = {};
    filterCache.set(root, cache);
  }
  cache.type = ensureFilter(root, root.querySelector('#medical-type-host'), cache.type, {
    key: 'Type',
    label: 'Medical type',
    options: [
      { value: '', label: 'All types' },
      ...model.recordTypes.map(value => ({ value, label: value }))
    ],
    value: model.recordType ?? '',
    onChange: onTypeChange
  });
  cache.provider = ensureFilter(root, root.querySelector('#medical-provider-host'), cache.provider, {
    key: 'Practitioner',
    label: 'Practitioner',
    options: [
      { value: '', label: 'All practitioners' },
      ...model.providers.map(value => ({ value, label: value }))
    ],
    value: model.provider ?? '',
    onChange: onProviderChange
  });
}

function ensureFilter(root, host, existing, config) {
  if (!host) return existing ?? null;
  if (existing?.setOptions) {
    existing.setOptions(config.options, config.value);
    return existing;
  }
  if (canUseKitFilter()) {
    const filter = createHubFilter(config);
    host.replaceChildren(filter.el);
    return filter;
  }
  host.replaceChildren();
  const btn = root.createElement('button');
  btn.type = 'button';
  btn.className = 'hub-filter';
  btn.setAttribute('aria-label', config.label);
  const current = config.options.find(option => option.value === config.value) ?? config.options[0];
  btn.textContent = current?.label ?? config.key;
  host.append(btn);
  return { setOptions() {}, setValue() {} };
}

function paintDensity(root, density) {
  const host = root.querySelector('#medical-density');
  if (!host) return;
  const buttons = host.querySelectorAll?.('[data-medical-density]') ?? host.children ?? [];
  for (const btn of buttons) {
    const on = btn.dataset?.medicalDensity === density;
    btn.classList?.toggle?.('is-active', on);
    btn.setAttribute?.('aria-pressed', on ? 'true' : 'false');
  }
}

function renderChips(root, model, { onSearch, onTypeChange, onProviderChange } = {}) {
  const host = root.querySelector('#medical-chips');
  if (!host) return;
  host.replaceChildren();
  const chips = [];
  if (model.query) chips.push({ key: 'query', label: `“${model.query}”`, clear: () => onSearch?.('') });
  if (model.recordType) chips.push({ key: 'type', label: model.recordType, clear: () => onTypeChange?.('') });
  if (model.provider) chips.push({ key: 'provider', label: model.provider, clear: () => onProviderChange?.('') });
  for (const item of chips) {
    const chip = root.createElement('button');
    chip.type = 'button';
    chip.className = 'hub-chip is-active';
    chip.dataset.clear = item.key;
    chip.textContent = item.label;
    chip.addEventListener('click', () => item.clear());
    host.append(chip);
  }
}

function renderEmpty(root, model) {
  const empty = root.querySelector('#medical-empty');
  if (!empty) return;
  if (model.count) {
    empty.hidden = true;
    empty.textContent = '';
    return;
  }
  empty.hidden = false;
  empty.textContent = model.query || model.recordType || model.provider
    ? 'No visits match.'
    : 'No visits yet.';
}

function renderTimeline(root, model, { onSelect, onToggleYear } = {}) {
  const host = root.querySelector('#medical-timeline');
  if (!host) return;
  host.className = `medical-timeline is-density-${model.density}`;
  host.replaceChildren();
  for (const item of model.items) appendTimelineItem(root, host, item, model.selected, { onSelect, onToggleYear });
}

function appendTimelineItem(root, host, item, selected, hooks) {
  if (item.kind === 'today') {
    const marker = root.createElement('div');
    marker.className = 'medical-today';
    marker.textContent = 'Today';
    host.append(marker);
    return;
  }
  if (item.kind === 'heading') {
    const heading = root.createElement('p');
    heading.className = 'medical-heading';
    heading.textContent = item.label;
    host.append(heading);
    return;
  }
  if (item.kind === 'year') {
    host.append(yearRow(root, item, selected, hooks));
    return;
  }
  if (item.kind === 'band') {
    host.append(bandBlock(root, item, selected, hooks.onSelect));
    return;
  }
  if (item.kind === 'visit' && item.visit) {
    host.append(visitCard(root, item.visit, selected, hooks.onSelect));
  }
}

function yearRow(root, item, selected, { onSelect, onToggleYear }) {
  const wrap = root.createElement('div');
  wrap.className = item.expanded ? 'medical-year is-open' : 'medical-year';
  wrap.dataset.year = item.year;
  wrap.setAttribute('data-year', item.year);

  const btn = root.createElement('button');
  btn.type = 'button';
  btn.className = 'medical-year__toggle';
  btn.dataset.year = item.year;
  btn.setAttribute('data-year', item.year);
  btn.setAttribute('aria-expanded', item.expanded ? 'true' : 'false');
  const title = root.createElement('strong');
  title.className = 'medical-year__label';
  title.textContent = item.year;
  const caption = root.createElement('span');
  caption.className = 'medical-year__caption';
  caption.textContent = item.caption || (item.count === 1 ? '1 visit' : `${item.count} visits`);
  btn.append(title, caption);
  btn.addEventListener('click', () => onToggleYear?.(item.year));
  wrap.append(btn);

  if (item.expanded && item.items?.length) {
    const nest = root.createElement('div');
    nest.className = 'medical-year__items';
    for (const child of item.items) appendTimelineItem(root, nest, child, selected, { onSelect, onToggleYear });
    wrap.append(nest);
  }
  return wrap;
}

function bandBlock(root, item, selected, onSelect) {
  const wrap = root.createElement('div');
  wrap.className = 'medical-band';
  const title = root.createElement('p');
  title.className = 'medical-band__title';
  title.textContent = item.episode.title;
  wrap.append(title);
  for (const visit of item.visits) wrap.append(visitCard(root, visit, selected, onSelect));
  return wrap;
}

function visitCard(root, visit, selected, onSelect) {
  const card = root.createElement('button');
  card.type = 'button';
  card.className = 'medical-card';
  card.dataset.visitId = visit.id;
  card.dataset.lane = visit.lane;
  card.setAttribute('data-visit-id', visit.id);
  card.setAttribute('data-lane', visit.lane);
  if (selected?.id === visit.id) card.classList.add('is-selected');
  card.addEventListener('click', () => onSelect?.(visit.id));

  const title = root.createElement('strong');
  title.className = 'medical-card__title';
  title.textContent = visit.title;
  const meta = root.createElement('span');
  meta.className = 'medical-card__meta';
  meta.textContent = [visit.displayDate || formatDisplayDate(visit.date), visit.provider || visit.location || visit.record_type]
    .filter(Boolean)
    .join(' · ');
  card.append(title, meta);

  if (visit.lab) {
    const chips = root.createElement('div');
    chips.className = 'medical-card__labs';
    const inRange = root.createElement('span');
    inRange.className = 'bloods-flag';
    inRange.textContent = `${visit.lab.inRange} in`;
    chips.append(inRange);
    for (const flag of visit.lab.flags.slice(0, 3)) {
      const chip = root.createElement('span');
      chip.className = 'bloods-flag';
      chip.dataset.status = flag.status;
      chip.textContent = `${flag.label} ${flag.status}`;
      chips.append(chip);
    }
    card.append(chips);
  }
  return card;
}

function renderSheet(root, model, hooks) {
  const host = root.querySelector('#medical-sheet');
  if (!host) return;
  host.replaceChildren();
  const visit = model.selected;
  if (!visit && model.mode !== 'write') {
    host.hidden = true;
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'Select a visit.';
    host.append(empty);
    return;
  }
  host.hidden = false;
  host.className = 'medical-sheet';

  if (model.mode === 'write') {
    host.append(writeForm(root, model.draft || visit, hooks));
    return;
  }

  const kicker = root.createElement('p');
  kicker.className = 'metric-label';
  kicker.textContent = 'Medical overview';
  const title = root.createElement('h2');
  title.textContent = visit.title;
  const meta = root.createElement('p');
  meta.className = 'metric-caption';
  meta.textContent = [visit.displayDate, visit.record_type, visit.provider].filter(Boolean).join(' · ');
  host.append(kicker, title, meta);

  if (visit.notes) {
    const notes = root.createElement('p');
    notes.className = 'medical-sheet__notes';
    notes.textContent = visit.notes;
    host.append(notes);
  }
  addLine(root, host, 'Follow-up', visit.follow_up_date ? formatDisplayDate(visit.follow_up_date) : null);
  addLine(root, host, 'Cost', visit.cost_aud != null ? `A$${visit.cost_aud}` : null);
  addLine(root, host, 'Insurance', visit.insurance_status);

  if (visit.location_kind === 'place' && visit.mapsUrl) {
    const link = root.createElement('a');
    link.className = 'medical-sheet__map';
    link.href = visit.mapsUrl;
    link.setAttribute('href', visit.mapsUrl);
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = visit.location;
    host.append(link);
  } else if (visit.location) {
    addLine(root, host, 'Location', visit.location);
  }

  if (visit.lab) {
    const labHost = root.createElement('div');
    labHost.id = 'medical-bloods-host';
    labHost.className = 'medical-sheet__labs';
    host.append(labHost);
    hooks.renderLabSnapshot?.(labHost, visit);
  }

  const edit = root.createElement('button');
  edit.type = 'button';
  edit.className = 'btn btn--secondary';
  edit.textContent = 'Edit';
  edit.addEventListener('click', () => hooks.onEdit?.(visit));
  host.append(edit);
}

function addLine(root, host, label, value) {
  if (!value) return;
  const line = root.createElement('p');
  line.className = 'medical-sheet__line';
  line.textContent = `${label}: ${value}`;
  host.append(line);
}

function writeForm(root, draft, hooks) {
  const form = root.createElement('form');
  form.className = 'medical-form';
  form.addEventListener('submit', event => {
    event.preventDefault?.();
    hooks.onSave?.(readDraft(form));
  });
  const title = field(root, 'title', 'Title', draft?.title ?? '');
  const date = field(root, 'date', 'Date', draft?.date ?? '', 'date');
  const type = field(root, 'record_type', 'Type', draft?.record_type ?? 'Appointment');
  const provider = field(root, 'provider', 'Provider', draft?.provider ?? '');
  const location = field(root, 'location', 'Location', draft?.location ?? '');
  const notes = field(root, 'notes', 'Overview', draft?.notes ?? '', 'textarea');
  const actions = root.createElement('div');
  actions.className = 'medical-form__actions';
  const save = root.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = 'Save';
  const cancel = root.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => hooks.onCancel?.());
  actions.append(save, cancel);
  form.append(title, date, type, provider, location, notes, actions);
  return form;
}

function field(root, name, label, value, kind = 'text') {
  const wrap = root.createElement('label');
  wrap.className = 'medical-form__field';
  const caption = root.createElement('span');
  caption.textContent = label;
  const input = root.createElement(kind === 'textarea' ? 'textarea' : 'input');
  if (kind !== 'textarea') input.type = kind;
  input.name = name;
  input.value = value ?? '';
  wrap.append(caption, input);
  wrap._input = input;
  wrap.dataset.field = name;
  return wrap;
}

function readDraft(form) {
  const draft = {};
  for (const child of form.children ?? []) {
    if (child.dataset?.field && child._input) draft[child.dataset.field] = child._input.value;
  }
  return draft;
}
