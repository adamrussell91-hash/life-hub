import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderCentralNode } from '../../js/app/render-central-node.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.hidden = false;
    this.attributes = {};
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }

  getBoundingClientRect() {
    return {};
  }

  addEventListener() {}

  removeEventListener() {}

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  get textContent() {
    if (this.children.length) return this.children.map(child => child.textContent).join('');
    return this._textContent;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (matches(child, selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'hidden') this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }
}

function matches(el, selector) {
  if (!el || !el.dataset) return false;
  const dataMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (dataMatch[2]) return el.dataset[key] === dataMatch[2];
    return el.dataset[key] !== undefined;
  }
  return false;
}

function fakeCentralNodeRoot() {
  const dashboard = new FakeElement('section');
  dashboard.hidden = true;

  const sections = {};
  for (const key of [
    'todays-status',
    'this-week',
    'this-month',
    'long-term-trends',
    'cross-agent',
    'recent-actions',
    'constraints'
  ]) {
    const el = new FakeElement('div');
    el.dataset.centralNode = key;
    sections[key] = el;
  }

  const weekChart = new FakeElement('svg');
  const line = new FakeElement('path');
  line.dataset.role = 'line';
  const area = new FakeElement('path');
  area.dataset.role = 'area';
  const rolling = new FakeElement('path');
  rolling.dataset.role = 'rolling';
  rolling.hidden = true;
  const dayLabels = new FakeElement('g');
  dayLabels.dataset.role = 'day-labels';
  weekChart.append(area, line, rolling, dayLabels);

  const completionRing = new FakeElement('svg');
  const track = new FakeElement('circle');
  track.dataset.role = 'track';
  const fill = new FakeElement('circle');
  fill.dataset.role = 'fill';
  completionRing.append(track, fill);

  const liveComplete = {};
  for (const key of ['nutrition', 'fitness', 'diary', 'body', 'skincare']) {
    const el = new FakeElement('li');
    liveComplete[key] = el;
  }
  const liveSnapshot = new FakeElement('p');

  const completionLabel = new FakeElement('span');

  const heatmaps = {
    '#central-node-logging-heatmap': new FakeElement('div'),
    '#central-node-exercise-heatmap': new FakeElement('div'),
    '#central-node-eating-heatmap': new FakeElement('div')
  };

  const bySelector = {
    '#central-node-dashboard': dashboard,
    '#central-node-week-chart': weekChart,
    '#central-node-completion-ring': completionRing,
    '[data-value="completion-ring-label"]': completionLabel,
    '[data-central-node="todays-status"]': sections['todays-status'],
    '[data-central-node="this-week"]': sections['this-week'],
    '[data-central-node="this-month"]': sections['this-month'],
    '[data-central-node="long-term-trends"]': sections['long-term-trends'],
    '[data-central-node="cross-agent"]': sections['cross-agent'],
    '[data-central-node="recent-actions"]': sections['recent-actions'],
    '[data-central-node="constraints"]': sections.constraints,
    '[data-live-snapshot]': liveSnapshot,
    ...heatmaps
  };
  for (const [key, el] of Object.entries(liveComplete)) {
    bySelector[`[data-live-complete="${key}"]`] = el;
  }

  return {
    createElement: tag => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    querySelector(selector) {
      return bySelector[selector] ?? null;
    },
    _sections: sections,
    _weekChart: weekChart,
    _rolling: rolling
  };
}

function baseModel(overrides = {}) {
  return {
    sections: {
      todaysStatus: 'Status text',
      thisWeek: '',
      thisMonth: 'Month text',
      longTermTrends: 'Trend text',
      crossAgentCoordination: 'Cross text',
      recentAgentActions: 'Actions text',
      constraints: 'Constraint text'
    },
    liveStatus: {
      completeness: { nutrition: true, fitness: false, diary: false, body: false, skincare: false },
      snapshot: { protein_g: 80, calories: 1200, fat_g: 20 }
    },
    completeness: { complete: 1, total: 5 },
    week: [
      { date: '2026-07-24', protein_g: 40 },
      { date: '2026-07-25', protein_g: 60 },
      { date: '2026-07-26', protein_g: 80 },
      { date: '2026-07-27', protein_g: 100 },
      { date: '2026-07-28', protein_g: 90 },
      { date: '2026-07-29', protein_g: 70 },
      { date: '2026-07-30', protein_g: 110 }
    ],
    loggingMonth: [],
    exerciseMonth: [],
    eatingMonth: [],
    ...overrides
  };
}

test('protein this week markup places chart before this-week prose and includes rolling elements', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const weekStart = html.indexOf('id="central-node-week-label"');
  const weekEnd = html.indexOf('central-node-month-label');
  assert.ok(weekStart >= 0 && weekEnd > weekStart);
  const weekCard = html.slice(weekStart, weekEnd);

  assert.ok(
    weekCard.indexOf('central-node-week-chart') < weekCard.indexOf('data-central-node="this-week"'),
    'chart must appear before the this-week prose block'
  );
  assert.match(weekCard, /Dotted = 3-day average/);
  assert.match(weekCard, /data-role="rolling"/);
});

test('renderCentralNode omits empty this-week prose', () => {
  const root = fakeCentralNodeRoot();
  const model = baseModel({ sections: { ...baseModel().sections, thisWeek: '' } });

  renderCentralNode(root, model);

  const prose = root._sections['this-week'];
  assert.equal(prose.hidden || prose.textContent.trim() === '', true);
});

test('renderCentralNode shows this-week prose when present', () => {
  const root = fakeCentralNodeRoot();
  const model = baseModel({ sections: { ...baseModel().sections, thisWeek: 'Some week notes' } });

  renderCentralNode(root, model);

  const prose = root._sections['this-week'];
  assert.equal(prose.hidden, false);
  assert.match(prose.textContent, /Some week notes/);
});

test('renderCentralNode draws a rolling average path on the week chart', () => {
  const root = fakeCentralNodeRoot();
  const model = baseModel();

  renderCentralNode(root, model);

  assert.equal(root._rolling.hidden, false);
  assert.ok(root._rolling.getAttribute('d'), 'rolling path should have a d attribute');
});
