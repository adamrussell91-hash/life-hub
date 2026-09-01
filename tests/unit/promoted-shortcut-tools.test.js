import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPromotedShortcutToolSchemas,
  findPromotedDraftByToolName,
  isPromotedShortcutToolName,
  loadPromotedShortcutDrafts,
  promotedShortcutPathsFromTree
} from '../../netlify/functions/_shared/capabilities/promoted-shortcut-tools.mjs';

test('promotedShortcutPathsFromTree lists draft blobs only', () => {
  const paths = promotedShortcutPathsFromTree([
    { path: 'data/os/promoted-shortcuts/track-morning-weigh-in.json', type: 'blob', sha: 'a' },
    { path: 'data/os/pending-actions.json', type: 'blob', sha: 'b' },
    { path: 'data/os/promoted-shortcuts/readme.txt', type: 'blob', sha: 'c' }
  ]);
  assert.deepEqual(paths, [{ path: 'data/os/promoted-shortcuts/track-morning-weigh-in.json', sha: 'a' }]);
});

test('loadPromotedShortcutDrafts parses catalogued drafts', async () => {
  const draft = JSON.stringify({
    proposed_id: 'track.morning-weigh-in',
    tool_name: 'track_morning_weigh_in',
    summary: 'Morning weigh-in tracker',
    status: 'ready'
  });
  const drafts = await loadPromotedShortcutDrafts(
    [{ path: 'data/os/promoted-shortcuts/track-morning-weigh-in.json', type: 'blob', sha: 'sha1' }],
    async () => draft
  );
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].tool_name, 'track_morning_weigh_in');
  assert.equal(drafts[0].proposed_id, 'track.morning-weigh-in');
});

test('buildPromotedShortcutToolSchemas emits per-draft named tools', () => {
  const schemas = buildPromotedShortcutToolSchemas([{
    proposed_id: 'track.morning-weigh-in',
    tool_name: 'track_morning_weigh_in',
    summary: 'Morning weigh-in tracker'
  }]);
  assert.equal(schemas.length, 1);
  assert.equal(schemas[0].name, 'track_morning_weigh_in');
  assert.match(schemas[0].description, /Morning weigh-in tracker/);
});

test('findPromotedDraftByToolName resolves dynamic tool aliases', () => {
  const drafts = [{ tool_name: 'track_morning_weigh_in', proposed_id: 'track.morning-weigh-in' }];
  assert.equal(findPromotedDraftByToolName('track_morning_weigh_in', drafts)?.proposed_id, 'track.morning-weigh-in');
  assert.equal(isPromotedShortcutToolName('track_morning_weigh_in', drafts), true);
  assert.equal(isPromotedShortcutToolName('os_run_promoted_shortcut', drafts), false);
});
