import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keepScanProposal,
  proposalOccurredOn,
  shouldRunCareerScanNow,
  skillTitleKey,
  sourceRefsHash,
  isoWeekKey,
  labelScanProposals
} from '../../netlify/functions/_shared/career-scan-service.mjs';
import { careerScanProposalKey } from '../../netlify/functions/_shared/professional-blobs.mjs';
import { generateScanProposalId } from '../../netlify/functions/_shared/career-schema.mjs';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key) {
      return data.has(key) ? structuredClone(data.get(key)) : null;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    }
  };
}

test('sourceRefsHash is order-insensitive', () => {
  assert.equal(
    sourceRefsHash(['tasks:task:a', 'professional:meeting:b']),
    sourceRefsHash(['professional:meeting:b', 'tasks:task:a'])
  );
});

test('shouldRunCareerScanNow is Sunday 17–19 Sydney with once-per-week success', () => {
  // 2026-09-27 is a Sunday. 07:00 UTC = 17:00 Sydney (AEST, UTC+10).
  const sunday1700 = new Date('2026-09-27T07:00:00Z');
  const gate = shouldRunCareerScanNow(sunday1700, {});
  assert.equal(gate.run, true);
  assert.ok(gate.weekKey);

  const already = shouldRunCareerScanNow(sunday1700, { last_success_week: gate.weekKey });
  assert.equal(already.run, false);

  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T08:00:00Z'), {}).run, true);
  assert.equal(shouldRunCareerScanNow(new Date('2026-09-27T09:00:00Z'), {}).run, true);

  const monday = new Date('2026-09-28T07:00:00Z');
  assert.equal(shouldRunCareerScanNow(monday, {}).run, false);
});

test('isoWeekKey is stable for a Sydney Sunday', () => {
  const key = isoWeekKey(new Date('2026-09-27T07:00:00Z'));
  assert.match(key, /^\d{4}-W\d{2}$/);
});

test('skillTitleKey treats case, spacing, ampersands and punctuation as the same skill', () => {
  assert.equal(
    skillTitleKey('Research translation & professional writing'),
    skillTitleKey('  research translation and Professional Writing. ')
  );
  assert.notEqual(skillTitleKey('Mentoring'), skillTitleKey('Mentoring new staff'));
});

test('proposalOccurredOn dates a card from its latest source, not the scan day', () => {
  const dates = new Map([
    ['professional:meeting:a', '2026-03-02'],
    ['professional:meeting:b', '2026-05-09']
  ]);
  assert.equal(
    proposalOccurredOn(['professional:meeting:a', 'professional:meeting:b'], dates, '2026-10-02', '2026-10-19T07:00:00Z'),
    '2026-05-09'
  );
  assert.equal(proposalOccurredOn(['x'], new Map(), '2026-04-01', '2026-10-19T07:00:00Z'), '2026-04-01');
  assert.equal(proposalOccurredOn([], new Map(), 'not a date', '2026-10-19T07:00:00Z'), '2026-10-19');
});

test('keeping a proposal whose title is already in the ledger reuses that card', async () => {
  const store = memoryStore();
  const id = generateScanProposalId();
  await store.setJSON(careerScanProposalKey(id), {
    id,
    status: 'pending',
    equivalence_hash: 'h1',
    title: 'Research translation & professional writing',
    occurred_on: '2026-05-09',
    date_precision: 'day',
    star: {},
    skills: [],
    apst: [],
    source_refs: [],
    witness_refs: [],
    future_matches: []
  });
  let created = 0;
  const existing = {
    id: 'ach_existing',
    title: 'Research translation and professional writing',
    lifecycle_status: 'active'
  };
  const careerRepo = {
    async listAchievements() {
      return [existing];
    },
    async createAchievement() {
      created += 1;
      return { id: 'ach_new' };
    }
  };
  const result = await keepScanProposal(
    { store, careerRepo, universalStore: memoryStore(), nowIso: '2026-10-19T07:00:00Z' },
    id
  );
  assert.equal(created, 0);
  assert.equal(result.achievement.id, 'ach_existing');
  assert.equal(result.proposal.status, 'kept');
  assert.equal(result.proposal.achievement_id, 'ach_existing');
});

test('labelScanProposals names and links source and witness refs', async () => {
  const calls = [];
  const resolveEntity = async (ref) => {
    calls.push(ref);
    if (ref === 'tasks:project:gone') throw new Error('not found');
    return { display_label: `Label for ${ref}`, href: `/hub/#/${ref}` };
  };
  const [proposal] = await labelScanProposals(
    [
      {
        id: 'p1',
        source_refs: ['tasks:project:p1', 'tasks:project:gone'],
        witness_refs: ['tasks:project:p1']
      }
    ],
    { resolveEntity }
  );
  assert.deepEqual(proposal.source_labels, [
    { ref: 'tasks:project:p1', label: 'Label for tasks:project:p1', href: '/hub/#/tasks:project:p1' },
    { ref: 'tasks:project:gone', label: null, href: null }
  ]);
  assert.equal(proposal.witness_labels[0].href, '/hub/#/tasks:project:p1');
  assert.equal(calls.filter((ref) => ref === 'tasks:project:p1').length, 1);
});
