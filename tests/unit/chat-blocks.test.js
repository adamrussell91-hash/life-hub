import assert from 'node:assert/strict';
import test from 'node:test';
import { takeCompletedChatBlocks } from '../../apps/life/js/core/chat-blocks.js';

test('takeCompletedChatBlocks splits on a blank line and keeps the leftover', () => {
  const { blocks, rest } = takeCompletedChatBlocks('First point.\n\nSecond point.');
  assert.deepEqual(blocks, ['First point.']);
  assert.equal(rest, 'Second point.');
});

test('takeCompletedChatBlocks starts a new block before a markdown heading', () => {
  const { blocks, rest } = takeCompletedChatBlocks('Here is the picture.\n# Claim\nProtein is the lever.');
  assert.deepEqual(blocks, ['Here is the picture.']);
  assert.equal(rest, '# Claim\nProtein is the lever.');
});

test('takeCompletedChatBlocks leaves a single-newline workout dump in rest', () => {
  const dump = '1. **Squat**\nSet 1: 5 × 100 kg (cable: none)\nSet 2: 5 × 100 kg (cable: none)';
  const { blocks, rest } = takeCompletedChatBlocks(dump);
  assert.deepEqual(blocks, []);
  assert.equal(rest, dump);
});

test('takeCompletedChatBlocks ignores an unfinished buffer with no break', () => {
  const { blocks, rest } = takeCompletedChatBlocks('Still writing');
  assert.deepEqual(blocks, []);
  assert.equal(rest, 'Still writing');
});

test('takeCompletedChatBlocks skips empty leading breaks', () => {
  const { blocks, rest } = takeCompletedChatBlocks('\n\n\nReady.');
  assert.deepEqual(blocks, []);
  assert.equal(rest, 'Ready.');
});

test('takeCompletedChatBlocks keeps a continuing numbered list in one remainder', () => {
  const list = [
    '7. HSC Trials Catch up (Library) — 1:30–2:00',
    '',
    '8. Start preparing a note — 2:00–2:20',
    '',
    '9. Pathfinders session — 3:00–4:00'
  ].join('\n');
  const { blocks, rest } = takeCompletedChatBlocks(list);
  assert.deepEqual(blocks, []);
  assert.equal(rest, list.replace(/\n\n/g, '\n'));
});

test('takeCompletedChatBlocks still splits a numbered list from following prose', () => {
  const text = '1. First row\n\n2. Second row\n\nThat is the lot — want me to add them?';
  const { blocks, rest } = takeCompletedChatBlocks(text);
  assert.deepEqual(blocks, ['1. First row\n2. Second row']);
  assert.equal(rest, 'That is the lot — want me to add them?');
});
