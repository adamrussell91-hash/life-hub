import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMorphingNotePopover,
  createMorphingPopover,
  createMorphingValuesPopover,
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
