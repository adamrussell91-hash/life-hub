import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBloods } from '../../js/app/render-bloods.js';

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
    '#bloods-explainer': explainer,
    '#bloods-explainer-body': explainerBody
  };
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
    _open: open
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

test('Lipid Studies render a Total:HDL ratio chip', () => {
  const root = fakeRoot();
  renderBloods(root, {
    ...model,
    flagged: [],
    categories: [{
      id: 'Lipid Studies',
      title: 'Lipid Studies',
      hasFlags: false,
      collapsed: true,
      lipidRatio: { value: 4, source: 'computed', date: '2026-05-19', tone: 'low' },
      markers: [{
        ...alt,
        key: 'hdl',
        label: 'HDL',
        chartKind: 'range-bar',
        statusTone: 'normal',
        latest: { date: '2026-05-19', value: 1.3, unit: 'mmol/L', status: 'Normal' }
      }]
    }]
  });
  const chip = root._host.querySelector('.bloods-lipid-ratio');
  assert.ok(chip);
  assert.match(String(chip.textContent), /Total : HDL 4/);
  assert.equal(chip.dataset.status, 'low');
});

test('numeric tiles show a what-line, In range label, refs, and previous value', () => {
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
        chartKind: 'range-bar',
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
          { date: '2025-06-01', value: 242 },
          { date: '2025-10-24', value: 117 }
        ],
        lastDelta: -125,
        overallDelta: -125,
        lastColour: 'green',
        overallColour: 'green',
        lastDeltaLabel: '↓125'
      }]
    }]
  });
  const tile = root._host.querySelector('.bloods-metric');
  assert.match(String(tile.textContent), /gut|mucosal|Crohn/i);
  assert.match(String(tile.textContent), /High/);
  assert.match(String(tile.textContent), /Was 242/);
  assert.match(String(tile.textContent), /<50|0–50|0-50/);
  const crpRoot = fakeRoot();
  renderBloods(crpRoot, {
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
        chartKind: 'range-bar'
      }]
    }]
  });
  assert.match(String(crpRoot._host.querySelector('.bloods-metric').textContent), /In range/);
  assert.doesNotMatch(String(crpRoot._host.querySelector('.bloods-status').textContent), /^Normal$/);
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
      series: [{ key: 'iron', points: [{ date: '2026-02-01', value: 18 }, { date: '2026-05-19', value: 21 }] }]
    },
    markers: [{ ...alt, key: 'iron', label: 'Iron' }]
  };
  const liver = model.categories[0];
  renderBloods(root, { ...model, categories: [combinedCategory, liver] });

  assert.equal(root._host.children.length, 2, 'both categories render');
  const chart = root._host.children[0].querySelector('.bloods-combined');
  assert.ok(chart, 'the combined chart is classed via setAttribute, not a className write');
  assert.match(String(chart.getAttribute('class')), /line-chart/);
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

