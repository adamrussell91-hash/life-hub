import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { buildNutritionModel } from '../../apps/life/js/app/nutrition-model.js';

const date = '2026-10-10';
const now = new Date('2026-10-10T08:30:00+11:00');
const events = [{ record: { type: 'creatine', date, time: '08:00', dose_key: 'dose-1', grams: 10, product: 'Coles creatine' } }];
const ready = { status: 'ready', complete: true };
function model(extra = {}) { return buildNutritionModel({ events, date, now, history: ready, ...extra }); }

test('nutrition supplies the real clock and history to its creatine model', () => {
  const result = model();
  assert.ok(result.creatine, 'nutrition should expose its creatine estimate');
  assert.equal(result.creatine.asOf, now.toISOString());
  assert.equal(result.creatine.todayGrams, 10);
  assert.equal(result.creatine.planConfirmed, false);
  assert.equal(model({ history: { loading: true } }).creatine.confidence, 'incomplete');
});

test('creatine card renders actual intake, default routine, estimate info and dose potential without demo controls', async () => {
  const result = model();
  assert.ok(result.creatine);
  const { renderCreatine } = await import('../../apps/life/js/app/render-creatine.js');
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<article id="nutrition-creatine"></article>';
  const cleanup = renderCreatine(doc, result.creatine, { quiet: true });
  const card = doc.querySelector('#nutrition-creatine');
  assert.match(card.textContent, /Creatine/);
  assert.match(card.textContent, /5 g\/day · default/);
  assert.match(card.textContent, /10 g today/);
  assert.match(card.textContent, /Coles creatine/);
  assert.match(card.textContent, /Muscle stores.*Recent dose.*Forecast/s);
  assert.equal(card.querySelectorAll('button').length, 1);
  assert.ok(card.querySelector('button.hub-chart-info'));
  assert.ok(card.querySelector('[data-role="pending-dose"]'));
  assert.ok(card.querySelector('[data-role="forecast"]'));
  assert.match(doc.querySelector('.hub-chart-info__note').textContent, /not.*measured|not measured/i);
  assert.match(doc.querySelector('.hub-chart-info__note').textContent, /conservative lower estimate.*target and ETA/s);
  assert.doesNotMatch(card.textContent, /absorb.*[0-9].*hour|deficit/i);
  assert.ok(card.querySelector('svg').getAttribute('viewBox'));
  cleanup();
  window.happyDOM.abort();
});

test('incomplete history suppresses levels and forecasts while empty loaded history stays honest', async () => {
  assert.ok(model().creatine);
  const { renderCreatine } = await import('../../apps/life/js/app/render-creatine.js');
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<article id="nutrition-creatine"></article>';
  renderCreatine(doc, model({ history: { loading: true } }).creatine, { quiet: true });
  assert.match(doc.querySelector('#nutrition-creatine').textContent, /History unavailable|History loading/);
  assert.equal(doc.querySelector('[data-role="forecast"]'), null);
  assert.equal(doc.querySelector('[data-role="stores-line"]'), null);
  renderCreatine(doc, model({ events: [] }).creatine, { quiet: true });
  assert.match(doc.querySelector('#nutrition-creatine').textContent, /0 g today.*No doses logged/s);
  assert.equal(doc.querySelector('[data-role="pending-dose"]'), null);
  assert.equal(doc.querySelectorAll('.hub-chart-info__note').length, 1);
  window.happyDOM.abort();
});

test('creatine layout is immediately below macro row with exact half desktop and full phone width', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');
  const window = new Window();
  window.document.body.innerHTML = html;
  const card = window.document.querySelector('#nutrition-creatine');
  assert.ok(card, 'creatine card should exist');
  assert.equal(card.previousElementSibling.className, 'nutrition-week-row');
  assert.match(css, /\.creatine-card\s*\{[^}]*width:\s*50%/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)\s*\{\s*\.creatine-card\s*\{\s*width:\s*100%/);
  window.happyDOM.abort();
});

test('elastic geometry redraws at phone width with separate target-label space and bounded dose potential', async () => {
  const { buildCreatineElastic } = await import('../../apps/life/js/app/chart-kit/creatine-elastic.js');
  for (const width of [260, 400, 650]) {
    const chart = buildCreatineElastic(model().creatine, { width });
    assert.equal(chart.width, width);
    assert.ok(chart.targetY > chart.top && chart.top > 12);
    assert.ok(chart.current.x > chart.left && chart.current.x < chart.right);
    assert.ok(chart.pending.x > chart.current.x && chart.pending.x < chart.right);
    assert.ok(chart.pending.y >= chart.top && chart.pending.y <= chart.base);
    for (const path of [chart.line, chart.forecast, chart.forecastBand]) {
      assert.ok(path.startsWith('M'));
      assert.doesNotMatch(path, /NaN|Infinity|undefined/);
    }
  }
});

test('elastic motion settles once, redraws on resize and cancels observers and frames on remount', async () => {
  const { renderCreatine } = await import('../../apps/life/js/app/render-creatine.js');
  const window = new Window();
  const doc = window.document;
  doc.body.innerHTML = '<article id="nutrition-creatine"></article>';
  const queue = new Map(), observers = [];
  let nextId = 0, cancels = 0;
  window.requestAnimationFrame = callback => { queue.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { cancels++; queue.delete(id); };
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const estimate = model().creatine;
  renderCreatine(doc, estimate);
  assert.equal(queue.size, 1);
  for (const time of [0, 450, 900]) {
    const [id, callback] = queue.entries().next().value;
    queue.delete(id);
    callback(time);
  }
  assert.equal(queue.size, 0, 'motion must stop after reaching its final geometry');
  const plot = doc.querySelector('.creatine-card__plot');
  Object.defineProperty(plot, 'clientWidth', { value: 260 });
  observers[0].callback();
  assert.equal(doc.querySelector('svg').getAttribute('viewBox'), '0 0 260 240');
  renderCreatine(doc, estimate);
  assert.equal(observers[0].disconnected, true);
  renderCreatine(doc, estimate, { quiet: true });
  assert.equal(cancels, 1);
  assert.equal(queue.size, 0, 'quiet refresh must not restart motion');
  assert.equal(observers[1].disconnected, true);
  assert.equal(doc.querySelectorAll('.hub-chart-info__note').length, 1);
  window.happyDOM.abort();
});


test('elastic curve stays below target until the conservative estimate reaches it', async () => {
  const { buildCreatineElastic } = await import('../../apps/life/js/app/chart-kit/creatine-elastic.js');
  const sample = {
    ...model().creatine,
    level: { low: 0.85, high: 1 }, target: 0.9, inTarget: false,
    phase: 'Loading', eta: { low: 0, high: 3 }, pendingGrams: 5,
    pendingLevel: { low: 0.89, high: 1 },
    trace: [{ low: 0.5, high: 0.8, value: 0.65 }, { low: 0.85, high: 1, value: 0.925 }],
    forecast: [{ days: 0, low: 0.85, high: 1, value: 0.925 }, { days: 1, low: 0.89, high: 1, value: 0.945 }]
  };
  const chart = buildCreatineElastic(sample);
  assert.equal(chart.trace[0].y, 114, 'history should show the conservative estimate');
  assert.ok(chart.current.y > chart.targetY, 'current dot must agree with Loading/ETA below target');
  assert.ok(chart.pending.y > chart.targetY, 'pending contribution should use the same conservative basis');
  const forecastEndY = Number(chart.forecast.trim().split(/\s+/).at(-1));
  assert.ok(forecastEndY > chart.targetY, 'dashed curve must not suggest target is reached before the lower bound');
  assert.match(chart.forecastBand, /32\.0/, 'uncertainty band must retain the upper estimate');
  const previous = { level: { low: 0.8, high: 1 }, pendingLevel: { low: 0.84, high: 1 } };
  const transitioning = buildCreatineElastic(sample, { previous, progress: 0.5 });
  assert.ok(transitioning.current.y > chart.current.y && transitioning.current.y > chart.targetY);
  const reached = buildCreatineElastic({ ...sample, level: { low: 0.91, high: 1 }, trace: [{ low: 0.91, high: 1, value: 0.955 }] });
  assert.ok(reached.current.y < reached.targetY);
  const fallback = buildCreatineElastic({ ...sample, trace: [] });
  assert.ok(fallback.current.y > fallback.targetY, 'fallback current geometry must use the same basis');
});
