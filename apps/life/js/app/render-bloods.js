import { categoryNote, explainerFor } from './bloods-explainers.js';
import {
  buildFbcRadial,
  buildGlucoseMap,
  buildLipidRings,
  combinedChartSvg,
  fbcRadialSvg,
  glucoseMapSvg,
  lipidRingsSvg,
  markerVisual
} from './bloods-charts.js';
import { renderBiochemistryGroups } from './bloods-instruments.js';
import { formatDisplayDate } from '../core/time.js';

export function renderBloods(root, model, { onRangeChange } = {}) {
  const dashboard = root.querySelector('#body-bloods-dashboard');
  if (!dashboard || !model) return;

  bindRange(root, model, onRangeChange);
  renderInRange(root, model);
  renderFlags(root, model);
  renderLastCollected(root, model);
  bindToolbar(root, dashboard);
  bindAppointment(root, model);
  bindExplainer(root);
  renderSections(root, model, dashboard);
  dashboard.removeAttribute('hidden');
}

function bindRange(root, model, onRangeChange) {
  const ranges = root.querySelector('#bloods-range-control');
  if (ranges && !ranges.dataset.bound) {
    ranges.dataset.bound = '1';
    ranges.addEventListener('click', event => {
      const button = event.target.closest?.('[data-bloods-range]');
      if (!button) return;
      onRangeChange?.(button.dataset.bloodsRange);
    });
  }
  if (!ranges) return;
  for (const button of ranges.querySelectorAll?.('[data-bloods-range]') ?? []) {
    const active = button.dataset.bloodsRange === model.range;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function flagSplit(model) {
  const low = model.flagged.filter(flag => flag.status === 'Low').length;
  return { low, high: model.flagged.length - low };
}

function renderInRange(root, model) {
  const host = root.querySelector('#bloods-in-range');
  if (!host) return;
  host.replaceChildren();
  if (!model.markerCount) {
    host.append(caption(root, 'No numeric markers yet.'));
    return;
  }
  const value = root.createElement('p');
  value.className = 'bloods-signal__value';
  const count = root.createElement('strong');
  count.textContent = String(model.inRangeCount);
  const of = root.createElement('span');
  of.textContent = `of ${model.markerCount} in range`;
  value.append(count, of);

  const { high, low } = flagSplit(model);
  const bar = root.createElement('div');
  bar.className = 'bloods-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `${model.inRangeCount} of ${model.markerCount} markers in range`);
  for (const [tone, amount] of [['in-range', model.inRangeCount], ['high', high], ['low', low]]) {
    if (!amount) continue;
    const segment = root.createElement('span');
    segment.className = 'bloods-bar__segment';
    segment.dataset.tone = tone;
    segment.style.width = `${(amount / model.markerCount) * 100}%`;
    bar.append(segment);
  }
  host.append(value, bar);
}

function renderFlagSummary(root, model) {
  const host = root.querySelector('#bloods-flag-summary');
  if (!host) return;
  host.replaceChildren();
  if (!model.categories.length) {
    host.append(caption(root, 'No blood results yet.'));
    return;
  }
  const { high, low } = flagSplit(model);
  if (!model.flagged.length) {
    host.append(legendItem(root, 'in-range', 'Everything in range'));
    return;
  }
  host.append(legendItem(root, 'in-range', `${model.inRangeCount} in range`));
  if (high) host.append(legendItem(root, 'high', `${high} high`));
  if (low) host.append(legendItem(root, 'low', `${low} low`));
}

function legendItem(root, tone, text) {
  const item = root.createElement('span');
  item.className = 'bloods-legend__item';
  item.dataset.tone = tone;
  item.textContent = text;
  return item;
}

function renderFlags(root, model) {
  renderFlagSummary(root, model);
  const flags = root.querySelector('#bloods-flags');
  if (!flags) return;
  flags.replaceChildren();
  if (!model.categories.length) {
    flags.append(caption(root, 'No blood results in your synced history yet.'));
    return;
  }
  if (!model.flagged.length) {
    flags.append(caption(root, 'Everything in range.'));
    return;
  }
  for (const flag of model.flagged) {
    const chip = root.createElement('button');
    chip.type = 'button';
    chip.className = 'bloods-flag';
    chip.dataset.status = flag.status === 'Low' ? 'low' : 'high';
    chip.dataset.bloodsMarker = flag.key;
    chip.textContent = [flag.label, formatLatestValue(flag.value, flag.unit), flag.status]
      .filter(Boolean)
      .join(' ');
    chip.addEventListener('click', () => jumpToMarker(root, flag.key));
    flags.append(chip);
  }
}

function renderLastCollected(root, model) {
  const host = root.querySelector('#bloods-last-collected');
  if (!host) return;
  host.replaceChildren();
  if (!model.lastCollected) {
    host.append(caption(root, 'No collection date yet.'));
    return;
  }
  const parts = [`Collected ${formatDisplayDate(model.lastCollected.date)}`];
  if (model.lastCollected.lab) parts.push(model.lastCollected.lab);
  host.append(caption(root, parts.join(' · ')));
  if (model.lastCollected.stale) {
    const stale = caption(root, 'More than 90 days ago.');
    stale.dataset.stale = '1';
    host.append(stale);
  }
}

function bindToolbar(root, dashboard) {
  const expand = root.querySelector('#bloods-expand-all');
  const collapse = root.querySelector('#bloods-collapse-all');
  const search = root.querySelector('#bloods-search');
  if (expand && !expand.dataset.bound) {
    expand.dataset.bound = '1';
    expand.addEventListener('click', () => setAllCollapsed(dashboard, false));
  }
  if (collapse && !collapse.dataset.bound) {
    collapse.dataset.bound = '1';
    collapse.addEventListener('click', () => setAllCollapsed(dashboard, true));
  }
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', () => filterMarkers(dashboard, search.value));
  }
}

function bindAppointment(root, model) {
  const open = root.querySelector('#bloods-appointment-open');
  const sheet = root.querySelector('#bloods-appointment-sheet');
  const body = root.querySelector('#bloods-appointment-body');
  if (body) {
    body.replaceChildren();
    if (!model.appointmentLines?.length) {
      body.append(caption(root, 'Nothing flagged or moving unfavourably.'));
    } else {
      for (const line of model.appointmentLines) {
        const p = root.createElement('p');
        p.className = 'bloods-appointment-line';
        p.textContent = line;
        body.append(p);
      }
    }
  }
  if (open && sheet && !open.dataset.bound) {
    open.dataset.bound = '1';
    open.addEventListener('click', () => {
      if (typeof sheet.showModal === 'function') sheet.showModal();
      else sheet.removeAttribute('hidden');
    });
  }
}

function bindExplainer(root) {
  const drawer = root.querySelector('#bloods-explainer');
  if (!drawer || drawer.dataset.bound) return;
  drawer.dataset.bound = '1';
  drawer.addEventListener('click', event => {
    if (event.target === drawer || event.target?.closest?.('[data-bloods-explainer-close]')) {
      drawer.setAttribute('hidden', '');
    }
  });
}

function renderSections(root, model, dashboard) {
  const host = root.querySelector('#bloods-sections');
  if (!host) return;
  const flareOn = dashboard.querySelector?.('[data-bloods-flare]')?.checked === true;
  renderBloodsSnapshot(root, host, model, flareOn);
}

export function renderBloodsSnapshot(root, host, model, flareOn = false) {
  if (!host || !model) return;
  host.replaceChildren();
  for (const category of model.categories ?? []) {
    host.append(categoryCard(root, category, model, flareOn));
  }
}

function categoryCard(root, category, model, flareOn) {
  const article = root.createElement('article');
  article.className = 'metric-card body-section bloods-category';
  article.dataset.bodySection = category.id;
  if (category.collapsed) article.classList.add('is-collapsed');

  const heading = root.createElement('div');
  heading.className = 'body-section__head';
  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'bloods-category__toggle';
  toggle.setAttribute('aria-expanded', category.collapsed ? 'false' : 'true');
  const title = root.createElement('h3');
  title.className = 'metric-label';
  title.textContent = category.title;
  const summary = root.createElement('span');
  summary.className = 'metric-caption';
  summary.textContent = category.summary || '';
  toggle.append(title, summary);
  toggle.addEventListener('click', () => {
    const collapsed = article.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
  heading.append(toggle);
  article.append(heading);

  const noteText = categoryNote(category.id);
  if (noteText) {
    const note = root.createElement('p');
    note.className = 'bloods-category__note metric-caption';
    note.textContent = noteText;
    article.append(note);
  }

  const body = root.createElement('div');
  body.className = 'bloods-category__body';

  const pictureOnly = category.id === 'Glucose/Diabetes' || category.id === 'Lipid Studies';

  if (category.id !== 'Biochemistry/Electrolytes' && !pictureOnly) {
    const strip = root.createElement('div');
    strip.className = 'bloods-summary-strip';
    for (const marker of category.markers.filter(m => !m.qualitative)) {
      const mini = root.createElement('button');
      mini.type = 'button';
      mini.className = 'bloods-summary-strip__item';
      mini.dataset.bloodsMarker = marker.key;
      mini.textContent = marker.label;
      mini.addEventListener('click', () => jumpToMarker(root, marker.key));
      strip.append(mini);
    }
    if (strip.children.length) body.append(strip);
  }

  if (['Inflammation Markers', 'Iron Studies'].includes(category.id) && model.flareMarks?.length) {
    const flare = root.createElement('label');
    flare.className = 'bloods-flare-toggle';
    const box = root.createElement('input');
    box.type = 'checkbox';
    box.dataset.bloodsFlare = '1';
    box.checked = flareOn;
    flare.append(box, documentText(root, ' Show flare diary ticks'));
    body.append(flare);
  }

  if (category.id === 'Full Blood Count') {
    const radial = fbcRadialSvg(root, buildFbcRadial(category.markers));
    if (radial) body.append(radial);
  }

  if (category.id === 'Glucose/Diabetes') {
    const map = glucoseMapSvg(root, buildGlucoseMap(category.markers));
    if (map) body.append(map);
    article.append(body);
    return article;
  }

  if (category.id === 'Lipid Studies') {
    const rings = lipidRingsSvg(root, buildLipidRings(category.markers));
    if (rings) body.append(rings);
    article.append(body);
    return article;
  }

  if (category.lipidRatio) {
    const ratio = root.createElement('p');
    ratio.className = 'bloods-lipid-ratio';
    ratio.dataset.status = category.lipidRatio.tone;
    const n = category.lipidRatio.value;
    const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
    ratio.textContent = `Total : HDL ${text}`;
    body.append(ratio);
  }

  if (category.combined) {
    const combined = combinedChartSvg(root, category.combined);
    if (combined) {
      // An SVG element's className is a read-only SVGAnimatedString; assigning to
      // it throws and takes the whole category render down with it.
      combined.setAttribute('class', `${chartClass(combined)} bloods-combined`.trim());
      body.append(combined);
    }
  }

  if (!category.markers.length) {
    body.append(caption(root, 'Not yet tested'));
    article.append(body);
    return article;
  }

  if (category.id === 'Biochemistry/Electrolytes') {
    body.append(renderBiochemistryGroups(root, category.markers, {
      flareMarks: model.flareMarks,
      flareOn,
      onExplain: marker => openExplainer(root, marker)
    }));
    article.append(body);
    return article;
  }

  // Markers with a history get a chart card; a marker with one or two draws
  // says everything it has to say in a row, so it does not take a card.
  const charted = category.markers.filter(marker => hasTrend(marker));
  const listed = category.markers.filter(marker => !hasTrend(marker));

  if (charted.length) {
    const grid = root.createElement('div');
    grid.className = 'bloods-metric-grid body-metrics body-metrics--pair';
    for (const marker of charted) grid.append(markerBlock(root, marker, model, flareOn));
    body.append(grid);
  }
  if (listed.length) {
    const list = root.createElement('div');
    list.className = 'bloods-rows';
    for (const marker of listed) list.append(markerRow(root, marker));
    body.append(list);
  }
  article.append(body);
  return article;
}

function hasTrend(marker) {
  return marker.chartKind === 'line' || marker.chartKind === 'zoned';
}

function markerRow(root, marker) {
  const row = root.createElement('div');
  row.className = 'bloods-row';
  row.id = `bloods-marker-${marker.key}`;
  row.dataset.bloodsMarker = marker.key;
  const tone = marker.statusTone || 'first';

  const name = root.createElement('div');
  name.className = 'bloods-row__name';
  const dot = root.createElement('span');
  dot.className = 'bloods-row__dot';
  dot.dataset.status = tone;
  const label = root.createElement('span');
  label.className = 'bloods-row__label';
  label.textContent = marker.label;
  name.append(dot, label, infoButton(root, marker));
  row.append(name);

  const value = root.createElement('p');
  value.className = 'bloods-row__value';
  value.style.fontVariantNumeric = 'tabular-nums';
  const number = root.createElement('span');
  number.className = 'bloods-row__number';
  if (marker.qualitative) {
    number.textContent = marker.latest?.status || marker.latest?.unit || 'Qualitative';
    value.append(number);
  } else {
    number.textContent = formatNumber(Number(marker.latest?.value));
    value.append(number);
    if (marker.latest?.unit) {
      const unit = root.createElement('span');
      unit.className = 'bloods-row__unit';
      unit.textContent = marker.latest.unit;
      value.append(unit);
    }
  }
  row.append(value);

  const meter = root.createElement('div');
  meter.className = 'bloods-row__meter';
  const visual = markerVisual(root, marker, {});
  if (visual) {
    const chart = visual.querySelector?.('.bloods-meter') ?? visual;
    if (chart?.dataset) chart.dataset.status = tone;
    meter.append(visual);
  }
  const foot = root.createElement('div');
  foot.className = 'bloods-row__foot';
  const band = root.createElement('span');
  band.textContent = refCaption(marker.latest?.ref_low, marker.latest?.ref_high);
  const pill = root.createElement('span');
  pill.className = 'bloods-status';
  pill.dataset.status = tone;
  pill.textContent = statusLabel(marker.latest?.status);
  foot.append(band, pill);
  meter.append(foot);
  row.append(meter);

  const delta = root.createElement('p');
  delta.className = 'bloods-row__delta';
  delta.textContent = marker.lastDeltaLabel || (marker.latest?.date ? formatDisplayDate(marker.latest.date) : '');
  row.append(delta);
  return row;
}

function infoButton(root, marker) {
  const info = root.createElement('button');
  info.type = 'button';
  info.className = 'bloods-info';
  info.setAttribute('aria-label', `About ${marker.label}`);
  info.textContent = 'i';
  info.addEventListener('click', () => openExplainer(root, marker));
  return info;
}

function markerBlock(root, marker, model, flareOn) {
  const wrap = root.createElement('div');
  wrap.className = `body-metric bloods-metric${marker.span === 'wide' ? ' bloods-metric--wide' : ''}`;
  wrap.id = `bloods-marker-${marker.key}`;
  wrap.dataset.bloodsMarker = marker.key;

  const head = root.createElement('div');
  head.className = 'body-metric__head';
  const name = root.createElement('strong');
  name.textContent = marker.label;
  const pill = root.createElement('span');
  pill.className = 'bloods-status';
  pill.dataset.status = marker.statusTone || 'first';
  pill.textContent = statusLabel(marker.latest?.status);
  head.append(name, infoButton(root, marker), pill);
  wrap.append(head);

  const what = root.createElement('p');
  what.className = 'bloods-metric__what';
  what.textContent = explainerFor(marker.key).what;
  wrap.append(what);

  const value = root.createElement('p');
  value.className = 'body-metric__value';
  value.style.fontVariantNumeric = 'tabular-nums';
  if (marker.qualitative) {
    value.textContent = marker.latest?.status || marker.latest?.unit || 'Qualitative';
    wrap.append(value);
    return wrap;
  }
  value.textContent = formatLatestValue(marker.latest?.value, marker.latest?.unit);
  wrap.append(value);

  const visual = markerVisual(root, marker, { flareMarks: model.flareMarks, flareOn });
  if (visual) {
    const chart = chartClass(visual).includes('body-chart')
      ? visual
      : visual.querySelector?.('.body-chart') || visual;
    if (chart?.dataset) chart.dataset.status = marker.statusTone || 'first';
    wrap.append(visual);
  } else if (marker.latest) {
    wrap.append(caption(root, marker.series?.length ? '' : 'Not yet tested'));
  }

  const tested = root.createElement('p');
  tested.className = 'metric-caption bloods-tested';
  const band = root.createElement('span');
  band.textContent = refCaption(marker.latest?.ref_low, marker.latest?.ref_high);
  const when = root.createElement('span');
  when.textContent = [marker.lastDeltaLabel, marker.latest?.date ? formatDisplayDate(marker.latest.date) : '']
    .filter(Boolean)
    .join(' · ');
  tested.append(band, when);
  wrap.append(tested);
  return wrap;
}

function chartClass(node) {
  const name = node?.getAttribute?.('class') ?? node?.className;
  return typeof name === 'string' ? name : String(name?.baseVal ?? '');
}

function openExplainer(root, marker) {
  const drawer = root.querySelector('#bloods-explainer');
  const body = root.querySelector('#bloods-explainer-body');
  if (!drawer || !body) return;
  const copy = explainerFor(marker.key);
  body.replaceChildren();
  const title = root.createElement('h3');
  title.textContent = marker.label;
  body.append(title);
  for (const [label, text] of [
    ['What it measures', copy.what],
    ['Why it’s tracked here', copy.why],
    ['If it’s high', copy.high],
    ['If it’s low', copy.low]
  ]) {
    const h = root.createElement('p');
    h.className = 'metric-label';
    h.textContent = label;
    const p = root.createElement('p');
    p.textContent = text;
    body.append(h, p);
  }
  if (copy.related?.length) {
    const rel = root.createElement('p');
    rel.className = 'metric-caption';
    rel.textContent = `Commonly read alongside ${copy.related.join(', ')}`;
    body.append(rel);
  }
  const disc = root.createElement('p');
  disc.className = 'metric-caption';
  disc.textContent = copy.disclaimer;
  body.append(disc);
  drawer.removeAttribute('hidden');
}

function jumpToMarker(root, key) {
  const node = root.querySelector?.(`#bloods-marker-${key}`);
  node?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  if (node?.classList) {
    node.classList.add('is-highlight');
    setTimeout(() => node.classList.remove('is-highlight'), 1200);
  }
}

function setAllCollapsed(dashboard, collapsed) {
  for (const article of dashboard.querySelectorAll?.('.bloods-category') ?? []) {
    article.classList.toggle('is-collapsed', collapsed);
    const toggle = article.querySelector?.('.bloods-category__toggle');
    toggle?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

function filterMarkers(dashboard, query) {
  const q = String(query || '').trim().toLowerCase();
  for (const card of dashboard.querySelectorAll?.('[data-bloods-marker]') ?? []) {
    const hay = String(card.textContent || '').toLowerCase();
    card.hidden = q ? !hay.includes(q) : false;
  }
  // A protein band represents every fraction together. Once a filter is
  // active, leaving the full band visible would imply hidden markers still
  // belong to the filtered result, so the matching labelled rows stand alone.
  for (const band of dashboard.querySelectorAll?.('.bloods-protein-band') ?? []) {
    band.hidden = Boolean(q);
  }
}

function caption(root, text) {
  const node = root.createElement('p');
  node.className = 'metric-caption';
  node.textContent = text;
  return node;
}

function documentText(root, text) {
  const span = root.createElement('span');
  span.textContent = text;
  return span;
}

function statusLabel(status) {
  if (status === 'Normal') return 'In range';
  return status || 'First reading';
}

function refCaption(low, high) {
  const lo = low != null && Number.isFinite(Number(low)) ? Number(low) : null;
  const hi = high != null && Number.isFinite(Number(high)) ? Number(high) : null;
  if (lo != null && hi != null) {
    if (lo === 0) return `In range <${formatNumber(hi)}`;
    return `Band ${formatNumber(lo)}–${formatNumber(hi)}`;
  }
  if (hi != null) return `In range <${formatNumber(hi)}`;
  if (lo != null) return `In range >${formatNumber(lo)}`;
  return '';
}

function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatLatestValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

