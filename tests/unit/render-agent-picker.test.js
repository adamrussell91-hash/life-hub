import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAgentPicker, applyAgentAvatarToBubble } from '../../js/app/render-agent-picker.js';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  get tokens() {
    return (this.owner.className || '').split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.tokens.includes(name);
  }

  add(name) {
    const tokens = this.tokens;
    if (!tokens.includes(name)) tokens.push(name);
    this.owner.className = tokens.join(' ');
  }

  remove(name) {
    this.owner.className = this.tokens.filter(token => token !== name).join(' ');
  }

  toggle(name, force) {
    const shouldHave = force === undefined ? !this.contains(name) : force;
    if (shouldHave) this.add(name); else this.remove(name);
    return shouldHave;
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.type = '';
    this.src = '';
    this.alt = '';
    this.title = '';
    this.width = null;
    this.height = null;
    this.decoding = '';
    this.classList = new FakeClassList(this);
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      node.parent = this;
    }
  }

  prepend(...nodes) {
    this.children.unshift(...nodes);
    for (const node of nodes) node.parent = this;
  }

  insertBefore(node, ref) {
    const index = ref ? this.children.indexOf(ref) : -1;
    if (index === -1) {
      this.children.push(node);
    } else {
      this.children.splice(index, 0, node);
    }
    node.parent = this;
  }

  setAttribute(name, value) {
    this.attributes ??= {};
    this.attributes[name] = value;
  }

  addEventListener() {}

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return this.children.find(child => child.classList?.contains(className)) ?? null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-agent-slug]') {
      return this.children.filter(child => child.dataset.agentSlug !== undefined);
    }
    return [];
  }
}

class FakeDocument {
  constructor() {
    this.pickerHost = new FakeElement('div');
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  querySelectorAll(selector) {
    if (selector === '#agent-picker') return [this.pickerHost];
    return [];
  }
}

test('renderAgentPicker renders 64x64 avatar images in the picker', () => {
  const root = new FakeDocument();
  renderAgentPicker(root, { onSelect: () => {} });

  const buttons = root.pickerHost.children;
  assert.ok(buttons.length > 0, 'expected picker buttons to be created');
  for (const button of buttons) {
    const img = button.children.find(child => child.tagName === 'img');
    assert.equal(img.width, 64);
    assert.equal(img.height, 64);
  }
});

test('applyAgentAvatarToBubble renders a 52x52 avatar image in a chat bubble', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  bubble.ownerDocument = root;

  applyAgentAvatarToBubble(bubble, 'brisket');

  const img = bubble.querySelector('.chat-message__avatar');
  assert.ok(img, 'expected avatar image to be inserted into the bubble');
  assert.equal(img.width, 52);
  assert.equal(img.height, 52);
});
