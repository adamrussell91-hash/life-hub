import { fillExercisePlanList } from './render-workout-plan.js';
import { muscleAssetPath, resolveMuscleMapKeys } from './muscle-maps.js';
import { formatDisplayDate, formatWeekday } from '../core/time.js';

const VOLUME_BAR_WEEKS = 12;
const VOLUME_BAR_MIN = 8;

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

const formatKg = kg => {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return '—';
  const text = Number.isInteger(kg) ? kg.toLocaleString('en-AU') : kg.toFixed(1);
  return `${text} kg`;
};

const formatWorkoutsPerWeek = value => {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (Number.isInteger(value)) return String(value);
  return value < 1 ? value.toFixed(2) : value.toFixed(1);
};

export function renderFitness(root, model, { logger, templates, libraryByName, onSelectTemplate } = {}) {
  setText(root, '[data-fitness="streak"]', model.streak);
  setText(root, '[data-fitness="day-type"]', DAY_TYPE_LABELS[model.dayType] ?? model.dayType ?? '—');

  renderWeekBoard(root, model);
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
    meta.textContent = template.source_session_date ? `Last ${formatDisplayDate(template.source_session_date)}` : 'No actuals yet';
    card.append(meta);

    card.addEventListener('click', () => onSelectTemplate?.(template));
    rail.append(card);
  }
}

function renderWeekBoard(root, model) {
  const done = Number.isFinite(model.weekCompletedCount) ? model.weekCompletedCount : 0;
  const target = Number.isFinite(model.weekTarget) && model.weekTarget > 0 ? model.weekTarget : 4;
  setText(root, '[data-fitness="week-done"]', String(done));
  setText(root, '[data-fitness="week-target"]', String(target));

  const volumeByDate = new Map((model.weekVolume ?? []).map(day => [day.date, day.volume]));
  const maxVolume = Math.max(0, ...volumeByDate.values());
  const days = root.querySelector('#fitness-week-days');
  if (days) {
    days.replaceChildren();
    for (const day of model.weekDots ?? []) {
      const cell = root.createElement('div');
      cell.className = 'fitness-week-day';
      cell.dataset.hit = String(Boolean(day.completed));
      if (day.isToday) cell.dataset.today = 'true';
      cell.title = formatDisplayDate(day.date);

      const name = root.createElement('span');
      name.className = 'fitness-week-day__name';
      name.textContent = (formatWeekday(day.date) || '').slice(0, 2);

      const bar = root.createElement('span');
      bar.className = 'fitness-week-day__bar';
      const fill = root.createElement('i');
      const volume = volumeByDate.get(day.date) ?? 0;
      const pct = maxVolume > 0 ? Math.max(8, Math.round((volume / maxVolume) * 100)) : 8;
      fill.style = fill.style ?? {};
      if (typeof fill.style.setProperty === 'function') {
        fill.style.setProperty('--bar', day.completed ? `${pct}%` : '8%');
      } else {
        fill.style['--bar'] = day.completed ? `${pct}%` : '8%';
      }
      bar.append(fill);

      cell.append(name, bar);
      days.append(cell);
    }
  }

  const track = root.querySelector('#fitness-quota-track');
  if (track) {
    track.replaceChildren();
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(target));
    track.setAttribute('aria-valuenow', String(done));
    for (let i = 0; i < target; i++) {
      const slot = root.createElement('span');
      slot.dataset.filled = String(i < done);
      track.append(slot);
    }
  }
}

function renderLongTerm(root, longTerm) {
  const data = longTerm ?? {};
  const delta = formatSignedPct(data.volumeDeltaPct);
  setText(root, '[data-fitness="volume-delta"]', delta);
  setText(root, '[data-fitness="workouts-week"]', formatWorkoutsPerWeek(data.workoutsPerWeek));
  setHidden(root.querySelector('[data-fitness="volume-delta-wrap"]'), delta === '—');

  const host = root.querySelector('#fitness-volume-bars');
  if (!host) return;
  host.replaceChildren();
  const recent = (data.weeklyVolume ?? []).slice(-VOLUME_BAR_WEEKS);
  const firstHit = recent.findIndex(week => Number(week.value) > 0);
  let start = firstHit > 0 ? Math.max(0, firstHit - 1) : 0;
  if (recent.length - start < VOLUME_BAR_MIN) start = Math.max(0, recent.length - VOLUME_BAR_MIN);
  const series = recent.slice(start);
  const max = Math.max(0, ...series.map(week => Number(week.value) || 0));
  for (const week of series) {
    const bar = root.createElement('span');
    bar.className = 'fitness-volume-bar';
    const value = Number(week.value) || 0;
    const pct = max > 0 ? Math.max(value > 0 ? 12 : 6, Math.round((value / max) * 100)) : 6;
    bar.dataset.hasValue = String(value > 0);
    bar.title = `${formatDisplayDate(week.weekStart)} · ${formatKg(value)}`;
    bar.style = bar.style ?? {};
    if (typeof bar.style.setProperty === 'function') {
      bar.style.setProperty('--bar', `${pct}%`);
    } else {
      bar.style['--bar'] = `${pct}%`;
    }
    host.append(bar);
  }
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
    img.alt = `${region.label} anatomy`;
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
    headline.textContent = region.bestSetDeltaKg != null
      ? formatSignedKg(region.bestSetDeltaKg)
      : formatKg(region.currentBestKg);

    const secondary = root.createElement('p');
    secondary.className = 'metric-caption';
    const volDelta = formatSignedPct(region.volumeDeltaPct);
    const volNow = formatKg(region.currentVolume);
    secondary.textContent = volDelta !== '—'
      ? `${volDelta} volume`
      : volNow === '—' ? 'Volume —' : `${volNow} volume`;

    copy.append(label, headline, secondary);
    card.append(media, copy);
    grid.append(card);
  }
}

function setHidden(element, hidden) {
  if (!element) return;
  if (hidden) element.setAttribute('hidden', '');
  else element.removeAttribute('hidden');
}

function renderHero(root, session, { logger, libraryByName } = {}) {
  setText(root, '[data-fitness="hero-day"]', formatWeekday(session.date) || '');
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
  const preview = root.querySelector('[data-fitness="hero-preview"]');
  const startBtn = root.querySelector('#fitness-start-workout');
  const loggerEl = root.querySelector('#fitness-logger');
  const notesEl = root.querySelector('[data-fitness="hero-notes"]');
  const planned = session.status === 'planned';
  const started = Boolean(logger?.getTimerState?.()?.everStarted);

  if (list) {
    fillExercisePlanList(root, list, {
      exercises: session.exercises ?? [],
      libraryByName,
      detail: planned ? 'count' : 'sets'
    });
  }

  if (planned && logger) {
    setHidden(preview, started);
    setHidden(startBtn, started);
    setHidden(loggerEl, !started);
    if (notesEl) {
      notesEl.textContent = '';
      notesEl.setAttribute('hidden', '');
    }
    if (started) {
      logger.mount(session);
    } else if (startBtn) {
      startBtn.onclick = () => {
        logger.mount(session);
        logger.startTimer();
        setHidden(preview, true);
        setHidden(startBtn, true);
        setHidden(loggerEl, false);
      };
    }
  } else {
    logger?.unmount?.();
    setHidden(preview, false);
    setHidden(startBtn, true);
    notesEl?.removeAttribute('hidden');
    if (notesEl) notesEl.textContent = session.notes?.trim() || '';
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
  const card = root.querySelector('#fitness-focus-card');
  if (!strip) return;
  strip.replaceChildren();
  const hits = Array.isArray(focusHits) ? focusHits : [];
  setHidden(card, hits.length === 0);
  if (!hits.length) return;
  for (const hit of hits) {
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
  const card = root.querySelector('#fitness-comparisons-card');
  if (!host) return;
  host.replaceChildren();
  const rows = (comparisons ?? []).filter(row => !row.firstLogged && row.previousBest);
  setHidden(card, rows.length === 0);
  if (!rows.length) return;
  for (const row of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-compare-row';
    const name = root.createElement('strong');
    name.textContent = row.name ?? 'Exercise';
    const detail = root.createElement('p');
    detail.textContent = `${formatLoad(row.currentBest)} vs ${formatLoad(row.previousBest)}`;
    item.append(name, detail);
    if (row.isPr) {
      const badge = root.createElement('span');
      badge.className = 'pr-badge';
      badge.textContent = 'PR';
      item.append(badge);
    } else if (row.weightDeltaKg != null && Number.isFinite(row.weightDeltaKg) && row.weightDeltaKg !== 0) {
      const delta = root.createElement('span');
      delta.className = 'fitness-compare-delta';
      delta.dataset.colour = row.weightDeltaKg > 0 ? 'green' : 'red';
      delta.textContent = formatSignedKg(row.weightDeltaKg);
      item.append(delta);
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
  const days = month ?? [];
  const hits = days.filter(day => day.completed).length;
  setText(root, '[data-fitness="month-hits"]', String(hits));
  for (const day of days) {
    const tile = root.createElement('span');
    tile.className = 'heatmap-tile';
    tile.dataset.hit = String(day.completed);
    tile.title = formatDisplayDate(day.date);
    grid.append(tile);
  }
}
