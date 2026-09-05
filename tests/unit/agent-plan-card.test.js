import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentPlanCard } from '../../packages/design-kit/js/agent-plan-card.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = '';
    const classes = new Set();
    this._classes = classes;
    let className = '';
    Object.defineProperty(this, 'className', {
      get: () => className,
      set: value => {
        className = String(value ?? '');
        classes.clear();
        for (const name of className.split(/\s+/).filter(Boolean)) classes.add(name);
      }
    });
    this.classList = {
      add: (...names) => {
        names.forEach(name => classes.add(name));
        className = [...classes].join(' ');
      },
      toggle: (name, force) => {
        if (force) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
        className = [...classes].join(' ');
      }
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
}

const root = {
  createElement: tag => new FakeEl(tag)
};

test('createAgentPlanCard paints steps and updates current', () => {
  const { card, update } = createAgentPlanCard(root, {
    id: 'clare-dump',
    heading: 'Dump',
    steps: ['Sort items', 'Draft voice', 'Build cards'],
    current: 0
  });
  assert.equal(card.dataset.planId, 'clare-dump');
  assert.match(card.className, /agent-plan-card/);
  update({ current: 2, heading: 'Dump' });
  assert.match(card.attributes['aria-label'] || '', /step 3 of 3/);
});
