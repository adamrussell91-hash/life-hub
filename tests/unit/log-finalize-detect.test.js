import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRISKET_FORCE_MEAL_NUDGE,
  claimedDomainSave,
  forceLogNudgeFor,
  isLogFinalize,
  isThinMindTurn,
  isVeraFlushMessage,
  missingSaraBodyLogTypes,
  saraBodyLogTypesFromMessage,
  shouldForceAgentLog,
  shouldNudgeMissingLogEntry,
  shouldStripWebSearch
} from '../../apps/life/js/core/log-finalize-detect.js';
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
  assert.equal(shouldStripWebSearch({ slug: 'chadwick', message: 'Log' }), false);
  assert.equal(shouldStripWebSearch({ slug: 'chadwick', message: 'lock this in' }), false);
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


test('Sara body detector requires composition and tape records from one mixed update', () => {
  const message = 'Weight 91.2 kg, body fat 17.4%, skeletal muscle 39.8 kg, visceral fat 8, body age 34, waist 86 cm, shoulders 124 cm, chest 105 cm, right arm flexed 38.5 cm.';
  assert.deepEqual(saraBodyLogTypesFromMessage(message), ['composition', 'measurements']);
  assert.deepEqual(
    missingSaraBodyLogTypes({ userMessage: message, loggedTypes: ['composition'] }),
    ['measurements']
  );
  assert.deepEqual(
    missingSaraBodyLogTypes({ userMessage: message, loggedTypes: ['composition', 'measurements'] }),
    []
  );
});

test('Sara body detector keeps weight-only updates as weight records', () => {
  assert.deepEqual(saraBodyLogTypesFromMessage('I weigh 90.7 kg today'), ['weight']);
  assert.deepEqual(
    missingSaraBodyLogTypes({ userMessage: 'Weight 90.7 kg', loggedTypes: ['composition'] }),
    []
  );
});

test('streamWithAgentLogForce makes Sara finish every body record group', async () => {
  const calls = [];
  const message = 'Weight 91.2 kg, body fat 17.4%, waist 86 cm and shoulders 124 cm.';
  const anthropic = {
    async *streamMessage(args) {
      calls.push(args);
      if (calls.length === 1) {
        yield {
          type: 'tool_call',
          id: 'composition',
          name: 'log_entry',
          input: {
            type: 'composition',
            date: '2026-09-19',
            fields: { weight_kg: 91.2, body_fat_pct: 17.4 }
          }
        };
        yield { type: 'done' };
        return;
      }
      yield {
        type: 'tool_call',
        id: 'measurements',
        name: 'log_entry',
        input: {
          type: 'measurements',
          date: '2026-09-19',
          fields: { waist: 86, shoulders: 124 }
        }
      };
      yield { type: 'done' };
    }
  };

  const events = await collect(streamWithAgentLogForce(anthropic, {
    slug: 'sara',
    userMessage: message,
    messages: [{ role: 'user', content: message }]
  }));

  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /Missing log_entry type\(s\): measurements/);
  assert.deepEqual(
    events.filter(event => event.type === 'tool_call' && event.name === 'log_entry').map(event => event.input.type),
    ['composition', 'measurements']
  );
});

test('Sara body figures trigger logging even without an explicit save command', () => {
  assert.equal(shouldForceAgentLog({
    slug: 'sara',
    userMessage: 'Waist 86 cm, chest 105 cm',
    sawLogEntry: false,
    loggedTypes: []
  }), true);
});

test('claimedDomainSave catches Sara body-save language', () => {
  assert.equal(claimedDomainSave('Your measurements are logged.', 'sara'), true);
  assert.equal(claimedDomainSave('Saved to Body.', 'sara'), true);
});


test('Sara body detector recognises value before label phrasing', () => {
  const message = '91.2 kg weight, 17.4% body fat, 86 cm waist, 124 cm shoulders and 38.5 cm right bicep flexed.';
  assert.deepEqual(saraBodyLogTypesFromMessage(message), ['composition', 'measurements']);
});


test('Sara detects additional smart scale metrics as composition data', () => {
  assert.deepEqual(
    saraBodyLogTypesFromMessage('Body water 56.2%, bone mass 3.4 kg and BMR 1890 kcal/day'),
    ['composition']
  );
  assert.deepEqual(
    saraBodyLogTypesFromMessage('56.2% body water, 3.4 kg bone mass'),
    ['composition']
  );
});
