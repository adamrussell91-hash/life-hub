import test from 'node:test';
import assert from 'node:assert/strict';
import { lockConfirmCardReceipt } from '../../apps/life/js/app/confirm-card-receipt.js';

function fakeEl(tag = 'div') {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    disabled: false,
    children: [],
    attributes: new Map(),
    classList: {
      add(...names) {
        const set = new Set((el.className || '').split(/\s+/).filter(Boolean));
        for (const name of names) set.add(name);
        el.className = [...set].join(' ');
      }
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    querySelector(selector) {
      if (selector === '.confirm-card__actions') {
        return this.children.find((child) => child.className === 'confirm-card__actions') ?? null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button, input, textarea, select') {
        const out = [];
        const walk = (node) => {
          if (/^(button|input|textarea|select)$/i.test(node.tagName)) out.push(node);
          for (const child of node.children ?? []) walk(child);
        };
        walk(this);
        return out;
      }
      return [];
    }
  };
  return el;
}

test('lockConfirmCardReceipt disables controls and replaces actions with receipt text', () => {
  const card = fakeEl('section');
  card.className = 'confirm-card';
  const actions = fakeEl('div');
  actions.className = 'confirm-card__actions';
  const confirm = fakeEl('button');
  confirm.textContent = 'Confirm';
  const discard = fakeEl('button');
  discard.textContent = 'Discard';
  actions.append(discard, confirm);
  card.append(actions);

  lockConfirmCardReceipt(card, {
    createElement: (tag) => fakeEl(tag),
    summary: 'Saved.',
    label: 'Confirmed'
  });

  assert.match(card.className, /confirm-card--receipt/);
  assert.equal(card.attributes.get('aria-label'), 'Confirmed');
  assert.equal(confirm.disabled, true);
  assert.equal(discard.disabled, true);
  assert.equal(actions.children.length, 1);
  assert.equal(actions.children[0].className, 'confirm-card__receipt');
  assert.equal(actions.children[0].textContent, 'Saved.');
});
