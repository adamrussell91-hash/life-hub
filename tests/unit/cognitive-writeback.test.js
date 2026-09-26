import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import { createCognitiveService } from '../../netlify/functions/_shared/cognitive-service.mjs';
import {
  buildProtocolWriteBackLines,
  centralNodeLineOk,
  clampSummary
} from '../../netlify/functions/_shared/cognitive-writeback.mjs';
import { assertAgentMayApplyCentralNodePatch } from '../../netlify/functions/_shared/hammond-tools.mjs';

test('summary shape is clamped to the Phase 3 limits', () => {
  const summary = clampSummary({
    title: 'x'.repeat(200),
    keyFinding: 'y'.repeat(200),
    summary: Array.from({ length: 120 }, () => 'word').join(' ') + '.',
    openQuestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    forHammond: 'Protect Wednesday afternoons for deep work!!!'
  });
  assert.ok(summary.title.length <= 120);
  assert.ok(summary.keyFinding.length <= 160);
  assert.ok(summary.summary.trim().split(/\s+/).length <= 80);
  assert.equal(summary.openQuestions.length, 6);
  assert.equal(summary.forHammond.includes('!'), false);
});

test('list paging returns title and summary without a 50-run hard cap', async () => {
  const store = createMemoryCognitiveStore();
  const service = createCognitiveService({
    store,
    model: async () => ({ text: 'done', evidenceIds: [] }),
    retrieve: async () => ({ evidence: [], status: 'none' })
  });
  for (let i = 0; i < 55; i++) {
    const id = randomUUID();
    await store.write('owner', id, {
      id,
      protocolId: 'horizon',
      mode: 'full',
      status: 'completed',
      stage: 'map',
      updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      createdAt: new Date(2026, 0, 1).toISOString(),
      intake: { focus: `Focus ${i}` },
      summary: { title: `Run ${i}`, keyFinding: 'A finding', summary: 'Short.', openQuestions: [], forHammond: null }
    }, null);
  }
  const page = await service.list('owner', { limit: 20, offset: 0 });
  assert.equal(page.length, 20);
  assert.ok(page[0].title);
  assert.ok(page[0].summary);
  const next = await service.list('owner', { limit: 20, offset: 20 });
  assert.equal(next.length, 20);
  assert.notEqual(page[0].id, next[0].id);
  const rest = await service.list('owner', { limit: 100, offset: 0 });
  assert.equal(rest.length, 55);
});

test('write-back lines obey writing rules and sender permits only two sections', () => {
  const session = {
    protocolId: 'horizon',
    updatedAt: '2026-09-26T00:00:00.000Z',
    summary: { title: 'Career map', keyFinding: 'Two load-bearing choices this quarter', summary: 'Ketill and Alvar diverged.', openQuestions: [], forHammond: 'Hold the Wednesday afternoon block' }
  };
  const lines = buildProtocolWriteBackLines(session);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => centralNodeLineOk(line.payload.text)));
  assert.ok(assertAgentMayApplyCentralNodePatch('protocol:horizon', lines[0]));
  assert.ok(assertAgentMayApplyCentralNodePatch('protocol:horizon', lines[1]));
  assert.equal(assertAgentMayApplyCentralNodePatch('protocol:horizon', { section: 'about_me', op: 'append_line', payload: { text: 'Horizon Council: no', summary: 'x' }, sender: 'Horizon Council' }), false);
  assert.equal(assertAgentMayApplyCentralNodePatch('protocol:horizon', { section: 'cross_agent', op: 'append_line', payload: { text: 'Clare→Hammond: wrong sender', summary: 'x' }, sender: 'Horizon Council' }), false);
});

test('write-back failure does not affect completion', async () => {
  const store = createMemoryCognitiveStore();
  const service = createCognitiveService({
    store,
    model: async p => {
      if (p.stage === 'summary') return { text: JSON.stringify({ title: 'Done', keyFinding: 'One finding', summary: 'Short summary.', openQuestions: [], forHammond: 'Hold the Wednesday block' }), evidenceIds: [] };
      return { text: 'A reconstructed process.', question: p.gate ? 'What needs correction?' : null, evidenceIds: [] };
    },
    retrieve: async () => ({ evidence: [], status: 'none' }),
    writeCentralNode: async () => { throw new Error('github down'); },
    readCentralNode: async () => '## 📝 Recent Agent Actions\n\n## 🤝 Cross-Agent Coordination\n'
  });
  const created = await service.create('owner', { protocolId: 'witness', intake: { instance: 'Compare two venues' }, requestId: randomUUID() });
  await service.run('owner', created.id);
  let s = await service.get('owner', created.id);
  s = await service.action('owner', { sessionId: s.id, revision: s.revision, requestId: randomUUID(), action: 'confirm' });
  s = await service.run('owner', s.id);
  assert.equal(s.status, 'completed');
  assert.ok(s.summary);
  assert.equal(s.writeBack?.ok, false);
});

test('completed Horizon writes recent_actions and optional cross_agent', async () => {
  const written = [];
  const store = createMemoryCognitiveStore();
  const service = createCognitiveService({
    store,
    model: async p => {
      if (p.stage === 'summary') {
        return {
          text: JSON.stringify({
            title: 'Career forks',
            keyFinding: 'Two load-bearing choices',
            summary: 'Near and far horizons diverged on timing.',
            openQuestions: ['Which fork first?'],
            forHammond: 'Protect the Wednesday afternoon block'
          }),
          evidenceIds: []
        };
      }
      if (p.speaker === 'ketill' || p.speaker === 'alvar') return { text: 'Horizon finding.', question: null, done: true, evidenceIds: [] };
      if (p.speaker === 'sigrid') return { text: 'Classify these.', question: 'Trade-off, drift, or unclassified?', done: true, evidenceIds: [] };
      return { text: 'Map.', question: null, done: true, evidenceIds: [] };
    },
    retrieve: async () => ({ evidence: [], status: 'none' }),
    readCentralNode: async () => '## 📝 Recent Agent Actions\n\n- Old line\n\n## 🤝 Cross-Agent Coordination\n\n- Old mail\n',
    writeCentralNode: async markdown => { written.push(markdown); }
  });
  let s = await service.create('owner', { protocolId: 'horizon', intake: { focus: 'Career direction' }, requestId: randomUUID() });
  for (let n = 0; n < 20 && s.status !== 'completed'; n++) {
    if (s.status === 'queued' || s.status === 'running') s = await service.run('owner', s.id);
    else if (s.status === 'waiting') {
      const action = s.allowedActions.includes('confirm') ? 'confirm' : 'answer';
      s = await service.action('owner', { sessionId: s.id, revision: s.revision, requestId: randomUUID(), action, text: 'Concrete answer' });
    } else break;
  }
  assert.equal(s.status, 'completed');
  assert.equal(written.length, 1);
  assert.match(written[0], /Horizon Council: \d{4}-\d{2}-\d{2}: Two load-bearing choices/);
  assert.match(written[0], /Horizon Council→Hammond: Protect the Wednesday afternoon block/);
  const listed = await service.list('owner');
  assert.equal(listed[0].summary?.title, 'Career forks');
});
