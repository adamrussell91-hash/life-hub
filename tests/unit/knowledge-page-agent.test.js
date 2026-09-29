import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKnowledgePageProposal,
  createKnowledgeWriteExecutor,
  proposeKnowledgePageSchema
} from '../../netlify/functions/_shared/knowledge-page-agent.mjs';
import {
  classifyWriteTarget,
  executeProposeActionWrites,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';

test('propose_knowledge_page is Clementine-only with knowledge:page allowlist', () => {
  resetCapabilityCaches();
  const names = buildAgentTools({ slug: 'clementine' }).map(t => t.name);
  assert.ok(names.includes('propose_knowledge_page'));
  assert.ok(!buildAgentTools({ slug: 'clare' }).map(t => t.name).includes('propose_knowledge_page'));
  assert.equal(proposeKnowledgePageSchema().name, 'propose_knowledge_page');
  assert.equal(isPathAllowedForAgent('clementine', 'knowledge:page:page_hub_abc', { mode: 'write' }), true);
  assert.equal(isPathAllowedForAgent('clare', 'knowledge:page:page_hub_abc', { mode: 'write' }), false);
  assert.equal(classifyWriteTarget('knowledge:page:page_hub_abc').store, 'knowledge');
});

test('buildKnowledgePageProposal create + patch + Confirm executor', async () => {
  const created = buildKnowledgePageProposal({
    summary: 'New note',
    mode: 'create',
    title: 'APST notes',
    body: 'Evidence of practice.',
    area: 'university',
    tags: ['apst']
  });
  assert.equal(created.ok, true);
  assert.match(created.pageId, /^page_hub_/);
  assert.equal(created.proposal.writes[0].mode, 'create');
  const validated = validateProposeActionInput(created.proposal, { agentSlug: 'clementine' });
  assert.equal(validated.ok, true, validated.error);

  let savedInput = null;
  const knowledge = createKnowledgeWriteExecutor({
    savePage: async (input) => {
      savedInput = input;
      return { id: input.id, updated_at: '2026-09-29T00:00:00.000Z' };
    }
  });
  const applied = await executeProposeActionWrites({}, validated.proposal, {
    blobStores: { knowledge }
  });
  assert.equal(applied.ok, true, applied.error);
  assert.equal(savedInput.title, 'APST notes');
  assert.equal(savedInput.area, 'university');

  assert.equal(buildKnowledgePageProposal({
    summary: 'Patch',
    mode: 'patch',
    title: 'X'
  }).error, 'id_required_for_patch');
});
