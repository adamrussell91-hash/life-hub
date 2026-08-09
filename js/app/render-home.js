import { applyRingTarget } from './chart-kit/apply-ring.js';

const DAY_TYPE_LABELS = {
  movement: 'Movement day',
  workout_30: '30-minute workout',
  workout_45_60: '45–60 minute workout'
};

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const formatDate = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long'
}).format(new Date(`${date}T12:00:00+10:00`));

const setProgress = (root, name, value) => {
  const element = root.querySelector(`[data-progress="${name}"]`);
  if (!element) return;
  element.style.setProperty('--progress', `${Math.min(Math.max(value, 0), 100)}%`);
  element.setAttribute('aria-valuenow', String(Math.min(Math.max(value, 0), 100)));
};

export function renderHome(root, model) {
  const app = root.querySelector('#app');
  if (app) app.dataset.state = 'ready';

  setText(root, '[data-value="date"]', formatDate(model.date));
  setText(root, '[data-value="calories"]', model.nutrition.calories.toLocaleString('en-AU'));
  setText(root, '[data-target="calories"]', `of ${model.targets.calories.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-value="protein"]', `${model.nutrition.protein_g} g`);
  setText(root, '[data-target="protein"]', `/ ${model.targets.protein_g} g`);
  setText(root, '[data-value="fat"]', `${model.nutrition.fat_g} g`);
  setText(root, '[data-target="fat"]', `/ ${model.targets.fat_ceiling_g} g`);
  setText(root, '[data-value="workout"]', DAY_TYPE_LABELS[model.dayType] ?? 'Movement day');
  setText(root, '[data-value="workout-state"]', model.dayType === 'movement' ? 'No completed session' : 'Completed');
  setText(root, '[data-value="streak"]', model.workoutStreak);
  setText(root, '[data-value="logging"]', `${model.completeness.complete} of ${model.completeness.total}`);
  setText(root, '[data-value="sync"]', 'Live data ready');
  setText(root, '#week-label', model.weekSummary.headline);
  setText(root, '[data-week-detail]', model.weekSummary.detail);

  const weekStrip = root.querySelector('.week-strip');
  if (weekStrip && Array.isArray(model.weekDays)) {
    weekStrip.replaceChildren();
    weekStrip.setAttribute('aria-label', 'This week logging coverage');
    for (const day of model.weekDays) {
      const cell = root.createElement('span');
      if (day.isToday) cell.classList.add('is-current');
      if (day.logged) cell.dataset.hit = 'true';
      const label = root.createElement('small');
      label.textContent = day.letter;
      const dot = root.createElement('i');
      cell.append(label, dot);
      weekStrip.append(cell);
    }
  }

  const ringMap = {
    calories: { value: model.nutrition.calories, target: model.targets.calories },
    protein: { value: model.nutrition.protein_g, target: model.targets.protein_g },
    fat: { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g }
  };
  for (const [name, config] of Object.entries(ringMap)) {
    applyRingTarget(root.querySelector(`[data-ring="${name}"]`), config, { size: 72, strokeWidth: 7 });
    setText(root, `[data-percent="${name}"]`, `${model.progress[name]}%`);
  }
  setProgress(root, 'logging', model.progress.logging);
  setText(root, '[data-percent="logging"]', `${model.progress.logging}%`);

  for (const [category, complete] of Object.entries(model.completeness)) {
    if (category === 'complete' || category === 'total') continue;
    const item = root.querySelector(`[data-complete="${category}"]`);
    if (item) item.dataset.checked = String(complete);
  }

  const fatOver = Boolean(model.overFatCeiling);
  root.querySelector('#home-dashboard')
    ?.classList?.toggle?.('nutrition--fat-over', fatOver);

  const status = root.querySelector('#app-status');
  if (status) status.textContent = `Life Hub loaded for ${formatDate(model.date)}.`;
  root.querySelector('#unavailable-panel')?.setAttribute('hidden', '');
  // Visibility is owned by showSection / setSectionVisibility — do not force-show
  // Home here, or a refresh while on Chat resurfaces Daily Pulse over the chat.
}

export function renderWarnings(root, warnings) {
  const panel = root.querySelector('#data-warning');
  const list = root.querySelector('#warning-list');
  if (!panel || !list) return;

  list.replaceChildren();
  for (const warning of warnings) {
    const item = root.createElement('li');
    item.textContent = `${warning.path} (${warning.code})`;
    list.append(item);
  }
  panel.hidden = warnings.length === 0;
}

export function renderUnavailable(root, message) {
  const app = root.querySelector('#app');
  if (app) app.dataset.state = 'unavailable';
  setText(root, '[data-error-message]', message);
  const panel = root.querySelector('#unavailable-panel');
  if (panel) panel.hidden = false;
  root.querySelector('#home-dashboard')?.setAttribute('hidden', '');
  const status = root.querySelector('#app-status');
  if (status) status.textContent = message;
}
