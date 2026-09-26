import { formatDisplayDate } from '../core/time.js';
import { createHubFilter } from '../../../../packages/design-kit/js/hub-filter-menu.js';
import { createViewOnMap } from '../../../../packages/design-kit/js/view-on-map.js';
import { openMorphingDialog } from '../../../../packages/design-kit/js/morphing-dialog.js';
import {
  listMedicalPlaceLabels,
  mapPlacesFromMedicalVisits,
  mountHubPlacesMap,
  parseMapPlacesPayload
} from '../../../../packages/design-kit/js/hub-places-map.js';
import { renderBriefRow, formatRelativeMedicalDate } from './medical-brief.js';
import { renderMedicalStrip } from './medical-strip.js';
import { markerRow, markerFromRawBloodsMarker } from './render-bloods.js';

/** Seeded Sydney-area medical coords for the constellation prototype (not a geocoder). */
const MEDICAL_PLACE_COORDS = {
  'north shore private hospital': { lng: 151.1936, lat: -33.8225 },
  'north shore private': { lng: 151.1936, lat: -33.8225 },
  'royal north shore hospital': { lng: 151.1905, lat: -33.822 },
  'macquarie university hospital': { lng: 151.1175, lat: -33.7735 },
  'prosper nutrition': { lng: 151.1689, lat: -33.8142 }
};

const filterCache = new WeakMap();
let placesMapSession = null;

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
  onShowMinor,
  onAddToTasks,
  onOpenEpisode,
  onJumpUpcoming,
  onWeightChange,
  onMarkBooked,
  onMarkDone,
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
  bindOnce(root, '#medical-places', 'click', event => {
    openMedicalPlacesMap(root, model, event.currentTarget);
  });
  bindOnce(root, '#medical-sheet-close', 'click', () => onClose?.());
  bindOnce(root, '#medical-show-minor', 'click', () => onShowMinor?.(!model.showMinor));

  const search = root.querySelector('#medical-search');
  if (search && search.value !== model.query) search.value = model.query ?? '';
  paintShowMinor(root, model.showMinor);
  paintFilters(root, model, { onTypeChange, onProviderChange });
  paintDensity(root, model.density);

  renderBriefRow(root, model, {
    onSelect,
    onAddToTasks,
    onOpenEpisode: onOpenEpisode || (id => {
      const band = root.querySelector?.(`[data-episode-id="${id}"]`);
      if (band?.tagName === 'DETAILS') band.open = true;
      band?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }),
    onJumpUpcoming: onJumpUpcoming || (() => {
      root.querySelector?.('.medical-upcoming')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    })
  });
  renderMedicalStrip(root, model, { onSelect });

  renderChips(root, model, { onSearch, onTypeChange, onProviderChange });
  renderEmpty(root, model);
  renderTimeline(root, model, { onSelect, onToggleYear });
  renderSheet(root, model, {
    onEdit,
    onSave,
    onCancel,
    onClose,
    onWeightChange,
    onMarkBooked,
    onMarkDone,
    renderLabSnapshot
  });
  dashboard.hidden = false;
  dashboard.removeAttribute?.('hidden');
}

function bindOnce(root, selector, type, handler) {
  const node = root.querySelector(selector);
  if (!node || node.dataset.bound) return;
  node.dataset.bound = '1';
  node.addEventListener(type, handler);
}

function paintShowMinor(root, showMinor) {
  const btn = root.querySelector('#medical-show-minor');
  if (!btn) return;
  btn.setAttribute('aria-pressed', showMinor ? 'true' : 'false');
  btn.classList.toggle?.('is-active', !!showMinor);
  btn.textContent = showMinor ? 'Hide minor' : 'Show minor';
}

function openMedicalPlacesMap(root, model, trigger) {
  const doc = root.ownerDocument || globalThis.document;
  if (!doc?.body) return;

  placesMapSession?.destroy?.();
  placesMapSession = null;

  const visits = model.visits || [];
  const labels = listMedicalPlaceLabels(visits);
  const payload =
    mapPlacesFromMedicalVisits(visits, { coordsByLocation: MEDICAL_PLACE_COORDS }) ||
    parseMapPlacesPayload({ type: 'map_places', places: [] });

  const frame = doc.createElement('div');
  frame.className = 'hub-places-map medical-places-dialog';
  frame.style.width = 'min(42rem, calc(100vw - 2rem))';
  frame.style.maxHeight = 'min(36rem, calc(100vh - 2rem))';
  frame.style.overflow = 'auto';
  frame.style.padding = '1rem 1.1rem 1.2rem';

  const title = doc.createElement('h2');
  title.id = 'medical-places-title';
  title.textContent = 'Medical places';
  frame.append(title);

  const blurb = doc.createElement('p');
  blurb.className = 'hub-places-map__empty';
  blurb.textContent = payload?.places?.length
    ? 'Trusted MapLibre constellation for visits with known coordinates.'
    : labels.length
      ? 'Places are listed below. Map markers appear once coordinates are known (seed lookup or agent map_places).'
      : 'No place-kind visits in the current medical filter.';
  frame.append(blurb);

  const layout = doc.createElement('div');
  layout.className = 'hub-places-map';
  const list = doc.createElement('ul');
  list.className = 'hub-places-map__list';
  list.setAttribute('aria-label', 'Places');

  const mapped = new Map((payload?.places || []).map((place) => [place.name.toLowerCase(), place]));
  for (const entry of labels) {
    const item = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'hub-places-map__item';
    const place = mapped.get(entry.name.toLowerCase());
    btn.textContent = place
      ? `${entry.name} · ${entry.visitIds.length} visit${entry.visitIds.length === 1 ? '' : 's'}`
      : `${entry.name} · no coordinates yet`;
    btn.disabled = !place;
    if (place) {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.hub-places-map__item').forEach((node) => node.classList.remove('is-active'));
        btn.classList.add('is-active');
        placesMapSession?.focusPlace?.(place.id);
      });
    }
    item.append(btn);
    list.append(item);
  }
  layout.append(list);

  if (payload?.places?.length) {
    const frameEl = doc.createElement('div');
    frameEl.className = 'hub-places-map__frame';
    frameEl.style.minHeight = '16rem';
    const canvas = doc.createElement('div');
    canvas.className = 'hub-places-map__canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    frameEl.append(canvas);
    layout.append(frameEl);
    frame.append(layout);
    openMorphingDialog({
      trigger,
      frame,
      labelledBy: 'medical-places-title',
      label: 'Medical places',
      onClose: () => {
        placesMapSession?.destroy?.();
        placesMapSession = null;
      }
    });
    void mountHubPlacesMap(canvas, payload, {
      onSelect: (place) => {
        list.querySelectorAll('.hub-places-map__item').forEach((node) => {
          node.classList.toggle('is-active', node.textContent?.startsWith(place.name));
        });
      }
    }).then((session) => {
      placesMapSession = session;
    });
    return;
  }

  frame.append(layout);
  openMorphingDialog({
    trigger,
    frame,
    labelledBy: 'medical-places-title',
    label: 'Medical places'
  });
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
  for (const item of model.items) appendTimelineItem(root, host, item, model, { onSelect, onToggleYear });
}

function appendTimelineItem(root, host, item, model, hooks) {
  if (item.kind === 'upcoming') {
    const heading = root.createElement('p');
    heading.className = 'medical-heading medical-upcoming';
    heading.textContent = 'Upcoming';
    host.append(heading);
    return;
  }
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
    host.append(yearRow(root, item, model, hooks));
    return;
  }
  if (item.kind === 'band') {
    host.append(bandBlock(root, item, model, hooks.onSelect));
    return;
  }
  if (item.kind === 'visit' && item.visit) {
    host.append(visitCard(root, item.visit, model, hooks.onSelect));
  }
}

function yearRow(root, item, model, { onSelect, onToggleYear }) {
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
    for (const child of item.items) appendTimelineItem(root, nest, child, model, { onSelect, onToggleYear });
    wrap.append(nest);
  }
  return wrap;
}

function bandBlock(root, item, model, onSelect) {
  const details = root.createElement('details');
  details.className = 'medical-band';
  details.dataset.episodeId = item.episode?.id || '';
  details.setAttribute('data-episode-id', item.episode?.id || '');
  const active = item.episode?.status === 'active'
    || (model.activeEpisode && model.activeEpisode.id === item.episode?.id);
  details.open = Boolean(active);

  const summary = root.createElement('summary');
  summary.className = 'medical-band__summary';
  const dates = (item.visits || []).map(v => v.date).filter(Boolean).sort();
  const start = dates[0] ? formatDisplayDate(dates[0]) : '';
  const end = dates.at(-1) ? formatDisplayDate(dates.at(-1)) : '';
  const status = item.episode?.status === 'resolved' || item.episode?.status === 'resolved?'
    ? item.episode.status
    : 'ongoing';
  const count = item.visits?.length || 0;
  summary.textContent = `🤧 ${item.episode?.title || 'Episode'} · ${start}${end && end !== start ? ` → ${end}` : ''} · ${status} · ${count} note${count === 1 ? '' : 's'}`;
  details.append(summary);

  const list = root.createElement('ol');
  list.className = 'medical-band__list';
  for (const visit of item.visits || []) {
    const li = root.createElement('li');
    const btn = root.createElement('button');
    btn.type = 'button';
    btn.className = 'medical-band__entry';
    btn.dataset.visitId = visit.id;
    btn.setAttribute('data-visit-id', visit.id);
    const when = root.createElement('strong');
    when.textContent = formatDisplayDate(visit.date);
    const body = root.createElement('span');
    body.textContent = visit.notes || visit.title;
    btn.append(when, body);
    btn.addEventListener('click', () => onSelect?.(visit.id));
    if (model.selected?.id === visit.id) btn.classList.add('is-selected');
    li.append(btn);
    list.append(li);
  }
  details.append(list);
  return details;
}

function visitCard(root, visit, model, onSelect) {
  const weight = visit.weight || 'routine';
  const planned = visit.planned || visit.virtual || visit.status === 'planned' || visit.status === 'to_book';

  if (weight === 'minor') {
    return minorRow(root, visit, model, onSelect, planned);
  }

  const card = root.createElement('button');
  card.type = 'button';
  card.className = [
    'medical-card',
    weight === 'major' ? 'medical-card--major' : 'medical-card--routine',
    planned ? 'medical-card--planned' : ''
  ].filter(Boolean).join(' ');
  card.dataset.visitId = visit.id;
  card.dataset.lane = visit.lane;
  card.dataset.weight = weight;
  card.setAttribute('data-visit-id', visit.id);
  card.setAttribute('data-lane', visit.lane);
  if (model.selected?.id === visit.id) card.classList.add('is-selected');
  card.addEventListener('click', () => onSelect?.(visit.id));

  if (planned) {
    const cd = root.createElement('span');
    cd.className = 'medical-card__countdown';
    const label = formatRelativeMedicalDate(visit.date, model.today, {
      precision: visit.date_precision,
      status: visit.status,
      virtual: visit.virtual
    });
    cd.textContent = visit.virtual && !label.startsWith('~') ? `~${label}` : label;
    if (label === 'action') cd.dataset.tone = 'danger';
    card.append(cd);
  }

  const title = root.createElement('strong');
  title.className = 'medical-card__title';
  title.textContent = visit.title;
  const meta = root.createElement('span');
  meta.className = 'medical-card__meta';
  const metaBits = [
    visit.virtual ? `~${visit.displayDate || formatDisplayDate(visit.date)}` : (visit.displayDate || formatDisplayDate(visit.date)),
    visit.provider || visit.location || visit.record_type
  ].filter(Boolean);
  meta.textContent = metaBits.join(' · ');
  card.append(title, meta);

  if (weight === 'major' && visit.lab) {
    card.append(miniLabPanel(root, visit));
  }
  return card;
}

function minorRow(root, visit, model, onSelect, planned) {
  const row = root.createElement('button');
  row.type = 'button';
  row.className = planned ? 'medical-minor medical-minor--planned' : 'medical-minor';
  row.dataset.visitId = visit.id;
  row.dataset.lane = visit.lane;
  row.dataset.weight = 'minor';
  row.setAttribute('data-visit-id', visit.id);
  row.setAttribute('data-lane', visit.lane);
  if (model.selected?.id === visit.id) row.classList.add('is-selected');
  row.addEventListener('click', () => onSelect?.(visit.id));
  const when = root.createElement('strong');
  when.textContent = visit.displayDate || formatDisplayDate(visit.date);
  const title = root.createElement('span');
  title.textContent = visit.title;
  row.append(when, title);
  return row;
}

function miniLabPanel(root, visit) {
  const panel = root.createElement('div');
  panel.className = 'medical-card__labs medical-mini-lab';
  const markers = visit.lab?.markers || visit.bloods?.markers || [];
  const flagged = markers.filter(m => m.status === 'High' || m.status === 'Low');
  const rest = markers.filter(m => m.status !== 'High' && m.status !== 'Low');
  const pick = [...flagged, ...rest].slice(0, 4);
  for (const raw of pick) {
    const shaped = markerFromRawBloodsMarker(raw, { date: visit.lab?.date || visit.date });
    if (shaped) panel.append(markerRow(root, shaped, { compact: true }));
  }
  const inRange = visit.lab?.inRange ?? 0;
  if (inRange > 0) {
    const link = root.createElement('a');
    link.className = 'medical-mini-lab__more';
    link.href = '#body-bloods-dashboard';
    const firstKey = pick[0]?.key || flagged[0]?.key || markers[0]?.key;
    if (firstKey) link.href = `#bloods-marker-${firstKey}`;
    link.textContent = `+${inRange} in range`;
    link.addEventListener('click', event => {
      event.stopPropagation?.();
    });
    panel.append(link);
  }
  return panel;
}

function renderSheet(root, model, hooks) {
  const host = root.querySelector('#medical-sheet');
  if (!host) return;
  host.replaceChildren();
  const visit = model.selected;
  if (!visit && model.mode !== 'write') {
    host.hidden = true;
    host.setAttribute('hidden', '');
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'Select a visit.';
    host.append(empty);
    return;
  }
  host.hidden = false;
  host.removeAttribute('hidden');
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

  if (visit.episode?.id) {
    const epCtx = root.createElement('p');
    epCtx.className = 'medical-sheet__episode';
    const siblings = (model.allVisits || model.visits || [])
      .filter(v => v.episode?.id === visit.episode.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    const index = Math.max(1, siblings.findIndex(v => v.id === visit.id) + 1);
    epCtx.textContent = `Part of ${visit.episode.title}, entry ${index} of ${siblings.length || 1}`;
    host.append(epCtx);
  }

  if (visit.planned || visit.status === 'planned' || visit.status === 'to_book' || visit.virtual) {
    const planned = root.createElement('div');
    planned.className = 'medical-sheet__planned';
    const book = root.createElement('button');
    book.type = 'button';
    book.className = 'btn btn--secondary';
    book.textContent = 'Mark booked';
    book.addEventListener('click', () => hooks.onMarkBooked?.(visit));
    const done = root.createElement('button');
    done.type = 'button';
    done.className = 'btn btn--ghost';
    done.textContent = 'Mark done';
    done.addEventListener('click', () => hooks.onMarkDone?.(visit));
    planned.append(book, done);
    host.append(planned);
  }

  const weightRow = root.createElement('div');
  weightRow.className = 'medical-sheet__weight hub-pills';
  weightRow.setAttribute('role', 'group');
  weightRow.setAttribute('aria-label', 'Weight');
  for (const value of ['major', 'routine', 'minor']) {
    const btn = root.createElement('button');
    btn.type = 'button';
    btn.className = 'hub-pills__btn';
    btn.textContent = value;
    const on = (visit.weight || 'routine') === value;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.addEventListener('click', () => hooks.onWeightChange?.(visit, value));
    weightRow.append(btn);
  }
  host.append(weightRow);

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
    const map = createViewOnMap({
      locationName: visit.location,
      address: visit.location,
      mapsUrl: visit.mapsUrl,
      locationKind: visit.location_kind,
      createElement: tag => root.createElement(tag),
      document: globalThis.document
    });
    if (map) {
      map.place.className = [map.place.className, 'medical-sheet__map'].filter(Boolean).join(' ');
      host.append(map.el);
    } else {
      const link = root.createElement('a');
      link.className = 'medical-sheet__map';
      link.href = visit.mapsUrl;
      link.setAttribute('href', visit.mapsUrl);
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = visit.location;
      host.append(link);
    }
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
