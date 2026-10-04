import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capabilityIdsForAgent,
  isPathAllowedForAgent
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import {
  validateProposeActionInput,
  executeProposeActionWrites,
  WRITE_MODES
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

// "Agent can propose it" must imply "Confirm can save it". Every failure here is a
// Confirm card that fails on every tap (5 Oct weight reading, PR #688).

const AGENTS = ['ann', 'brisket', 'chadwick', 'clare', 'clementine', 'hammond', 'hyaluronica', 'penelope', 'sara', 'vera'];

// Store-backed paths each capability's builder writes. Capabilities routed through
// another queue are left out on purpose: coordinate.request-cn-write (Hammond's
// cn_patch Confirm writes) and comms.propose-log-communication (writes
// data/os/calendar-ghost-confirm/*, covered by publish.calendar-ghost).
const CAPABILITY_WRITE_PATHS = {
  'tasks.create': ['tasks:task:t1'],
  'tasks.update': ['tasks:task:t1'],
  'tasks.propose-follow-up': ['tasks:task:t1'],
  'prefs.propose-hub-prefs': ['tasks:meta:hub_prefs'],
  'goals.propose': ['tasks:goal:g1'],
  'goals.checkin': ['tasks:goal_checkin:2026-10-05'],
  'travel.propose-item': ['travel:trip:t1'],
  'travel.propose-checkin': ['travel:trip:t1'],
  'knowledge.propose-page': ['knowledge:page:p1'],
  'people.propose-changes': ['people:person:p1', 'people:person:new-1', 'people:link:new-1', 'people:organisation:new-x'],
  'people.propose-organisation-changes': ['people:organisation:o1', 'people:link:new-1'],
  'people.propose-observation': ['people:observation:new-1'],
  'people.propose-remember-fact': ['people:remember:new-1'],
  'people.propose-tie-decision': ['professional:tie:x1'],
  'professional.propose-meeting': ['professional:meeting:m1'],
  'professional.propose-meeting-update': ['professional:meeting:m1'],
  'professional.propose-event': ['professional:event:e1'],
  'professional.propose-event-update': ['professional:event:e1'],
  'professional.propose-communication': ['professional:communication:c1', 'professional:communication:new-x'],
  'career.propose-application': ['professional:application:a1'],
  'career.propose-future': ['professional:future:f1'],
  'publish.calendar-ghost': ['data/os/calendar-ghost-confirm/x.md'],
  'remember.write-memory': ['data/remember/x.md'],
  'remember.note-context': ['data/remember/x.md'],
  'remember.set-week-flag': ['data/remember/x.md'],
  'track.open-challenge': ['data/challenges/x.json'],
  'research.save-brief': ['data/research/x.md'],
  'publish.surface-widget': ['data/widgets/x.json'],
  'intuition.edit-pack': ['intuition/x.json'],
  'os.promote-shortcut': ['data/os/promoted-shortcuts/x.json'],
  'plan.week-meals': ['data/nutrition/meal-plans/week-x.json'],
  'publish.cn-patch': ['central-node.md']
};

test('every agent may write the paths its own tools write', () => {
  const denied = [];
  for (const agent of AGENTS) {
    for (const id of capabilityIdsForAgent(agent)) {
      for (const path of CAPABILITY_WRITE_PATHS[id] ?? []) {
        if (!isPathAllowedForAgent(agent, path, { mode: 'write' })) denied.push(`${agent} ${id} ${path}`);
      }
    }
  }
  assert.deepEqual(denied, []);
});

function memoryBlobStore() {
  const data = new Map();
  return {
    async get(key) { return data.get(key) ?? null; },
    async setJSON(key, value) { data.set(key, value); }
  };
}

// Dedicated executors (people/travel/knowledge/professional/goals) carry their own
// round-trip tests; here they only need to be bound so the dispatcher reaches them.
const boundExecutor = { async apply(write, target) { return { ok: true, result: { path: write.path, id: target.id } }; } };

function fakeClient() {
  return {
    async writeFile() { return { sha: 'sha', commitSha: 'commit' }; },
    async deleteFile() { return { commitSha: 'commit' }; }
  };
}

test('os_propose_action: anything the validator accepts, Confirm can execute', async () => {
  const paths = [...new Set([
    ...Object.values(CAPABILITY_WRITE_PATHS).flat(),
    'tasks:project:p1', 'tasks:work_block:w1', 'tasks:work_session:s1', 'teaching:unit:u1'
  ])];
  const contents = ['{"title":"x"}', 'plain text', '[1,2]', ''];
  const broken = [];
  let accepted = 0;
  for (const agent of AGENTS) {
    for (const path of paths) {
      for (const mode of WRITE_MODES) {
        for (const content of contents) {
          const validated = validateProposeActionInput(
            { intent: 'probe', writes: [{ path, mode, content }] },
            { agentSlug: agent }
          );
          if (!validated.ok) continue;
          accepted += 1;
          const applied = await executeProposeActionWrites(fakeClient(), validated.proposal, {
            blobStores: {
              tasks: memoryBlobStore(),
              teaching: memoryBlobStore(),
              people: boundExecutor,
              travel: boundExecutor,
              knowledge: boundExecutor,
              professional: boundExecutor,
              goals: boundExecutor
            }
          });
          if (!applied.ok) broken.push(`${agent} ${mode} ${path} ${JSON.stringify(content)} -> ${applied.error}`);
        }
      }
    }
  }
  assert.ok(accepted > 0);
  assert.deepEqual(broken, []);
});
