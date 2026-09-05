import test from 'node:test';
import assert from 'node:assert/strict';
import { autoGrowComposer, bindChatComposer } from '../../apps/life/js/app/chat-composer.js';

class FakeInput extends EventTarget {
  constructor(tag = 'TEXTAREA') {
    super();
    this.tagName = tag;
    this.value = '';
    this.dataset = {};
    this.style = { height: '' };
    this.scrollHeight = 72;
  }
}

class FakeForm extends EventTarget {
  constructor(input) {
    super();
    this.dataset = {};
    this.input = input;
  }
}

test('autoGrowComposer sizes a textarea up to the cap', () => {
  const input = new FakeInput();
  input.scrollHeight = 240;
  autoGrowComposer(input);
  assert.equal(input.style.height, '160px');
});

test('bindChatComposer submits trimmed text and clears the field', () => {
  const input = new FakeInput();
  input.value = '  hello  ';
  const form = new FakeForm(input);
  const root = {
    querySelector(selector) {
      if (selector === '#chat-form') return form;
      if (selector === '#chat-input') return input;
      if (selector === '#chat-stop') return null;
      return null;
    }
  };
  const sent = [];
  bindChatComposer(root, { onSend: message => sent.push(message) });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(sent, ['hello']);
  assert.equal(input.value, '');
});

test('bindChatComposer Escape calls onStop', () => {
  const input = new FakeInput();
  const stop = new FakeInput('BUTTON');
  const form = new FakeForm(input);
  const root = {
    querySelector(selector) {
      if (selector === '#chat-form') return form;
      if (selector === '#chat-input') return input;
      if (selector === '#chat-stop') return stop;
      return null;
    }
  };
  let stopped = 0;
  bindChatComposer(root, { onStop: () => { stopped += 1; } });

  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  Object.defineProperty(escape, 'isComposing', { value: false });
  input.dispatchEvent(escape);
  assert.equal(stopped, 1);
  assert.equal(escape.defaultPrevented, true);

  const stopEscape = new Event('keydown', { cancelable: true });
  Object.defineProperty(stopEscape, 'key', { value: 'Escape' });
  Object.defineProperty(stopEscape, 'isComposing', { value: false });
  stop.dispatchEvent(stopEscape);
  assert.equal(stopped, 2);
});
