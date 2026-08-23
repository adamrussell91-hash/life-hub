import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_PROTOCOLS,
  AGENT_STATUS_LINES,
  findProtocol,
  isAgentStatusLine,
  isGenericStatusCopy,
  normalizeProtocolId,
  pickStatusLine,
  protocolSteerBlock,
  protocolsForSlug
} from '../../js/app/agent-protocols.js';

test('every Life Hub agent has user-facing pills and 10–12 status lines', () => {
  const slugs = ['brisket', 'chadwick', 'hyaluronica', 'sara', 'penelope', 'vera', 'hammond'];
  assert.deepEqual(Object.keys(AGENT_PROTOCOLS).sort(), [...slugs].sort());
  for (const slug of slugs) {
    const pack = protocolsForSlug(slug);
    assert.ok(pack.pills.length >= 4, `${slug} should offer at least four protocols`);
    assert.ok(pack.eyebrow.toLowerCase().includes(pack.firstName.toLowerCase()));
    const ids = pack.pills.map(pill => pill.id);
    assert.equal(new Set(ids).size, ids.length, `${slug} protocol ids must be unique`);
    const lines = AGENT_STATUS_LINES[slug];
    assert.ok(lines.length >= 10 && lines.length <= 12, `${slug} should rotate 10–12 lines`);
    assert.ok(lines.every(line => line.endsWith('…')), `${slug} status lines end in an ellipsis`);
    assert.ok(lines.every(line => !isGenericStatusCopy(line)), `${slug} must not reuse generic wait copy`);
    for (const pill of pack.pills) {
      assert.equal(typeof pill.explain, 'string', `${slug}/${pill.id} needs a hover explainer`);
      assert.match(pill.explain, /^[A-Z].*\.$/, `${slug}/${pill.id} explainer must be one sentence`);
      assert.equal(pill.explain.split(/(?<=[.])\s+/).length, 1, `${slug}/${pill.id} explainer must stay one sentence`);
    }
  }
});

test('Brisket’s pills match the approved user-facing protocols', () => {
  assert.deepEqual(
    protocolsForSlug('brisket').pills.map(pill => pill.label),
    ['Log a meal', 'Flare-up eating', 'Weekend / eating out', 'Plan the rest of today', 'Why I ate that']
  );
});

test('findProtocol only resolves ids that belong to that agent', () => {
  assert.equal(findProtocol('brisket', 'log-meal')?.label, 'Log a meal');
  assert.equal(findProtocol('chadwick', 'log-meal'), null);
  assert.equal(findProtocol('brisket', 'nope'), null);
});

test('protocolSteerBlock asks the model to run the protocol in character', () => {
  const block = protocolSteerBlock('brisket', 'flare-up');
  assert.match(block, /Flare-up eating/);
  assert.match(block, /Active flare-up protocol/);
  assert.match(block, /in character/);
  assert.doesNotMatch(block, /as Ted would say/);
  assert.equal(protocolSteerBlock('brisket', 'next-session'), '');
});

test('pickStatusLine stays in that agent’s voice and skips the previous line', () => {
  const first = pickStatusLine('chadwick', { random: () => 0 });
  const second = pickStatusLine('chadwick', { exclude: first, random: () => 0 });
  assert.equal(first, AGENT_STATUS_LINES.chadwick[0]);
  assert.equal(second, AGENT_STATUS_LINES.chadwick[1]);
  assert.notEqual(first, second);
  assert.equal(isAgentStatusLine('chadwick', first), true);
  assert.equal(isAgentStatusLine('brisket', first), false);
});

test('normalizeProtocolId accepts kit-style ids only', () => {
  assert.equal(normalizeProtocolId('log-meal'), 'log-meal');
  assert.equal(normalizeProtocolId('  weekly-review  '), 'weekly-review');
  assert.equal(normalizeProtocolId('Log a meal'), undefined);
  assert.equal(normalizeProtocolId('../etc'), undefined);
  assert.equal(normalizeProtocolId(''), undefined);
});
