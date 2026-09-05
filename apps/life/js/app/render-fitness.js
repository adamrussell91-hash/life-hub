import { fillExercisePlanList } from './render-workout-plan.js';
import { muscleAssetPath, resolveMuscleMapKeys } from './muscle-maps.js';
import { formatDisplayDate, formatWeekday } from '../core/time.js';
import { renderFitnessCharts } from './render-fitness-charts.js';
import { createRunWidget } from '../../../../packages/design-kit/js/hub-surfaces.js';

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

export function renderFitness(root, model, { logger, templates, libraryByName, onSelectTemplate } = {}) {
  setText(root, '[data-fitness="streak"]', model.streak);
  setText(root, '[data-fitness="day-type"]', DAY_TYPE_LABELS[model.dayType] ?? model.dayType ?? '—');

  renderStatus(root, model);
  renderWorkingWeights(root, model.workingWeights);
  renderVolumeWeeks(root, model);
  renderFitnessCharts(root, model.charts);
  renderRegions(root, model.regions);
  renderRecentSessions(root, model.recentSessions);

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
  renderRunWidget(root, model);

  root.querySelector('#fitness-dashboard')?.removeAttribute('hidden');
}

function renderRunWidget(root, model) {
  const host = root.querySelector('[data-fitness="run-widget"]');
  if (!host) return;
  host.replaceChildren();
  const sessionKm = Number(model.heroSession?.distance_km);
  if (!(Number.isFinite(sessionKm) && sessionKm > 0)) {
    host.setAttribute('hidden', '');
    return;
  }
  host.removeAttribute('hidden');
  createRunWidget({ root, wrap: host, distance: sessionKm, unit: 'km', label: 'Last session' });
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

function renderStatus(root, model) {
  const done = Number.isFinite(model.weekCompletedCount) ? model.weekCompletedCount : 0;
  const target = Number.isFinite(model.weekTarget) && model.weekTarget > 0 ? model.weekTarget : 4;
  setText(root, '[data-fitness="week-done"]', String(done));
  setText(root, '[data-fitness="week-target"]', String(target));
  setText(root, '[data-fitness="week-volume"]', formatKg(model.weekVolumeKg));
  setText(root, '[data-fitness="last-week-volume"]', formatKg(model.lastWeekVolumeKg));

  const trained = (model.weekDots ?? []).filter(day => day.completed);
  const weekStory = root.querySelector('[data-fitness="week-story"]');
  if (weekStory) {
    if (!trained.length) {
      weekStory.textContent = `No sessions yet this week · target ${target}`;
    } else {
      const days = trained.map(day => `${(formatWeekday(day.date) || '').slice(0, 3)} ${formatDisplayDate(day.date)}`);
      const rest = Math.max(0, 7 - trained.length);
      weekStory.textContent = `Trained ${days.join(', ')} · ${rest} rest day${rest === 1 ? '' : 's'}`;
    }
  }

  const monthStory = root.querySelector('[data-fitness="month-story"]');
  if (monthStory) {
    const hits = Number.isFinite(model.monthHitCount) ? model.monthHitCount : 0;
    const last = model.lastCompletedDate ? formatDisplayDate(model.lastCompletedDate) : null;
    monthStory.textContent = hits
      ? `Last 30 days: ${hits} session${hits === 1 ? '' : 's'}${last ? ` · most recent ${last}` : ''}`
      : 'Last 30 days: no completed sessions';
  }

  const paceStory = root.querySelector('[data-fitness="pace-story"]');
  if (paceStory) {
    const remaining = Number.isFinite(model.weekRemaining) ? model.weekRemaining : Math.max(0, target - done);
    const avgVol = formatKg(model.avgSessionVolumeKg);
    const avgMin = Number.isFinite(model.avgDurationMin) ? `${model.avgDurationMin} min` : null;
    const pace = remaining === 0
      ? 'Week target hit'
      : `${remaining} session${remaining === 1 ? '' : 's'} short of ${target}`;
    const extras = [avgVol !== '—' ? `avg session ${avgVol}` : null, avgMin].filter(Boolean);
    paceStory.textContent = extras.length ? `${pace} · ${extras.join(' · ')}` : pace;
  }

  const next = root.querySelector('[data-fitness="next-planned"]');
  if (next) {
    if (model.nextPlanned?.date) {
      const day = (formatWeekday(model.nextPlanned.date) || '').slice(0, 3);
      next.textContent = `Next planned: ${model.nextPlanned.title ?? 'Session'} · ${day} ${formatDisplayDate(model.nextPlanned.date)}`;
      next.removeAttribute('hidden');
    } else {
      next.textContent = '';
      next.setAttribute('hidden', '');
    }
  }
}

function renderWorkingWeights(root, weights) {
  const host = root.querySelector('#fitness-loads');
  const card = root.querySelector('#fitness-loads-card');
  if (!host) return;
  host.replaceChildren();
  const rows = Array.isArray(weights) ? weights : [];
  setHidden(card, rows.length === 0);
  for (const row of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-kv-row';
    const name = root.createElement('strong');
    name.textContent = row.name;
    const load = root.createElement('span');
    load.textContent = `${formatLoad(row)} · ${formatDisplayDate(row.date)}`;
    item.append(name, load);
    host.append(item);
  }
}

function appendKvRow(root, host, label, value) {
  const row = root.createElement('div');
  row.className = 'fitness-kv-row';
  const name = root.createElement('strong');
  name.textContent = label;
  const amount = root.createElement('span');
  amount.textContent = value;
  row.append(name, amount);
  host.append(row);
}

function renderVolumeWeeks(root, model) {
  const host = root.querySelector('#fitness-volume-rows');
  const card = root.querySelector('#fitness-volume-card');
  if (!host) return;
  host.replaceChildren();
  const delta = formatSignedPct(model.weekVolumeDeltaPct);
  setText(root, '[data-fitness="volume-delta"]', delta);
  setHidden(root.querySelector('[data-fitness="volume-delta-wrap"]'), delta === '—');
  appendKvRow(root, host, 'Last 30 days', formatKg(model.monthVolumeKg));
  appendKvRow(root, host, 'Avg session', formatKg(model.avgSessionVolumeKg));
  appendKvRow(
    root,
    host,
    'Avg duration',
    Number.isFinite(model.avgDurationMin) ? `${model.avgDurationMin} min` : '—'
  );
  appendKvRow(root, host, 'Unique lifts', String(model.charts?.uniqueLifts ?? 0));
  appendKvRow(
    root,
    host,
    'kg / set',
    formatKg(model.charts?.volumePerSetKg)
  );
  setHidden(card, false);
}

function renderRecentSessions(root, sessions) {
  const host = root.querySelector('#fitness-recent');
  const card = root.querySelector('#fitness-recent-card');
  if (!host) return;
  host.replaceChildren();
  const rows = Array.isArray(sessions) ? sessions : [];
  setHidden(card, rows.length === 0);
  for (const session of rows) {
    const item = root.createElement('div');
    item.className = 'fitness-recent-row';
    const title = root.createElement('strong');
    title.textContent = session.title ?? 'Session';
    const meta = root.createElement('p');
    const parts = [
      formatWeekday(session.date),
      formatDisplayDate(session.date),
      formatKg(session.volume),
      session.duration_min != null ? `${session.duration_min} min` : null,
      session.exerciseCount ? `${session.exerciseCount} lifts` : null
    ].filter(Boolean);
    meta.textContent = parts.join(' · ');
    item.append(title, meta);
    host.append(item);
  }
}

function renderRegions(root, regions) {
  const grid = root.querySelector('#fitness-region-grid');
  const block = root.querySelector('.fitness-region-block');
  if (!grid) return;
  grid.replaceChildren();
  const visible = (regions ?? []).filter(region => (
    region.currentBestKg != null || (Number(region.currentVolume) > 0)
  ));
  setHidden(block, visible.length === 0);

  for (const region of visible) {
    const card = root.createElement('div');
    card.className = 'fitness-region-card';
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
  setText(root, '[data-fitness="hero-volume"]', formatKg(session.volume));

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
