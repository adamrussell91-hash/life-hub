import { animateAreaReveal } from './chart-kit/animate.js';
import { buildAreaLine } from './chart-kit/area-line.js';
import { formatExerciseSets, formatExerciseTitle } from './format-exercise.js';
import { muscleAssetPath, resolveMuscleMapKeys } from './muscle-maps.js';

const DAY_TYPE_LABELS = {
  movement: 'Movement day',
  workout_30: '30-minute workout',
  workout_45_60: '45–60 minute workout'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const formatSignedPct = pct => {
  if (pct == null || !Number.isFinite(pct)) return '—';
  if (pct === 0) return '0%';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
};

const formatSignedKg = kg => {
  if (kg == null || !Number.isFinite(kg)) return '—';
  if (kg === 0) return '0 kg';
  const sign = kg > 0 ? '+' : '−';
  const mag = Math.abs(kg);
  const text = Number.isInteger(mag) ? String(mag) : mag.toFixed(1);
  return `${sign}${text} kg`;
};

const formatWorkoutsPerWeek = value => {
  if (value == null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export function renderFitness(root, model, { logger, templates, libraryByName, onSelectTemplate } = {}) {
  setText(root, '[data-fitness="streak"]', model.streak);
  setText(root, '[data-fitness="day-type"]', DAY_TYPE_LABELS[model.dayType] ?? model.dayType ?? '—');

  const dots = root.querySelector('#fitness-week-dots');
  if (dots) {
    dots.replaceChildren();
    for (const day of model.weekDots) {
      const el = root.createElement('span');
      el.dataset.hit = String(day.completed);
      if (day.isToday) el.dataset.today = 'true';
      el.title = day.date;
      dots.append(el);
    }
  }

  renderLongTerm(root, model.longTerm);
  renderRegions(root, model.regions);

  const empty = root.querySelector('[data-fitness="hero-empty"]');
  const heroWrap = root.querySelector('[data-fitness-hero]');
  if (!model.heroSession) {
    empty?.removeAttribute('hidden');
    heroWrap?.setAttribute('hidden', '');
    logger?.unmount?.();
    renderMuscleStrip(root.querySelector('#fitness-muscle-maps'), []);
  } else {
    empty?.setAttribute('hidden', '');
    heroWrap?.removeAttribute('hidden');
    renderHero(root, model.heroSession, { logger, libraryByName });
  }

  renderTemplateRail(root, templates, { libraryByName, onSelectTemplate });
  renderFocusStrip(root, model.focusHits);
  renderComparisons(root, model.comparisons);
  renderHeatmap(root, model.month);

  root.querySelector('#fitness-dashboard')?.removeAttribute('hidden');
}

export function renderMuscleStrip(container, keys) {
  if (!container) return;
  container.replaceChildren();
  const create = name => {
    if (typeof container.createElement === 'function') return container.createElement(name);
    const doc = container.ownerDocument;
    if (doc && typeof doc.createElement === 'function') return doc.createElement(name);
    return globalThis.document.createElement(name);
  };
  for (const key of keys ?? []) {
    const img = create('img');
    img.className = 'fitness-muscle-strip__img';
    img.src = muscleAssetPath(key);
    img.alt = key.replace(/-/g, ' ');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener?.('error', () => img.remove?.());
    container.append(img);
  }
}

export function renderTemplateRail(root, templatesState, { libraryByName, onSelectTemplate } = {}) {
  const rail = root.querySelector('#fitness-templates-rail');
  const status = root.querySelector('#fitness-templates-status');
  if (!rail) return;

  const state = templatesState ?? { status: 'idle', templates: [] };
  if (status) {
    if (state.status === 'loading') status.textContent = 'Loading templates…';
    else if (state.status === 'error') status.textContent = 'Templates unavailable — try Refresh.';
    else if (state.status === 'ready' && (!state.templates || state.templates.length === 0)) {
      status.textContent = 'Finish a workout and it’ll show up here.';
    } else {
      status.textContent = '';
    }
  }

  rail.replaceChildren();
  if (state.status !== 'ready' || !Array.isArray(state.templates)) return;

  for (const template of state.templates) {
    const card = root.createElement('button');
    card.type = 'button';
    card.className = 'fitness-template-card';
    card.setAttribute('aria-label', `Open template ${template.title}`);

    const strip = root.createElement('div');
    strip.className = 'fitness-muscle-strip fitness-muscle-strip--card';
    const keys = resolveMuscleMapKeys({
      focus: template.focus,
      exercises: template.exercises,
      libraryByName
    });
    renderMuscleStrip(strip, keys);
    card.append(strip);

    const title = root.createElement('strong');
    title.textContent = template.title ?? 'Template';
    card.append(title);

    const meta = root.createElement('span');
    meta.className = 'fitness-template-card__meta';
    meta.textContent = template.source_session_date ? `Last ${template.source_session_date}` : 'No actuals yet';
    card.append(meta);

    card.addEventListener('click', () => onSelectTemplate?.(template));
    rail.append(card);
  }
}

function renderLongTerm(root, longTerm) {
  const data = longTerm ?? {};
  setText(root, '[data-fitness="volume-delta"]', formatSignedPct(data.volumeDeltaPct));
  setText(root, '[data-fitness="workouts-week"]', formatWorkoutsPerWeek(data.workoutsPerWeek));
  setText(
    root,
    '[data-fitness="adherence"]',
    data.adherencePct == null || !Number.isFinite(data.adherencePct)
      ? '—'
      : `${Math.round(data.adherencePct)}%`
  );
  setText(root, '[data-fitness="strength-delta"]', formatSignedPct(data.strengthDeltaPct));

  const svg = root.querySelector('#fitness-volume-sparkline');
  if (!svg) return;
  const area = svg.querySelector('[data-role="area"]');
  const line = svg.querySelector('[data-role="line"]');
  const series = (data.weeklyVolume ?? []).map(week => ({
    date: week.weekStart,
    value: week.value
  }));
  if (!series.length) {
    if (area) area.setAttribute('d', '');
    if (line) line.setAttribute('d', '');
    svg.classList?.remove?.('chart-animating', 'chart-static');
    return;
  }
  const chart = buildAreaLine(series, { height: 72, padding: 8 });
  if (area) area.setAttribute('d', chart.areaPath || '');
  if (line) line.setAttribute('d', chart.linePath || '');
  queueMicrotask(() => animateAreaReveal(svg));
}

function renderRegions(root, regions) {
  const grid = root.querySelector('#fitness-region-grid');
  if (!grid) return;
  grid.replaceChildren();

  for (const region of regions ?? []) {
    const card = root.createElement('article');
    card.className = 'metric-card fitness-region-card';
    card.dataset.region = region.key;
    card.dataset.colour = region.colour ?? 'neutral';

    const media = root.createElement('div');
    media.className = 'fitness-region-card__media';
    const img = root.createElement('img');
    img.className = 'fitness-region-card__img';
    img.src = region.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener?.('error', () => {
      media.classList.add('fitness-region-card__media--missing');
      img.remove?.();
    });
    media.append(img);

    const copy = root.createElement('div');
    copy.className = 'fitness-region-card__copy';

    const label = root.createElement('p');
    label.className = 'metric-label';
    label.textContent = region.label;

    const headline = root.createElement('p');
    headline.className = 'fitness-region-card__headline';
    headline.dataset.colour = region.colour ?? 'neutral';
    headline.textContent = formatSignedKg(region.bestSetDeltaKg);

    const secondary = root.createElement('p');
    secondary.className = 'metric-caption';
    const vol = formatSignedPct(region.volumeDeltaPct);
    secondary.textContent = vol === '—' ? 'Volume —' : `${vol} volume`;

    copy.append(label, headline, secondary);
    card.append(media, copy);
    grid.append(card);
  }
}

function renderHero(root, session, { logger, libraryByName } = {}) {
  setText(root, '[data-fitness="hero-title"]', session.title ?? 'Session');
  setText(root, '[data-fitness="hero-duration"]', session.duration_min != null ? `${session.duration_min} min` : '—');
  setText(root, '[data-fitness="hero-status"]', session.status ?? '—');

  const mapKeys = session.muscleMapKeys ?? resolveMuscleMapKeys({
    focus: session.focus,
    exercises: session.exercises,
    libraryByName
  });
  renderMuscleStrip(root.querySelector('#fitness-muscle-maps'), mapKeys);

  const tags = root.querySelector('#fitness-focus-tags');
  if (tags) {
    tags.replaceChildren();
    for (const tag of session.focus ?? []) {
      const pill = root.createElement('span');
      pill.className = 'fitness-tag';
      pill.textContent = String(tag);
      tags.append(pill);
    }
  }

  const list = root.querySelector('#fitness-exercise-list');
  const notesEl = root.querySelector('[data-fitness="hero-notes"]');
  const planned = session.status === 'planned';

  if (planned && logger) {
    list?.setAttribute('hidden', '');
    if (notesEl) {
      notesEl.textContent = '';
      notesEl.setAttribute('hidden', '');
    }
    logger.mount(session);
  } else {
    logger?.unmount?.();
    list?.removeAttribute('hidden');
    notesEl?.removeAttribute('hidden');
    if (notesEl) notesEl.textContent = session.notes?.trim() || '';
    if (list) {
      list.replaceChildren();
      for (const exercise of session.exercises ?? []) {
        const row = root.createElement('div');
        row.className = 'fitness-exercise';
        const title = root.createElement('strong');
        title.textContent = formatExerciseTitle(exercise);
        row.append(title);
        const detail = root.createElement('p');
        detail.className = 'fitness-exercise__sets';
        detail.textContent = formatExerciseSets(exercise) || (session.status === 'planned' ? 'Sets to be confirmed' : 'No sets logged');
        row.append(detail);
        list.append(row);
      }
    }
  }

  const pain = root.querySelector('#fitness-pain-flags');
  if (pain) {
    pain.replaceChildren();
    for (const flag of session.pain_flags ?? []) {
      const pill = root.createElement('span');
      pill.className = 'fitness-tag';
      pill.textContent = typeof flag === 'string' ? flag : (flag?.area ?? flag?.note ?? 'pain');
      pain.append(pill);
    }
  }
}

function renderFocusStrip(root, focusHits) {
  const strip = root.querySelector('#fitness-focus-strip');
  if (!strip) return;
  strip.replaceChildren();
  if (!focusHits.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No focus tags this week';
    strip.append(empty);
    return;
  }
  for (const hit of focusHits) {
    const pill = root.createElement('span');
    pill.className = 'fitness-focus-pill';
    const label = root.createElement('strong');
    label.textContent = hit.label;
    const count = root.createElement('span');
    count.textContent = `×${hit.count}`;
    pill.append(label, count);
    strip.append(pill);
  }
}

function renderComparisons(root, comparisons) {
  const host = root.querySelector('#fitness-comparisons');
  if (!host) return;
  host.replaceChildren();
  if (!comparisons.length) {
    const empty = root.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'No exercises to compare yet';
    host.append(empty);
    return;
  }
  for (const row of comparisons) {
    const item = root.createElement('div');
    item.className = 'fitness-compare-row';
    const name = root.createElement('strong');
    name.textContent = row.name ?? 'Exercise';
    const detail = root.createElement('p');
    if (row.firstLogged) {
      detail.textContent = `${formatLoad(row.currentBest)} · first logged`;
    } else {
      detail.textContent = `${formatLoad(row.currentBest)} vs ${formatLoad(row.previousBest)}`;
    }
    item.append(name, detail);
    if (row.isPr) {
      const badge = root.createElement('span');
      badge.className = 'pr-badge';
      badge.textContent = 'PR';
      item.append(badge);
    } else if (row.firstLogged) {
      const first = root.createElement('span');
      first.className = 'fitness-first-logged';
      first.textContent = 'New';
      item.append(first);
    }
    host.append(item);
  }
}

function formatLoad(set) {
  if (!set) return '—';
  return `${set.weight_kg} kg × ${set.reps}`;
}

function renderHeatmap(root, month) {
  const grid = root.querySelector('#fitness-heatmap');
  if (!grid) return;
  grid.replaceChildren();
  for (const day of month) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(day.completed);
    tile.title = day.date;
    grid.append(tile);
  }
}
