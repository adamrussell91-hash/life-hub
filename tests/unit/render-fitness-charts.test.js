import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitnessCharts } from '../../apps/life/js/app/render-fitness-charts.js';

class Node {
  constructor(name = 'div') {
    this.name = name;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }

  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'data-role') this.dataset.role = String(value);
  }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  querySelector(selector) {
    if (selector === '[data-role="fitness-tip"]') {
      return this.children.find(node => node.dataset?.role === 'fitness-tip') ?? null;
    }
    if (selector === '.mind-chart-legend') {
      return this.children.find(node => String(node.className || '').includes('mind-chart-legend')) ?? null;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 20, height: 20 }; }
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function texts(node) {
  const found = [];
  walk(node, item => {
    if (item.textContent) found.push(item.textContent);
  });
  return found;
}

function chartRoot() {
  const nodes = new Map();
  const ensure = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Node());
    return nodes.get(selector);
  };
  return {
    nodes,
    ensure,
    createElement: () => new Node('div'),
    createElementNS: (_ns, name) => new Node(name),
    querySelector(selector) { return ensure(selector); }
  };
}

test('when-you-train paints day-part counts and a typical-time caption', () => {
  const root = chartRoot();
  renderFitnessCharts(root, {
    trainWhen: {
      count: 4,
      typicalTime: '18:40',
      typicalBand: 'evening',
      read: 'Usually evenings, around 18:40 · mostly Tue',
      buckets: [
        { key: 'morning', label: 'Morning', value: 1 },
        { key: 'afternoon', label: 'Afternoon', value: 0 },
        { key: 'evening', label: 'Evening', value: 3 },
        { key: 'night', label: 'Night', value: 0 }
      ]
    },
    orbitDays: [
      { date: '2026-08-20', volume: 1200, dayType: 'workout_30', colour: 'var(--wave)' },
      { date: '2026-09-01', volume: 2400, dayType: 'workout_45_60', colour: 'var(--marine)' }
    ]
  });

  assert.equal(root.ensure('[data-fitness="when-read"]').textContent, 'Usually evenings, around 18:40 · mostly Tue');
  const clock = texts(root.ensure('#fitness-clock-chart'));
  assert.ok(clock.includes('Morning'));
  assert.ok(clock.includes('Evening'));
  assert.ok(clock.includes('3'));
  assert.equal(root.ensure('#fitness-clock-card').attributes.hidden, undefined);
  assert.ok(root.ensure('#fitness-clock-card').children.some(node => node.dataset?.role === 'fitness-tip'));

  const orbit = texts(root.ensure('#fitness-orbit-chart'));
  assert.ok(orbit.includes('Lighter'));
  assert.ok(orbit.includes('Heavier'));
  let orbitLeaders = 0;
  walk(root.ensure('#fitness-orbit-chart'), node => {
    if (node.attributes?.['data-role'] === 'leader') orbitLeaders += 1;
  });
  assert.ok(orbitLeaders >= 3, 'orbit volume and date labels use leader lines');
  assert.equal(root.ensure('[data-fitness="orbit-status"]').textContent, '2 sessions');
});
