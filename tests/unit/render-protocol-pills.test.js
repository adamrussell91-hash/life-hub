import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProtocolPills } from '../../apps/life/js/app/render-protocol-pills.js';

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
    this.hidden = false;
    this.textContent = '';
    this.type = '';
    this.attributes = {};
    this.classList = new FakeClassList(this);
    this.style = { setProperty() {} };
    this.listeners = new Map();
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden') this.hidden = false;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  click() {
    for (const handler of this.listeners.get('click') ?? []) handler();
  }
}

class FakeDocument {
  constructor() {
    this.host = new FakeElement('div');
  }

  querySelector(selector) {
    return selector === '#agent-protocol-pills' ? this.host : null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }
}

function pillButtons(root) {
  return root.host.children[1]?.children ?? [];
}

function pillLabel(button) {
  return button.children.find(child => child.className === 'agent-protocol-pills__label')?.textContent ?? '';
}

function pillTip(button) {
  return button.children.find(child => child.className === 'agent-protocol-pills__tip') ?? null;
}

test('renderProtocolPills hides the tray when no agent is selected', () => {
  const root = new FakeDocument();
  renderProtocolPills(root, { slug: null, onSelect() {} });
  assert.equal(root.host.hidden, true);
  assert.equal(root.host.children.length, 0);
});

test('selecting Brisket renders the approved pills under Can', () => {
  const root = new FakeDocument();
  renderProtocolPills(root, { slug: 'brisket', onSelect() {} });
  assert.equal(root.host.hidden, false);
  assert.equal(root.host.children[0].textContent, 'Can');
  assert.deepEqual(pillButtons(root).map(pillLabel), [
    'Log a meal',
    'Flare-up eating',
    'Weekend / eating out',
    'Plan the rest of today',
    'Why I ate that'
  ]);
});

test('an active pill is marked without inventing a description', () => {
  const root = new FakeDocument();
  renderProtocolPills(root, { slug: 'brisket', selectedId: 'flare-up', onSelect() {} });
  const flare = pillButtons(root).find(button => button.dataset.protocolId === 'flare-up');
  assert.ok(flare.classList.contains('is-active'));
  assert.equal(flare.attributes['aria-pressed'], 'true');
  assert.equal(
    root.host.children.some(child => /polyphenol|lasso/i.test(child.textContent)),
    false
  );
});

test('each pill carries a one-sentence hover explainer card', () => {
  const root = new FakeDocument();
  renderProtocolPills(root, { slug: 'brisket', onSelect() {} });
  const flare = pillButtons(root).find(button => button.dataset.protocolId === 'flare-up');
  const tip = pillTip(flare);
  assert.ok(tip, 'expected a hover card on the pill');
  assert.equal(tip.attributes.role, 'tooltip');
  assert.match(tip.textContent, /flare-up rules/i);
  assert.equal(flare.attributes['aria-describedby'], tip.id);
  assert.equal(pillLabel(flare), 'Flare-up eating');
});

test('clicking a pill reports its id and does not write assistant copy', () => {
  const root = new FakeDocument();
  const seen = [];
  renderProtocolPills(root, { slug: 'chadwick', onSelect: id => seen.push(id) });
  pillButtons(root).find(button => button.dataset.protocolId === 'next-session').click();
  assert.deepEqual(seen, ['next-session']);
});
