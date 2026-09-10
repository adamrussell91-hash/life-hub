import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMedical } from '../../apps/life/js/app/render-medical.js';

function el(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    id: '',
    type: '',
    value: '',
    href: '',
    dataset: {},
    children: [],
    attributes: {},
    listeners: [],
    style: {},
    classList: {
      owner: null,
      add(...names) {
        const tokens = new Set(String(this.owner.className).split(/\s+/).filter(Boolean));
        names.forEach(name => tokens.add(name));
        this.owner.className = [...tokens].join(' ');
      },
      toggle(name, force) {
        const tokens = new Set(String(this.owner.className).split(/\s+/).filter(Boolean));
        const on = force == null ? !tokens.has(name) : !!force;
        if (on) tokens.add(name);
        else tokens.delete(name);
        this.owner.className = [...tokens].join(' ');
        return on;
      },
      contains(name) {
        return String(this.owner.className).split(/\s+/).includes(name);
      }
    },
    append(...nodes) {
      this.children.push(...nodes);
      const bits = this.children.map(n => n.textContent).filter(Boolean);
      if (bits.length) this.textContent = bits.join('');
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
      this.textContent = nodes.map(n => n.textContent).filter(Boolean).join('');
    },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'href') this.href = String(value);
      if (name === 'hidden') this.hidden = true;
      if (name === 'data-lane') this.dataset.lane = String(value);
      if (name === 'data-visit-id') this.dataset.visitId = String(value);
      if (name === 'data-year') this.dataset.year = String(value);
      if (name === 'data-medical-density') this.dataset.medicalDensity = String(value);
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
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (matches(current, selector)) return current;
        current = current.parent;
      }
      return null;
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
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return String(node.className).split(/\s+/).includes(selector.slice(1));
  if (selector === 'a') return node.tagName === 'A';
  if (selector === 'button') return node.tagName === 'BUTTON';
  const data = /^\[data-visit-id="(.+)"\]$/.exec(selector);
  if (data) return node.dataset.visitId === data[1];
  if (selector === '[data-visit-id]') return node.dataset.visitId != null;
  if (selector === '[data-medical-density]') return node.dataset.medicalDensity != null;
  if (selector === '[data-year]') return node.dataset.year != null;
  return false;
}

function attachParent(node) {
  for (const child of node.children ?? []) {
    child.parent = node;
    attachParent(child);
  }
}

function fakeRoot() {
  const dashboard = el('section');
  dashboard.id = 'body-medical-dashboard';
  dashboard.hidden = true;
  const timeline = el('div');
  timeline.id = 'medical-timeline';
  const sheet = el('div');
  sheet.id = 'medical-sheet';
  const search = el('input');
  search.id = 'medical-search';
  search.className = 'hub-search__input';
  const typeHost = el('div');
  typeHost.id = 'medical-type-host';
  const providerHost = el('div');
  providerHost.id = 'medical-provider-host';
  const density = el('div');
  density.id = 'medical-density';
  density.className = 'hub-pills';
  for (const value of ['weeks', 'months', 'years']) {
    const btn = el('button');
    btn.dataset.medicalDensity = value;
    btn.setAttribute('data-medical-density', value);
    btn.textContent = value;
    density.append(btn);
  }
  const chips = el('div');
  chips.id = 'medical-chips';
  const empty = el('p');
  empty.id = 'medical-empty';
  const map = {
    '#body-medical-dashboard': dashboard,
    '#medical-timeline': timeline,
    '#medical-sheet': sheet,
    '#medical-search': search,
    '#medical-type-host': typeHost,
    '#medical-provider-host': providerHost,
    '#medical-density': density,
    '#medical-chips': chips,
    '#medical-empty': empty
  };
  return {
    createElement: tag => el(tag),
    querySelector(selector) { return map[selector] ?? null; }
  };
}

function sampleModel(overrides = {}) {
  const visit = {
    id: 'gastro',
    date: '2026-05-27',
    displayDate: '27 May 2026',
    title: 'Gastroenterologist Follow-up',
    record_type: 'Appointment',
    lane: 'appointment',
    provider: 'Dr Chris Keily',
    location: 'Northern Gastroenterology',
    location_kind: 'place',
    notes: 'Review Entocort response.',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Northern%20Gastroenterology',
    lab: null,
    episode: null,
    ...overrides.visit
  };
  return {
    today: '2026-08-20',
    density: 'months',
    query: '',
    recordType: '',
    provider: '',
    selected: overrides.selected === undefined ? null : overrides.selected,
    recordTypes: ['Appointment'],
    providers: ['Dr Chris Keily'],
    count: 1,
    items: [
      { kind: 'today', date: '2026-08-20' },
      { kind: 'visit', visit },
      ...(overrides.items ?? [])
    ],
    mode: overrides.mode ?? 'read',
    ...overrides
  };
}

test('renderMedical lists visit titles on the timeline', () => {
  const root = fakeRoot();
  renderMedical(root, sampleModel());
  const timeline = root.querySelector('#medical-timeline');
  assert.match(timeline.textContent, /Gastroenterologist Follow-up/);
  assert.match(timeline.textContent, /Dr Chris Keily/);
  assert.equal(root.querySelector('#body-medical-dashboard').hidden, false);
});

test('renderMedical selects a card without expanding it', () => {
  const root = fakeRoot();
  let selected = null;
  const model = sampleModel();
  renderMedical(root, model, { onSelect: id => { selected = id; } });
  const card = root.querySelector('#medical-timeline').querySelector('[data-visit-id]');
  attachParent(root.querySelector('#medical-timeline'));
  card.listeners.find(entry => entry[0] === 'click')[1]({
    currentTarget: card,
    target: card
  });
  assert.equal(selected, 'gastro');
  const selectedModel = sampleModel({ selected: model.items[1].visit });
  renderMedical(root, selectedModel);
  const again = root.querySelector('#medical-timeline').querySelector('[data-visit-id]');
  assert.ok(again.classList.contains('is-selected'));
  assert.equal(again.classList.contains('is-expanded'), false);
});

test('renderMedical wraps an episode band and shows a Maps link in the sheet', () => {
  const visit = sampleModel().items[1].visit;
  const root = fakeRoot();
  renderMedical(root, sampleModel({
    selected: visit,
    items: [
      { kind: 'today', date: '2026-08-20' },
      { kind: 'band', episode: { id: 'crohns', title: "Crohn's diagnosis" }, visits: [visit] }
    ]
  }));
  assert.match(root.querySelector('#medical-timeline').textContent, /Crohn's diagnosis/);
  const sheet = root.querySelector('#medical-sheet');
  assert.match(sheet.textContent, /Review Entocort response/);
  const link = sheet.querySelector('a');
  assert.ok(link);
  assert.match(link.href, /google\.com\/maps/);
  assert.match(sheet.textContent, /View on Map/);
  assert.ok(sheet.querySelector('.view-on-map'));
});

test('renderMedical shows lab chips on a lab card', () => {
  const root = fakeRoot();
  renderMedical(root, sampleModel({
    items: [{
      kind: 'visit',
      visit: {
        id: 'lab',
        date: '2026-05-19',
        displayDate: '19 May 2026',
        title: 'May panel',
        record_type: 'Lab Work',
        lane: 'lab',
        provider: '4Cyte',
        location_kind: 'unknown',
        notes: '',
        mapsUrl: null,
        lab: { inRange: 12, total: 14, flags: [{ label: 'γ-GT', status: 'High' }] }
      }
    }]
  }));
  assert.match(root.querySelector('#medical-timeline').textContent, /12 in/);
  assert.match(root.querySelector('#medical-timeline').textContent, /High/);
});

test('renderMedical asks for a bloods snapshot when the selected visit has labs', () => {
  const root = fakeRoot();
  let host = null;
  let visit = null;
  const selected = {
    id: 'lab',
    date: '2026-05-19',
    displayDate: '19 May 2026',
    title: 'May panel',
    record_type: 'Lab Work',
    lane: 'lab',
    location_kind: 'unknown',
    notes: '',
    mapsUrl: null,
    lab: { inRange: 12, total: 14, flags: [] }
  };
  renderMedical(root, sampleModel({ selected }), {
    renderLabSnapshot: (nextHost, nextVisit) => {
      host = nextHost;
      visit = nextVisit;
    }
  });
  assert.equal(visit.id, 'lab');
  assert.equal(host.id, 'medical-bloods-host');
});

test('renderMedical paints kit zoom pills and year rows', () => {
  const root = fakeRoot();
  let year = null;
  renderMedical(root, sampleModel({
    density: 'years',
    items: [
      { kind: 'year', year: '2026', count: 2, caption: '2 visits', expanded: false, items: [] },
      { kind: 'today', date: '2026-08-20' }
    ]
  }), { onToggleYear: value => { year = value; } });
  const timeline = root.querySelector('#medical-timeline');
  assert.match(timeline.textContent, /2026/);
  assert.match(timeline.textContent, /2 visits/);
  assert.equal(timeline.querySelector('[data-visit-id]'), null);
  const months = root.querySelector('#medical-density').children.find(btn => btn.dataset.medicalDensity === 'months');
  assert.equal(months.classList.contains('is-active'), false);
  const years = root.querySelector('#medical-density').children.find(btn => btn.dataset.medicalDensity === 'years');
  assert.equal(years.classList.contains('is-active'), true);
  const toggle = timeline.querySelector('.medical-year__toggle');
  toggle.listeners.find(entry => entry[0] === 'click')[1]({});
  assert.equal(year, '2026');
});

test('renderMedical expands a year into nested visit cards', () => {
  const visit = sampleModel().items[1].visit;
  const root = fakeRoot();
  renderMedical(root, sampleModel({
    density: 'years',
    items: [{
      kind: 'year',
      year: '2026',
      count: 1,
      caption: '1 visit',
      expanded: true,
      items: [
        { kind: 'heading', label: 'May 2026' },
        { kind: 'visit', visit }
      ]
    }]
  }));
  const timeline = root.querySelector('#medical-timeline');
  assert.match(timeline.textContent, /May 2026/);
  assert.match(timeline.textContent, /Gastroenterologist Follow-up/);
});
