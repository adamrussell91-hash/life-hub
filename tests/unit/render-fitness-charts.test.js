import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitnessCharts } from '../../apps/life/js/app/render-fitness-charts.js';

class Node {
  constructor(name = 'div') {
    this.name = name;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'data-role') this.dataset.role = String(value);
  }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  querySelector(selector) {
    if (selector === '[data-role="fitness-tip"]') {
      return this.children.find(node => node.dataset?.role === 'fitness-tip') ?? null;
    }
    if (selector === '.mind-chart-legend') {
      return this.children.find(node => String(node.className || '').includes('mind-chart-legend')) ?? null;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; }
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function texts(node) {
  const found = [];
  walk(node, item => {
    if (item.textContent) found.push(item.textContent);
  });
  return found;
}

function chartRoot() {
  const nodes = new Map();
  const ensure = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Node());
    return nodes.get(selector);
  };
  return {
    nodes,
    ensure,
    createElement: () => new Node('div'),
    createElementNS: (_ns, name) => new Node(name),
    querySelector(selector) { return ensure(selector); }
  };
}

test('training rhythm combines time-of-day and monthly cadence in one radial card', () => {
  const root = chartRoot();
  renderFitnessCharts(root, {
    trainWhen: {
      count: 4,
      typicalTime: '18:40',
      typicalBand: 'evening',
      read: 'Usually evenings, around 18:40 · mostly Tue',
      buckets: [
        { key: 'morning', label: 'Morning', value: 1 },
        { key: 'afternoon', label: 'Afternoon', value: 0 },
        { key: 'evening', label: 'Evening', value: 3 },
        { key: 'night', label: 'Night', value: 0 }
      ]
    },
    monthRhythm: {
      count: 4,
      days: 30,
      longestGap: 8,
      read: '4 sessions in the last 30 days · longest gap 8 days',
      weeks: [
        { key: '2026-08-04', value: 0 },
        { key: '2026-08-11', value: 1 },
        { key: '2026-08-18', value: 2 },
        { key: '2026-08-25', value: 1 },
        { key: '2026-09-01', value: 0 }
      ]
    },
    e1rmVsBest: {
      read: 'Closest to best: Squat · 98% · furthest Press · 72%',
      lifts: [
        { key: 'Squat', label: 'Squat', value: 98, kg: 80, peak: 82, date: '2026-09-01' },
        { key: 'Press', label: 'Press', value: 72, kg: 40, peak: 55, date: '2026-08-20' }
      ]
    },
    yearMonths: {
      count: 4,
      read: '4 sessions in 2026',
      months: [
        { key: '8', label: 'Aug', value: 3 },
        { key: '9', label: 'Sep', value: 1 }
      ]
    }
  });

  assert.equal(root.ensure('[data-fitness="training-rhythm-read"]').textContent, 'Usually evenings, around 18:40 · mostly Tue · 4 sessions in the last 30 days · longest gap 8 days');
  const radial = texts(root.ensure('#fitness-training-radial'));
  assert.ok(radial.includes('Morning 1'));
  assert.ok(radial.includes('Evening 3'));
  assert.ok(radial.includes('11/08 1'));
  assert.ok(radial.includes('18/08 2'));
  assert.equal(root.ensure('#fitness-training-radial-card').attributes.hidden, undefined);
  assert.ok(root.ensure('#fitness-training-radial-card').children.some(node => node.dataset?.role === 'fitness-tip'));
  assert.equal(root.ensure('[data-fitness="year-read"]').textContent, '4 sessions in 2026');
  assert.ok(texts(root.ensure('#fitness-year-chart')).includes('Aug'));
});

test('goal cards show lift progress, four-week frequency, and safe-load streaks', () => {
  const root = chartRoot();
  renderFitnessCharts(root, {
    fitnessGoals: [
      { id: 'chest-e1rm', label: 'Chest e1RM', kind: 'e1rm', exercise: 'Bar Press', current: 58.7, target: 65, remaining: 6.3, progress: 90, deadline: '2026-10-31' },
      { id: 'frequency', label: 'Training frequency', kind: 'frequency', current: 1.5, target: 3, weeks: [{ date: '2026-08-17', value: 2, met: false }, { date: '2026-08-24', value: 3, met: true }, { date: '2026-08-31', value: 3, met: true }, { date: '2026-09-07', value: 2, met: false }] },
      { id: 'load-consistency', label: 'Load consistency', kind: 'load', target: 3, weeks: [{ date: '2026-08-24', band: 'medium', met: true }, { date: '2026-08-31', band: 'medium', met: true }, { date: '2026-09-07', band: 'high', met: false }] }
    ]
  });

  assert.equal(root.ensure('#fitness-goals-card').attributes.hidden, undefined);
  const goals = texts(root.ensure('#fitness-goals'));
  assert.ok(goals.includes('Chest e1RM'));
  assert.ok(goals.includes('58.7 kg'));
  assert.ok(goals.some(text => text.startsWith('1.5 / week')));
  assert.ok(goals.includes('2 / 3 safe weeks'));
});

test('who-is-improving uses a legend and short week labels', () => {
  const root = chartRoot();
  renderFitnessCharts(root, {
    bumpRanks: [
      { week: '2026-07-13', rankByTheme: { Squat: 2, Press: 1 } },
      { week: '2026-07-20', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-07-27', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-08-03', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-08-10', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-08-17', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-08-24', rankByTheme: { Squat: 1, Press: 2 } },
      { week: '2026-08-31', rankByTheme: { Squat: 1, Press: 2 } }
    ]
  });

  const svg = root.ensure('#fitness-bump-chart');
  const weekLabels = [];
  walk(svg, node => {
    if (node.name === 'text' && node.textContent) weekLabels.push(node.textContent);
  });
  assert.ok(weekLabels.includes('13/07'));
  assert.ok(weekLabels.includes('31/08'));
  assert.ok(!weekLabels.includes('Squat'));
  assert.ok(weekLabels.length < 12);
  const legend = texts(root.ensure('#fitness-bump-card'));
  assert.ok(legend.includes('Squat'));
  assert.ok(legend.includes('Press'));
});
