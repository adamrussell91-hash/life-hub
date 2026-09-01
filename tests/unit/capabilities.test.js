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
import {
  executeShortcut,
  isShortcutTool,
  shortcutSchemas,
  REMEMBER_WEEK_FLAGS_PATH,
  CN_LOANS_PATH
} from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import {
  selectCapabilityIdsForTurn,
  scoreboardForAgent
} from '../../netlify/functions/_shared/capabilities/intent-router.mjs';
import {
  loadIntuitionFor,
  formatIntuitionForPrompt,
  applyIntuitionEdit
} from '../../netlify/functions/_shared/capabilities/intuition.mjs';
import {
  resolveResearchTtl,
  researchExpiresAt
} from '../../netlify/functions/_shared/capabilities/stores.mjs';
import { classifyCentralNodePatchRisk } from '../../apps/life/js/core/central-node-patch.js';

function mockCtx(agentSlug = 'brisket') {
  const files = new Map();
  const shaByPath = new Map();
  const writes = [];
  const client = {
    async writeFile({ path, content, message, sha }) {
      const next = `sha_${writes.length + 1}`;
      writes.push({ path, message, sha });
      files.set(path, content);
      shaByPath.set(path, next);
      return { sha: next, commitSha: `c_${writes.length}` };
    }
  };
  return {
    writes,
    ctx: {
      agentSlug,
      today: '2026-08-31',
      client,
      get repoTree() {
        return [...files.keys()].map(path => ({ type: 'blob', path, sha: shaByPath.get(path) }));
      },
      async readBlob(sha) {
        for (const [path, content] of files) {
          if (shaByPath.get(path) === sha) return content;
        }
        throw new Error(`missing ${sha}`);
      }
    }
  };
}

test('registry loads propose-action and Phase 1-3 shortcuts', () => {
  resetCapabilityCaches();
  const registry = loadRegistry();
  assert.equal(registry.version, '0.4.0');
  assert.ok(registry.capabilities['os.propose-action']);
  assert.ok(registry.capabilities['track.open-challenge']);
  assert.ok(registry.capabilities['coordinate.request-cn-write']);
  assert.ok(registry.capabilities['os.capability-scoreboard']);
  assert.equal(loadCapability('os.propose-action')?.tool_name, 'os_propose_action');
});

test('every agent gets os.propose-action plus domain shortcuts', () => {
  resetCapabilityCaches();
  const brisket = capabilityIdsForAgent('brisket');
  assert.ok(brisket.includes('os.propose-action'));
  assert.ok(brisket.includes('log.entry'));
  assert.ok(brisket.includes('lookup.save-food-library'));
  assert.ok(brisket.includes('track.open-challenge'));
  assert.ok(!brisket.includes('publish.cn-patch'));

  const hammond = capabilityIdsForAgent('hammond');
  assert.ok(hammond.includes('os.propose-action'));
  assert.ok(hammond.includes('publish.cn-patch'));
  assert.ok(!hammond.includes('log.entry'));
  assert.ok(!hammond.includes('coordinate.request-cn-write'));
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

test('intent router narrows shortcuts for a challenge ask', () => {
  resetCapabilityCaches();
  const ids = selectCapabilityIdsForTurn({
    slug: 'brisket',
    message: 'Open a no-sugar challenge for me'
  });
  assert.ok(ids.includes('os.propose-action'));
  assert.ok(ids.includes('track.open-challenge'));

  const tools = buildAgentTools({
    slug: 'brisket',
    allowedTypes: ['meal'],
    needsFoodLibrary: true,
    message: 'Open a no-sugar challenge for me'
  });
  const names = tools.map(tool => tool.name);
  assert.ok(names.includes('track_open_challenge'));
  assert.ok(names.includes('os_propose_action'));
  assert.ok(!names.includes('plan_week_meals'));
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
  assert.equal(isPathAllowedForAgent('brisket', 'data/os/cn-loans.json'), true);
  assert.ok(loadAllowlist('brisket')?.write_globs?.length > 0);
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
  assert.ok(result.proposal.writes[0].diff);
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
  assert.ok(result.error);
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

test('shortcutSchemas covers Phase 1-3 tool names', () => {
  const names = Object.keys(shortcutSchemas());
  for (const name of [
    'remember_set_week_flag',
    'track_open_challenge',
    'coordinate_request_cn_write',
    'research_save_brief',
    'publish_surface_widget',
    'plan_week_meals',
    'lookup_food_brand_au',
    'os_capability_scoreboard',
    'intuition_edit_pack',
    'os_promote_shortcut',
    'os_list_promoted_shortcuts',
    'os_run_promoted_shortcut'
  ]) {
    assert.ok(isShortcutTool(name), name);
    assert.ok(names.includes(name), name);
  }
});

test('remember_set_week_flag auto-writes allowlisted path', async () => {
  const { ctx, writes } = mockCtx();
  const result = await executeShortcut(
    'remember_set_week_flag',
    { week_id: '2026-W36', key: 'travel', value: true },
    ctx
  );
  assert.equal(result.kind, 'ok');
  assert.equal(writes[0].path, REMEMBER_WEEK_FLAGS_PATH);
});

test('track_open_challenge returns Confirm proposal', async () => {
  const { ctx } = mockCtx();
  const result = await executeShortcut(
    'track_open_challenge',
    { title: 'No refined sugar', goal: '7 days clean' },
    ctx
  );
  assert.equal(result.kind, 'propose');
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'brisket' });
  assert.equal(validated.ok, true);
  assert.match(validated.proposal.writes[0].path, /^data\/challenges\//);
});

test('coordinate_request_cn_write auto-applies low-risk loan without Confirm', async () => {
  const { ctx, writes } = mockCtx();
  assert.equal(
    classifyCentralNodePatchRisk({ section: 'todays_status', op: 'upsert_field' }),
    'auto'
  );
  const result = await executeShortcut(
    'coordinate_request_cn_write',
    {
      section: 'todays_status',
      op: 'upsert_field',
      path: 'Flags',
      value: 'sugar challenge open',
      reason: 'track open'
    },
    ctx
  );
  assert.equal(result.kind, 'loan_auto');
  assert.equal(result.loan.risk, 'auto');
  assert.equal(writes[0].path, CN_LOANS_PATH);
});

test('coordinate_request_cn_write high-risk loan needs Confirm', async () => {
  const { ctx, writes } = mockCtx();
  const result = await executeShortcut(
    'coordinate_request_cn_write',
    {
      section: 'purpose',
      op: 'replace_section',
      value: 'nope',
      reason: 'should confirm'
    },
    ctx
  );
  assert.equal(result.kind, 'loan_confirm');
  assert.equal(writes.length, 0);
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'brisket' });
  assert.equal(validated.ok, true);
});

test('research TTL is per-domain', () => {
  assert.equal(resolveResearchTtl('clinical'), 90);
  assert.equal(resolveResearchTtl('nutrition'), 45);
  assert.equal(resolveResearchTtl('retail'), 14);
  assert.equal(resolveResearchTtl('general'), 30);
  assert.equal(researchExpiresAt('clinical', '2026-08-31T00:00:00.000Z'), '2026-11-29T00:00:00.000Z');
});

test('publish_surface_widget requires Adam-approved template', async () => {
  const { ctx } = mockCtx();
  const denied = await executeShortcut(
    'publish_surface_widget',
    { template_id: 'not-a-real-template', title: 'Nope' },
    ctx
  );
  assert.equal(denied.kind, 'error');

  const ok = await executeShortcut(
    'publish_surface_widget',
    {
      template_id: 'challenge-progress',
      title: 'Sugar bar',
      props: { progress_pct: 20, challenge_id: 'ch_1' }
    },
    ctx
  );
  assert.equal(ok.kind, 'propose');
});

test('intuition packs load for Brisket and stay judgment-only', () => {
  const packs = loadIntuitionFor({ agentSlug: 'brisket' });
  assert.ok(packs.some(pack => pack.id === 'vyvanse-appetite-window'));
  const text = formatIntuitionForPrompt(packs);
  assert.match(text, /never block a capacity/i);
  const edited = applyIntuitionEdit(packs[0], { guidance: 'Updated guidance' });
  assert.equal(edited.guidance, 'Updated guidance');
});

test('capability scoreboard returns rows when asked', async () => {
  const { ctx } = mockCtx();
  const board = scoreboardForAgent('brisket', { message: 'what can you actually do?' });
  assert.ok(board.some(row => row.id === 'os.propose-action'));
  const result = await executeShortcut('os_capability_scoreboard', { detail: true }, ctx);
  assert.equal(result.kind, 'ok');
  assert.ok(result.count >= 10);
});

test('capability scoreboard includes promoted shortcut drafts when detail is on', async () => {
  const { ctx } = mockCtx('brisket');
  const promote = await executeShortcut(
    'os_promote_shortcut',
    {
      proposed_id: 'track.morning-weigh-in',
      summary: 'Morning weigh-in tracker',
      example_intent: 'log morning weight',
      example_writes: [{
        path: 'data/challenges/2026-08-31-weigh-in.json',
        mode: 'create',
        content: '{\n  "title": "Morning weigh-in"\n}\n'
      }]
    },
    ctx
  );
  await ctx.client.writeFile({
    path: promote.proposal.writes[0].path,
    content: promote.proposal.writes[0].content,
    message: 'seed promoted draft'
  });
  const result = await executeShortcut('os_capability_scoreboard', { detail: true }, ctx);
  assert.equal(result.kind, 'ok');
  assert.equal(result.promoted_shortcut_count, 1);
  assert.equal(result.promoted_shortcuts[0].proposed_id, 'track.morning-weigh-in');
});


test('intuition_edit_pack updates owned pack for Sara', async () => {
  resetCapabilityCaches();
  const { ctx, writes } = mockCtx('sara');
  // Seed flare-rules into the mock tree via a prior write
  const seed = await import('node:fs');
  const raw = seed.readFileSync(new URL('../../intuition/flare-rules.json', import.meta.url), 'utf8');
  await ctx.client.writeFile({ path: 'intuition/flare-rules.json', content: raw, message: 'seed' });
  writes.length = 0;
  const result = await executeShortcut(
    'intuition_edit_pack',
    { pack_id: 'flare-rules', guidance: 'Deload earlier in flare week 2.', reason: 'Hard flare week' },
    ctx
  );
  assert.equal(result.kind, 'ok');
  assert.equal(writes[0].path, 'intuition/flare-rules.json');
});

test('os_promote_shortcut returns Confirm draft under data/os', async () => {
  const { ctx } = mockCtx('brisket');
  const result = await executeShortcut(
    'os_promote_shortcut',
    {
      proposed_id: 'track.morning-weigh-in',
      summary: 'Morning weigh-in tracker',
      example_intent: 'log morning weight',
      risk: 'confirm'
    },
    ctx
  );
  assert.equal(result.kind, 'propose');
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'brisket' });
  assert.equal(validated.ok, true);
  assert.match(validated.proposal.writes[0].path, /^data\/os\/promoted-shortcuts\//);
});

test('intent router surfaces intuition.edit-pack on flare-update asks', () => {
  resetCapabilityCaches();
  const ids = selectCapabilityIdsForTurn({
    slug: 'sara',
    message: 'Update the flare intuition after this bad week'
  });
  assert.ok(ids.includes('intuition.edit-pack'));
});

test('os_list_promoted_shortcuts and os_run_promoted_shortcut replay Confirm writes', async () => {
  resetCapabilityCaches();
  const { ctx, writes } = mockCtx('brisket');
  const promote = await executeShortcut(
    'os_promote_shortcut',
    {
      proposed_id: 'track.morning-weigh-in',
      summary: 'Morning weigh-in tracker',
      example_intent: 'log morning weight',
      example_writes: [{
        path: 'data/challenges/2026-08-31-weigh-in.json',
        mode: 'create',
        content: '{\n  "title": "Morning weigh-in"\n}\n',
        diff: 'new weigh-in challenge'
      }],
      risk: 'confirm'
    },
    ctx
  );
  assert.equal(promote.kind, 'propose');
  const draftPath = promote.proposal.writes[0].path;
  assert.match(draftPath, /^data\/os\/promoted-shortcuts\//);

  // Simulate Adam Confirm of the promote draft.
  await ctx.client.writeFile({
    path: draftPath,
    content: promote.proposal.writes[0].content,
    message: 'confirm promote draft'
  });

  const listed = await executeShortcut('os_list_promoted_shortcuts', {}, ctx);
  assert.equal(listed.kind, 'ok');
  assert.equal(listed.count, 1);
  assert.equal(listed.drafts[0].proposed_id, 'track.morning-weigh-in');

  const run = await executeShortcut(
    'os_run_promoted_shortcut',
    { proposed_id: 'track.morning-weigh-in' },
    ctx
  );
  assert.equal(run.kind, 'propose');
  const validated = validateProposeActionInput(run.proposal, { agentSlug: 'brisket' });
  assert.equal(validated.ok, true);
  assert.equal(validated.proposal.writes[0].path, 'data/challenges/2026-08-31-weigh-in.json');
  assert.match(run.proposal.intent, /morning/i);

  const missing = await executeShortcut(
    'os_run_promoted_shortcut',
    { proposed_id: 'track.does-not-exist' },
    ctx
  );
  assert.equal(missing.kind, 'error');
});

test('registry 0.4 includes promoted-shortcut runner tools', () => {
  resetCapabilityCaches();
  const registry = loadRegistry();
  assert.equal(registry.version, '0.4.0');
  assert.ok(capabilityIdsForAgent('brisket').includes('os.run-promoted-shortcut'));
  assert.ok(capabilityIdsForAgent('brisket').includes('os.list-promoted-shortcuts'));
  const tools = buildAgentTools({ slug: 'brisket', message: 'run the promoted shortcut for morning weigh-in' });
  assert.ok(tools.some(tool => tool.name === 'os_run_promoted_shortcut'));
  assert.ok(isShortcutTool('os_run_promoted_shortcut'));
  assert.ok(isShortcutTool('os_list_promoted_shortcuts'));
});

test('intent router surfaces os.run-promoted-shortcut on promoted asks', () => {
  resetCapabilityCaches();
  const ids = selectCapabilityIdsForTurn({
    slug: 'brisket',
    message: 'Run the promoted shortcut for morning weigh-in'
  });
  assert.ok(ids.includes('os.run-promoted-shortcut'));
});

test('intent router surfaces plan.week-meals and publish.surface-widget on nutrition widget asks', () => {
  resetCapabilityCaches();
  const ids = selectCapabilityIdsForTurn({
    slug: 'brisket',
    message: 'Put a weekly meal plan widget on the nutrition tab'
  });
  assert.ok(ids.includes('plan.week-meals'));
  assert.ok(ids.includes('publish.surface-widget'));
});

test('intent router surfaces track.close-challenge on dispute asks', () => {
  resetCapabilityCaches();
  const ids = selectCapabilityIdsForTurn({
    slug: 'brisket',
    message: 'Close this challenge — I dispute the auto judge verdict'
  });
  assert.ok(ids.includes('track.close-challenge'));
});
