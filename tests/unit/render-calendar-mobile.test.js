import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCalendar } from '../../apps/life/js/app/render-calendar.js';
import { buildCalendarModel } from '../../apps/life/js/app/calendar-model.js';

function createEl(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '',
    id: '',
    textContent: '',
    hidden: false,
    children: [],
    dataset: {},
    style: {},
    attributes: {},
    listeners: [],
    parent: null,
    value: '',
    type: '',
    selected: false,
    title: '',
    open: false,
    classList: {
      add(...names) {
        const set = new Set(`${el.className} ${names.join(' ')}`.trim().split(/\s+/).filter(Boolean));
        el.className = [...set].join(' ');
      },
      toggle(name, force) {
        const has = el.className.split(/\s+/).includes(name);
        const on = force == null ? !has : Boolean(force);
        this[on ? 'add' : 'remove']?.(name);
        if (!on) el.className = el.className.split(/\s+/).filter(item => item && item !== name).join(' ');
      },
      contains(name) {
        return el.className.split(/\s+/).includes(name);
      }
    },
    append(...nodes) {
      for (const node of nodes) {
        if (node == null) continue;
        if (typeof node === 'string') {
          const text = createEl('span');
          text.textContent = node;
          text.parent = el;
          el.children.push(text);
          continue;
        }
        node.parent = el;
        el.children.push(node);
      }
    },
    replaceChildren(...nodes) {
      el.children = [];
      el.append(...nodes);
    },
    addEventListener(type, fn) {
      el.listeners.push([type, fn]);
    },
    removeAttribute(name) {
      if (name === 'hidden') el.hidden = false;
      if (name === 'open') el.open = false;
      delete el.attributes[name];
    },
    setAttribute(name, value) {
      el.attributes[name] = value;
      if (name === 'hidden') el.hidden = true;
      if (name === 'id') el.id = value;
      if (name === 'open') el.open = true;
    },
    getAttribute(name) {
      return el.attributes[name] ?? null;
    },
    scrollIntoView() {
      el.scrolled = true;
    },
    focus() {
      el.focused = true;
    },
    showModal() {
      el.open = true;
      el.attributes.open = '';
    },
    close() {
      el.open = false;
      delete el.attributes.open;
    },
    closest(selector) {
      let node = el;
      while (node) {
        if (matches(node, selector)) return node;
        node = node.parent;
      }
      return null;
    },
    querySelector(selector) {
      return collect(el).find(node => matches(node, selector)) ?? null;
    },
    querySelectorAll(selector) {
      return collect(el).filter(node => matches(node, selector));
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 800 };
    }
  };
  return el;
}

function collect(node) {
  const out = [];
  for (const child of node.children ?? []) {
    out.push(child, ...collect(child));
  }
  return out;
}

function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('[data-calendar="')) {
    const value = selector.slice('[data-calendar="'.length, -2);
    return node.dataset.calendar === value;
  }
  if (selector.startsWith('[data-calendar-view')) {
    return Boolean(node.dataset.calendarView);
  }
  if (selector.startsWith('[data-panel=')) {
    return node.dataset.panel === selector.slice('[data-panel="'.length, -2);
  }
  if (selector.startsWith('[data-role=')) {
    return node.attributes['data-role'] === selector.slice('[data-role="'.length, -2)
      || node.getAttribute?.('data-role') === selector.slice('[data-role="'.length, -2);
  }
  if (selector.startsWith('[role=')) {
    return node.attributes.role === selector.slice(7, -2);
  }
  if (selector.includes('.')) {
    const [tag, ...classes] = selector.replace(':scope > ', '').split('.');
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    return classes.every(name => node.className.split(/\s+/).includes(name));
  }
  return node.className.split(/\s+/).includes(selector.replace('.', ''));
}

function fakeRoot({ mobile = true } = {}) {
  const dashboard = createEl('section');
  dashboard.id = 'calendar-dashboard';
  dashboard.hidden = true;
  const host = createEl('div');
  host.id = 'life-calendar-host';
  dashboard.append(host);
  const store = new Map([
    ['#calendar-dashboard', dashboard],
    ['#life-calendar-host', host]
  ]);
  return {
    createElement: createEl,
    defaultView: {
      matchMedia: query => ({
        matches: mobile && String(query).includes('max-width: 720px')
      }),
      document: {
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        body: createEl('body')
      }
    },
    querySelector(selector) {
      if (store.has(selector)) return store.get(selector);
      return dashboard.querySelector(selector) ?? host.querySelector(selector);
    },
    _dashboard: dashboard,
    _host: host
  };
}

function model(events = []) {
  return buildCalendarModel({
    events,
    date: '2026-08-05',
    selectedDate: '2026-08-05',
    viewMonth: '2026-08'
  });
}

function assertKitWorkspace(calendar, mode) {
  assert.ok(calendar.className.includes('hub-calendar--workspace'));
  assert.equal(calendar.className.includes('hub-calendar--mobile'), false);
  assert.ok(calendar.querySelector('.hub-calendar__nav'));
  assert.ok(calendar.querySelector('.hub-calendar__workspace'));
  if (mode === 'day') {
    assert.ok(calendar.querySelector('.hub-calendar__rail'));
    assert.ok(calendar.querySelector('[data-calendar="compose-title"]'));
  } else {
    assert.equal(calendar.querySelector('[data-calendar="compose-title"]'), null);
  }
  if (mode === 'month') {
    assert.ok(calendar.querySelector('.hub-calendar__grid'));
  } else {
    assert.ok(calendar.querySelector('.hub-calendar__timegrid'));
  }
}

test('phone day view uses the kit workspace, not a second mobile skin', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'day', now: new Date('2026-08-05T08:00:00') });
  assertKitWorkspace(root._host.children[0], 'day');
});

test('phone week view uses the kit workspace, not a second mobile skin', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'week', now: new Date('2026-08-05T08:00:00') });
  assertKitWorkspace(root._host.children[0], 'week');
});

test('phone month view uses the kit workspace, not a second mobile skin', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'month', now: new Date('2026-08-05T08:00:00') });
  assertKitWorkspace(root._host.children[0], 'month');
});

test('desktop day view stays on the time-grid path', () => {
  const root = fakeRoot({ mobile: false });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'day' });
  const calendar = root._host.children[0];
  assertKitWorkspace(calendar, 'day');
  assert.equal(calendar.querySelector('[data-calendar="now-card"]'), null);
});

test('master calendar names every hub source', () => {
  const root = fakeRoot({ mobile: false });
  renderCalendar(root, model([
    { record: { type: 'scheduled_lesson', date: '2026-08-05', time: '09:15', title: 'Memory' }, body: '', path: 't' },
    { record: { type: 'task', date: '2026-08-05', title: 'Marking' }, body: '', path: 'k' }
  ]), { view: 'week' });
  const strip = root._host.querySelector('.hub-calendar__sources');
  assert.ok(strip);
  const labels = (strip.children ?? []).map(node => node.textContent).join(' ');
  assert.match(labels, /Life/);
  assert.match(labels, /Teaching/);
  assert.match(labels, /Knowledge/);
  assert.match(labels, /Tasks/);
  assert.match(labels, /Professional/);
});
