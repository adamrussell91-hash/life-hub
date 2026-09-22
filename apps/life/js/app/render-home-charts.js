/**
 * Home forecast charts: Stimulus (gate rings / region rose), Scale (glide slope)
 * and Recomp (twin clocks + the road into the box). Data comes from
 * model.forecastCards (home-forecast.js); geometry from chart-kit.
 */
import { applyHubPillsThumb } from '../../../../packages/design-kit/js/hub-motion.js';
import { buildGateRings } from './chart-kit/gate-rings.js';
import { buildGlideSlope } from './chart-kit/glide-slope.js';
import { buildRecompPlane } from './chart-kit/recomp-plane.js';
import { buildRegionRose } from './chart-kit/region-rose.js';
import { buildTwinClocks } from './chart-kit/twin-clocks.js';
import { mountSceneChart, selectSceneGroup } from './render-scene-chart.js';

const STIMULUS_VIEWS = ['gate', 'regions'];

function stimulusView(root) {
  const card = root.querySelector('[data-home-card="stimulus"]');
  const view = card?.dataset.view;
  return STIMULUS_VIEWS.includes(view) ? view : 'gate';
}

function setStimulusView(root, view, cards, options) {
  const card = root.querySelector('[data-home-card="stimulus"]');
  if (!card) return;
  card.dataset.view = view;
  const pills = card.querySelector('[data-home-stimulus-views]');
  for (const button of card.querySelectorAll('[data-stimulus-view]')) {
    const on = button.dataset.stimulusView === view;
    button.setAttribute('aria-selected', on ? 'true' : 'false');
    button.tabIndex = on ? 0 : -1;
  }
  if (pills) requestAnimationFrame(() => applyHubPillsThumb(pills));
  paintStimulus(root, cards, options);
}

function resetHost(host) {
  host._hc?.resize?.disconnect();
  clearTimeout(host._hc?.settleTimer);
  host._hc = null;
  host.replaceChildren();
}

function paintStimulus(root, cards, options) {
  const host = root.querySelector('[data-home-chart="stimulus"]');
  const chart = cards?.stimulus?.chart;
  if (!host || !chart) return;
  const view = stimulusView(root);
  host.dataset.view = view;
  if (view === 'regions') {
    // A fresh shell per view keeps each view's selection and motion independent.
    if (host._hcView !== 'regions') resetHost(host);
    host._hcView = 'regions';
    mountSceneChart(host, buildRegionRose, chart, { quiet: options.quiet, maxWidth: 620 });
  } else {
    if (host._hcView !== 'gate') resetHost(host);
    host._hcView = 'gate';
    mountSceneChart(host, buildGateRings, chart, {
      quiet: options.quiet,
      maxWidth: 620,
      onAction: action => {
        if (action === 'open-regions') setStimulusView(root, 'regions', cards, { quiet: false });
      }
    });
  }
}

function wireStimulusViews(root, getCards) {
  const card = root.querySelector('[data-home-card="stimulus"]');
  if (!card || card.dataset.viewsWired === '1') return;
  card.dataset.viewsWired = '1';
  const buttons = [...card.querySelectorAll('[data-stimulus-view]')];
  for (const button of buttons) {
    button.addEventListener('click', () => setStimulusView(root, button.dataset.stimulusView, getCards(), { quiet: false }));
    button.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = buttons[(buttons.indexOf(button) + step + buttons.length) % buttons.length];
      next.focus();
      next.click();
    });
  }
}

function paintRecomp(root, cards, options, lockText) {
  const clocksHost = root.querySelector('[data-home-chart="clocks"]');
  const planeHost = root.querySelector('[data-home-chart="plane"]');
  const chart = cards?.recomp;
  if (!chart) return;
  const link = target => group => selectSceneGroup(target, group);
  if (clocksHost) {
    mountSceneChart(clocksHost, (data, opts) => buildTwinClocks(data, { ...opts, lockText }), chart, {
      quiet: options.quiet,
      onSelect: planeHost ? link(planeHost) : undefined
    });
  }
  if (planeHost) {
    mountSceneChart(planeHost, buildRecompPlane, chart, {
      quiet: options.quiet,
      onSelect: clocksHost ? link(clocksHost) : undefined
    });
  }
}

/**
 * @param {Document} root
 * @param {object} cards  model.forecastCards
 * @param {{ quiet?: boolean }} options
 */
export function renderHomeCharts(root, cards, options = {}) {
  if (!root?.querySelector || !cards) return;
  root._homeChartCards = cards;
  wireStimulusViews(root, () => root._homeChartCards);
  paintStimulus(root, cards, options);
  const scaleHost = root.querySelector('[data-home-chart="scale"]');
  if (scaleHost && cards.scale?.chart) {
    mountSceneChart(scaleHost, buildGlideSlope, cards.scale.chart, { quiet: options.quiet, maxWidth: 720 });
  }
  paintRecomp(root, cards, options, cards.paths?.detail ?? '');
}
