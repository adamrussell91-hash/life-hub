import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUMANIZER_LAYER_HEADING,
  HUMANIZER_UPSTREAM,
  formatWritingSampleBlock,
  loadHumanizerGuidance,
  loadHumanizerIntegration,
  loadHumanizerOrigin,
  loadHumanizerSkill,
  loadPersonalityWritingSample,
  loadPrivatePersonalityWritingSample
} from '../../netlify/functions/_shared/load-humanizer.mjs';

test('records the pinned upstream Humanizer snapshot', () => {
  assert.equal(HUMANIZER_UPSTREAM.repository, 'https://github.com/blader/humanizer');
  assert.equal(HUMANIZER_UPSTREAM.version, '2.11.2');
  assert.equal(HUMANIZER_UPSTREAM.commit, 'e2e92e7b4b8229253ed5c8e81dc65463fdeddda5');
  assert.equal(HUMANIZER_UPSTREAM.integrated, '2026-09-05');
  const origin = loadHumanizerOrigin();
  assert.match(origin, /2\.11\.2/);
  assert.match(origin, /e2e92e7b4b8229253ed5c8e81dc65463fdeddda5/);
  assert.match(origin, /2026-09-05/);
});

test('loads the vendored Humanizer skill verbatim', () => {
  const skill = loadHumanizerSkill();
  const onDisk = readFileSync(join(process.cwd(), 'config/humanizer/SKILL.md'), 'utf8').trim();
  assert.equal(skill, onDisk);
  assert.match(skill, /version: "2\.11\.2"/);
  assert.match(skill, /Match the writer's voice/);
  assert.match(skill, /Do not invent facts/);
  assert.match(skill, /A writing sample takes priority/);
});

test('keeps Life Hub integration rules out of the upstream skill file', () => {
  const skill = loadHumanizerSkill();
  const integration = loadHumanizerIntegration();
  assert.match(integration, new RegExp(HUMANIZER_LAYER_HEADING));
  assert.match(integration, /embedded mode/i);
  assert.match(integration, /Personality identity outranks/);
  assert.doesNotMatch(skill, /Clare DeMind|General Hammond|Life Hub Humanizer layer/);
});

test('composes integration then upstream skill once', () => {
  const guidance = loadHumanizerGuidance();
  const integration = loadHumanizerIntegration();
  const skill = loadHumanizerSkill();
  assert.equal(guidance, `${integration}\n\n${skill}`);
  assert.equal(guidance.split(HUMANIZER_LAYER_HEADING).length - 1, 1);
});

test('returns an empty string when Humanizer files cannot be read', () => {
  const missing = () => {
    throw new Error('ENOENT');
  };
  assert.equal(loadHumanizerGuidance({ readFileSyncImpl: missing }), '');
  assert.equal(loadPersonalityWritingSample('clare', { readFileSyncImpl: missing }), '');
});

test('public prompt assembly has no filesystem fallback for personal samples', () => {
  assert.equal(loadPersonalityWritingSample('clare'), '');
  assert.equal(loadPersonalityWritingSample('router'), '');
  assert.equal(formatWritingSampleBlock(''), '');
});

test('private voice reader uses the requested blob and omits missing or invalid samples', async () => {
  const tree = [{ path: 'config/humanizer/voices/clare.md', type: 'blob', sha: 'private-sha' }];
  const calls = [];
  const client = { readBlob: async sha => {
    calls.push(sha);
    return { encoding: 'base64', content: Buffer.from('Synthetic private sample.').toString('base64') };
  } };
  assert.equal(await loadPrivatePersonalityWritingSample('clare', { client, tree }), 'Synthetic private sample.');
  assert.deepEqual(calls, ['private-sha']);
  assert.equal(await loadPrivatePersonalityWritingSample('../clare', { client, tree }), '');
  assert.equal(await loadPrivatePersonalityWritingSample('hammond', { client, tree }), '');
  assert.equal(await loadPrivatePersonalityWritingSample('clare', { client: { readBlob: async () => { throw Error('offline'); } }, tree }), '');
  assert.equal(await loadPrivatePersonalityWritingSample('clare', { client: { readBlob: async () => ({ encoding: 'base64', content: 'invalid!' }) }, tree }), '');
});

test('formats a supplied writing sample with precedence over Humanizer style defaults', () => {
  const block = formatWritingSampleBlock('Alright. Sit down. Walk me through what happened.');
  assert.match(block, /Approved writing sample/);
  assert.match(block, /outranks Humanizer generic style defaults/);
  assert.match(block, /dash rule in §14/);
  assert.match(block, /Alright\. Sit down\./);
});

test('private writing samples never enter the browser sync manifest', async () => {
  const { selectManifestEntries } = await import('../../netlify/functions/_shared/repo-policy.mjs');
  const tree = [{ path: 'config/humanizer/voices/clare.md', type: 'blob', sha: 'a'.repeat(40), size: 50 }];
  assert.deepEqual(selectManifestEntries(tree, { from: '2026-10-15', to: '2026-10-15' }), []);
});
