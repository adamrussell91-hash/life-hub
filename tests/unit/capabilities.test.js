import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  isPathAllowedForAgent,
  loadAllowlist,
  loadCapability,
  loadRegistry,
  matchGlob,
  promptOneLinersForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import {
  validateProposeActionInput,
  executeProposeActionWrites,
  parsePendingActions,
  addPendingAction,
  removePendingActionById,
  findPendingActionById,
  proposeActionToolSchema
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

test('registry loads propose-action and migrated shortcuts', () => {
  resetCapabilityCaches();
  const registry = loadRegistry();
  assert.equal(registry.version, '0.1.0');
  assert.ok(registry.capabilities['os.propose-action']);
  assert.ok(registry.capabilities['log.entry']);
  assert.ok(loadCapability('os.propose-action')?.tool_name === 'os_propose_action');
});

test('every agent gets os.propose-action plus domain shortcuts', () => {
  resetCapabilityCaches();
  const brisket = capabilityIdsForAgent('brisket');
  assert.ok(brisket.includes('os.propose-action'));
  assert.ok(brisket.includes('log.entry'));
  assert.ok(brisket.includes('lookup.save-food-library'));
  assert.ok(!brisket.includes('publish.cn-patch'));

  const hammond = capabilityIdsForAgent('hammond');
  assert.ok(hammond.includes('os.propose-action'));
  assert.ok(hammond.includes('publish.cn-patch'));
  assert.ok(!hammond.includes('log.entry'));
});

test('buildAgentTools always includes os_propose_action', () => {
  resetCapabilityCaches();
  const tools = buildAgentTools({
    slug: 'brisket',
    allowedTypes: ['meal'],
    needsFoodLibrary: true
  });
  const names = tools.map(tool => tool.name);
  assert.ok(names.includes('os_propose_action'));
  assert.ok(names.includes('log_entry'));
  assert.ok(names.includes('save_food_library_entry'));
  assert.ok(names.includes('web_search'));
});

test('buildAgentTools strips web_search on finalize turns', () => {
  resetCapabilityCaches();
  const tools = buildAgentTools({
    slug: 'brisket',
    allowedTypes: ['meal'],
    stripWebSearch: true
  });
  assert.ok(!tools.some(tool => tool.name === 'web_search'));
  assert.ok(tools.some(tool => tool.name === 'os_propose_action'));
});

test('allowlist globs match domain paths and deny others', () => {
  resetCapabilityCaches();
  assert.equal(matchGlob('data/nutrition/**', 'data/nutrition/2026/08/2026-08-31-lunch.md'), true);
  assert.equal(matchGlob('data/food-library.json', 'data/food-library.json'), true);
  assert.equal(isPathAllowedForAgent('brisket', 'data/challenges/2026-08-31-no-sugar.json'), true);
  assert.equal(isPathAllowedForAgent('brisket', 'central-node.md'), false);
  assert.equal(isPathAllowedForAgent('brisket', 'data/fitness/2026/08/2026-08-31-workout.md'), false);
  assert.equal(isPathAllowedForAgent('hammond', 'central-node.md'), true);
  assert.equal(isPathAllowedForAgent('brisket', '../etc/passwd'), false);
});

test('validateProposeActionInput accepts allowlisted writes and builds diffs', () => {
  resetCapabilityCaches();
  const result = validateProposeActionInput({
    intent: 'open a 7-day no-refined-sugar tracker',
    reads: ['central_node.active_challenges'],
    writes: [{
      path: 'data/challenges/2026-08-31-no-sugar.json',
      mode: 'create',
      content: JSON.stringify({ title: 'No refined sugar', duration_days: 7 }, null, 2)
    }],
    surfaces: ['nutrition_tab', 'governance_log']
  }, { agentSlug: 'brisket' });

  assert.equal(result.ok, true);
  assert.equal(result.proposal.agent, 'brisket');
  assert.equal(result.proposal.writes[0].mode, 'create');
  assert.match(result.proposal.writes[0].diff, /new file/);
});

test('validateProposeActionInput rejects out-of-allowlist writes before Confirm', () => {
  resetCapabilityCaches();
  const result = validateProposeActionInput({
    intent: 'rewrite medical constraints',
    writes: [{
      path: 'central-node.md',
      mode: 'overwrite',
      content: '# hacked'
    }]
  }, { agentSlug: 'brisket' });

  assert.equal(result.ok, false);
  assert.equal(result.error, 'write_path_denied');
  assert.equal(result.detail, 'central-node.md');
});

test('executeProposeActionWrites creates then appends files', async () => {
  const writes = [];
  const client = {
    async writeFile({ path, content, sha, message }) {
      writes.push({ path, content, sha, message });
      return { sha: 'a'.repeat(40), commitSha: 'b'.repeat(40) };
    }
  };

  const proposal = {
    agent: 'brisket',
    intent: 'note travel',
    writes: [
      { path: 'data/remember/travel.md', mode: 'create', content: 'Away until Friday\n', diff: 'new' },
      { path: 'data/remember/travel.md', mode: 'append', content: 'Back Monday\n', diff: 'append' }
    ]
  };

  const first = await executeProposeActionWrites(client, {
    ...proposal,
    writes: [proposal.writes[0]]
  });
  assert.equal(first.ok, true);

  const second = await executeProposeActionWrites(client, {
    ...proposal,
    writes: [proposal.writes[1]]
  }, {
    files: { 'data/remember/travel.md': { sha: 'a'.repeat(40), content: 'Away until Friday\n' } }
  });
  assert.equal(second.ok, true);
  assert.equal(writes[1].content, 'Away until Friday\nBack Monday\n');
});

test('pending action queue add/find/remove', () => {
  const entry = {
    id: 'act_test',
    createdAt: '2026-08-31',
    slug: 'brisket',
    proposal: { intent: 'x', writes: [] }
  };
  const queued = addPendingAction([], entry);
  assert.equal(findPendingActionById(queued, 'act_test')?.id, 'act_test');
  assert.equal(removePendingActionById(queued, 'act_test').length, 0);
  assert.deepEqual(parsePendingActions('not-json'), []);
});

test('proposeActionToolSchema is confirm-gated and declarative', () => {
  const schema = proposeActionToolSchema();
  assert.equal(schema.name, 'os_propose_action');
  assert.ok(schema.input_schema.required.includes('intent'));
  assert.ok(schema.input_schema.required.includes('writes'));
});

test('prompt one-liners mention propose-action for every agent', () => {
  resetCapabilityCaches();
  const lines = promptOneLinersForAgent('vera');
  assert.match(lines, /os\.propose-action/);
  assert.ok(loadAllowlist('vera')?.write_globs?.length > 0);
});
