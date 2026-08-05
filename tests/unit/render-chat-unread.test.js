import test from 'node:test';
import assert from 'node:assert/strict';
import { setChatUnread } from '../../js/app/render-chat.js';

const UNREAD_SELECTOR = '.floating-chat-button, [data-section="chat"]';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.classes = new Set();
  }

  add(name) {
    this.classes.add(name);
    this.owner.className = [...this.classes].join(' ');
  }

  remove(name) {
    this.classes.delete(name);
    this.owner.className = [...this.classes].join(' ');
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.classList = new FakeClassList(this);
  }
}

class FakeDocument {
  constructor() {
    this.fab = new FakeElement('button');
    this.railChatButton = new FakeElement('button');
    this.mobileChatButton = new FakeElement('button');
    this.otherNavButton = new FakeElement('button');
  }

  querySelectorAll(selector) {
    if (selector === UNREAD_SELECTOR) {
      return [this.fab, this.railChatButton, this.mobileChatButton];
    }
    return [];
  }
}

test('setChatUnread(root, true) adds has-unread and a data-unread flag to every chat FAB and Chat nav button', () => {
  const root = new FakeDocument();

  setChatUnread(root, true);

  for (const target of [root.fab, root.railChatButton, root.mobileChatButton]) {
    assert.ok(target.classList.contains('has-unread'), 'expected has-unread class to be added');
    assert.equal(target.dataset.unread, 'true');
  }
  assert.equal(root.otherNavButton.classList.contains('has-unread'), false, 'unrelated buttons should be untouched');
});

test('setChatUnread(root, false) removes has-unread and the data-unread flag', () => {
  const root = new FakeDocument();
  setChatUnread(root, true);

  setChatUnread(root, false);

  for (const target of [root.fab, root.railChatButton, root.mobileChatButton]) {
    assert.equal(target.classList.contains('has-unread'), false);
    assert.equal(target.dataset.unread, undefined);
  }
});

test('setChatUnread tolerates a root with no matching elements', () => {
  const root = { querySelectorAll: () => [] };
  assert.doesNotThrow(() => setChatUnread(root, true));
});
