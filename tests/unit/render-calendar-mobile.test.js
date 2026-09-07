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

function click(node) {
  const handler = node.listeners.find(([type]) => type === 'click')?.[1];
  assert.ok(handler, 'expected click handler');
  handler({ preventDefault() {}, stopPropagation() {}, target: node });
}

test('mobile day view paints Now card, day strip, and segmented control', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' },
    { record: { type: 'task', date: '2026-08-05', title: 'Call clinic', status: 'open', id: 't1' }, body: '', path: 't1' }
  ]), { view: 'day', now: new Date('2026-08-05T08:00:00') });

  const calendar = root._host.children[0];
  assert.ok(calendar.className.includes('hub-calendar--mobile-day'));
  assert.ok(calendar.querySelector('[data-calendar="now-card"]'));
  assert.ok(calendar.querySelector('[data-calendar="day-strip"]'));
  assert.ok(calendar.querySelector('[data-calendar="mobile-segments"]'));
  assert.equal(calendar.querySelector('[data-calendar="now-tasks"]')?.children[0]?.textContent, '1');
  assert.equal(
    calendar.querySelectorAll('[data-calendar="day-pill"]').length,
    7
  );
  assert.equal(calendar.querySelector('.hub-calendar__timegrid'), null);
  assert.equal(calendar.querySelector('.hub-calendar__rail'), null);
});

test('mobile Schedule panel lists only timed items', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' },
    { record: { type: 'task', date: '2026-08-05', title: 'Call clinic', status: 'open', id: 't1' }, body: '', path: 't1' },
    { record: { type: 'meal', date: '2026-08-05', time: '12:30', meal: 'Lunch' }, body: '', path: 'm' }
  ]), { view: 'day', mobilePanel: 'schedule', now: new Date('2026-08-05T08:00:00') });

  const list = root._host.querySelector('[data-calendar="schedule-list"]');
  const rows = list.querySelectorAll('[data-calendar="mobile-row"]');
  assert.equal(rows.length, 2);
  const titles = rows.map(row => row.querySelector('.hub-calendar__mobile-row-title')?.textContent);
  assert.deepEqual(titles, ['Push', 'Lunch']);
});

test('mobile Tasks panel groups by parsed status and Other', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'task', date: '2026-08-05', title: 'Draft slides', status: 'in_progress', id: 't1' }, body: '', path: 't1' },
    { record: { type: 'task', date: '2026-08-05', title: 'Buy milk', status: 'open', id: 't2' }, body: '', path: 't2' },
    { record: { type: 'knowledge_page', date: '2026-08-05', title: 'Read notes', area: 'Body' }, body: '', path: 'k1' }
  ]), { view: 'day', mobilePanel: 'tasks', now: new Date('2026-08-05T08:00:00') });

  const list = root._host.querySelector('[data-calendar="tasks-list"]');
  const groups = collect(list).filter(node => node.className === 'hub-calendar__mobile-group');
  assert.deepEqual(groups.map(node => node.textContent), ['In progress', 'Open', 'Other']);
  const rows = list.querySelectorAll('[data-calendar="mobile-row"]');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].querySelector('.hub-calendar__mobile-row-title')?.textContent, 'Draft slides');
  assert.equal(rows[2].querySelector('.hub-calendar__mobile-row-meta')?.textContent, 'Knowledge');
});

test('tapping a mobile row opens the event sheet with title and meta', () => {
  const root = fakeRoot({ mobile: true });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: 'Bench focus', path: 'w' }
  ]), { view: 'day', now: new Date('2026-08-05T08:00:00') });

  const row = root._host.querySelector('[data-calendar="mobile-row"]');
  click(row);
  const sheet = root._host.querySelector('[data-calendar="event-sheet"]');
  assert.equal(sheet.open, true);
  assert.equal(sheet.querySelector('[data-calendar="event-sheet-title"]')?.textContent, 'Push');
  const bodyText = collect(sheet.querySelector('[data-calendar="event-sheet-body"]'))
    .map(node => node.textContent)
    .join(' ');
  assert.match(bodyText, /9:00|09:00/);
  assert.match(bodyText, /Workout/);
  assert.match(bodyText, /Bench focus/);
});

test('mobile FAB opens compose sheet and submit still calls onCreateLog', () => {
  const root = fakeRoot({ mobile: true });
  let payload = null;
  renderCalendar(root, model(), {
    view: 'day',
    now: new Date('2026-08-05T08:00:00'),
    onCreateLog: next => { payload = next; }
  });

  click(root._host.querySelector('[data-calendar="mobile-fab"]'));
  const sheet = root._host.querySelector('[data-calendar="compose-sheet"]');
  assert.equal(sheet.open, true);

  const title = sheet.querySelector('[data-calendar="compose-title"]');
  title.value = 'Felt steady';
  const form = collect(sheet).find(node => node.tagName === 'FORM');
  const submit = form.listeners.find(([type]) => type === 'submit')[1];
  submit({ preventDefault() {} });
  assert.equal(payload.candidate.type, 'diary');
  assert.equal(payload.candidate.notes, 'Felt steady');
  assert.equal(payload.slug, 'diary-0000');
});

test('desktop day view stays on the time-grid path', () => {
  const root = fakeRoot({ mobile: false });
  renderCalendar(root, model([
    { record: { type: 'workout', date: '2026-08-05', time: '09:00', title: 'Push', duration_min: 40 }, body: '', path: 'w' }
  ]), { view: 'day' });
  const calendar = root._host.children[0];
  assert.equal(calendar.className.includes('hub-calendar--mobile-day'), false);
  assert.ok(calendar.querySelector('.hub-calendar__timegrid'));
  assert.ok(calendar.querySelector('.hub-calendar__rail'));
  assert.equal(calendar.querySelector('[data-calendar="now-card"]'), null);
});
