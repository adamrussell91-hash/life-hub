import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMessage, renderInlineMarkdown } from '../../js/app/render-chat.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.hidden = false;
    this.children = [];
    this.parent = null;
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      node.parent = this;
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = nodes;
    for (const node of nodes) node.parent = this;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([['#chat-messages', new FakeElement('ul')]]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }
}

test('renderInlineMarkdown renders **bold** segments as strong elements and the rest as plain spans', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**, buddy.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Now ');
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].tagName, 'span');
  assert.equal(bubble.children[2].textContent, ', buddy.');
});

test('renderInlineMarkdown re-renders cleanly on repeated calls (streaming updates)', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **45');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].textContent, '.');
});

test('renderInlineMarkdown treats plain text with no markers as a single span', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Just plain text here.');

  assert.equal(bubble.children.length, 1);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Just plain text here.');
});

test('appendMessage still sets plain textContent for simple system-style bubbles', () => {
  const root = new FakeDocument();
  const item = appendMessage(root, { role: 'assistant', text: '🔍 Searched the web: pizza' });
  assert.equal(item.textContent, '🔍 Searched the web: pizza');
  assert.equal(item.className, 'chat-message chat-message--assistant');
});
