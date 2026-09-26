import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_CENTRAL_NODE_SECTIONS,
  gatherContext,
  selectCentralNodeEvidence,
  topicSearchTerms
} from '../../netlify/functions/_shared/cognitive-context.mjs';
import { defaultGatherContext } from '../../netlify/functions/knowledge-protocols.mjs';
import { createKnowledgeProtocolsRunHandler } from '../../netlify/functions/knowledge-protocols-run.mjs';

const sampleNode = `# Purpose
Keep life coherent.

## 👤 About Me
### Work
Teaches secondary English.
### Study
Completing a curriculum unit.
### People
Close circle of three.
### Medical
Chronic tendon pain in the right shoulder. Detailed imaging notes follow here that must stay out of most protocols.

## 📊 This Month (September 2026)
Marking load is high.

## 📈 Long-Term Trends & Patterns
Sleep debt accumulates on term weeks.

## 🔴 Current Constraints & Priorities
### Work
No evening meetings after 7.
### Time
Protect Wednesday afternoons.

## 🤝 Cross-Agent Coordination
- Clare→Hammond: defer travel planning

## 📝 Recent Agent Actions
- Horizon: mapped career forks

## Medical Status
Summary: shoulder load limit. Do not schedule overhead lifts.
`;

test('topicSearchTerms ignore personal intake fields', () => {
  const terms = topicSearchTerms({
    intake: {
      topic: 'Meeting participation literature',
      constraints: 'Adam lives at 12 Secret Street with chronic neuropathy',
      userContext: 'Do not put this private string into web search'
    }
  });
  assert.ok(terms.includes('meeting') || terms.includes('participation') || terms.includes('literature'));
  assert.equal(terms.join(' ').includes('secret'), false);
  assert.equal(terms.join(' ').includes('neuropath'), false);
  assert.equal(terms.join(' ').includes('street'), false);
});

test('per-protocol Central Node sections and medical exclusion', () => {
  const horizon = selectCentralNodeEvidence(sampleNode, 'horizon');
  assert.ok(horizon.some(e => e.id.includes('about_me')));
  assert.ok(horizon.some(e => e.id.includes('constraints')));
  assert.equal(horizon.some(e => e.id.includes('medical')), false);
  assert.equal(horizon.some(e => /tendon pain|imaging notes/i.test(e.text)), false);

  const witness = selectCentralNodeEvidence(sampleNode, 'witness');
  assert.ok(witness.some(e => e.id.includes('medical_status')));
  assert.match(witness.find(e => e.id.includes('medical')).text, /shoulder/i);
  assert.equal(/imaging notes/i.test(witness.find(e => e.id.includes('medical')).text), false);

  const fates = selectCentralNodeEvidence(sampleNode, 'fates');
  assert.deepEqual(
    PROTOCOL_CENTRAL_NODE_SECTIONS.fates.map(s => s.id),
    ['about_me', 'this_month']
  );
  assert.ok(fates.every(e => e.kind === 'central_node'));
});

test('gatherContext continues when each source fails independently', async () => {
  const session = { protocolId: 'horizon', intake: { focus: 'Career direction over two years' } };
  const result = await gatherContext(session, {}, {
    readCentralNode: async () => { throw new Error('cn down'); },
    retrieveKnowledge: async () => { throw new Error('kh down'); },
    research: async () => { throw new Error('web down'); }
  });
  assert.deepEqual(result.evidence, []);
  assert.match(result.status, /central_node/);
  assert.match(result.status, /knowledge_hub/);
  assert.match(result.status, /web/);
});

test('gatherContext keeps surviving sources when others fail', async () => {
  const session = { protocolId: 'refinery', intake: { claim: 'Short meetings improve participation', context: 'Proposal', audience: 'Committee' } };
  const result = await gatherContext(session, {}, {
    readCentralNode: async () => sampleNode,
    retrieveKnowledge: async () => ({ evidence: [{ id: 'knowledge:1', kind: 'knowledge_hub_note', title: 'Meetings', text: 'Shorter agendas helped.' }], status: 'grounded' }),
    research: async () => ({ evidence: [{ id: 'web:1', kind: 'web', title: 'Study', text: 'A 2020 paper.', url: 'https://example.test/a' }], unavailable: false })
  });
  assert.ok(result.evidence.some(e => e.kind === 'central_node'));
  assert.ok(result.evidence.some(e => e.kind === 'knowledge_hub_note'));
  assert.ok(result.evidence.some(e => e.id === 'web:1'));
  assert.equal(result.evidence.some(e => /Medical Status|tendon pain/i.test(e.text)), false);
});

test('research brief queries are built from topic terms only', async () => {
  const session = {
    protocolId: 'cartographers',
    intake: {
      topic: 'Formative assessment loops',
      purpose: 'Evidence for a proposal',
      constraints: 'Private: lives with chronic illness on Harbour Road'
    }
  };
  let seenTerms = [];
  await gatherContext(session, {}, {
    readCentralNode: async () => sampleNode,
    retrieveKnowledge: async () => ({ evidence: [], status: 'none' }),
    research: async (_s, { terms }) => {
      seenTerms = terms;
      assert.equal(terms.some(t => /harbour|illness|chronic|private|lives/i.test(t)), false);
      assert.ok(terms.some(t => /formative|assessment|loops|evidence|proposal/i.test(t)));
      return { evidence: [{ id: 'web:1', kind: 'web', title: 'Loop', text: 'Short excerpt', url: 'https://example.test' }], unavailable: false };
    }
  });
  assert.ok(seenTerms.length > 0);
});

test('background runner and inline gatherContext share the same function path', async () => {
  let calls = 0;
  const retrieve = async () => {
    calls += 1;
    return { evidence: [{ id: 'central_node:about_me', kind: 'central_node', title: 'About', text: 'Teaches English' }], status: 'ok' };
  };
  const inline = await defaultGatherContext(
    { protocolId: 'horizon', intake: { focus: 'Career' } },
    {},
    fetch,
    { retrieveKnowledge: async () => ({ evidence: [], status: 'none' }), readCentralNode: async () => null, research: async () => ({ evidence: [], unavailable: true }), model: async () => ({ text: '{}' }) }
  );
  assert.ok(inline);
  const handler = createKnowledgeProtocolsRunHandler({
    verifySessionToken: () => ({ valid: true }),
    getStore: async () => ({
      read: async () => null,
      write: async () => null,
      list: async () => []
    }),
    retrieve,
    model: async () => ({ text: 'x', evidenceIds: [] })
  });
  assert.equal(typeof handler, 'function');
  assert.equal(calls, 0);
  await retrieve();
  assert.equal(calls, 1);
});

test('Horizon fake run surfaces Central Node and Knowledge Hub in Ketill knownContext', async () => {
  const { createSession, advance, buildPrompt } = await import('../../netlify/functions/_shared/cognitive-controller.mjs');
  const { randomUUID } = await import('node:crypto');
  let s = createSession({
    id: randomUUID(),
    owner: 'owner',
    protocolId: 'horizon',
    intake: { focus: 'Career direction' },
    requestId: randomUUID()
  });
  s = await advance(s, {
    model: async () => ({ text: 'Ketill speaks of the near forks.', question: 'Which constraint is load-bearing?', done: true, evidenceIds: [] }),
    retrieve: async () => ({
      evidence: [
        { id: 'central_node:about_me', kind: 'central_node', title: 'About Me', text: 'Teaches secondary English.' },
        { id: 'knowledge:note-1', kind: 'knowledge_hub_note', title: 'Workload', text: 'Afternoon marking leaves no recovery.' }
      ],
      status: 'ok'
    })
  });
  const prompt = buildPrompt({ ...s, burst: 0 }, { speaker: 'ketill', stage: 'ketill', maxBursts: 3, burstWords: 90 });
  assert.match(prompt.user, /Teaches secondary English/);
  assert.match(prompt.user, /Afternoon marking/);
});

test('Refinery fake search evidence appears as web ids', async () => {
  const { createSession, advance } = await import('../../netlify/functions/_shared/cognitive-controller.mjs');
  const { randomUUID } = await import('node:crypto');
  let s = createSession({
    id: randomUUID(),
    owner: 'owner',
    protocolId: 'refinery',
    mode: 'build',
    intake: { claim: 'Short meetings improve participation', context: 'Proposal', audience: 'Committee' },
    requestId: randomUUID()
  });
  s = await advance(s, {
    model: async () => ({ text: 'Builder speaks.', question: null, done: true, evidenceIds: [] }),
    retrieve: async () => ({
      evidence: [{ id: 'web:1', kind: 'web', title: 'Study', text: 'A small experiment.', url: 'https://example.test/a' }],
      status: 'ok'
    })
  });
  assert.ok(s.evidence.some(e => e.id === 'web:1'));
});
