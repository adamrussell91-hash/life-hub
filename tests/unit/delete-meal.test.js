import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMealDeletePaths,
  mealDeletesFromWrites,
  parseNutritionMealPath
} from '../../netlify/functions/_shared/delete-meal.mjs';
import {
  executeShortcut,
  shortcutSchemas
} from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import {
  executeProposeActionWrites,
  validateProposeActionInput
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { syncCentralNodeAfterMealDeletes } from '../../netlify/functions/_shared/persist-log.mjs';
import { createGitHubClient, GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';
import { WRITE_GATEWAY_TOOLS } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { buildAgentTools, resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { recentActionFingerprint } from '../../apps/life/js/core/central-node-write.js';

const SHA = 'a'.repeat(40);
const COMMIT = 'b'.repeat(40);

test('parseNutritionMealPath accepts canonical and numbered meal slots', () => {
  assert.deepEqual(parseNutritionMealPath('data/nutrition/2026/09/2026-09-08-snack.md'), {
    date: '2026-09-08',
    meal: 'snack',
    slug: 'snack',
    path: 'data/nutrition/2026/09/2026-09-08-snack.md'
  });
  assert.equal(parseNutritionMealPath('data/nutrition/2026/09/2026-09-08-snack-2.md')?.meal, 'snack');
  assert.equal(parseNutritionMealPath('data/nutrition/2026/09/2026-09-08-notes.md'), null);
});

test('findMealDeletePaths returns canonical slot plus numbered variants', () => {
  const tree = [
    { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-snack.md', sha: SHA },
    { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-snack-2.md', sha: SHA },
    { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-lunch.md', sha: SHA },
    { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-snack-notes.md', sha: SHA }
  ];
  assert.deepEqual(findMealDeletePaths(tree, '2026-09-08', 'snack'), [
    'data/nutrition/2026/09/2026-09-08-snack-2.md',
    'data/nutrition/2026/09/2026-09-08-snack.md'
  ]);
  assert.deepEqual(findMealDeletePaths(tree, '2026-09-08', 'lunch'), [
    'data/nutrition/2026/09/2026-09-08-lunch.md'
  ]);
  assert.deepEqual(findMealDeletePaths(tree, '2026-09-08', 'breakfast'), []);
});

test('delete_meal shortcut proposes delete writes for existing files', async () => {
  assert.ok(shortcutSchemas().delete_meal);
  const result = await executeShortcut('delete_meal', {
    date: '2026-09-08',
    meal: 'snack'
  }, {
    agentSlug: 'brisket',
    repoTree: [
      { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-snack.md', sha: SHA },
      { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-snack-2.md', sha: SHA }
    ]
  });
  assert.equal(result.kind, 'propose');
  assert.match(result.proposal.intent, /Delete snack/);
  assert.equal(result.proposal.writes.length, 2);
  assert.ok(result.proposal.writes.every(write => write.mode === 'delete' && write.content === ''));
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'brisket' });
  assert.equal(validated.ok, true);
});

test('delete_meal errors when the slot file is missing', async () => {
  const result = await executeShortcut('delete_meal', {
    date: '2026-09-08',
    meal: 'dinner'
  }, { agentSlug: 'brisket', repoTree: [] });
  assert.equal(result.kind, 'error');
  assert.match(result.error, /No dinner record/);
});

test('validateProposeActionInput accepts empty-content delete writes', () => {
  const result = validateProposeActionInput({
    intent: 'Delete snack for 2026-09-08',
    writes: [{
      path: 'data/nutrition/2026/09/2026-09-08-snack.md',
      mode: 'delete',
      content: '',
      diff: 'Remove snack'
    }]
  }, { agentSlug: 'brisket' });
  assert.equal(result.ok, true);
  assert.equal(result.proposal.writes[0].mode, 'delete');
});

test('validateProposeActionInput rejects non-empty delete content', () => {
  const result = validateProposeActionInput({
    intent: 'Delete snack',
    writes: [{
      path: 'data/nutrition/2026/09/2026-09-08-snack.md',
      mode: 'delete',
      content: 'nope'
    }]
  }, { agentSlug: 'brisket' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'delete_content_not_empty');
});

test('executeProposeActionWrites deletes github files by sha', async () => {
  const deleted = [];
  const client = {
    async writeFile() {
      throw new Error('writeFile must not run for delete');
    },
    async deleteFile(args) {
      deleted.push(args);
      return { commitSha: COMMIT };
    }
  };
  const result = await executeProposeActionWrites(client, {
    agent: 'brisket',
    intent: 'Delete snack',
    writes: [{
      path: 'data/nutrition/2026/09/2026-09-08-snack.md',
      mode: 'delete',
      content: ''
    }]
  }, {
    files: {
      'data/nutrition/2026/09/2026-09-08-snack.md': { sha: SHA, content: '---\n' }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].path, 'data/nutrition/2026/09/2026-09-08-snack.md');
  assert.equal(deleted[0].sha, SHA);
});

test('executeProposeActionWrites skips already-missing deletes', async () => {
  const client = {
    async writeFile() {
      throw new Error('unexpected write');
    },
    async deleteFile() {
      throw new Error('unexpected delete');
    }
  };
  const result = await executeProposeActionWrites(client, {
    agent: 'brisket',
    intent: 'Delete snack',
    writes: [{
      path: 'data/nutrition/2026/09/2026-09-08-snack.md',
      mode: 'delete',
      content: ''
    }]
  }, { files: {} });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].skipped, true);
});

test('syncCentralNodeAfterMealDeletes rebuilds Nutrition and upserts Recent Action', async () => {
  const lunch = `---
type: meal
date: "2026-09-08"
meal: lunch
calories: 500
protein_g: 40
fat_g: 20
---
Lunch — on track
`;
  const cn = `# Central Node

## ⚡ Today's Status
**Nutrition:** 900 kcal, 60g P, 30g F.
**Flags:** custard — duplicate.

## 📝 Recent Agent Actions
**8 Sep:** Brisket: Logged custard — duplicate for snack.
`;
  const writes = [];
  const blobs = {
    [SHA]: Buffer.from(cn, 'utf8').toString('base64'),
    c: Buffer.from(lunch, 'utf8').toString('base64')
  };
  const lunchSha = 'c'.repeat(40);
  blobs[lunchSha] = Buffer.from(lunch, 'utf8').toString('base64');

  const client = {
    async resolveTree() {
      return {
        commitSha: COMMIT,
        treeSha: SHA,
        tree: [
          { type: 'blob', path: 'central-node.md', sha: SHA },
          { type: 'blob', path: 'data/nutrition/2026/09/2026-09-08-lunch.md', sha: lunchSha }
        ]
      };
    },
    async readBlob(sha) {
      return { encoding: 'base64', content: blobs[sha], sha };
    },
    async writeFile(args) {
      writes.push(args);
      return { sha: 'd'.repeat(40), commitSha: COMMIT };
    }
  };

  const result = await syncCentralNodeAfterMealDeletes(client, [{
    date: '2026-09-08',
    meals: ['snack'],
    paths: ['data/nutrition/2026/09/2026-09-08-snack.md']
  }]);
  assert.equal(result.updated, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'central-node.md');
  assert.match(writes[0].content, /\*\*Nutrition:\*\* 500 kcal/);
  assert.match(writes[0].content, /Removed meal log for snack/);
  assert.doesNotMatch(writes[0].content, /Logged custard — duplicate for snack/);
});

test('Removed meal log shares the meal Recent Action fingerprint', () => {
  const logged = '**8 Sep:** Brisket: Logged custard — duplicate for snack.';
  const removed = '**8 Sep:** Brisket: Removed meal log for snack.';
  assert.equal(recentActionFingerprint(logged), recentActionFingerprint(removed));
});

test('mealDeletesFromWrites groups nutrition deletes by date', () => {
  assert.deepEqual(mealDeletesFromWrites([
    { mode: 'delete', path: 'data/nutrition/2026/09/2026-09-08-snack.md' },
    { mode: 'delete', path: 'data/nutrition/2026/09/2026-09-08-snack-2.md' },
    { mode: 'overwrite', path: 'data/nutrition/2026/09/2026-09-08-lunch.md' }
  ]), [{
    date: '2026-09-08',
    meals: ['snack'],
    paths: [
      'data/nutrition/2026/09/2026-09-08-snack.md',
      'data/nutrition/2026/09/2026-09-08-snack-2.md'
    ]
  }]);
});

test('deleteFile DELETEs contents with sha precondition', async () => {
  const env = {
    GITHUB_REPOSITORY: 'life-owner/life-repo',
    GITHUB_BRANCH: 'main',
    GITHUB_TOKEN: 'secret-token',
    GITHUB_TOKEN_EXPIRES: '2026-09-01'
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ commit: { sha: COMMIT } }, { status: 200 });
  };
  const client = createGitHubClient({ env, fetchImpl });
  const result = await client.deleteFile({
    path: 'data/nutrition/2026/09/2026-09-08-snack.md',
    sha: SHA,
    message: 'chore: delete snack'
  });
  assert.equal(result.commitSha, COMMIT);
  assert.equal(calls[0].options.method, 'DELETE');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.sha, SHA);
  assert.equal(body.branch, 'main');
});

test('deleteFile maps conflict statuses', async () => {
  const env = {
    GITHUB_REPOSITORY: 'life-owner/life-repo',
    GITHUB_BRANCH: 'main',
    GITHUB_TOKEN: 'secret-token',
    GITHUB_TOKEN_EXPIRES: '2026-09-01'
  };
  const fetchImpl = async () => Response.json({ message: 'sha mismatch' }, { status: 409 });
  const client = createGitHubClient({ env, fetchImpl });
  await assert.rejects(
    client.deleteFile({ path: 'x.md', sha: SHA, message: 'm' }),
    error => error instanceof GitHubClientError && error.code === 'write_conflict'
  );
});

test('Brisket tools and write gateway include delete_meal', () => {
  resetCapabilityCaches();
  assert.ok(WRITE_GATEWAY_TOOLS.includes('delete_meal'));
  const tools = buildAgentTools({
    slug: 'brisket',
    allowedTypes: ['meal'],
    message: 'delete the duplicate snack'
  });
  assert.ok(tools.some(tool => tool.name === 'delete_meal'));
});

test('Brisket persona instructs delete_meal and forbids Hammond handoff for meal deletes', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.match(prompt, /delete_meal/);
  assert.match(prompt, /never send him to Hammond for nutrition file removal/i);
});
