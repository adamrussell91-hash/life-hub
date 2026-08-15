import test from 'node:test';
import assert from 'node:assert/strict';
import { openMindThreadSheet, closeMindThreadSheet } from '../../js/app/mind-thread-sheet.js';

function el(tag = 'div') {
  let text = '';
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    hidden: false,
    id: '',
    dataset: {},
    children: [],
    attributes: {},
    listeners: [],
    style: { setProperty() {} },
    classList: {
      remove() {},
      add() {},
      toggle(name, force) {
        const parts = String(this.className || '').split(/\s+/).filter(Boolean);
        const has = parts.includes(name);
        const on = force == null ? !has : Boolean(force);
        this.className = on
          ? (has ? parts.join(' ') : [...parts, name].join(' '))
          : parts.filter(part => part !== name).join(' ');
      }
    },
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    append(...nodes) {
      for (const child of nodes) child.parentNode = this;
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
      for (const child of nodes) child.parentNode = this;
    },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'id') this.id = String(value);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = String(value);
      }
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
  Object.defineProperty(node, 'textContent', {
    get() {
      if (this.children.length) {
        return this.children.map(child => child.textContent).filter(Boolean).join('');
      }
      return text;
    },
    set(value) {
      text = String(value ?? '');
    }
  });
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
  const data = /^\[data-([a-z-]+)(?:="([^"]+)")?\]$/.exec(selector);
  if (data) {
    const key = data[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (data[2]) return node.dataset?.[key] === data[2] || node.attributes?.[`data-${data[1]}`] === data[2];
    return node.dataset?.[key] !== undefined;
  }
  return false;
}

function makeRootWithSheet() {
  const root = el('div');
  const sheet = el('div');
  sheet.id = 'mind-thread-sheet';
  sheet.hidden = true;
  const title = el('h2');
  title.dataset.role = 'title';
  const rows = el('div');
  rows.dataset.role = 'rows';
  const cont = el('button');
  cont.dataset.role = 'continue';
  const close = el('button');
  close.dataset.role = 'close';
  const scrim = el('div');
  scrim.dataset.role = 'scrim';
  sheet.append(title, rows, cont, close, scrim);
  root.append(sheet);
  root.createElement = tag => el(tag);
  return root;
}

test('openMindThreadSheet lists rows and continue action', () => {
  const root = makeRootWithSheet();
  openMindThreadSheet(root, {
    title: 'shame-loop',
    rows: [{ date: '2026-04-07', title: 'The Filter', excerpt: 'The filter activated.' }],
    continueAgent: 'vera'
  });
  const sheet = root.querySelector('#mind-thread-sheet');
  assert.equal(sheet.hidden, false);
  assert.match(sheet.textContent, /The Filter/);
  assert.match(sheet.textContent, /Continue with Vera/);
});

test('closeMindThreadSheet hides the overlay', () => {
  const root = makeRootWithSheet();
  openMindThreadSheet(root, { title: 'x', rows: [], continueAgent: null });
  closeMindThreadSheet(root);
  assert.equal(root.querySelector('#mind-thread-sheet').hidden, true);
});
