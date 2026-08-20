import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBloods } from '../../js/app/render-bloods.js';
import { combinedChartSvg } from '../../js/app/bloods-charts.js';

function el(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    id: '',
    dataset: {},
    children: [],
    attributes: {},
    listeners: [],
    style: {},
    classList: {
      remove(...names) {
        setClass(this.owner, classTokens(this.owner).filter(token => !names.includes(token)).join(' '));
      },
      add(...names) {
        setClass(this.owner, [...new Set([...classTokens(this.owner), ...names])].join(' '));
      },
      toggle(name, force) {
        const tokens = classTokens(this.owner);
        const on = force == null ? !tokens.includes(name) : !!force;
        setClass(this.owner, on
          ? [...new Set([...tokens, name])].join(' ')
          : tokens.filter(token => token !== name).join(' '));
        return on;
      },
      contains(name) {
        return classTokens(this.owner).includes(name);
      },
      owner: null
    },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    append(...nodes) {
      this.children.push(...nodes);
      const bits = this.children.map(n => n.textContent).filter(Boolean);
      if (bits.length) this.textContent = bits.join('');
    },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'data-role') this.dataset.role = String(value);
      if (name === 'data-status') this.dataset.status = String(value);
      if (name === 'hidden') this.hidden = true;
    },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'hidden') this.hidden = false;
    },
    querySelector(selector) {
      return collect(this, selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return collect(this, selector);
    }
  };
  node.classList.owner = node;
  return node;
}

function className(node) {
  const value = node?.className;
  return typeof value === 'string' ? value : String(value?.baseVal ?? '');
}

function classTokens(node) {
  return className(node).split(/\s+/).filter(Boolean);
}

function setClass(node, value) {
  node.attributes.class = String(value);
  if (node._animatedClass) node._animatedClass.baseVal = String(value);
  else node.className = String(value);
}

/**
 * A real SVGElement exposes className as a read-only SVGAnimatedString, so
 * assigning to it throws. Mirror that here, or the fake DOM keeps accepting
 * writes that blow up the live page.
 */
function svgEl(tag) {
  const node = el(tag);
  const animated = { baseVal: '', animVal: '' };
  node._animatedClass = animated;
  Object.defineProperty(node, 'className', {
    get: () => animated,
    set() { throw new TypeError('Cannot set property className of #<SVGElement> which has only a getter'); },
    configurable: true
  });
  node.setAttribute = (name, value) => {
    node.attributes[name] = String(value);
    if (name === 'class') animated.baseVal = String(value);
    if (name === 'id') node.id = String(value);
    if (name === 'data-role') node.dataset.role = String(value);
    if (name === 'data-status') node.dataset.status = String(value);
  };
  return node;
}

function collect(node, selector) {
  const out = [];
  walk(node, child => { if (matches(child, selector)) out.push(child); });
  return out;
}

function walk(node, visit) {
  for (const child of node.children ?? []) {
    visit(child);
    walk(child, visit);
  }
}

function matches(node, selector) {
  if (selector.startsWith('.')) {
    return classTokens(node).includes(selector.slice(1));
  }
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  const role = /^\[data-role="(.+)"\]$/.exec(selector);
  if (role) return node.dataset?.role === role[1] || node.attributes?.['data-role'] === role[1];
  const data = /^\[data-([a-z-]+)\]$/.exec(selector);
  if (data) {
    const key = data[1].replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    return node.dataset?.[key] != null;
  }
  return false;
}

function fakeRoot() {
  const dashboard = el('section');
  dashboard.id = 'body-bloods-dashboard';
  dashboard.hidden = true;
  const flags = el('div');
  flags.id = 'bloods-flags';
  const flagSummary = el('div');
  flagSummary.id = 'bloods-flag-summary';
  const inRange = el('div');
  inRange.id = 'bloods-in-range';
  const collected = el('div');
  collected.id = 'bloods-last-collected';
  const host = el('div');
  host.id = 'bloods-sections';
  const ranges = el('div');
  ranges.id = 'bloods-range-control';
  ranges.querySelectorAll = () => [];
  const open = el('button');
  open.id = 'bloods-appointment-open';
  const search = el('input');
  search.id = 'bloods-search';
  search.value = '';
  const explainer = el('div');
  explainer.id = 'bloods-explainer';
  explainer.hidden = true;
  const explainerBody = el('div');
  explainerBody.id = 'bloods-explainer-body';
  const map = {
    '#body-bloods-dashboard': dashboard,
    '#bloods-flags': flags,
    '#bloods-flag-summary': flagSummary,
    '#bloods-in-range': inRange,
    '#bloods-last-collected': collected,
    '#bloods-sections': host,
    '#bloods-range-control': ranges,
    '#bloods-appointment-open': open,
    '#bloods-search': search,
    '#bloods-explainer': explainer,
    '#bloods-explainer-body': explainerBody
  };
  dashboard.append(host);
  return {
    createElement: tag => el(tag),
    createElementNS: (_uri, tag) => svgEl(tag),
    querySelector(selector) {
      if (map[selector]) return map[selector];
      return dashboard.querySelector(selector) || host.querySelector(selector);
    },
    _dashboard: dashboard,
    _flags: flags,
    _flagSummary: flagSummary,
    _inRange: inRange,
    _collected: collected,
    _host: host,
    _open: open,
    _search: search
  };
}

const alt = {
  key: 'alt',
  label: 'ALT',
  qualitative: false,
  chartKind: 'line',
  statusTone: 'high',
  latest: { date: '2026-05-19', value: 42, unit: 'U/L', status: 'High', ref_low: 5, ref_high: 40 },
  series: [{ date: '2026-02-01', value: 50 }, { date: '2026-05-19', value: 42 }],
  lastDelta: -8,
  overallDelta: -8,
  lastColour: 'green',
  overallColour: 'green',
  lastDeltaLabel: '↓8'
};

const model = {
  date: '2026-08-13',
  range: 'six_month',
  rangeLabel: '6M',
  inRangeCount: 0,
  markerCount: 1,
  flagged: [
    { key: 'alt', label: 'ALT', value: 42, unit: 'U/L', status: 'High', date: '2026-05-19' }
  ],
  flareMarks: [],
  lastCollected: { date: '2026-05-22', lab: null, stale: false },
  appointmentLines: ['ALT 42 U/L — High, ↓8.'],
  categories: [
    {
      id: 'Liver Function',
      title: 'Liver Function',
      hasFlags: true,
      collapsed: false,
      summary: '2 markers, 1 high',
      markers: [
        alt,
        {
          key: 'hepb_sag',
          label: 'HepB sAg',
          qualitative: true,
          chartKind: 'none',
          statusTone: 'first',
          latest: { date: '2026-05-19', value: null, unit: 'Qualitative', status: null },
          series: [],
          lastDelta: null,
          overallDelta: null,
          lastColour: 'first',
          overallColour: 'first'
        }
      ]
    }
  ]
};

test('renderBloods paints flags, category cards, and a ref-band chart', () => {
  const root = fakeRoot();
  renderBloods(root, model);
  assert.equal(root._dashboard.hidden, false);
  assert.ok(root._flags.children.length >= 1);
  const chip = root._flags.children[0];
  assert.match(chip.className, /bloods-flag/);
  assert.doesNotMatch(chip.className, /body-tape-chip/);
  assert.equal(chip.dataset.status, 'high');
  assert.equal(chip.dataset.bloodsMarker, 'alt');
  assert.match(String(chip.textContent), /ALT/);
  const section = root._host.children[0];
  assert.match(section.className, /body-section/);
  const chart = section.querySelector('.body-chart');
  assert.ok(chart);
  assert.equal(chart.dataset.status, 'high');
  const band = chart.querySelector('[data-role="ref-band"]');
  assert.ok(band);
});

test('numeric markers in a category sit side by side', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    categories: [{
      id: 'Liver Function',
      title: 'Liver Function',
      hasFlags: true,
      collapsed: false,
      markers: [
        alt,
        { ...alt, key: 'ggt', label: 'GGT', latest: { ...alt.latest, value: 120 } }
      ]
    }]
  });
  const pair = root._host.querySelector('.body-metrics--pair');
  assert.ok(pair, 'expected a side-by-side marker row');
  const blocks = pair.children.filter(child => String(child.className).split(/\s+/).includes('body-metric'));
  assert.equal(blocks.length, 2);
  assert.match(String(blocks[0].textContent), /ALT/);
  assert.match(String(blocks[1].textContent), /GGT/);
});

test('renderBloods empty flags copy and skips charts for qualitative markers', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Liver Function',
      title: 'Liver Function',
      hasFlags: false,
      collapsed: true,
      markers: [model.categories[0].markers[1]]
    }]
  });
  assert.match(String(root._flags.textContent), /Everything in range/);
  assert.equal(root._host.querySelector('.body-chart'), null);
});

test('Lipid Studies render nested rings and drop the ratio chip and tiles', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Lipid Studies',
      title: 'Lipid Studies',
      hasFlags: false,
      collapsed: false,
      lipidRatio: { value: 3.5, source: 'computed', date: '2026-02-20', tone: 'normal' },
      markers: [
        {
          ...alt,
          key: 'cholesterol',
          label: 'Cholesterol',
          chartKind: 'line',
          statusTone: 'normal',
          latest: { date: '2026-02-20', value: 4.5, unit: 'mmol/L', status: 'Normal', ref_high: 5.6 },
          series: [
            { date: '2025-11-03', value: 5.2 },
            { date: '2026-02-20', value: 4.5 }
          ]
        },
        {
          ...alt,
          key: 'hdl',
          label: 'HDL',
          chartKind: 'meter',
          statusTone: 'normal',
          latest: { date: '2026-02-20', value: 1.3, unit: 'mmol/L', status: 'Normal', ref_low: 0.9 },
          series: [
            { date: '2025-11-03', value: 1.28 },
            { date: '2026-02-20', value: 1.3 }
          ]
        },
        {
          ...alt,
          key: 'ldl',
          label: 'LDL',
          chartKind: 'line',
          statusTone: 'normal',
          latest: { date: '2026-02-20', value: 2.8, unit: 'mmol/L', status: 'Normal', ref_high: 3.1 },
          series: [
            { date: '2025-11-03', value: 3.3 },
            { date: '2026-02-20', value: 2.8 }
          ]
        }
      ]
    }]
  });
  assert.ok(root._host.querySelector('.bloods-lipid-rings'));
  assert.ok(root._host.querySelector('[data-role="lipid-ring"]'));
  assert.ok(root._host.querySelector('[data-role="lipid-arrow"]'));
  assert.equal(root._host.querySelector('.bloods-lipid-ratio'), null);
  assert.equal(root._host.querySelector('.bloods-metric-grid'), null);
  assert.equal(root._host.querySelector('.bloods-rows'), null);
});

test('a marker with history gets a trend card: what-line, status, band, and dated ticks', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Inflammation Markers',
      title: 'Inflammation Markers',
      hasFlags: true,
      collapsed: false,
      markers: [{
        key: 'calprotectin',
        label: 'Calprotectin',
        qualitative: false,
        chartKind: 'line',
        statusTone: 'high',
        latest: {
          date: '2025-10-24',
          value: 117,
          unit: 'ug/g',
          status: 'High',
          ref_low: 0,
          ref_high: 50
        },
        series: [
          { date: '2025-01-11', value: 320 },
          { date: '2025-06-01', value: 242 },
          { date: '2025-10-24', value: 117 }
        ],
        lastDelta: -125,
        overallDelta: -203,
        lastColour: 'green',
        overallColour: 'green',
        lastDeltaLabel: '↓125'
      }]
    }]
  });
  const tile = root._host.querySelector('.bloods-metric');
  assert.ok(tile, 'three draws earn a card, not a row');
  assert.equal(root._host.querySelector('.bloods-row'), null);
  assert.match(String(tile.textContent), /gut|mucosal|Crohn/i);
  assert.match(String(tile.textContent), /High/);
  assert.match(String(tile.textContent), /<50|0–50|0-50/);
  assert.match(String(tile.textContent), /↓125/);

  const dots = [
    ...tile.querySelectorAll('[data-role="point"]'),
    ...tile.querySelectorAll('[data-role="latest-point"]')
  ];
  assert.equal(dots.length, 3, 'one dot per draw');
  assert.deepEqual(dots.map(dot => dot.getAttribute('data-tone')), ['high', 'high', 'high']);
  const ticks = tile.querySelectorAll('.bloods-ticks__item');
  assert.ok(ticks.length >= 2, 'the chart is dated at both ends');
  assert.match(String(ticks[0].textContent), /’25/);

  const wrap = tile.querySelector('.bloods-line-wrap');
  const note = wrap?.querySelector('[data-role="point-note"]');
  assert.ok(note, 'each trend chart carries a hover note');
  assert.equal(note.hidden, true);
  const mid = dots[1];
  const enter = mid.listeners.find(([type]) => type === 'pointerenter');
  assert.ok(enter, 'hovering a dot shows the note');
  enter[1]();
  assert.equal(note.hidden, false);
  assert.match(String(note.textContent), /01\/06\/25/);
  assert.match(String(note.textContent), /242/);
  assert.match(String(note.textContent), /↓24\.4%|↓24%/);
  assert.equal(note.querySelector('.bloods-point-note__change')?.dataset.dir, 'down');
  const leave = mid.listeners.find(([type]) => type === 'pointerleave');
  leave[1]();
  assert.equal(note.hidden, true);

  const first = dots[0];
  first.listeners.find(([type]) => type === 'pointerenter')[1]();
  assert.match(String(note.textContent), /11\/01\/25/);
  assert.match(String(note.textContent), /320/);
  assert.doesNotMatch(String(note.textContent), /[↑↓%]/);
  assert.equal(first.getAttribute('aria-label')?.includes('%'), false);
});

test('a marker with one or two draws becomes a row: value, meter, band, status', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Inflammation Markers',
      title: 'Inflammation Markers',
      hasFlags: false,
      collapsed: false,
      markers: [{
        ...alt,
        key: 'crp',
        label: 'CRP',
        statusTone: 'normal',
        latest: { date: '2026-05-22', value: 2.4, unit: 'mg/L', status: 'Normal', ref_low: 0, ref_high: 5 },
        series: [{ date: '2026-05-22', value: 2.4 }],
        lastDelta: null,
        chartKind: 'meter'
      }]
    }]
  });
  const row = root._host.querySelector('.bloods-row');
  assert.ok(row, 'a single draw does not take a whole card');
  assert.equal(root._host.querySelector('.bloods-metric'), null);
  assert.equal(row.id, 'bloods-marker-crp', 'flag chips can still jump to it');
  assert.equal(row.querySelector('.bloods-row__dot').dataset.status, 'normal');
  assert.match(String(row.querySelector('.bloods-row__value').textContent), /2\.4\s*mg\/L/);
  assert.ok(row.querySelector('.bloods-meter'), 'the row carries the reference meter');
  assert.match(String(row.textContent), /In range/);
  assert.doesNotMatch(String(row.querySelector('.bloods-status').textContent), /^Normal$/);
});

test('one category mixes both treatments: charted markers first, then the rows', () => {
  const root = fakeRoot();
  const charted = {
    ...alt,
    key: 'ferritin',
    label: 'Ferritin',
    chartKind: 'line',
    statusTone: 'normal',
    latest: { date: '2026-05-19', value: 96, unit: 'ug/L', status: 'Normal', ref_low: 30, ref_high: 300 },
    series: [
      { date: '2025-01-11', value: 150 },
      { date: '2025-10-24', value: 124 },
      { date: '2026-05-19', value: 96 }
    ]
  };
  const listed = {
    ...alt,
    key: 'vitamin_d',
    label: 'Vitamin D',
    chartKind: 'meter',
    statusTone: 'normal',
    latest: { date: '2026-05-19', value: 62, unit: 'nmol/L', status: 'Normal', ref_low: 50, ref_high: 150 },
    series: [{ date: '2026-05-19', value: 62 }]
  };
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Iron Studies',
      title: 'Iron Studies',
      hasFlags: false,
      collapsed: false,
      markers: [listed, charted]
    }]
  });
  const body = root._host.querySelector('.bloods-category__body');
  const grid = body.querySelector('.bloods-metric-grid');
  const rows = body.querySelector('.bloods-rows');
  assert.ok(grid && rows, 'both treatments appear in the one category');
  assert.equal(grid.querySelectorAll('.bloods-metric').length, 1);
  assert.equal(rows.querySelectorAll('.bloods-row').length, 1);
  assert.ok(body.children.indexOf(grid) < body.children.indexOf(rows), 'charts lead, rows follow');
});

test('a category with a combined chart still renders, and does not take later categories down with it', () => {
  const root = fakeRoot();
  const combinedCategory = {
    id: 'Iron Studies',
    title: 'Iron Studies',
    hasFlags: false,
    collapsed: false,
    summary: '1 marker',
    combined: {
      series: [
        { key: 'iron', label: 'Iron', points: [{ date: '2026-02-01', value: 0.4 }, { date: '2026-05-19', value: 0.6 }] },
        { key: 'ferritin', label: 'Ferritin', points: [{ date: '2026-02-01', value: 1.2 }, { date: '2026-05-19', value: 0.9 }] }
      ]
    },
    markers: [{ ...alt, key: 'iron', label: 'Iron' }]
  };
  const liver = model.categories[0];
  renderBloods(root, { ...model, categories: [combinedCategory, liver] });

  assert.equal(root._host.children.length, 2, 'both categories render');
  const combined = root._host.children[0].querySelector('.bloods-combined');
  assert.ok(combined, 'the combined chart is classed via setAttribute, not a className write');
  assert.ok(combined.querySelector('.bloods-combined-strip'), 'the strip svg is inside the wrapper');
  const legend = combined.querySelector('.bloods-combined-legend');
  assert.equal(legend.children.length, 2, 'one legend entry per marker');
  assert.match(String(legend.textContent), /Iron/);
});

test('a combined strip puts every marker on one shared scale so the lines are comparable', () => {
  const root = fakeRoot();
  const near = { key: 'iron', label: 'Iron', points: [{ date: '2026-02-01', value: 0.4 }, { date: '2026-05-19', value: 0.6 }] };
  const far = { key: 'ferritin', label: 'Ferritin', points: [{ date: '2026-02-01', value: 3 }, { date: '2026-05-19', value: 3.2 }] };
  const chart = combinedChartSvg(root, { series: [near, far] });
  const lines = chart.querySelectorAll('[data-role="line"]');
  assert.equal(lines.length, 2);

  const yOf = path => Number(/^M [\d.]+ ([\d.]+)/.exec(path.getAttribute('d'))?.[1]);
  assert.ok(yOf(lines[0]) > yOf(lines[1]), 'the higher reading sits higher on the same axis');

  const band = chart.querySelector('[data-role="ref-band"]');
  assert.ok(Number(band.getAttribute('height')) > 0, 'the in-range band is drawn once for all series');
});

test('the summary is one card: a bar with a legend, no ring, and the date folded in', async () => {
  const root = fakeRoot();
  renderBloods(root, model);

  const bar = root._inRange.querySelector('.bloods-bar');
  assert.ok(bar, 'expected a horizontal in-range bar');
  assert.equal(root._inRange.querySelector('.metric-ring'), null);
  const inRangeSegment = bar.children.find(child => child.dataset.tone === 'in-range');
  const highSegment = bar.children.find(child => child.dataset.tone === 'high');
  assert.equal(inRangeSegment, undefined, 'nothing is in range in this model');
  assert.equal(highSegment.style.width, '100%');
  assert.match(String(root._inRange.textContent), /of 1 in range/);

  assert.match(String(root._flagSummary.textContent), /1 high/);
  assert.equal(root._flagSummary.querySelector('.bloods-flag'), null);
  assert.match(String(root._collected.textContent), /Collected 22\/05\/26/);

  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const signal = html.match(/<div id="bloods-signal"[\s\S]*?\n {10}<\/div>/);
  assert.ok(signal, 'expected a #bloods-signal block');
  assert.doesNotMatch(signal[0], /id="bloods-flags"/);
  assert.equal((signal[0].match(/<article/g) || []).length, 1, 'the summary row is a single card');
  assert.match(signal[0], /id="bloods-last-collected"/);
  assert.match(html, /id="bloods-flags"/);
});

test('bloods flag chips are centred in CSS, not baseline-aligned tape chips', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');
  const block = css.match(/\.bloods-flag\s*\{[^}]+\}/);
  assert.ok(block, 'expected a .bloods-flag rule');
  assert.match(block[0], /align-items:\s*center/);
  assert.match(block[0], /justify-content:\s*center/);
  assert.doesNotMatch(block[0], /baseline/);
});

test('categories honour collapsed from the model and the appointment control stays quiet', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Thyroid',
      title: 'Thyroid',
      hasFlags: false,
      collapsed: true,
      summary: '1 marker, all normal',
      markers: [{
        ...alt,
        key: 'tsh',
        label: 'TSH',
        chartKind: 'range-bar',
        statusTone: 'normal',
        latest: { date: '2026-05-19', value: 2, unit: 'mU/L', status: 'Normal', ref_low: 0.4, ref_high: 4 }
      }]
    }]
  });
  const section = root._host.children[0];
  assert.equal(section.classList.contains('is-collapsed'), true);
  assert.equal(root._open.id, 'bloods-appointment-open');
});

test('Biochemistry/Electrolytes uses physiological instrument groups without changing other categories', () => {
  const instrumentMarker = (key, label, value, low, high) => ({
    ...alt,
    key,
    label,
    statusTone: 'normal',
    latest: {
      date: '2026-05-19',
      value,
      unit: 'mmol/L',
      status: 'Normal',
      ref_low: low,
      ref_high: high
    },
    series: [
      { date: '2026-01-28', value: value * 0.95 },
      { date: '2026-02-20', value: value * 0.98 },
      { date: '2026-05-19', value }
    ]
  });
  const biochemistry = {
    id: 'Biochemistry/Electrolytes',
    title: 'Biochemistry/Electrolytes',
    hasFlags: false,
    collapsed: false,
    summary: '4 markers, all normal',
    markers: [
      instrumentMarker('sodium', 'Sodium', 140, 135, 145),
      instrumentMarker('creatinine', 'Creatinine', 98, 60, 110),
      instrumentMarker('alpha_1_globulin', 'Alpha 1 Globulin', 3.1, 1.7, 3.9),
      instrumentMarker('mystery_marker', 'Mystery marker', 7, 2, 9)
    ]
  };

  const root = fakeRoot();
  renderBloods(root, { ...model, flagged: [], categories: [biochemistry, model.categories[0]] });

  const biochemSection = root._host.children[0];
  const groups = biochemSection.querySelectorAll('.bloods-instrument-group');
  assert.equal(groups.length, 4);
  assert.deepEqual(groups.map(group => group.dataset.instrumentGroup), [
    'electrolytes',
    'kidney',
    'protein',
    'other'
  ]);
  assert.match(String(groups[0].textContent), /Electrolytes & Minerals/);
  assert.match(String(groups[1].textContent), /Kidney & Waste Clearance/);
  assert.match(String(groups[2].textContent), /Protein Profile/);
  assert.match(String(groups[3].textContent), /Mystery marker/);
  const meter = groups[0].querySelector('.bloods-instrument-meter');
  assert.equal(meter.getAttribute('role'), 'img');
  assert.match(meter.getAttribute('aria-label'), /Sodium.*140.*In range/);
  assert.equal(meter.querySelectorAll('[data-role="history-point"]').length, 2);
  const tube = groups[1].querySelector('.bloods-tube');
  assert.equal(tube.getAttribute('role'), 'img');
  assert.match(tube.getAttribute('aria-label'), /Creatinine.*98/);
  const protein = groups[2].querySelector('.bloods-protein-band');
  assert.equal(protein.getAttribute('role'), 'img');
  assert.match(protein.getAttribute('aria-label'), /Alpha 1 Globulin.*3\.1/);
  assert.equal(biochemSection.querySelector('.bloods-summary-strip'), null, 'group headings replace the flat jump strip');
  assert.equal(biochemSection.querySelector('.bloods-metric-grid'), null);
  assert.equal(biochemSection.querySelector('.bloods-rows'), null);
  assert.ok(root._host.children[1].querySelector('.bloods-metric-grid'), 'Liver Function keeps its standard renderer');
});

test('a biochemical marker expands, switches, and collapses one inline trend', () => {
  const marker = (key, label, values) => ({
    ...alt,
    key,
    label,
    statusTone: 'normal',
    latest: {
      date: '2026-05-19',
      value: values.at(-1),
      unit: 'mmol/L',
      status: 'Normal',
      ref_low: 0,
      ref_high: 200
    },
    series: values.map((value, index) => ({
      date: ['2026-01-28', '2026-02-20', '2026-05-19'][index],
      value
    }))
  });
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Biochemistry/Electrolytes',
      title: 'Biochemistry/Electrolytes',
      collapsed: false,
      markers: [
        marker('sodium', 'Sodium', [141, 143, 140]),
        marker('potassium', 'Potassium', [4.3, 5, 4.8])
      ]
    }]
  });

  const controls = root._host.querySelectorAll('.bloods-instrument-marker');
  assert.equal(controls.length, 2);
  controls[0].listeners.find(([type]) => type === 'click')[1]();
  assert.equal(controls[0].getAttribute('aria-expanded'), 'true');
  assert.equal(root._host.querySelectorAll('.bloods-instrument-trend').length, 1);
  assert.match(String(root._host.querySelector('.bloods-instrument-trend').textContent), /Sodium/);

  controls[1].listeners.find(([type]) => type === 'click')[1]();
  assert.equal(controls[0].getAttribute('aria-expanded'), 'false');
  assert.equal(controls[1].getAttribute('aria-expanded'), 'true');
  assert.match(String(root._host.querySelector('.bloods-instrument-trend').textContent), /Potassium/);

  controls[1].listeners.find(([type]) => type === 'click')[1]();
  assert.equal(controls[1].getAttribute('aria-expanded'), 'false');
  assert.equal(root._host.querySelector('.bloods-instrument-trend'), null);
});

test('biochemical instruments keep marker explainers as separate controls', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Biochemistry/Electrolytes',
      title: 'Biochemistry/Electrolytes',
      collapsed: false,
      markers: [{
        ...alt,
        key: 'sodium',
        label: 'Sodium',
        latest: {
          date: '2026-05-19',
          value: 140,
          unit: 'mmol/L',
          status: 'Normal',
          ref_low: 135,
          ref_high: 145
        },
        series: [{ date: '2026-05-19', value: 140 }]
      }]
    }]
  });

  const info = root._host.querySelector('.bloods-info');
  assert.ok(info, 'the instrument keeps the existing About control');
  assert.match(info.getAttribute('aria-label'), /About Sodium/);
  info.listeners.find(([type]) => type === 'click')[1]();
  const drawer = root.querySelector('#bloods-explainer');
  assert.equal(drawer.hidden, false);
  assert.match(String(root.querySelector('#bloods-explainer-body').textContent), /Sodium/);
  assert.equal(root._host.querySelectorAll('.bloods-instrument-marker').length, 0, 'one draw does not create a trend control');
});

test('the Bloods search filters biochemical instrument markers too', () => {
  const marker = (key, label) => ({
    ...alt,
    key,
    label,
    statusTone: 'normal',
    latest: {
      date: '2026-05-19',
      value: 10,
      unit: 'mmol/L',
      status: 'Normal',
      ref_low: 0,
      ref_high: 20
    },
    series: [{ date: '2026-05-19', value: 10 }]
  });
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Biochemistry/Electrolytes',
      title: 'Biochemistry/Electrolytes',
      collapsed: false,
      markers: [
        marker('sodium', 'Sodium'),
        marker('copper', 'Copper')
      ]
    }]
  });

  root._search.value = 'sodium';
  root._search.listeners.find(([type]) => type === 'input')[1]();
  const sodium = root._host.querySelector('#bloods-marker-sodium');
  const copper = root._host.querySelector('#bloods-marker-copper');
  assert.equal(sodium.hidden, false);
  assert.equal(copper.hidden, true);
});

test('filtering protein markers hides the aggregate band instead of showing unfiltered fractions', () => {
  const protein = key => ({
    ...alt,
    key,
    label: key === 'igg1' ? 'IgG1' : 'IgG2',
    latest: {
      date: '2026-05-19',
      value: key === 'igg1' ? 6.5 : 5.4,
      unit: 'g/L',
      status: 'Normal',
      ref_low: 1,
      ref_high: 10
    },
    series: [{ date: '2026-05-19', value: key === 'igg1' ? 6.5 : 5.4 }]
  });
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Biochemistry/Electrolytes',
      title: 'Biochemistry/Electrolytes',
      collapsed: false,
      markers: [protein('igg1'), protein('igg2')]
    }]
  });

  root._search.value = 'igg1';
  root._search.listeners.find(([type]) => type === 'input')[1]();
  assert.equal(root._host.querySelector('.bloods-protein-band').hidden, true);
});

test('Full Blood Count renders a radial and keeps the marker tiles', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Full Blood Count',
      title: 'Full Blood Count',
      hasFlags: false,
      collapsed: false,
      markers: [
        {
          ...alt,
          key: 'haemoglobin',
          label: 'Haemoglobin',
          chartKind: 'line',
          statusTone: 'normal',
          latest: { date: '2026-05-19', value: 151, unit: 'g/L', status: 'Normal', ref_low: 130, ref_high: 180 },
          series: [
            { date: '2026-02-20', value: 147 },
            { date: '2026-04-10', value: 141 },
            { date: '2026-05-19', value: 151 }
          ]
        },
        {
          ...alt,
          key: 'haematocrit',
          label: 'Haematocrit',
          chartKind: 'meter',
          statusTone: 'normal',
          latest: { date: '2026-05-19', value: 0.5, unit: 'L/L', status: 'Normal', ref_low: 0.4, ref_high: 0.5 },
          series: [
            { date: '2026-02-20', value: 0.46 },
            { date: '2026-05-19', value: 0.5 }
          ]
        }
      ]
    }]
  });
  assert.ok(root._host.querySelector('.bloods-fbc-radial'));
  assert.ok(root._host.querySelector('[data-role="fbc-spoke"]'));
  assert.ok(root._host.querySelector('.bloods-metric-grid') || root._host.querySelector('.bloods-rows'));
});

test('Glucose/Diabetes renders the zone map and no marker tiles', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Glucose/Diabetes',
      title: 'Glucose/Diabetes',
      hasFlags: false,
      collapsed: false,
      markers: [
        {
          ...alt,
          key: 'fasting_glucose',
          label: 'Fasting glucose',
          chartKind: 'zoned',
          statusTone: 'normal',
          latest: { date: '2026-05-19', value: 5.3, unit: 'mmol/L', status: 'Normal', ref_low: 3, ref_high: 5.4 },
          series: [
            { date: '2025-11-03', value: 4.6 },
            { date: '2026-02-20', value: 4.7 },
            { date: '2026-05-19', value: 5.3 }
          ]
        },
        {
          ...alt,
          key: 'hba1c_ngsp',
          label: 'HbA1c',
          chartKind: 'zoned',
          statusTone: 'normal',
          latest: { date: '2026-05-19', value: 5.0, unit: '%', status: 'Normal', ref_low: 4, ref_high: 5.9 },
          series: [
            { date: '2025-11-03', value: 5.6 },
            { date: '2026-02-20', value: 5.7 },
            { date: '2026-05-19', value: 5.0 }
          ]
        },
        {
          ...alt,
          key: 'insulin',
          label: 'Insulin',
          chartKind: 'meter',
          statusTone: 'normal',
          latest: { date: '2026-02-20', value: 7.7, unit: 'mIU/L', status: 'Normal', ref_low: 3, ref_high: 25 },
          series: [{ date: '2026-02-20', value: 7.7 }]
        }
      ]
    }]
  });
  assert.ok(root._host.querySelector('.bloods-glucose-map'));
  assert.ok(root._host.querySelector('[data-role="glucose-zone"]'));
  assert.match(String(root._host.textContent), /Insulin 7\.7/);
  assert.equal(root._host.querySelector('.bloods-metric-grid'), null);
  assert.equal(root._host.querySelector('.bloods-rows'), null);
});

