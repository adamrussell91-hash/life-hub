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
      delete el.attributes[name];
    },
    setAttribute(name, value) {
      el.attributes[name] = value;
      if (name === 'hidden') el.hidden = true;
      if (name === 'id') el.id = value;
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

function fakeRoot() {
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
      matchMedia: () => ({ matches: false }),
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

test('week view paints a time grid and standing compose', () => {
  const root = fakeRoot();
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'week' });
  const calendar = root._host.children[0];
  assert.ok(calendar.className.includes('hub-calendar'));
  assert.ok(calendar.querySelector('.hub-calendar__timegrid'));
  assert.ok(calendar.querySelector('[data-calendar="compose-title"]'));
  assert.equal(calendar.querySelector('[data-calendar="month-label"]')?.textContent.includes('08'), true);
});

test('month shift applies forward/back motion on the grid', () => {
  const root = fakeRoot();
  const built = model();
  renderCalendar(root, built, { view: 'month', monthDelta: 1 });
  assert.equal(root._host.querySelector('#calendar-month-grid')?.dataset.motion, 'forward');
  renderCalendar(root, built, { view: 'month', monthDelta: -1 });
  assert.equal(root._host.querySelector('#calendar-month-grid')?.dataset.motion, 'back');
  renderCalendar(root, built, { view: 'month', monthDelta: 0 });
  assert.equal(root._host.querySelector('#calendar-month-grid')?.dataset.motion, undefined);
});

test('day agenda lists brief rows or empty copy', () => {
  const root = fakeRoot();
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', title: 'Push', duration_min: 40, status: 'completed' }, body: '', path: 'w' }
  ]), { view: 'week', expanded: true, scrollToDetail: true });
  const detail = root._host.querySelector('#calendar-day-detail');
  assert.ok(detail);
  const brief = collect(detail).find(node => node.className === 'calendar-event__brief');
  assert.equal(brief?.textContent, '40 min · completed');

  renderCalendar(root, model(), { view: 'week', expanded: true });
  assert.equal(
    collect(root._host.querySelector('#calendar-day-detail')).some(node => node.textContent === 'Nothing logged this day.'),
    true
  );
});

test('compose submit calls onCreateLog with a diary candidate', () => {
  const root = fakeRoot();
  let payload = null;
  renderCalendar(root, model(), {
    view: 'day',
    onCreateLog: next => { payload = next; }
  });
  const title = root._host.querySelector('[data-calendar="compose-title"]');
  title.value = 'Felt steady';
  const form = collect(root._host.children[0]).find(node => node.tagName === 'FORM');
  const submit = form.listeners.find(([type]) => type === 'submit')[1];
  submit({ preventDefault() {} });
  assert.equal(payload.candidate.type, 'diary');
  assert.equal(payload.candidate.notes, 'Felt steady');
  assert.equal(payload.slug, 'diary-0000');
});
