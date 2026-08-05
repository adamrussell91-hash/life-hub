import { animateColumnGrow } from './chart-kit/animate.js';
import { buildColumns } from './chart-kit/columns.js';
import { formatExerciseSets, formatExerciseTitle } from './format-exercise.js';

const DAY_TYPE_LABELS = {
  movement: 'Movement day',
  workout_30: '30-minute workout',
  workout_45_60: '45–60 minute workout'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

const formatLoad = set => {
  if (!set) return '—';
  return `${set.weight_kg} kg × ${set.reps}`;
};

export function renderFitness(root, model) {
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

  const empty = root.querySelector('[data-fitness="hero-empty"]');
  const heroWrap = root.querySelector('[data-fitness-hero]');
  if (!model.heroSession) {
    empty?.removeAttribute('hidden');
    heroWrap?.setAttribute('hidden', '');
  } else {
    empty?.setAttribute('hidden', '');
    heroWrap?.removeAttribute('hidden');
    renderHero(root, model.heroSession);
  }

  renderWeekVolume(root, model.weekVolume);
  renderFocusStrip(root, model.focusHits);
  renderComparisons(root, model.comparisons);
  renderHeatmap(root, model.month);

  root.querySelector('#fitness-dashboard')?.removeAttribute('hidden');
}

function renderHero(root, session) {
  setText(root, '[data-fitness="hero-title"]', session.title ?? 'Session');
  setText(root, '[data-fitness="hero-duration"]', session.duration_min != null ? `${session.duration_min} min` : '—');
  setText(root, '[data-fitness="hero-status"]', session.status ?? '—');
  setText(root, '[data-fitness="hero-notes"]', session.notes?.trim() || '');

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
  if (list) {
    list.replaceChildren();
    for (const exercise of session.exercises ?? []) {
      const row = root.createElement('div');
      row.className = 'fitness-exercise';
      const title = root.createElement('strong');
      title.textContent = formatExerciseTitle(exercise);
      row.append(title);
      const detail = root.createElement('p');
      detail.textContent = formatExerciseSets(exercise) || (session.status === 'planned' ? 'Sets to be confirmed' : 'No sets logged');
      row.append(detail);
      list.append(row);
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

function renderWeekVolume(root, weekVolume) {
  const host = root.querySelector('#fitness-week-volume');
  if (!host) return;
  const chart = buildColumns(weekVolume.map(day => ({
    key: day.date,
    label: weekdayLetter(day.date),
    value: day.volume
  })));
  host.replaceChildren();
  for (const bar of chart.bars) {
    const col = root.createElement('div');
    col.className = 'column-bar';
    const fill = root.createElement('span');
    col.append(fill);
    const label = root.createElement('span');
    label.textContent = bar.label;
    col.append(label);
    host.append(col);
    animateColumnGrow(fill, bar.heightPct);
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
