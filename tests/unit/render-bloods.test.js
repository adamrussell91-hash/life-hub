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
      remove(name) {
        this.owner.className = String(this.owner.className || '')
          .split(/\s+/)
          .filter(token => token && token !== name)
          .join(' ');
      },
      add(name) {
        const tokens = String(this.owner.className || '').split(/\s+/).filter(Boolean);
        if (!tokens.includes(name)) this.owner.className = [...tokens, name].join(' ');
      },
      toggle(name, force) {
        const tokens = String(this.owner.className || '').split(/\s+/).filter(Boolean);
        const has = tokens.includes(name);
        const on = force == null ? !has : !!force;
        this.owner.className = on
          ? [...new Set([...tokens, name])].join(' ')
          : tokens.filter(token => token !== name).join(' ');
        return on;
      },
      contains(name) {
        return String(this.owner.className || '').split(/\s+/).includes(name);
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
    return String(node.className).split(/\s+/).includes(selector.slice(1));
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
    '#bloods-sections': host,
    '#bloods-range-control': ranges,
    '#bloods-appointment-open': open,
    '#bloods-explainer': explainer,
    '#bloods-explainer-body': explainerBody
  };
  return {
    createElement: tag => el(tag),
    createElementNS: (_uri, tag) => el(tag),
    querySelector(selector) {
      if (map[selector]) return map[selector];
      return dashboard.querySelector(selector) || host.querySelector(selector);
    },
    _dashboard: dashboard,
    _flags: flags,
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
  assert.match(chip.className, /body-tape-chip/);
  assert.equal(chip.dataset.colour, 'red');
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

test('normal categories start collapsed and the appointment control stays quiet', () => {
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
