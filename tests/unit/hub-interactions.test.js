import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextualAiBar, createSelectAiAgent } from '../../packages/design-kit/js/hub-ai-bar.js';
import { createQuickPaste, createVoiceNote } from '../../packages/design-kit/js/hub-capture.js';
import { openHubCommandSearch, resetHubCommandSearchForTests } from '../../packages/design-kit/js/hub-command-search.js';
import { createCreateDisclosure } from '../../packages/design-kit/js/hub-create-disclosure.js';
import { createEditableChip, createTagList, enhanceInlineEdit } from '../../packages/design-kit/js/hub-inline-edit.js';
import {
  createJournalNav,
  createLabeledProgress,
  createPinList,
  createRunWidget,
  createSaveToggle,
  createScrollIsland,
  createStatusPicker,
  createStepIndicator,
  createTaskDisclosure
} from '../../packages/design-kit/js/hub-surfaces.js';

class FakeEl {
  constructor(tag = 'div', doc = null) {
    this.tagName = String(tag).toLowerCase();
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.hidden = false;
    this.parentNode = null;
    this.ownerDocument = doc;
    this.value = '';
    this.name = '';
    this.style = { cssText: '', setProperty() {} };
    const classes = new Set();
    this._classes = classes;
    this.classList = {
      add: (...names) => {
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(' ');
      },
      remove: (...names) => {
        names.forEach((name) => classes.delete(name));
        this.className = [...classes].join(' ');
      },
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const on = force == null ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
        return on;
      }
    };
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.ownerDocument = node.ownerDocument ?? this.ownerDocument;
      this.children.push(node);
    }
    this.textContent = this.children.map((child) => child.textContent).join('');
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  querySelector(selector) {
    return descendants(this).find((node) => matches(node, selector)) ?? null;
  }

  querySelectorAll(selector) {
    return descendants(this).filter((node) => matches(node, selector));
  }

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== handler);
  }

  focus() {}
  select() {}

  click() {
    for (const handler of this.listeners.click ?? []) {
      handler({ preventDefault() {}, stopPropagation() {}, target: this });
    }
  }
}

class FakeDoc {
  constructor() {
    this.body = new FakeEl('body', this);
    this.body.ownerDocument = this;
    this.listeners = {};
    this.defaultView = {
      matchMedia: () => ({ matches: false }),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      navigator: { clipboard: { writeText: async () => {}, readText: async () => 'pasted' } }
    };
  }

  createElement(tag) {
    return new FakeEl(tag, this);
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((fn) => fn !== handler);
  }
}

function descendants(node) {
  const out = [];
  for (const child of node.children ?? []) out.push(child, ...descendants(child));
  return out;
}

function matches(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  if (selector.startsWith('[')) {
    const match = selector.match(/^\[([a-z-]+)(?:="([^"]*)")?\]$/i);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (match[1].startsWith('data-')) {
      const dataKey = match[1].slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (match[2] != null) return node.dataset[dataKey] === match[2];
      return node.dataset[dataKey] != null || node.getAttribute(match[1]) != null;
    }
    if (match[2] != null) return node.getAttribute(match[1]) === match[2] || node.dataset[key] === match[2];
    return node.getAttribute(match[1]) != null;
  }
  return node.tagName === selector.toLowerCase();
}

test('contextual AI bar submits trimmed text', () => {
  const doc = new FakeDoc();
  let submitted = '';
  const bar = createContextualAiBar({
    root: doc,
    placeholder: 'Ask Clare',
    onSubmit: (value) => { submitted = value; }
  });
  assert.match(bar.el.className, /hub-ai-bar/);
  bar.input.value = '  hello  ';
  for (const handler of bar.el.listeners.submit ?? []) {
    handler({ preventDefault() {} });
  }
  assert.equal(submitted, 'hello');
});

test('agent select reports the chosen id', () => {
  const doc = new FakeDoc();
  let value = '';
  const picker = createSelectAiAgent({
    root: doc,
    agents: [{ id: 'clare', label: 'Clare' }, { id: 'vera', label: 'Vera' }],
    onChange: (id) => { value = id; }
  });
  const vera = picker.el.querySelector('[data-agent]');
  const buttons = picker.el.querySelectorAll('[data-agent]');
  buttons[1].click();
  assert.equal(value, 'vera');
  assert.equal(picker.value, 'vera');
  void vera;
});

test('inline edit commits on Enter', () => {
  const doc = new FakeDoc();
  const el = doc.createElement('h2');
  el.textContent = 'Draft title';
  let committed = '';
  enhanceInlineEdit(el, { onCommit: (value) => { committed = value; } });
  el.click();
  const input = el.querySelector('input');
  assert.ok(input);
  input.value = 'Published title';
  for (const handler of input.listeners.keydown ?? []) {
    handler({ key: 'Enter', preventDefault() {} });
  }
  assert.equal(committed, 'Published title');
});

test('editable chip and tag list mutate labels', () => {
  const doc = new FakeDoc();
  let chip = '';
  createEditableChip({ root: doc, label: 'Psych', onCommit: (value) => { chip = value; } });
  const tags = createTagList({ root: doc, tags: ['exam', 'year12'] });
  assert.deepEqual(tags.tags, ['exam', 'year12']);
  tags.el.querySelector('[aria-label="Remove exam"]')?.click();
  assert.deepEqual(tags.tags, ['year12']);
  void chip;
});

test('create disclosure opens the item grid', () => {
  const doc = new FakeDoc();
  let selected = '';
  const create = createCreateDisclosure({
    root: doc,
    items: [{ id: 'lesson', label: 'Lesson', onSelect: () => { selected = 'lesson'; } }]
  });
  assert.equal(create.isOpen(), false);
  create.trigger.click();
  assert.equal(create.isOpen(), true);
  create.panel.querySelector('[data-create="lesson"]').click();
  assert.equal(selected, 'lesson');
  assert.equal(create.isOpen(), false);
});

test('voice note toggles recording and paste reads the clipboard', async () => {
  const doc = new FakeDoc();
  let started = false;
  const voice = createVoiceNote({ root: doc, onStart: () => { started = true; } });
  voice.button.click();
  assert.equal(voice.isRecording(), true);
  assert.equal(started, true);
  let pasted = '';
  const paste = createQuickPaste({
    root: doc,
    clipboard: { readText: async () => 'clipboard note' },
    onPaste: (text) => { pasted = text; }
  });
  await paste.button.listeners.click[0]();
  assert.equal(pasted, 'clipboard note');
});

test('command search filters rows and runs the selected action', () => {
  resetHubCommandSearchForTests();
  const doc = new FakeDoc();
  let chosen = '';
  const palette = openHubCommandSearch({
    root: doc,
    groups: [{
      heading: 'Go to',
      items: [
        { id: 'board', label: 'Board', onSelect: () => { chosen = 'board'; } },
        { id: 'today', label: 'Today', onSelect: () => { chosen = 'today'; } }
      ]
    }]
  });
  assert.ok(palette.el);
  assert.equal(palette.list.querySelectorAll('.hub-command__row').length, 2);
  palette.input.value = 'tod';
  for (const handler of palette.input.listeners.input ?? []) handler();
  const rows = palette.list.querySelectorAll('.hub-command__row');
  assert.equal(rows.length, 1);
  rows[0].click();
  assert.equal(chosen, 'today');
  resetHubCommandSearchForTests();
});

test('surfaces render pin, progress, run, steps, disclosure, and status', () => {
  const doc = new FakeDoc();
  let opened = '';
  let pinned = false;
  const pins = createPinList({
    root: doc,
    items: [{ id: 'n1', label: 'Note one', pinned: false }],
    onPin: (_id, next) => { pinned = next; },
    onOpen: (id) => { opened = id; }
  });
  pins.el.querySelector('.hub-icon-btn').click();
  assert.equal(pinned, true);
  pins.el.querySelector('.hub-pin-list__label').click();
  assert.equal(opened, 'n1');

  const progress = createLabeledProgress({ root: doc, label: 'Today', value: 3, max: 7 });
  assert.equal(progress.pct, 43);
  assert.match(progress.el.textContent, /Today 3 \/ 7/);

  const run = createRunWidget({ root: doc, distance: 4.2, unit: 'km', label: 'Last session' });
  assert.match(run.value.textContent, /4\.2 km/);

  const steps = createStepIndicator({ root: doc, steps: ['Draft', 'Publish'], current: 1 });
  assert.ok(steps.el.querySelector('.is-current'));

  const task = createTaskDisclosure({ root: doc, title: 'Mark essays', progress: '2/5', detail: 'Due Friday' });
  assert.equal(task.body.hidden, true);
  task.trigger.click();
  assert.equal(task.body.hidden, false);

  const save = createSaveToggle({ root: doc, label: 'Save' });
  assert.equal(save.isSaved(), false);
  save.el.click();
  assert.equal(save.isSaved(), true);

  const status = createStatusPicker({
    root: doc,
    statuses: [{ id: 'open', label: 'Open' }, { id: 'done', label: 'Done' }],
    value: 'open'
  });
  status.el.querySelector('[data-status="done"]').click();
  assert.equal(status.value, 'done');

  const nav = createJournalNav({
    root: doc,
    current: 'mind',
    sections: [{ id: 'mind', label: 'Mind' }, { id: 'body', label: 'Body' }]
  });
  assert.match(nav.el.className, /hub-journal-nav/);

  const island = createScrollIsland({ root: doc, progressLabel: 'Lesson', actions: [{ label: 'Top' }] });
  assert.match(island.el.textContent, /Lesson/);
});
