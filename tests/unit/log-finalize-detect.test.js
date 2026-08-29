import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRISKET_FORCE_MEAL_NUDGE,
  claimedDomainSave,
  forceLogNudgeFor,
  isLogFinalize,
  isThinMindTurn,
  isVeraFlushMessage,
  shouldForceAgentLog,
  shouldNudgeMissingLogEntry,
  shouldStripWebSearch
} from '../../js/core/log-finalize-detect.js';
import { streamWithAgentLogForce } from '../../netlify/functions/_shared/agent-log-force.mjs';

async function collect(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test('isLogFinalize is shared across meal/session/medical phrasing', () => {
  for (const text of ['Log', 'Confirm logged', 'log the meal', 'save the session', 'record the session', 'put it onto nutrition']) {
    assert.equal(isLogFinalize(text), true, text);
  }
  assert.equal(isLogFinalize('I felt flat after lunch'), false);
});

test('Vera flush and thin-mind / strip-search helpers', () => {
  assert.equal(isVeraFlushMessage("That's enough for today — record the session if there is one."), true);
  assert.equal(isThinMindTurn({ slug: 'vera', message: 'Log' }), true);
  assert.equal(isThinMindTurn({ slug: 'brisket', message: 'Log' }), false);
  assert.equal(shouldStripWebSearch({ slug: 'brisket', message: 'Confirm logged' }), true);
  assert.equal(shouldStripWebSearch({ slug: 'hammond', message: 'Log' }), false);
});

test('claimedDomainSave covers each logging agent', () => {
  assert.equal(claimedDomainSave('Heading to the vault it goes.', 'penelope'), true);
  assert.equal(claimedDomainSave("It's in the books.", 'brisket'), true);
  assert.equal(claimedDomainSave('Saved on Medical Overview.', 'sara'), true);
  assert.equal(claimedDomainSave('Session is logged.', 'vera'), true);
  assert.equal(claimedDomainSave('Logged the AM routine.', 'hyaluronica'), true);
});

test('shouldForceAgentLog fires for every logging agent except Chadwick', () => {
  for (const slug of ['penelope', 'brisket', 'sara', 'vera', 'hyaluronica']) {
    assert.equal(shouldForceAgentLog({ slug, userMessage: 'Log', sawLogEntry: false }), true, slug);
  }
  assert.equal(shouldForceAgentLog({ slug: 'chadwick', userMessage: 'Log', sawLogEntry: false }), false);
  assert.equal(shouldForceAgentLog({ slug: 'brisket', userMessage: 'Log', sawLogEntry: true }), false);
});

test('streamWithAgentLogForce nudges Brisket after claim-without-tool', async () => {
  const calls = [];
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      if (calls.length === 1) {
        yield { type: 'text', delta: "It's in the books." };
        yield { type: 'done' };
        return;
      }
      yield {
        type: 'tool_call',
        id: 'forced',
        name: 'log_entry',
        input: { type: 'meal', date: '2026-08-29', fields: { meal: 'lunch', calories: 500 } }
      };
      yield { type: 'done' };
    }
  };
  const events = await collect(streamWithAgentLogForce(anthropic, {
    slug: 'brisket',
    userMessage: 'ok',
    messages: [{ role: 'user', content: 'ok' }]
  }));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.at(-1).content, BRISKET_FORCE_MEAL_NUDGE);
  assert.ok(events.some(e => e.type === 'tool_call' && e.name === 'log_entry'));
  assert.equal(forceLogNudgeFor('brisket'), BRISKET_FORCE_MEAL_NUDGE);
});

test('shouldNudgeMissingLogEntry surfaces chat-only claims', () => {
  assert.equal(shouldNudgeMissingLogEntry({
    agentSlug: 'brisket',
    assistantText: "It's in the books.",
    sawRecordProposal: false
  }), true);
  assert.equal(shouldNudgeMissingLogEntry({
    agentSlug: 'brisket',
    assistantText: "It's in the books.",
    sawRecordProposal: true
  }), false);
});
