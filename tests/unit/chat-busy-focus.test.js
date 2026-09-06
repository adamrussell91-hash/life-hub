import test from 'node:test';
import assert from 'node:assert/strict';
import { setChatBusy } from '../../apps/life/js/app/render-chat.js';

// Disabling the currently-focused Send/Stop button blurs focus to <body>.
// visual-viewport.js reads that blur as "keyboard closed" and collapses the
// whole Chat layout mid-turn -- the window-flicker bug. setChatBusy must move
// focus back to the composer field before disabling either button.

class FakeButton {
  constructor() {
    this.disabled = false;
    this.hidden = false;
  }
}

class FakeInput {
  constructor() {
    this.readOnly = false;
    this.disabled = false;
    this.focused = false;
  }

  focus() {
    this.focused = true;
    globalThis.document.activeElement = this;
  }
}

function makeRoot({ input, button, stop, view }) {
  return {
    querySelector(selector) {
      if (selector === '#chat-input') return input;
      if (selector === '#chat-send') return button;
      if (selector === '#chat-stop') return stop;
      if (selector === '#chat-view') return view;
      return null;
    }
  };
}

test('setChatBusy refocuses the composer when the focused Send button is about to be disabled', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: button };
  setChatBusy(root, true);

  assert.equal(input.focused, true, 'composer must regain focus before Send is disabled');
  assert.equal(globalThis.document.activeElement, input);
  assert.equal(button.disabled, true);
});

test('setChatBusy refocuses the composer when the focused Stop button is about to be disabled', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: stop };
  setChatBusy(root, false);

  assert.equal(input.focused, true, 'composer must regain focus before Stop is disabled');
  assert.equal(stop.disabled, true);
});

test('setChatBusy does not steal focus when the composer field already holds it', () => {
  const input = new FakeInput();
  const button = new FakeButton();
  const stop = new FakeButton();
  const view = { classList: { add() {}, remove() {}, contains: () => false } };
  const root = makeRoot({ input, button, stop, view });

  globalThis.document = { activeElement: input };
  setChatBusy(root, true);

  assert.equal(input.focused, false, 'no redundant focus() call when focus never left the field');
});
