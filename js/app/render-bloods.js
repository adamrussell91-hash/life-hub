import { applyRingTarget } from './chart-kit/apply-ring.js';
import { categoryNote, explainerFor } from './bloods-explainers.js';
import { combinedChartSvg, markerVisual } from './bloods-charts.js';

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

function renderInRange(root, model) {
  const host = root.querySelector('#bloods-in-range');
  if (!host) return;
  host.replaceChildren();
  const svg = root.querySelector('#bloods-in-range-ring') || (() => {
    const node = root.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.id = 'bloods-in-range-ring';
    node.setAttribute('class', 'metric-ring metric-ring--bloods-in-range');
    node.setAttribute('viewBox', '0 0 56 56');
    const track = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('data-role', 'track');
    const fill = root.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fill.setAttribute('data-role', 'fill');
    node.append(track, fill);
    return node;
  })();
  if (!svg.id) svg.id = 'bloods-in-range-ring';
  applyRingTarget(svg, { value: model.inRangeCount ?? 0, target: model.markerCount || 1 });
  const caption = root.createElement('p');
  caption.className = 'metric-caption';
  caption.textContent = model.markerCount
    ? `${model.inRangeCount} of ${model.markerCount} in range`
    : 'No numeric markers yet.';
  host.append(svg, caption);
}

function renderFlags(root, model) {
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
    chip.className = 'body-tape-chip bloods-flag';
    chip.dataset.colour = flag.status === 'Low' ? 'low' : flag.status === 'High' ? 'red' : 'neutral';
    chip.dataset.bloodsMarker = flag.key;
    const label = root.createElement('span');
    label.className = 'body-tape-chip__label';
    label.textContent = flag.label;
    const value = root.createElement('span');
    value.className = 'body-tape-chip__delta';
    value.textContent = [formatLatestValue(flag.value, flag.unit), flag.status].filter(Boolean).join(' ');
    chip.append(label, value);
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
  const line = root.createElement('p');
  line.className = 'metric-value';
  line.textContent = model.lastCollected.date;
  host.append(line);
  if (model.lastCollected.lab) {
    host.append(caption(root, model.lastCollected.lab));
  }
  if (model.lastCollected.stale) {
    const stale = caption(root, 'Last panel is more than 90 days ago.');
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
  host.replaceChildren();
  const flareOn = dashboard.querySelector?.('[data-bloods-flare]')?.checked === true;
  for (const category of model.categories) {
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
      combined.className = `${combined.className || ''} bloods-combined`.trim();
      body.append(combined);
    }
  }

  const grid = root.createElement('div');
  grid.className = 'bloods-metric-grid body-metrics body-metrics--pair';
  if (!category.markers.length) {
    body.append(caption(root, 'Not yet tested'));
  } else {
    for (const marker of category.markers) {
      grid.append(markerBlock(root, marker, model, flareOn));
    }
    body.append(grid);
  }
  article.append(body);
  return article;
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
  const info = root.createElement('button');
  info.type = 'button';
  info.className = 'bloods-info';
  info.setAttribute('aria-label', `About ${marker.label}`);
  info.textContent = 'i';
  info.addEventListener('click', () => openExplainer(root, marker));
  head.append(name, info);

  if (marker.lastDelta != null) {
    const trends = root.createElement('div');
    trends.className = 'body-metric__growth';
    trends.append(
      trendChip(root, marker.lastDelta, marker.lastColour, marker.lastDeltaLabel ? marker.lastDeltaLabel : 'Last'),
      trendChip(root, marker.overallDelta, marker.overallColour, 'Overall')
    );
    head.append(trends);
  }
  wrap.append(head);

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

  const pill = root.createElement('span');
  pill.className = 'bloods-status';
  pill.dataset.status = marker.statusTone || 'first';
  pill.textContent = marker.latest?.status || 'First reading';
  wrap.append(pill);

  const visual = markerVisual(root, marker, { flareMarks: model.flareMarks, flareOn });
  if (visual) {
    const chart = String(visual.className || '').includes('body-chart')
      ? visual
      : visual.querySelector?.('.body-chart') || visual;
    if (chart?.dataset) chart.dataset.status = marker.statusTone || 'first';
    wrap.append(visual);
  } else if (marker.latest) {
    wrap.append(caption(root, marker.series?.length ? '' : 'Not yet tested'));
  }

  const tested = root.createElement('p');
  tested.className = 'metric-caption bloods-tested';
  tested.textContent = marker.latest?.date || '';
  wrap.append(tested);
  return wrap;
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
  for (const card of dashboard.querySelectorAll?.('.bloods-metric') ?? []) {
    const hay = String(card.textContent || '').toLowerCase();
    card.hidden = q ? !hay.includes(q) : false;
  }
}

function trendChip(root, delta, colour, label) {
  const chip = root.createElement('span');
  chip.className = 'body-tape-chip';
  chip.dataset.colour = colour || 'neutral';
  const kind = root.createElement('span');
  kind.className = 'body-tape-chip__label';
  kind.textContent = label;
  const deltaEl = root.createElement('span');
  deltaEl.className = 'body-tape-chip__delta';
  deltaEl.textContent = /[↑↓→]/.test(String(label)) ? '' : formatDeltaChip(delta);
  chip.append(kind, deltaEl);
  return chip;
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

function formatLatestValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit ? `${text} ${unit}` : text;
}

function formatDeltaChip(delta) {
  if (delta == null || !Number.isFinite(delta)) return '→ —';
  if (delta === 0) return '→ 0';
  const arrow = delta > 0 ? '↑' : '↓';
  const mag = Math.abs(delta);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  return `${arrow} ${text}`;
}
