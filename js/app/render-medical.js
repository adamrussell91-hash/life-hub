import { formatDisplayDate } from '../core/time.js';

const DENSITY_VALUES = ['weeks', 'months', 'years'];

export function renderMedical(root, model, {
  onSelect,
  onSearch,
  onTypeChange,
  onProviderChange,
  onDensityChange,
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
  bindOnce(root, '#medical-type', 'change', event => onTypeChange?.(event.target.value));
  bindOnce(root, '#medical-provider', 'change', event => onProviderChange?.(event.target.value));
  bindOnce(root, '#medical-density', 'input', event => {
    const index = Number(event.target.value);
    onDensityChange?.(DENSITY_VALUES[index] ?? 'months');
  });
  bindOnce(root, '#medical-today', 'click', () => onToday?.());
  bindOnce(root, '#medical-add', 'click', () => onAdd?.());
  bindOnce(root, '#medical-sheet-close', 'click', () => onClose?.());

  const search = root.querySelector('#medical-search');
  if (search && search.value !== model.query) search.value = model.query ?? '';
  fillSelect(root.querySelector('#medical-type'), ['', ...model.recordTypes], model.recordType, 'All types');
  fillSelect(root.querySelector('#medical-provider'), ['', ...model.providers], model.provider, 'All practitioners');
  const density = root.querySelector('#medical-density');
  if (density) density.value = String(Math.max(0, DENSITY_VALUES.indexOf(model.density)));

  renderChips(root, model);
  renderEmpty(root, model);
  renderTimeline(root, model, onSelect);
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

function fillSelect(select, values, current, allLabel) {
  if (!select) return;
  select.replaceChildren();
  const createOption = select.ownerDocument?.createElement?.bind(select.ownerDocument);
  for (const value of values) {
    const option = createOption ? createOption('option') : {
      value: '',
      textContent: '',
      tagName: 'OPTION',
      children: [],
      append() {},
      setAttribute() {}
    };
    option.value = value;
    option.textContent = value || allLabel;
    if (value === (current ?? '')) option.selected = true;
    select.append(option);
  }
  select.value = current ?? '';
}

function renderChips(root, model) {
  const host = root.querySelector('#medical-chips');
  if (!host) return;
  host.replaceChildren();
  const chips = [];
  if (model.query) chips.push(`“${model.query}”`);
  if (model.recordType) chips.push(model.recordType);
  if (model.provider) chips.push(model.provider);
  for (const label of chips) {
    const chip = root.createElement('span');
    chip.className = 'hub-chip';
    chip.textContent = label;
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

function renderTimeline(root, model, onSelect) {
  const host = root.querySelector('#medical-timeline');
  if (!host) return;
  host.className = `medical-timeline is-density-${model.density}`;
  host.replaceChildren();
  for (const item of model.items) {
    if (item.kind === 'today') {
      const marker = root.createElement('div');
      marker.className = 'medical-today';
      marker.textContent = 'Today';
      host.append(marker);
      continue;
    }
    if (item.kind === 'band') {
      host.append(bandBlock(root, item, model.selected, onSelect));
      continue;
    }
    host.append(visitCard(root, item.visit, model.selected, onSelect));
  }
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
