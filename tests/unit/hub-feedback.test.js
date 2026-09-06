import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  offerTimedUndo,
  resetHubFeedbackForTests,
  showCopyConfirm,
  showHubToast
} from '../../packages/design-kit/js/hub-feedback.js';

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
      contains: (name) => classes.has(name)
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
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

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
    this.defaultView = {
      matchMedia: () => ({ matches: false }),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      navigator: { clipboard: { writeText: async () => {} } }
    };
  }

  createElement(tag) {
    return new FakeEl(tag, this);
  }
}

function descendants(node) {
  const out = [];
  for (const child of node.children ?? []) out.push(child, ...descendants(child));
  return out;
}

function matches(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  return node.tagName === selector.toLowerCase();
}

test('showHubToast renders a status region with the message', () => {
  resetHubFeedbackForTests();
  const doc = new FakeDoc();
  const toast = showHubToast('Meal logged', { root: doc, durationMs: 0 });
  assert.ok(toast?.el);
  assert.equal(toast.el.getAttribute('role'), 'status');
  assert.match(toast.el.className, /hub-toast/);
  assert.match(toast.el.textContent, /Meal logged/);
  resetHubFeedbackForTests();
});

test('empty toast is a no-op', () => {
  resetHubFeedbackForTests();
  const doc = new FakeDoc();
  assert.equal(showHubToast('   ', { root: doc }), null);
  assert.equal(doc.body.children.length, 0);
});

test('copy confirm writes the clipboard and marks the trigger', async () => {
  resetHubFeedbackForTests();
  const doc = new FakeDoc();
  const trigger = doc.createElement('button');
  let written = '';
  await showCopyConfirm(trigger, 'https://teaching.example/s/lessons/1', {
    root: doc,
    clipboard: { writeText: async (value) => { written = value; } }
  });
  assert.equal(written, 'https://teaching.example/s/lessons/1');
  assert.equal(trigger.dataset.hubCopyState, 'copied');
  assert.ok(trigger.classList.contains('is-copied'));
  resetHubFeedbackForTests();
});

test('timed undo calls onUndo when the action is pressed', () => {
  resetHubFeedbackForTests();
  const doc = new FakeDoc();
  let undone = false;
  let committed = false;
  offerTimedUndo({
    message: 'Task completed',
    root: doc,
    durationMs: 0,
    onUndo: () => { undone = true; },
    onCommit: () => { committed = true; }
  });
  const action = doc.body.querySelector('.hub-toast__action');
  assert.ok(action);
  action.click();
  assert.equal(undone, true);
  assert.equal(committed, false);
  resetHubFeedbackForTests();
});

test('kit sheet and snippets exist and chrome loads them', async () => {
  const css = await readFile(new URL('../../packages/design-kit/hub-interactions.css', import.meta.url), 'utf8');
  const prose = await readFile(new URL('../../packages/design-kit/chat-prose.css', import.meta.url), 'utf8');
  const chrome = await readFile(new URL('../../packages/design-kit/chrome.css', import.meta.url), 'utf8');
  const snippet = await readFile(new URL('../../packages/design-kit/snippets/hub-toast.html', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');
  const life = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');
  assert.match(css, /\.hub-toast\b/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /chat-prose\.css/);
  assert.match(prose, /\.chat-message--assistant \.chat-message__body/);
  assert.match(prose, /\.chat-md-h1/);
  assert.match(
    prose,
    /\.chat-message--user \.chat-message__body,\s*\.chat-message--assistant \.chat-message__body,\s*\.coach-msg__body\s*\{[^}]*font-size:\s*var\(--text-base\)/,
    'chat bubbles use Messenger-density body text, not reading-copy --text-md'
  );
  assert.match(
    prose,
    /\.chat-message--user \.chat-message__body,\s*\.chat-message--assistant \.chat-message__body,\s*\.coach-msg__body\s*\{[^}]*line-height:\s*var\(--leading-snug\)/,
    'chat bubbles use snug leading, not article --leading-normal'
  );
  assert.match(
    prose,
    /@media \(max-width:\s*720px\)\s*\{[^}]*\.chat-message__body[^}]*font-size:\s*16px/,
    'phone chat locks Messenger 16px body across hubs'
  );
  assert.doesNotMatch(
    prose,
    /\.chat-message--assistant \.chat-message__body[^{/\n]*\{[^}]*font-size:\s*var\(--text-md\)/
  );
  assert.match(chrome, /hub-interactions\.css/);
  assert.match(snippet, /hub-toast/);
  assert.match(agents, /hub-feedback\.js/);
  assert.match(agents, /chat-prose\.css/);
  assert.match(life, /chat-prose\.css/);
  const knowledge = await readFile(new URL('../../apps/knowledge/src/style.css', import.meta.url), 'utf8');
  const teaching = await readFile(new URL('../../apps/teaching/src/styles/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(
    knowledge,
    /\.chat-overlay \.chat-message--assistant \.chat-message__body\s*\{[^}]*font-size:\s*var\(--text-md\)/
  );
  assert.match(knowledge, /@media \(max-width:\s*720px\)[\s\S]*?\.chat-overlay \.chat-message__body[\s\S]*?font-size:\s*16px/);
  assert.match(teaching, /\.ai-panel__bubble\s*\{[^}]*font-size:\s*var\(--text-base\)/);
  assert.match(teaching, /\.lesson-builder__chat \.ai-panel__bubble[\s\S]*?font-size:\s*16px/);

  assert.match(worker, /chat-prose\.css/);
  assert.match(worker, /chat-blocks\.js/);
});
