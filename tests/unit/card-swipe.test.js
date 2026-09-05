import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCardSwipe,
  DEFAULT_CARD_SWIPE_ITEMS,
  nextSwipeIndex
} from '../../packages/design-kit/js/card-swipe.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.hidden = false;
    this.parentNode = null;
    this.type = '';
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  querySelector(selector) {
    return descendants(this).find(node => matches(node, selector)) ?? null;
  }

  querySelectorAll(selector) {
    return descendants(this).filter(node => matches(node, selector));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(fn => fn !== handler);
  }

  emit(type, event = {}) {
    const payload = {
      preventDefault() {},
      stopPropagation() {},
      target: this,
      currentTarget: this,
      button: 0,
      ...event
    };
    for (const handler of this.listeners[type] ?? []) handler(payload);
    return payload;
  }

  getBoundingClientRect() {
    const width = Number.parseFloat(this.style?.width) || 320;
    const height = Number.parseFloat(this.style?.height) || 220;
    return { width, height, left: 0, top: 0, right: width, bottom: height };
  }

  get offsetWidth() {
    return this.getBoundingClientRect().width;
  }

  get offsetHeight() {
    return this.getBoundingClientRect().height;
  }
}

class FakeDoc {
  constructor() {
    this.body = new FakeEl('body');
    this.defaultView = { matchMedia: () => ({ matches: false }) };
  }

  createElement(tag) {
    return new FakeEl(tag);
  }
}

function descendants(node) {
  const list = [];
  for (const child of node.children ?? []) {
    list.push(child, ...descendants(child));
  }
  return list;
}

function matches(node, selector) {
  const raw = String(selector || '');
  if (raw.startsWith(':scope > ')) return matches(node, raw.slice(9));
  if (raw.includes(',')) return raw.split(',').some(part => matches(node, part.trim()));
  if (raw.startsWith('.')) return String(node.className || '').split(/\s+/).includes(raw.slice(1));
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const body = raw.slice(1, -1);
    const [key, value] = body.split('=');
    const camel = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (value == null) return Boolean(node.dataset?.[camel] || node.attributes?.[key] != null);
    return String(node.dataset?.[camel] ?? node.attributes?.[key] ?? '') === value.replaceAll('"', '');
  }
  return String(node.tagName || '').toLowerCase() === raw.toLowerCase();
}

test('nextSwipeIndex advances on a left flick and stays put on a tap', () => {
  assert.equal(nextSwipeIndex({ offset: -80, currentIndex: 0, itemCount: 5 }), 1);
  assert.equal(nextSwipeIndex({ offset: 80, currentIndex: 2, itemCount: 5 }), 1);
  assert.equal(nextSwipeIndex({ offset: -10, velocity: -600, currentIndex: 0, itemCount: 5 }), 1);
  assert.equal(nextSwipeIndex({ offset: -10, currentIndex: 0, itemCount: 5 }), 0);
  assert.equal(nextSwipeIndex({ offset: -80, currentIndex: 4, itemCount: 5 }), 4);
  assert.equal(nextSwipeIndex({ offset: 80, currentIndex: 0, itemCount: 5 }), 0);
  assert.equal(nextSwipeIndex({ offset: -80, currentIndex: 0, itemCount: 1 }), 0);
});

test('createCardSwipe builds the default workout deck and reports position', () => {
  const root = new FakeDoc();
  const swipe = createCardSwipe({ root, label: 'Exercises' });
  assert.equal(swipe.getIndex(), 0);
  assert.equal(DEFAULT_CARD_SWIPE_ITEMS.length, 5);
  assert.equal(swipe.track.children.length, 5);
  assert.match(swipe.status.textContent, /1 of 5 · Bench press/);
  assert.equal(swipe.dots.children.length, 5);
  swipe.setIndex(2);
  assert.equal(swipe.getIndex(), 2);
  assert.match(swipe.status.textContent, /3 of 5 · Bayesian curl/);
  assert.equal(swipe.dots.children[2].attributes['aria-current'], 'true');
});

test('dots and arrow keys move the deck', () => {
  const root = new FakeDoc();
  const seen = [];
  const swipe = createCardSwipe({
    root,
    onIndexChange: index => seen.push(index)
  });
  swipe.dots.children[3].emit('click');
  assert.equal(swipe.getIndex(), 3);
  swipe.el.emit('keydown', { key: 'ArrowLeft' });
  swipe.el.emit('keydown', { key: 'Home' });
  assert.equal(swipe.getIndex(), 0);
  assert.deepEqual(seen, [3, 2, 0]);
});

test('a horizontal drag past the buffer advances the card', () => {
  const root = new FakeDoc();
  const swipe = createCardSwipe({ root });
  swipe.track.emit('pointerdown', { clientX: 200, timeStamp: 0 });
  swipe.track.emit('pointermove', { clientX: 120, timeStamp: 30 });
  swipe.track.emit('pointerup', { clientX: 80, timeStamp: 80 });
  assert.equal(swipe.getIndex(), 1);
});

test('createCardSwipe keeps the requested index until slides are appended', () => {
  const root = new FakeDoc();
  const swipe = createCardSwipe({ root, items: [], currentIndex: 2 });
  swipe.appendSlide(root.createElement('div'), { title: 'One' });
  swipe.appendSlide(root.createElement('div'), { title: 'Two' });
  swipe.appendSlide(root.createElement('div'), { title: 'Three' });
  swipe.sync();
  assert.equal(swipe.getIndex(), 2);
  assert.match(swipe.status.textContent, /3 of 3 · Three/);
});

test('fluid decks pin slide widths to the measured viewport', () => {
  const root = new FakeDoc();
  const swipe = createCardSwipe({ root, items: [], fluid: true });
  swipe.viewport.getBoundingClientRect = () => ({
    width: 390, height: 200, left: 0, top: 0, right: 390, bottom: 200
  });
  for (let i = 0; i < 18; i++) {
    const card = root.createElement('article');
    card.className = 'hub-card-swipe__card';
    swipe.appendSlide(card, { title: `Ex ${i + 1}` });
  }
  swipe.sync();
  assert.equal(swipe.track.children.length, 18);
  for (const slide of swipe.track.children) {
    assert.equal(slide.style.width, '390px');
    assert.equal(slide.style.maxWidth, '390px');
    assert.equal(slide.style.flex, '0 0 390px');
  }
  assert.match(swipe.track.style.transform, /translate3d\(0px/);
  swipe.setIndex(2, { animate: false });
  assert.match(swipe.track.style.transform, /translate3d\(-812px/);
});

test('a tap without a drag selects the current card', () => {
  const root = new FakeDoc();
  const seen = [];
  const swipe = createCardSwipe({
    root,
    onSelect: index => seen.push(index)
  });
  swipe.track.emit('pointerdown', { clientX: 160, timeStamp: 0 });
  swipe.track.emit('pointerup', { clientX: 158, timeStamp: 20 });
  swipe.track.emit('click', { clientX: 158 });
  assert.deepEqual(seen, [0]);
});

test('pointerup alone selects without waiting for click', () => {
  const root = new FakeDoc();
  const seen = [];
  const swipe = createCardSwipe({
    root,
    onSelect: index => seen.push(index)
  });
  swipe.track.emit('pointerdown', { clientX: 160, timeStamp: 0 });
  swipe.track.emit('pointerup', { clientX: 160, timeStamp: 40 });
  assert.deepEqual(seen, [0]);
});

test('small finger jitter still selects instead of dead-zoning', () => {
  const root = new FakeDoc();
  const seen = [];
  const swipe = createCardSwipe({
    root,
    onSelect: index => seen.push(index)
  });
  swipe.track.emit('pointerdown', { clientX: 200, timeStamp: 0 });
  swipe.track.emit('pointermove', { clientX: 220, timeStamp: 20 });
  swipe.track.emit('pointerup', { clientX: 225, timeStamp: 50 });
  assert.equal(swipe.getIndex(), 0);
  assert.deepEqual(seen, [0]);
});

test('a real swipe past the buffer does not also select', () => {
  const root = new FakeDoc();
  const seen = [];
  const swipe = createCardSwipe({
    root,
    onSelect: index => seen.push(index)
  });
  swipe.track.emit('pointerdown', { clientX: 200, timeStamp: 0 });
  swipe.track.emit('pointermove', { clientX: 120, timeStamp: 30 });
  swipe.track.emit('pointerup', { clientX: 80, timeStamp: 80 });
  assert.equal(swipe.getIndex(), 1);
  assert.deepEqual(seen, []);
});

test('drags that start on an input do not change the card', () => {
  const root = new FakeDoc();
  const swipe = createCardSwipe({ root, items: [] });
  const field = root.createElement('input');
  swipe.appendSlide(field, { title: 'Weight' });
  swipe.appendSlide(root.createElement('div'), { title: 'Next' });
  swipe.sync();
  swipe.track.emit('pointerdown', { clientX: 200, timeStamp: 0, target: field });
  swipe.track.emit('pointerup', { clientX: 80, timeStamp: 80, target: field });
  assert.equal(swipe.getIndex(), 0);
});
