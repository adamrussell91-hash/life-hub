import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatPanelController } from '../../js/app/chat-panel.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.hidden = false;
    this.dataset = {};
    this.children = [];
    this.parent = null;
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name),
      getPropertyValue: name => properties.get(name) ?? ''
    };
  }

  append(node) {
    if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
    this.children.push(node);
    node.parent = this;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([
      ['#chat-view', new FakeElement('section')],
      ['#chat-view-home', new FakeElement('div')]
    ]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }
}

test('opening the panel moves it into the given slot, unhides it, and sets the accent colour', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');

  controller.open(nutritionSlot, '#EEB046');

  const panel = root.querySelector('#chat-view');
  assert.equal(panel.parent, nutritionSlot);
  assert.equal(panel.hidden, false);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '#EEB046');
  assert.equal(panel.dataset.panelMode, 'overlay');
  assert.equal(controller.isOpen(), true);
});

test('closing the panel returns it to the home slot and hides it without clearing accent', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');
  controller.open(nutritionSlot, '#EEB046');

  controller.close();

  const panel = root.querySelector('#chat-view');
  const homeSlot = root.querySelector('#chat-view-home');
  assert.equal(panel.parent, homeSlot);
  assert.equal(panel.hidden, true);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '#EEB046');
  assert.equal(panel.dataset.panelMode, undefined);
  assert.equal(controller.isOpen(), false);
});

test('closing when already closed is a harmless no-op', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });

  controller.close();

  assert.equal(controller.isOpen(), false);
  assert.equal(root.querySelector('#chat-view').parent, null);
});

test('opening a second slot moves the same panel again rather than cloning it', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });
  const nutritionSlot = new FakeElement('div');
  const centralNodeSlot = new FakeElement('div');

  controller.open(nutritionSlot, '#EEB046');
  controller.open(centralNodeSlot, '#2D2D2D');

  const panel = root.querySelector('#chat-view');
  assert.equal(panel.parent, centralNodeSlot);
  assert.equal(nutritionSlot.children.length, 0);
  assert.equal(panel.style.getPropertyValue('--agent-accent'), '#2D2D2D');
});

test('open requires a slot element', () => {
  const root = new FakeDocument();
  const controller = createChatPanelController({ root });

  assert.throws(() => controller.open(null, '#EEB046'), TypeError);
});

test('throws when required DOM elements are unavailable', () => {
  const root = { querySelector: () => null };
  assert.throws(() => createChatPanelController({ root }), TypeError);
});
