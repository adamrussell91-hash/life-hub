import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimedDiaryFiling,
  isDiaryFinalize,
  shouldForcePenelopeDiaryProposal
} from '../../apps/life/js/core/diary-log-detect.js';

test('isDiaryFinalize catches confirm/log/vault phrasing and bare Log', () => {
  for (const text of [
    'Confirm logged',
    'Did you log',
    'Log',
    'log it',
    'log today',
    'file it',
    'send it through',
    'propose the diary',
    'put it in the vault'
  ]) {
    assert.equal(isDiaryFinalize(text), true, text);
  }
});

test('isDiaryFinalize ignores ordinary interview chatter', () => {
  for (const text of [
    'I felt flat after lunch',
    'Start a diary',
    'what about Corey',
    'catalogue my thoughts later'
  ]) {
    assert.equal(isDiaryFinalize(text), false, text);
  }
});

test('claimedDiaryFiling catches vault / filing theatre without a tool call', () => {
  assert.equal(claimedDiaryFiling('Alright, board this one goes onto — heading to the vault it goes.'), true);
  assert.equal(claimedDiaryFiling('Let me get that filed properly right now.'), true);
  assert.equal(claimedDiaryFiling('What drained you this afternoon?'), false);
});

test('shouldForcePenelopeDiaryProposal fires on finalize or claimed filing', () => {
  assert.equal(shouldForcePenelopeDiaryProposal({
    userMessage: 'Log',
    assistantText: '',
    sawLogEntry: false
  }), true);
  assert.equal(shouldForcePenelopeDiaryProposal({
    userMessage: 'ok',
    assistantText: 'Heading to the vault it goes.',
    sawLogEntry: false
  }), true);
  assert.equal(shouldForcePenelopeDiaryProposal({
    userMessage: 'Log',
    assistantText: '',
    sawLogEntry: true
  }), false);
});
