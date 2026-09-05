import test from 'node:test';
import assert from 'node:assert/strict';
import { syncChatChrome, toggleChatChrome } from '../../apps/life/js/app/chat-chrome.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.id = '';
    this.className = '';
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.textContent = '';
    this.attributes = new Map();
  }

  get childElementCount() {
    return this.children.length;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  querySelector(selector) {
    if (selector === '#chat-messages') return this.children.find(child => child.id === 'chat-messages') ?? null;
    if (selector === '#chat-tools') return this.children.find(child => child.id === 'chat-tools') ?? null;
    if (selector === '#chat-empty') return this.children.find(child => child.id === 'chat-empty') ?? null;
    return null;
  }
}

function viewWith(messages = 0) {
  const view = new FakeElement('section');
  view.id = 'chat-view';
  view.className = 'chat-view';
  const list = new FakeElement('ul');
  list.id = 'chat-messages';
  for (let i = 0; i < messages; i += 1) list.children.push(new FakeElement('li'));
  const tools = new FakeElement('button');
  tools.id = 'chat-tools';
  tools.hidden = true;
  const empty = new FakeElement('div');
  empty.id = 'chat-empty';
  view.children.push(list, tools, empty);
  return view;
}

test('syncChatChrome stays expanded while the thread is empty', () => {
  const view = viewWith(0);
  syncChatChrome(view);
  assert.equal(view.dataset.chrome, undefined);
  assert.equal(view.querySelector('#chat-tools').hidden, true);
  assert.equal(view.querySelector('#chat-empty').hidden, false);
});

test('syncChatChrome collapses protocols once a message lands and offers Tools', () => {
  const view = viewWith(1);
  syncChatChrome(view);
  assert.equal(view.dataset.chrome, 'engaged');
  const tools = view.querySelector('#chat-tools');
  assert.equal(tools.hidden, false);
  assert.equal(tools.getAttribute('aria-expanded'), 'false');
  assert.equal(tools.textContent, 'Tools');
  assert.equal(view.querySelector('#chat-empty').hidden, true);
});

test('toggleChatChrome reveals protocol trays', () => {
  const view = viewWith(1);
  syncChatChrome(view);
  toggleChatChrome(view);
  assert.equal(view.dataset.chromeExpanded, 'true');
  assert.equal(view.querySelector('#chat-tools').textContent, 'Hide tools');
  toggleChatChrome(view);
  assert.equal(view.dataset.chromeExpanded, undefined);
});
