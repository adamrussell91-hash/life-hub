import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHubPrefsProposal,
  HUB_PREFS_PATH,
  mergeHubPrefsPatch,
  proposeHubPrefsSchema
} from '../../netlify/functions/_shared/hub-prefs-agent.mjs';
import {
  buildFollowUpProposal,
  isCalendarGhostConfirmWrite,
  proposeFollowUpSchema
} from '../../netlify/functions/_shared/follow-up-agent.mjs';
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

test('propose_hub_prefs and propose_follow_up tools for Clare/Hammond', () => {
  resetCapabilityCaches();
  for (const slug of ['clare', 'hammond']) {
    const names = buildAgentTools({ slug }).map(t => t.name);
    assert.ok(names.includes('propose_hub_prefs'), slug);
    assert.ok(names.includes('propose_follow_up'), slug);
    assert.equal(isPathAllowedForAgent(slug, HUB_PREFS_PATH, { mode: 'write' }), true, slug);
  }
  assert.equal(proposeHubPrefsSchema().name, 'propose_hub_prefs');
  assert.equal(proposeFollowUpSchema().name, 'propose_follow_up');
  assert.deepEqual(classifyWriteTarget(HUB_PREFS_PATH), {
    store: 'tasks', kind: 'meta', id: 'hub_prefs', key: 'meta/hub_prefs', path: HUB_PREFS_PATH
  });
});

test('buildHubPrefsProposal patches subset and documents CN/bedtime surfaces', async () => {
  const built = buildHubPrefsProposal({
    summary: 'Set marking minutes',
    marking_default_minutes_per_script: 12,
    timezone: 'Australia/Sydney'
  });
  assert.equal(built.ok, true);
  assert.ok(built.notes.constraints);
  assert.ok(built.notes.bedtime);
  const validated = validateProposeActionInput(built.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);

  const store = {
    data: new Map(),
    async get(key, { type } = {}) {
      if (!this.data.has(key)) return null;
      const raw = this.data.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      this.data.set(key, JSON.stringify(value));
    }
  };
  // Seed prior prefs so dismissed insights survive the merge.
  store.data.set('meta/hub_prefs', JSON.stringify({
    schema_version: 1,
    timezone: 'UTC',
    dismissed_insight_ids: [{ id: 'a', fingerprint: 'fp' }],
    school_terms: [],
    marking_default_minutes_per_script: 10
  }));
  const applied = await executeProposeActionWrites({}, validated.proposal, {
    files: {
      [HUB_PREFS_PATH]: {
        record: JSON.parse(store.data.get('meta/hub_prefs'))
      }
    },
    blobStores: { tasks: store },
    nowIso: () => '2026-09-29T00:00:00.000Z'
  });
  assert.equal(applied.ok, true, applied.error);
  const next = JSON.parse(store.data.get('meta/hub_prefs'));
  assert.equal(next.marking_default_minutes_per_script, 12);
  assert.equal(next.timezone, 'Australia/Sydney');
  assert.equal(next.dismissed_insight_ids.length, 1);

  assert.equal(buildHubPrefsProposal({ summary: 'Nothing' }).error, 'no_prefs_fields');
  assert.equal(mergeHubPrefsPatch(null, { timezone: 'Australia/Melbourne' }).timezone, 'Australia/Melbourne');
});

test('buildFollowUpProposal creates task write and optional calendar ghost input', () => {
  const taskOnly = buildFollowUpProposal({
    summary: 'Follow up Jo',
    title: 'Email Jo about APST',
    due_date: '2026-10-01',
    domain: 'teaching'
  });
  assert.equal(taskOnly.ok, true);
  assert.equal(taskOnly.ghostInput, undefined);
  assert.equal(taskOnly.proposal.writes.length, 1);
  assert.match(taskOnly.proposal.writes[0].path, /^tasks:task:/);
  const validated = validateProposeActionInput(taskOnly.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);

  const dual = buildFollowUpProposal({
    summary: 'Block for follow-up',
    title: 'Call Pat',
    due_date: '2026-10-02',
    date: '2026-10-02',
    start: '14:00',
    end: '14:30',
    calendar_kind: 'outing'
  });
  assert.equal(dual.ok, true);
  assert.equal(dual.ghostInput.kind, 'outing');
  assert.equal(dual.ghostInput.start, '14:00');
  assert.equal(isCalendarGhostConfirmWrite('data/os/calendar-ghost-confirm/abc.md'), true);
  assert.equal(isCalendarGhostConfirmWrite('tasks:task:x'), false);
});
