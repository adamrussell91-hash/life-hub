import test from 'node:test';
import assert from 'node:assert/strict';
import { appendChatThreadItem, beginChatTurnAnchor, clearChatTurnAnchors } from '../../apps/life/js/app/chat-turn-anchor.js';

function fakeNode(tag = 'li', props = {}) {
  const node = {
    tagName: tag,
    className: '',
    attributes: new Map(),
    children: [],
    parent: null,
    offsetTop: props.offsetTop ?? 0,
    offsetHeight: props.offsetHeight ?? 0,
    clientHeight: props.clientHeight ?? 0,
    scrollHeight: props.scrollHeight ?? 0,
    scrollTop: props.scrollTop ?? 0,
    style: { height: '0px' },
    get isConnected() {
      return this.parent != null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    append(...nodes) {
      for (const child of nodes) {
        this.children.push(child);
        child.parent = this;
      }
    },
    insertBefore(node, ref) {
      if (node.parent) node.remove();
      const idx = this.children.indexOf(ref);
      if (idx === -1) {
        this.append(node);
        return node;
      }
      this.children.splice(idx, 0, node);
      node.parent = this;
      return node;
    },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    querySelector(selector) {
      return this.children.find((child) => matches(child, selector)) ?? null;
    },
    querySelectorAll(selector) {
      return this.children.filter((child) => matches(child, selector));
    }
  };
  return node;
}

function matches(node, selector) {
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const attr = selector.slice(1, -1);
    return node.attributes?.has(attr);
  }
  return false;
}

test('beginChatTurnAnchor creates a spacer, follow scrolls to the user item, release removes spacer', () => {
  const list = fakeNode('ul', { clientHeight: 400, scrollHeight: 200 });
  const userItem = fakeNode('li', { offsetTop: 40 });
  list.append(userItem);
  list.scrollHeight = 200;

  const created = [];
  const dom = {
    createElement(tag) {
      const el = fakeNode(tag);
      created.push(el);
      return el;
    }
  };

  const anchor = beginChatTurnAnchor(list, userItem, dom);
  assert.equal(typeof anchor.follow, 'function');
  assert.equal(typeof anchor.release, 'function');

  const spacer = list.children.find((child) => child.attributes.has('data-chat-turn-spacer'));
  assert.ok(spacer, 'expected a turn spacer in the list');
  assert.equal(spacer.className, 'chat-turn-spacer');
  assert.equal(userItem.attributes.get('data-chat-turn-anchor'), '1');

  list.scrollTop = 999;
  userItem.offsetTop = 80;
  anchor.follow();
  assert.equal(list.scrollTop, 72, 'follow should pin near the user item (offsetTop - 8)');

  anchor.release();
  assert.equal(list.children.includes(spacer), false, 'release should remove the spacer');
  assert.equal(userItem.attributes.has('data-chat-turn-anchor'), false);
});

test('appendChatThreadItem keeps new cards above the turn spacer', () => {
  const list = fakeNode('ul', { clientHeight: 400, scrollHeight: 200 });
  const userItem = fakeNode('li', { offsetTop: 40 });
  list.append(userItem);
  const created = [];
  const dom = {
    createElement(tag) {
      const el = fakeNode(tag);
      created.push(el);
      return el;
    }
  };
  beginChatTurnAnchor(list, userItem, dom);
  const spacer = list.children.find((child) => child.attributes.has('data-chat-turn-spacer'));
  const card = fakeNode('li');
  card.className = 'record-proposal confirm-card';
  appendChatThreadItem(list, card);

  assert.equal(list.children.at(-1), spacer, 'spacer must stay last');
  assert.equal(list.children.at(-2), card, 'confirm card must land above the spacer');
});

test('clearChatTurnAnchors strips anchors and spacers', () => {
  const list = fakeNode('ul');
  const userItem = fakeNode('li');
  const spacer = fakeNode('li');
  userItem.setAttribute('data-chat-turn-anchor', '1');
  spacer.setAttribute('data-chat-turn-spacer', '1');
  list.append(userItem, spacer);

  clearChatTurnAnchors(list);
  assert.equal(userItem.attributes.has('data-chat-turn-anchor'), false);
  assert.equal(list.children.includes(spacer), false);
});
