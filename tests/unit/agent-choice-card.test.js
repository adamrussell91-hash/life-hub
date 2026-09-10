import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentChoiceCard } from '../../packages/design-kit/js/agent-choice-card.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.disabled = false;
    this.type = '';
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
      remove: (...names) => {
        names.forEach(name => classes.delete(name));
        className = [...classes].join(' ');
      },
      toggle: (name, force) => {
        const on = force == null ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name);
        else classes.delete(name);
        className = [...classes].join(' ');
        return on;
      },
      contains: name => classes.has(name)
    };
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  append(...nodes) {
    for (const node of nodes) this.children.push(node);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  click() {
    for (const handler of this.listeners.click ?? []) handler({});
  }

  querySelector(selector) {
    if (selector === '.agent-choice-card__option') {
      return this.children.find(child => String(child.className).includes('agent-choice-card__option')) ?? null;
    }
    for (const child of this.children) {
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = node => {
      if (selector.startsWith('.') && String(node.className).includes(selector.slice(1))) out.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(this);
    return out;
  }
}

function fakeRoot() {
  return {
    createElement: tag => new FakeEl(tag)
  };
}

test('createAgentChoiceCard confirms the selected option', () => {
  const confirmed = [];
  const card = createAgentChoiceCard(fakeRoot(), {
    title: 'Pick one',
    choices: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' }
    ],
    onConfirm: picks => confirmed.push(picks.map(p => p.id))
  });

  const options = card.querySelectorAll('.agent-choice-card__option');
  assert.equal(options.length, 2);
  options[1].click();

  const actions = card.children.find(child => child.className === 'confirm-card__actions');
  const confirm = actions.children.find(child => String(child.className).includes('btn--primary'));
  confirm.click();

  assert.deepEqual(confirmed, [['b']]);
  assert.equal(card.className.includes('is-receipt'), true);
});
