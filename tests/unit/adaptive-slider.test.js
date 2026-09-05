import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  clampSliderValue,
  createAdaptiveSlider,
  mountAdaptiveSlider,
  mountAdaptiveSliders,
  sliderBand,
  sliderCeiling,
  sliderPercentage
} from '../../packages/design-kit/js/adaptive-slider.js';
import { renderEnergySlider } from '../../apps/life/js/app/render-nutrition.js';

class FakeEl {
  constructor(tag = 'div', doc = null) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.value = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.disabled = false;
    this.parentNode = null;
    this.ownerDocument = doc;
    this.style = {
      props: {},
      setProperty(key, value) {
        this.props[key] = value;
      }
    };
    const classes = new Set();
    this._classes = classes;
    this.classList = {
      add: (...names) => {
        names.forEach(name => classes.add(name));
        this.className = [...classes].join(' ');
      },
      contains: name => classes.has(name)
    };
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      node.ownerDocument = node.ownerDocument ?? this.ownerDocument;
      this.children.push(node);
    }
    this.textContent = this.children.map(child => child.textContent).join('');
  }

  prepend(node) {
    node.parentNode = this;
    node.ownerDocument = node.ownerDocument ?? this.ownerDocument;
    this.children.unshift(node);
  }

  after(node) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    node.parentNode = this.parentNode;
    node.ownerDocument = node.ownerDocument ?? this.ownerDocument;
    this.parentNode.children.splice(index + 1, 0, node);
  }

  insertBefore(node, ref) {
    node.parentNode = this;
    node.ownerDocument = node.ownerDocument ?? this.ownerDocument;
    const index = this.children.indexOf(ref);
    if (index < 0) this.children.unshift(node);
    else this.children.splice(index, 0, node);
    return node;
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

  setAttribute(name, value = '') {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    if (name in this.attributes) return this.attributes[name];
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) != null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(fn => fn !== handler);
  }

  dispatch(type, extra = {}) {
    for (const handler of this.listeners[type] ?? []) {
      handler({ target: this, ...extra });
    }
  }
}

class FakeDoc {
  constructor() {
    this.body = new FakeEl('body', this);
    this.defaultView = { matchMedia: () => ({ matches: true }) };
    this.listeners = {};
  }

  createElement(tag) {
    return new FakeEl(tag, this);
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(fn => fn !== handler);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function matches(node, selector) {
  return selector.split(',').some(part => matchesOne(node, part.trim()));
}

function matchesOne(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.includes('.')) {
    const [tag, ...classes] = selector.split('.');
    if (tag && node.tagName !== tag) return false;
    return classes.every(name => node.classList.contains(name) || String(node.className).split(/\s+/).includes(name));
  }
  if (selector.startsWith('[')) {
    const body = selector.slice(1, -1);
    if (body.includes('=')) {
      const [rawKey, rawValue] = body.split('=');
      return node.getAttribute(rawKey) === rawValue.replace(/"/g, '');
    }
    return node.hasAttribute(body) || Boolean(node.dataset?.[camelize(body)]);
  }
  if (selector.includes('[')) {
    const [tag, attr] = selector.split('[');
    return (!tag || node.tagName === tag) && matchesOne(node, `[${attr}`);
  }
  return node.tagName === selector;
}

function camelize(name) {
  return name.replace(/^data-/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

test('slider math clamps, steps, bands, and ceilings', () => {
  assert.equal(sliderPercentage(200, 100, 300), 50);
  assert.equal(sliderPercentage(100, 100, 100), 0);
  assert.equal(sliderBand(0.49), 'low');
  assert.equal(sliderBand(0.5), 'mid');
  assert.equal(sliderBand(0.69), 'mid');
  assert.equal(sliderBand(0.7), 'high');
  assert.equal(sliderBand(60), 'mid');
  assert.equal(clampSliderValue(317, 100, 800, 50), 300);
  assert.equal(clampSliderValue(10, 100, 800, 50), 100);
  assert.equal(clampSliderValue(900, 100, 800, 50), 800);
  assert.equal(sliderCeiling(1130, 1900, 50), 1900);
  assert.equal(sliderCeiling(1925, 1900, 50), 1950);
});

test('createAdaptiveSlider paints band, percentage, and digits', () => {
  const root = new FakeDoc();
  const changes = [];
  const slider = createAdaptiveSlider({
    root,
    min: 100,
    max: 800,
    step: 50,
    defaultValue: 300,
    onChange: value => changes.push(value)
  });

  assert.match(slider.el.className, /hub-slider/);
  assert.equal(slider.getValue(), 300);
  assert.equal(slider.el.dataset.band, 'low');
  assert.equal(slider.el.style.props['--hub-slider-pct'], '28.57142857142857');
  assert.equal(slider.el.querySelector('.hub-slider__digits').textContent, '300');
  assert.equal(slider.el.querySelectorAll('.hub-slider__dot').length, 6);

  slider.setValue(500);
  assert.equal(slider.getValue(), 500);
  assert.equal(slider.el.dataset.band, 'mid');
  assert.deepEqual(changes, [500]);

  slider.setRange({ max: 500 });
  assert.equal(slider.getValue(), 500);
  assert.equal(slider.el.dataset.band, 'high');
});

test('range input updates the value and fires onChange', () => {
  const root = new FakeDoc();
  const changes = [];
  const slider = createAdaptiveSlider({
    root,
    min: 100,
    max: 800,
    step: 50,
    value: 300,
    onChange: value => changes.push(value)
  });

  slider.input.value = '450';
  slider.input.dispatch('input');
  assert.equal(slider.getValue(), 450);
  assert.deepEqual(changes, [450]);
});

test('mountAdaptiveSlider reads data attributes and is idempotent', () => {
  const root = new FakeDoc();
  const el = root.createElement('div');
  el.className = 'hub-slider';
  el.classList.add('hub-slider');
  el.setAttribute('data-adaptive-slider', '');
  el.setAttribute('data-slider-min', '0');
  el.setAttribute('data-slider-max', '1900');
  el.setAttribute('data-slider-step', '50');
  el.setAttribute('data-slider-value', '1130');
  el.setAttribute('data-slider-label', 'Calories');
  root.body.append(el);

  const first = mountAdaptiveSlider(el);
  const second = mountAdaptiveSlider(el);
  assert.equal(first, second);
  assert.equal(first.getValue(), 1150);
  assert.deepEqual(first.getRange(), { min: 0, max: 1900, step: 50 });
  assert.equal(mountAdaptiveSliders(root).length, 1);
});

test('kit CSS uses tokens and chrome imports the sheet', async () => {
  const css = await readFile(new URL('../../packages/design-kit/adaptive-slider.css', import.meta.url), 'utf8');
  const chrome = await readFile(new URL('../../packages/design-kit/chrome.css', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../../packages/design-kit/AGENTS.md', import.meta.url), 'utf8');
  const snippet = await readFile(new URL('../../packages/design-kit/snippets/adaptive-slider.html', import.meta.url), 'utf8');

  assert.match(chrome, /adaptive-slider\.css/);
  assert.match(agents, /adaptive-slider\.js/);
  assert.match(snippet, /data-adaptive-slider/);
  assert.match(css, /--hub-slider-spring/);
  assert.match(css, /var\(--success\)/);
  assert.match(css, /var\(--high-sea\)/);
  assert.match(css, /var\(--wave\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /#10B981|#FE55B7|#D946EF|#4946FF|#FEB101|#FEFEFE/i);
});

test('Life Hub loads and mounts the slider on Nutrition', async () => {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../../apps/life/js/app/main.js', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../apps/life/service-worker.js', import.meta.url), 'utf8');

  assert.match(html, /packages\/design-kit\/adaptive-slider\.css/);
  assert.match(html, /id="nutrition-energy-slider"/);
  assert.match(html, /data-adaptive-slider/);
  assert.match(main, /adaptive-slider\.js/);
  assert.match(main, /mountAdaptiveSliders/);
  assert.match(worker, /life-hub-shell-v120/);
  assert.match(worker, /packages\/design-kit\/adaptive-slider\.css/);
  assert.match(worker, /packages\/design-kit\/js\/adaptive-slider\.js/);
});

test('renderEnergySlider binds today\'s calories to the daily target', () => {
  const root = new FakeDoc();
  const el = root.createElement('div');
  el.id = 'nutrition-energy-slider';
  el.classList.add('hub-slider');
  el.setAttribute('data-adaptive-slider', '');
  el.setAttribute('data-slider-min', '0');
  el.setAttribute('data-slider-max', '2500');
  el.setAttribute('data-slider-step', '50');
  el.setAttribute('data-slider-value', '0');
  root.body.append(el);

  const queryRoot = {
    querySelector(selector) {
      if (selector === '#nutrition-energy-slider') return el;
      return root.body.querySelector(selector);
    }
  };

  const api = renderEnergySlider(queryRoot, {
    nutrition: { calories: 1130 },
    targets: { calories: 1900 }
  });

  assert.equal(api.getValue(), 1130);
  assert.deepEqual(api.getRange(), { min: 0, max: 1900, step: 1 });
  assert.equal(el.dataset.band, 'mid');
});
