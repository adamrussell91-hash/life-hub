import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMorphingClosedFieldPopover,
  createMorphingNotePopover,
  createMorphingPopover,
  createMorphingValuesPopover,
  mountMorphingPopover,
  resetMorphingPopoverForTests
} from '../../packages/design-kit/js/morphing-popover.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    this.parentNode = null;
    this.nextSibling = null;
    this.style = { cssText: '' };
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) {
        node.parentNode.children = node.parentNode.children.filter(child => child !== node);
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }

  querySelector(selector) {
    return descendants(this).find(node => matches(node, selector)) ?? null;
  }

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(fn => fn !== handler);
  }

  click() {
    for (const handler of this.listeners.click ?? []) {
      handler({ preventDefault() {}, stopPropagation() {}, target: this });
    }
  }
}

class FakeDoc {
  constructor() {
    this.body = new FakeEl('body');
    this.defaultView = { matchMedia: () => ({ matches: true }) };
    this.listeners = {};
  }

  createElement(tag) {
    return new FakeEl(tag);
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(fn => fn !== handler);
  }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) {
    return String(node.className || '').split(/\s+/).includes(selector.slice(1));
  }
  if (selector.startsWith('[')) {
    const key = selector.slice(1, -1).replace('data-', '');
    const camel = key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    return Boolean(node.dataset?.[camel] || node.attributes?.[selector.slice(1, -1)]);
  }
  return node.tagName === selector;
}

test.afterEach(() => resetMorphingPopoverForTests());

test('Home shell loads the morphing popover stylesheet and mounts it', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../apps/life/js/app/main.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../packages/design-kit/morphing-popover.css', import.meta.url), 'utf8');
  const chrome = await readFile(new URL('../../packages/design-kit/chrome.css', import.meta.url), 'utf8');

  assert.match(html, /packages\/design-kit\/morphing-popover\.css/);
  assert.match(main, /morphing-popover\.js/);
  assert.match(main, /mountMorphingPopovers/);
  assert.match(chrome, /morphing-popover\.css/);
  assert.match(css, /blur\(var\(--morphing-popover-blur\)\)/);
  assert.match(css, /--morphing-popover-duration: 250ms/);
  assert.match(css, /ease-out/);
});

test('note popover keeps the textarea in the tree and opens from the trigger', () => {
  const root = new FakeDoc();
  const popover = createMorphingNotePopover({
    root,
    label: 'Notes',
    title: 'Notes',
    supporting: 'How does skin feel?',
    placeholder: 'A short note',
    value: 'Dry'
  });

  assert.match(popover.el.className, /morphing-popover/);
  assert.equal(popover.trigger.attributes['aria-expanded'], 'false');
  assert.equal(popover.textarea.value, 'Dry');
  assert.equal(popover.content.hidden, true);

  popover.trigger.click();
  assert.equal(popover.isOpen(), true);
  assert.equal(popover.content.hidden, false);
  assert.match(popover.el.className, /is-open/);

  popover.close();
  assert.equal(popover.isOpen(), false);
  assert.equal(popover.content.hidden, true);
});

test('values popover submits labelled fields like a dimensions editor', () => {
  const root = new FakeDoc();
  let submitted = null;
  const popover = createMorphingValuesPopover({
    root,
    label: 'Dimensions',
    title: 'Dimensions',
    supporting: 'Set the dimensions for the layer.',
    fields: [
      { name: 'width', label: 'Width', value: '100%', autoFocus: true },
      { name: 'maxWidth', label: 'Max. width', value: '300px' },
      { name: 'height', label: 'Height', value: '25px' },
      { name: 'maxHeight', label: 'Max. height', value: 'none' }
    ],
    submitLabel: 'Save',
    onSubmit(values) {
      submitted = values;
    }
  });

  popover.trigger.click();
  const save = descendants(popover.content).find(node => node.textContent === 'Save');
  assert.ok(save, 'Save action should exist');
  save.click();
  assert.deepEqual(submitted, {
    width: '100%',
    maxWidth: '300px',
    height: '25px',
    maxHeight: 'none'
  });
});

test('only one morphing popover stays open', () => {
  const root = new FakeDoc();
  const first = createMorphingPopover({ root, triggerLabel: 'One', title: 'One' });
  const second = createMorphingPopover({ root, triggerLabel: 'Two', title: 'Two' });
  first.open();
  second.open();
  assert.equal(first.isOpen(), false);
  assert.equal(second.isOpen(), true);
});

test('closed-field popover wraps long closed lists as loose pills', () => {
  const root = new FakeDoc();
  const popover = createMorphingClosedFieldPopover({
    root,
    title: 'Domain',
    value: 'teaching',
    options: [
      { value: 'teaching', label: 'Teaching' },
      { value: 'life', label: 'Life' },
      { value: 'wedding', label: 'Wedding' },
      { value: 'health', label: 'Health' },
      { value: 'other', label: 'Other' }
    ]
  });
  const group = descendants(popover.content).find((node) =>
    String(node.className || '').includes('morphing-popover__choices')
  );
  assert.match(group.className, /hub-pills--loose/);
});

test('closed-field popover stages a pill then Save commits it', () => {
  const root = new FakeDoc();
  let saved = null;
  const popover = createMorphingClosedFieldPopover({
    root,
    title: 'Status',
    value: 'in_progress',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'in_progress', label: 'In progress' },
      { value: 'done', label: 'Done' }
    ],
    onSave(value) {
      saved = value;
    }
  });

  assert.match(popover.el.className, /morphing-popover--closed-field/);
  assert.equal(popover.getValue(), 'in_progress');
  popover.trigger.click();

  const done = descendants(popover.content).find(node => node.textContent === 'Done');
  assert.ok(done, 'Done option should exist');
  done.click();
  assert.equal(popover.getDraft(), 'done');
  assert.equal(popover.getValue(), 'in_progress');

  const save = descendants(popover.content).find(node => node.textContent === 'Save');
  save.click();
  assert.equal(saved, 'done');
  assert.equal(popover.getValue(), 'done');
  assert.equal(popover.isOpen(), false);
  const triggerLabel = popover.trigger.querySelector('[data-morphing-label]');
  assert.equal(triggerLabel.textContent, 'Done');
});

test('close cancels leftover box animations so the next open can measure', async () => {
  const cancelled = [];

  class AnimEl extends FakeEl {
    getBoundingClientRect() {
      const panel = String(this.className || '').includes('morphing-popover__panel');
      return {
        left: 8,
        top: 8,
        width: panel ? 320 : 80,
        height: panel ? 180 : 36
      };
    }

    animate() {
      const anim = {
        cancel() {
          cancelled.push(1);
        },
        finished: Promise.resolve()
      };
      this.anims = this.anims || [];
      this.anims.push(anim);
      return anim;
    }

    getAnimations() {
      return this.anims || [];
    }

    focus() {}
  }

  class AnimDoc extends FakeDoc {
    constructor() {
      super();
      this.body = new AnimEl('body');
      this.defaultView = {
        matchMedia: () => ({ matches: false }),
        requestAnimationFrame: cb => cb(),
        getComputedStyle: () => ({ borderRadius: '8px' }),
        innerWidth: 800,
        innerHeight: 600
      };
    }

    createElement(tag) {
      return new AnimEl(tag);
    }
  }

  const root = new AnimDoc();
  const popover = createMorphingClosedFieldPopover({
    root,
    title: 'Status',
    value: 'open',
    options: [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' }
    ]
  });

  popover.open();
  await Promise.resolve();
  popover.close();
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(cancelled.length > 0, 'close should cancel fill:forwards box animations');
  popover.open();
  await Promise.resolve();
  assert.equal(popover.isOpen(), true);
});

test('closed-field popover discards a staged pick on Discard', () => {
  const root = new FakeDoc();
  let saved = null;
  const popover = createMorphingClosedFieldPopover({
    root,
    title: 'Priority',
    value: 'medium',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' }
    ],
    onSave(value) {
      saved = value;
    }
  });

  popover.trigger.click();
  descendants(popover.content).find(node => node.textContent === 'High').click();
  descendants(popover.content).find(node => node.textContent === 'Discard').click();
  assert.equal(saved, null);
  assert.equal(popover.getValue(), 'medium');
  assert.equal(popover.getDraft(), 'medium');
});

test('mount wires a closed-field chip from data attributes', () => {
  const root = new FakeDoc();
  const wrap = root.createElement('div');
  wrap.className = 'morphing-popover';
  wrap.dataset.morphingKind = 'closed-field';
  wrap.dataset.morphingTitle = 'Status';
  wrap.dataset.morphingValue = 'open';
  wrap.dataset.morphingOptions = JSON.stringify([
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' }
  ]);
  const trigger = root.createElement('button');
  trigger.dataset.morphingTrigger = '1';
  const label = root.createElement('span');
  label.dataset.morphingLabel = 'status';
  label.textContent = 'Open';
  trigger.append(label);
  wrap.append(trigger);

  let saved = null;
  const popover = mountMorphingPopover(wrap, {
    root,
    onSave(value) {
      saved = value;
    }
  });

  assert.ok(popover);
  popover.trigger.click();
  descendants(popover.content).find(node => node.textContent === 'Done').click();
  descendants(popover.content).find(node => node.textContent === 'Save').click();
  assert.equal(saved, 'done');
});

test('closed-field snippet and kit docs name the factory', async () => {
  const html = await readFile(new URL('../../packages/design-kit/snippets/morphing-popover.html', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../packages/design-kit/morphing-popover.css', import.meta.url), 'utf8');
  assert.match(html, /data-morphing-kind="closed-field"/);
  assert.match(html, /createMorphingClosedFieldPopover/);
  assert.match(agents, /createMorphingClosedFieldPopover/);
  assert.match(css, /morphing-popover__choices/);
});
