import { applyRingTarget } from './chart-kit/apply-ring.js';
import { renderHomeCharts } from './render-home-charts.js';
import { formatGrams } from '../core/aggregate.js';
import { formatDisplayDate } from '../core/time.js';

const setText = (root, selector, value) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = String(value);
};

const formatDate = date => formatDisplayDate(date);

const STATUS_LABEL = {
  dated: 'Dated',
  complete: 'Met',
  will_not_arrive: 'Off course',
  locked: 'Locked'
};

function paintPath(root, key, path) {
  const host = root.querySelector(`[data-home-path="${key}"]`);
  if (!host || !path) return;
  const status = host.querySelector('[data-home-path-status]');
  if (status) {
    const statusName = path.status ?? 'locked';
    status.dataset.status = statusName;
    status.textContent = STATUS_LABEL[statusName] ?? 'Locked';
  }
  setText(host, '[data-home-path-main]', path.main ?? '—');
  setText(host, '[data-home-path-detail]', path.detail ?? '');
}

function paintForecastCards(root, cards) {
  if (!cards) return;
  setText(root, '[data-home="paths-headline"]', cards.paths.headline);
  setText(root, '[data-home="paths-detail"]', cards.paths.detail);
  paintPath(root, 'as_logged', cards.paths.asLogged);
  paintPath(root, 'on_plan', cards.paths.onPlan);
  setText(root, '[data-home="stimulus-rate"]', cards.stimulus.rate);
  setText(root, '[data-home="stimulus-detail"]', cards.stimulus.detail);
  setText(root, '[data-home="stimulus-gate"]', cards.stimulus.gate);
  setText(root, '[data-home="scale-headline"]', cards.scale.headline);
  setText(root, '[data-home="scale-detail"]', cards.scale.detail);
}

export function renderHome(root, model, options = {}) {
  const quiet = options.quiet === true;
  const app = root.querySelector('#app');
  if (app) app.dataset.state = 'ready';

  setText(root, '[data-value="date"]', formatDate(model.date));
  setText(root, '[data-value="calories"]', model.nutrition.calories.toLocaleString('en-AU'));
  setText(root, '[data-target="calories"]', `of ${model.targets.calories.toLocaleString('en-AU')} kcal`);
  setText(root, '[data-value="protein"]', `${formatGrams(model.nutrition.protein_g)} g`);
  setText(root, '[data-target="protein"]', `/ ${formatGrams(model.targets.protein_g)} g`);
  setText(root, '[data-value="fat"]', `${formatGrams(model.nutrition.fat_g)} g`);
  setText(root, '[data-target="fat"]', `/ ${formatGrams(model.targets.fat_ceiling_g)} g`);
  setText(root, '[data-value="sync"]', 'Live data ready');

  paintForecastCards(root, model.forecastCards);
  renderHomeCharts(root, model.forecastCards, { quiet });

  const hammondLine = root.querySelector('[data-value="hammond-line"]');
  if (hammondLine) {
    if (model.hammondLine) {
      hammondLine.textContent = model.hammondLine;
      hammondLine.removeAttribute('hidden');
    } else {
      hammondLine.textContent = '';
      hammondLine.setAttribute('hidden', '');
    }
  }

  const openBody = root.querySelector('[data-home="open-body"]');
  if (openBody) {
    openBody.onclick = () => options.onOpenSection?.('body');
  }

  const ringMap = {
    calories: { value: model.nutrition.calories, target: model.targets.calories },
    protein: { value: model.nutrition.protein_g, target: model.targets.protein_g },
    fat: { value: model.nutrition.fat_g, target: model.targets.fat_ceiling_g }
  };
  for (const [name, config] of Object.entries(ringMap)) {
    applyRingTarget(root.querySelector(`[data-ring="${name}"]`), config, {
      size: 72,
      strokeWidth: 7,
      quiet
    });
    setText(root, `[data-percent="${name}"]`, `${model.progress[name]}%`);
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
