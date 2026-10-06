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
      if (name === 'data-part') this.dataset.part = String(value);
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
  const part = /^\[data-part="(.+)"\]$/.exec(selector);
  if (part) return node.dataset.part === part[1] || node.attributes['data-part'] === part[1];
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
  const brief = el('div');
  brief.id = 'medical-brief-row';
  const strip = el('div');
  strip.id = 'medical-strip';
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
  const showMinor = el('button');
  showMinor.id = 'medical-show-minor';
  showMinor.type = 'button';
  showMinor.textContent = 'Show minor';
  const chips = el('div');
  chips.id = 'medical-chips';
  const empty = el('p');
  empty.id = 'medical-empty';
  const map = {
    '#body-medical-dashboard': dashboard,
    '#medical-brief-row': brief,
    '#medical-strip': strip,
    '#medical-timeline': timeline,
    '#medical-sheet': sheet,
    '#medical-search': search,
    '#medical-type-host': typeHost,
    '#medical-provider-host': providerHost,
    '#medical-density': density,
    '#medical-show-minor': showMinor,
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
    showMinor: false,
    brief: overrides.brief ?? { cycle: null, watch: [], verdict: null },
    nextItems: overrides.nextItems ?? [],
    threads: overrides.threads ?? { today: '2026-08-20', lanes: [] },
    activeEpisode: overrides.activeEpisode ?? null,
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
      { kind: 'band', episode: { id: 'crohns', title: "Crohn's diagnosis", status: 'active' }, visits: [visit] }
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

test('renderMedical shows compact mini-lab rows on a major lab card', () => {
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
        weight: 'major',
        provider: '4Cyte',
        location_kind: 'unknown',
        notes: '',
        mapsUrl: null,
        lab: {
          inRange: 12,
          total: 14,
          flags: [{ label: 'γ-GT', status: 'High', key: 'ggt', value: 233 }],
          markers: [
            { key: 'ggt', label: 'γ-GT', status: 'High', value: 233, ref_low: 0, ref_high: 60 },
            { key: 'alt', label: 'ALT', status: 'Normal', value: 30, ref_low: 0, ref_high: 45 }
          ]
        }
      }
    }]
  }));
  const text = root.querySelector('#medical-timeline').textContent;
  assert.match(text, /γ-GT/);
  assert.match(text, /\+12 in range/);
  assert.equal(text.includes('12 in') && !text.includes('+12 in range'), false);
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
    weight: 'major',
    location_kind: 'unknown',
    notes: '',
    mapsUrl: null,
    lab: { inRange: 12, total: 14, flags: [], markers: [] }
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

test('renderMedical paints Health Brief / strip hosts and upcoming heading', () => {
  const root = fakeRoot();
  renderMedical(root, sampleModel({
    brief: { cycle: null, watch: [], verdict: null },
    nextItems: [],
    threads: { today: '2026-08-20', lanes: [] },
    activeEpisode: null,
    items: [
      { kind: 'upcoming' },
      { kind: 'today', date: '2026-08-20' }
    ]
  }));
  assert.match(root.querySelector('#medical-brief-row').textContent, /Health Brief/);
  assert.match(root.querySelector('#medical-brief-row').textContent, /Next/);
  assert.match(root.querySelector('#medical-strip').textContent, /Health Threads/);
  assert.match(root.querySelector('#medical-timeline').textContent, /Upcoming/);
});

test('renderMedical paints kit zoom pills and year rows', () => {
  const root = fakeRoot();
  let year = null;
  renderMedical(root, sampleModel({
    density: 'years',
    brief: { cycle: null, watch: [], verdict: null },
    nextItems: [],
    threads: { today: '2026-08-20', lanes: [] },
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
    brief: { cycle: null, watch: [], verdict: null },
    nextItems: [],
    threads: { today: '2026-08-20', lanes: [] },
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

test('renderMedical shows time and length in the sheet meta', () => {
  const visit = { ...sampleModel().items[1].visit, time: '10:30', durationMin: 45 };
  const root = fakeRoot();
  renderMedical(root, sampleModel({ selected: visit }));
  assert.match(root.querySelector('#medical-sheet').textContent, /10:30, 45 min/);
});

test('renderMedical write form has start time and length fields prefilled and saves them', () => {
  const visit = { ...sampleModel().items[1].visit, time: '10:30', durationMin: 45 };
  const root = fakeRoot();
  let saved = null;
  renderMedical(root, sampleModel({ selected: visit, mode: 'write', draft: visit }), {
    onSave: fields => { saved = fields; }
  });
  const form = root.querySelector('#medical-sheet').children[0];
  const byField = name => formField(form, name);
  assert.equal(byField('time')._input.type, 'time');
  assert.equal(byField('time')._input.value, '10:30');
  assert.equal(byField('duration_min')._input.value, 45);
  const chip90 = byField('duration_min').children
    .find(c => c.children?.some?.(x => x.textContent === '90m'))
    .children.find(x => x.textContent === '90m');
  chip90.listeners.find(e => e[0] === 'click')[1]();
  assert.equal(byField('duration_min')._input.value, '90');
  form.listeners.find(e => e[0] === 'submit')[1]({ preventDefault() {} });
  assert.equal(saved.time, '10:30');
  assert.equal(saved.duration_min, '90');
});

test('Show minor toggles on AND off: the click handler reads the latest model, not the first render', () => {
  const root = fakeRoot();
  const calls = [];
  const onShowMinor = value => calls.push(value);
  renderMedical(root, sampleModel({ showMinor: false }), { onShowMinor });
  const button = root.querySelector('#medical-show-minor');
  const click = () => button.listeners.find(entry => entry[0] === 'click')[1]({ currentTarget: button, target: button });

  click();                                   // shown -> asks to turn on
  renderMedical(root, sampleModel({ showMinor: true }), { onShowMinor });
  assert.equal(button.textContent, 'Hide minor');
  click();                                   // now on -> must ask to turn OFF
  renderMedical(root, sampleModel({ showMinor: false }), { onShowMinor });
  click();
  assert.deepEqual(calls, [true, false, true]);
});

test('re-rendering with new hooks does not leave the buttons calling the first hooks', () => {
  const root = fakeRoot();
  const seen = [];
  renderMedical(root, sampleModel(), { onSearch: v => seen.push(`old:${v}`) });
  renderMedical(root, sampleModel(), { onSearch: v => seen.push(`new:${v}`) });
  const search = root.querySelector('#medical-search');
  search.listeners.find(entry => entry[0] === 'input')[1]({ target: { value: 'gp' } });
  assert.deepEqual(seen, ['new:gp']);
});

test('the length field accepts any whole minute (15 was rejected by step 5 from min 1)', () => {
  const visit = { ...sampleModel().items[1].visit, time: '10:30', durationMin: 15 };
  const root = fakeRoot();
  renderMedical(root, sampleModel({ selected: visit, mode: 'write', draft: visit }), {});
  const form = root.querySelector('#medical-sheet').children[0];
  const input = formField(form, 'duration_min')._input;
  assert.equal(input.step, '1');
  assert.equal(input.min, '1');
  // HTML validity: a value is valid when (value - min) is a multiple of step.
  for (const minutes of [5, 10, 15, 20, 25, 30, 45, 60, 90]) {
    assert.equal((minutes - Number(input.min)) % Number(input.step), 0, `${minutes} must be a valid length`);
  }
  assert.equal(input.value, 15);
});

function formField(form, name) {
  let found = null;
  const walk = node => {
    if (found) return;
    if (node.dataset?.field === name) {
      found = node;
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(form);
  return found;
}

function sheetButtons(root) {
  const sheet = root.querySelector('#medical-sheet');
  const found = [];
  const walk = node => {
    if (node.tagName === 'BUTTON') found.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(sheet);
  return found;
}

test('a saved visit sheet has Delete; a cadence ghost does not', () => {
  const visit = { ...sampleModel().items[1].visit, virtual: false };
  const root = fakeRoot();
  renderMedical(root, sampleModel({ selected: visit }));
  assert.ok(sheetButtons(root).some(btn => btn.textContent === 'Delete'));

  const ghost = {
    ...visit,
    id: 'virtual-stelara-2026-10-22',
    virtual: true,
    planned: true,
    title: 'Stelara injection'
  };
  renderMedical(root, sampleModel({ selected: ghost }));
  assert.equal(sheetButtons(root).some(btn => btn.textContent === 'Delete'), false);
  assert.equal(sheetButtons(root).some(btn => /Mark booked|Mark done|^Edit$/.test(btn.textContent)), false);
  assert.match(root.querySelector('#medical-sheet').textContent, /estimated/i);
});

test('Delete asks once, then calls onDelete', () => {
  const visit = { ...sampleModel().items[1].visit, path: 'data/body/2026/05/2026-05-01-medical-visit.md' };
  const root = fakeRoot();
  const deleted = [];
  renderMedical(root, sampleModel({ selected: visit }), {
    onDelete: next => deleted.push(next.id)
  });
  const first = sheetButtons(root).find(btn => btn.textContent === 'Delete');
  first.listeners.find(entry => entry[0] === 'click')[1]();
  assert.equal(deleted.length, 0);
  const confirm = sheetButtons(root).find(btn => btn.textContent === 'Delete visit');
  assert.ok(confirm);
  confirm.listeners.find(entry => entry[0] === 'click')[1]();
  assert.deepEqual(deleted, [visit.id]);
});

test('Delete confirm Cancel restores the sheet without deleting', () => {
  const visit = { ...sampleModel().items[1].visit, path: 'data/body/2026/05/2026-05-01-medical-visit.md' };
  const root = fakeRoot();
  const deleted = [];
  renderMedical(root, sampleModel({ selected: visit }), {
    onDelete: next => deleted.push(next.id)
  });
  sheetButtons(root).find(btn => btn.textContent === 'Delete').listeners.find(entry => entry[0] === 'click')[1]();
  const cancel = sheetButtons(root).find(btn => btn.textContent === 'Cancel');
  assert.ok(cancel);
  cancel.listeners.find(entry => entry[0] === 'click')[1]();
  assert.equal(deleted.length, 0);
  assert.ok(sheetButtons(root).some(btn => btn.textContent === 'Delete'));
  assert.equal(sheetButtons(root).some(btn => btn.textContent === 'Delete visit'), false);
});

test('saved visit actions sit in a docked form-actions row', () => {
  const visit = { ...sampleModel().items[1].visit, path: 'data/body/2026/05/2026-05-01-medical-visit.md' };
  const root = fakeRoot();
  renderMedical(root, sampleModel({ selected: visit }));
  const actions = root.querySelector('#medical-sheet').querySelector('[data-part="form-actions"]');
  assert.ok(actions);
  const labels = sheetButtons(root).map(btn => btn.textContent);
  assert.ok(labels.includes('Edit'));
  assert.ok(labels.includes('Delete'));
});

