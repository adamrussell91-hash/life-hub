import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationsHandler } from '../../netlify/functions/applications.mjs';
import { createCareerFuturesHandler } from '../../netlify/functions/career-futures.mjs';
import { careerAnnRunner } from '../../netlify/functions/career-ann-run.mjs';
import {
  checkApplicationWithAnn,
  countBrackets,
  parseApplicationCheck
} from '../../netlify/functions/_shared/career-application-ann.mjs';
import { applicationDraftPrompt } from '../../netlify/functions/_shared/career-application-prompts.mjs';
import { createApplicationRepository } from '../../netlify/functions/_shared/application-repository.mjs';
import { createCareerRepository } from '../../netlify/functions/_shared/career-repository.mjs';
import { createUniversalLinkRepository } from '../../netlify/functions/_shared/universal-link-repository.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';
import { resolveAchievement, resolveApplication } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';

// Invented role, school and records only.
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'test-only', SESSION_SECRET: 'x'.repeat(32), ANTHROPIC_API_KEY: 'test-key' };
const C1 = 'acrit_00000000-0000-4000-8000-000000000001';
const C2 = 'acrit_00000000-0000-4000-8000-000000000002';
const C3 = 'acrit_00000000-0000-4000-8000-000000000003';
const C4 = 'acrit_00000000-0000-4000-8000-000000000004';
const C5 = 'acrit_00000000-0000-4000-8000-000000000005';
const CARD_A = 'achievement_00000000-0000-4000-8000-0000000000a1';
const CARD_B = 'achievement_00000000-0000-4000-8000-0000000000b2';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? (typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function annReply(payload) {
  return async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(payload) }] }), { status: 200 });
}

const check = (status, card_ids = [], evidence = 'Ran the Year 9 reading program at Ridgeview College') => ({
  status,
  evidence,
  card_ids,
  confirmed_at: '2026-11-01T00:00:00.000Z'
});

async function seedApplication(store, criteria, extra = {}) {
  const repo = createApplicationRepository({ store, now: () => '2026-11-01T00:00:00.000Z' });
  const { application } = await repo.createApplication({ position_title: 'Head of English' });
  return repo.updateApplication(application.id, { selection_criteria: criteria, ...extra });
}

async function seedCards(store) {
  const ids = [CARD_A, CARD_B];
  const make = (title) => ({
    title,
    occurred_on: '2026-03-01',
    date_precision: 'month',
    star: { situation: 'Year 9 reading was flat', task: 'Lift it', action: 'Ran a program', result: 'Scores rose' },
    skills: ['curriculum'],
    apst: [],
    origin: 'manual',
    lifecycle_status: 'active'
  });
  const repoWithIds = createCareerRepository({
    store,
    now: () => '2026-11-01T00:00:00.000Z',
    generateAchievementId: () => ids.shift()
  });
  await repoWithIds.createAchievement(make('Reading program'));
  await repoWithIds.createAchievement(make('Faculty mentoring'));
}

test('check parse drops unknown criterion ids and card ids, and dedupes', () => {
  const raw = JSON.stringify({
    suggestions: [
      { criterion_id: C1, status: 'have', evidence: 'Reading program', card_ids: [CARD_A, 'achievement_made_up', CARD_A] },
      { criterion_id: C1, status: 'partly', evidence: 'duplicate', card_ids: [] },
      { criterion_id: 'acrit_unknown', status: 'have', evidence: 'x', card_ids: [CARD_A] },
      { criterion_id: C2, status: 'brilliant', evidence: 'x'.repeat(400), card_ids: 'nope' }
    ]
  });
  const parsed = parseApplicationCheck(raw, [{ id: C1 }, { id: C2 }], [CARD_A, CARD_B]);
  assert.deepEqual(parsed[0], { criterion_id: C1, status: 'have', evidence: 'Reading program', card_ids: [CARD_A] });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].status, 'unknown');
  assert.equal(parsed[1].evidence.length, 300);
  assert.deepEqual(parsed[1].card_ids, []);
  assert.equal(parseApplicationCheck('not json', [{ id: C1 }]), null);
});

test('checkApplicationWithAnn sends card ids and returns parsed suggestions', async () => {
  let sent = '';
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body).messages[0].content;
    return annReply({ suggestions: [{ criterion_id: C1, status: 'have', evidence: 'Reading program', card_ids: [CARD_A] }] })();
  };
  const result = await checkApplicationWithAnn({
    application: { position_title: 'Head of English', selection_criteria: [{ id: C1, criterion: 'Leads literacy' }] },
    cards: [{ id: CARD_A, title: 'Reading program' }],
    roles: [],
    env: {},
    apiKey: 'k',
    fetchImpl
  });
  assert.ok(sent.includes(CARD_A));
  assert.ok(sent.includes('card_ids'));
  assert.deepEqual(result.suggestions[0].card_ids, [CARD_A]);
  assert.equal(result.read_central_node, false);
});

function applicationsSetup() {
  const store = memoryStore();
  const universal = memoryStore();
  let tick = 0;
  const handler = createApplicationsHandler({
    env: ENV,
    verifySessionToken: () => ({ valid: true }),
    getContentStore: async () => store,
    getUniversalLinkStore: async () => universal,
    applicationNow: () => `2026-11-0${2 + tick++ % 5}T00:00:00.000Z`
  });
  const confirm = (id, answers) =>
    handler(
      new Request(`https://life-hub.adam-russell.com/api/applications?id=${id}&action=confirm-check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers })
      })
    );
  const links = async (applicationId) => {
    const resolveEntity = async (ref, ctx) => {
      const parsed = parseEntityRef(ref);
      if (parsed.kind === 'application') return resolveApplication(parsed.id, ctx, { getStore: async () => store });
      return resolveAchievement(parsed.id, ctx, { getStore: async () => store });
    };
    const repo = createUniversalLinkRepository({ store: universal, resolveEntity });
    const incoming = await repo.listIncoming(`professional:application:${applicationId}`, createAccessContext({ workflow: 'life' }));
    return incoming
      .filter((e) => e.link.relationship_type === 'answers_criterion')
      .map((e) => ({ card: e.link.source_ref.split(':').pop(), ...e.link.metadata }))
      .sort((a, b) => (a.card + a.criterion_id).localeCompare(b.card + b.criterion_id));
  };
  return { store, confirm, links };
}

test('confirm-check writes check and links; a re-confirm replaces that criterion’s links', async () => {
  const { store, confirm, links } = applicationsSetup();
  await seedCards(store);
  const app = await seedApplication(store, [
    { id: C1, criterion: 'Leads literacy', order: 0, completed: false },
    { id: C2, criterion: 'Mentors staff', order: 1, completed: false }
  ]);

  const first = await confirm(app.id, [
    { criterion_id: C1, status: 'have', evidence: 'Reading program', card_ids: [CARD_A, CARD_B] },
    { criterion_id: C2, status: 'partly', evidence: 'Mentoring', card_ids: [CARD_A] }
  ]);
  assert.equal(first.status, 200, await first.clone().text());
  const saved = (await first.json()).data.application;
  assert.equal(saved.selection_criteria[0].check.status, 'have');
  assert.ok(saved.selection_criteria[0].check.confirmed_at);
  assert.deepEqual(saved.selection_criteria[1].check.card_ids, [CARD_A]);
  assert.deepEqual(await links(app.id), [
    { card: CARD_A, criterion_id: C1, strength: 'strong' },
    { card: CARD_A, criterion_id: C2, strength: 'some' },
    { card: CARD_B, criterion_id: C1, strength: 'strong' }
  ]);

  const again = await confirm(app.id, [{ criterion_id: C1, status: 'partly', evidence: 'Only one card', card_ids: [CARD_B] }]);
  assert.equal(again.status, 200, await again.clone().text());
  assert.deepEqual(await links(app.id), [
    { card: CARD_A, criterion_id: C2, strength: 'some' },
    { card: CARD_B, criterion_id: C1, strength: 'some' }
  ]);

  const none = await confirm(app.id, [{ criterion_id: C1, status: 'not_yet', evidence: '', card_ids: [] }]);
  const after = (await none.json()).data.application;
  assert.equal(after.selection_criteria[0].check.status, 'not_yet');
  assert.equal(after.selection_criteria[1].check.status, 'partly');
  assert.deepEqual(await links(app.id), [{ card: CARD_A, criterion_id: C2, strength: 'some' }]);

  const bad = await confirm(app.id, [{ criterion_id: 'acrit_00000000-0000-4000-8000-00000000ffff', status: 'have', card_ids: [] }]);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'invalid_criterion_id');
  const badStatus = await confirm(app.id, [{ criterion_id: C1, status: 'maybe', card_ids: [] }]);
  assert.equal(badStatus.status, 400);
});

function runnerFor(store, fetchImpl, cards = []) {
  return careerAnnRunner(store, ENV, {
    fetchImpl,
    readCareerRecord: async () => ({ roles: [{ role: 'Teacher', where: 'Ridgeview College', from: '2020', to: null }], cards }),
    readApplicationWhere: async () => 'Lakeside Grammar',
    draftNow: () => '2026-11-07T00:00:00.000Z',
    sleep: async () => {}
  });
}

test('app_draft fills empty and Ann responses, holds Adam’s as pending, skips unchecked, counts brackets', async () => {
  const store = memoryStore();
  const app = await seedApplication(store, [
    { id: C1, criterion: 'Leads literacy', order: 0, completed: false, word_limit: 250, check: check('have', [CARD_A]),
      response: 'My own words', response_source: 'adam' },
    { id: C2, criterion: 'Mentors staff', order: 1, completed: false, word_limit: 300, check: check('partly', [], 'Mentored two graduates') },
    { id: C3, criterion: 'Builds partnerships', order: 2, completed: false, check: check('have'), response: 'Old Ann draft', response_source: 'ann' },
    { id: C4, criterion: 'Uses data to plan', order: 3, completed: false },
    { id: C5, criterion: 'Holds a principal credential', order: 4, completed: false, check: check('not_yet') }
  ]);
  let prompt = '';
  const fetchImpl = async (url, init) => {
    prompt = JSON.parse(init.body).messages[0].content;
    return annReply({
      responses: [
        { criterion_id: C1, text: 'Draft one [add: year]' },
        { criterion_id: C2, text: 'Draft two [add: number of staff] and [add: school]' },
        { criterion_id: C3, text: 'Draft three' },
        { criterion_id: C4, text: 'Should be ignored' }
      ]
    })();
  };
  const cards = [{ id: CARD_A, title: 'Reading program', when: '2026-03-01', skills: [], star: { action: 'Ran a reading program' } }];
  const result = await runnerFor(store, fetchImpl, cards)({ kind: 'app_draft', application_id: app.id, target: 'responses', criterion_id: null });

  assert.deepEqual(result.drafted.sort(), [C1, C2, C3]);
  assert.deepEqual(result.skipped, [
    { criterion_id: C4, reason: 'not_checked' },
    { criterion_id: C5, reason: 'no_evidence' }
  ]);
  assert.equal(result.brackets, 3);
  const [r1, r2, r3, r4] = result.application.selection_criteria;
  assert.equal(r1.response, 'My own words');
  assert.equal(r1.response_source, 'adam');
  assert.equal(r1.response_pending, 'Draft one [add: year]');
  assert.equal(r2.response, 'Draft two [add: number of staff] and [add: school]');
  assert.equal(r2.response_source, 'ann');
  assert.equal(r2.response_drafted_at, '2026-11-07T00:00:00.000Z');
  assert.equal(r3.response, 'Draft three');
  assert.equal(r3.response_pending, null);
  assert.equal(r4.response, null);

  const stored = await createApplicationRepository({ store }).getApplication(app.id);
  assert.equal(stored.selection_criteria[0].response, 'My own words');

  assert.ok(prompt.includes('"word_limit":250'));
  assert.ok(prompt.includes('"word_limit":300'));
  assert.ok(prompt.includes('Mentored two graduates'));
  assert.ok(prompt.includes('Ran a reading program'));
  assert.ok(prompt.includes('Lakeside Grammar'));
  assert.ok(!prompt.includes('Uses data to plan'));
  assert.ok(!prompt.includes('Holds a principal credential'));
});

test('app_draft with nothing checked makes no model call', async () => {
  const store = memoryStore();
  const app = await seedApplication(store, [{ id: C1, criterion: 'Leads literacy', order: 0, completed: false }]);
  let called = false;
  const result = await runnerFor(store, async () => { called = true; })({ kind: 'app_draft', application_id: app.id, target: 'responses' });
  assert.equal(called, false);
  assert.deepEqual(result.drafted, []);
  assert.deepEqual(result.skipped, [{ criterion_id: C1, reason: 'not_checked' }]);
});

test('app_draft cover letter goes to pending over Adam’s own; CV fills an empty box and counts brackets', async () => {
  const store = memoryStore();
  const app = await seedApplication(store, [{ id: C1, criterion: 'Leads literacy', order: 0, completed: false, check: check('have') }], {
    cover_letter: { text: 'My letter', source: 'adam' }
  });
  const letter = await runnerFor(store, annReply({ text: 'Ann letter for [add: panel chair]' }))({
    kind: 'app_draft', application_id: app.id, target: 'cover_letter'
  });
  assert.equal(letter.application.cover_letter.text, 'My letter');
  assert.equal(letter.application.cover_letter.source, 'adam');
  assert.equal(letter.application.cover_letter.pending, 'Ann letter for [add: panel chair]');
  assert.equal(letter.brackets, 1);
  assert.deepEqual(letter.drafted, ['cover_letter']);

  const cv = await runnerFor(store, annReply({ text: 'Profile\n[add: teaching registration number]\n[add: degree]' }))({
    kind: 'app_draft', application_id: app.id, target: 'cv'
  });
  assert.equal(cv.application.cv.source, 'ann');
  assert.equal(cv.application.cv.pending, null);
  assert.equal(cv.brackets, 2);
  assert.equal(countBrackets('[ADD: x] [add: y] [addition]'), 2);
});

test('draft prompt rules: word limits, no meta openers, brackets, Australian English', () => {
  const prompt = applicationDraftPrompt({
    target: 'responses',
    application: { position_title: 'Head of English', advertisement: { summary: 'Invented ad' } },
    where: 'Lakeside Grammar',
    criteria: [{ criterion_id: C1, text: 'Leads literacy', word_limit: 250, evidence: 'Reading program', cards: [] }]
  });
  assert.ok(prompt.includes('"word_limit":250'));
  assert.ok(prompt.includes('200–250 words'));
  assert.ok(prompt.includes('[add:'));
  assert.ok(prompt.includes('Australian English'));
  assert.ok(prompt.includes('This response will'));
  const cv = applicationDraftPrompt({ target: 'cv', application: { position_title: 'x' } });
  assert.ok(cv.includes('Available on request'));
  assert.ok(cv.includes('[add: teaching registration number]'));
});

test('career-futures app_check_start and app_draft_start validate before starting', async () => {
  const store = memoryStore();
  const app = await seedApplication(store, [{ id: C1, criterion: 'Leads literacy', order: 0, completed: false }]);
  const started = [];
  const handler = createCareerFuturesHandler({
    env: ENV,
    verifySessionToken: () => ({ valid: true }),
    getContentStore: async () => store,
    invokeCareerAnnRun: async (request, jobId) => { started.push(jobId); return true; }
  });
  const post = (action, id, body = {}) =>
    handler(new Request(`https://life-hub.adam-russell.com/api/career-futures?action=${action}&id=${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }));

  const ok = await post('app_check_start', app.id);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.ok((await ok.json()).data.job_id);
  const missing = await post('app_check_start', 'application_00000000-0000-4000-8000-00000000dead');
  assert.equal(missing.status, 404);
  assert.equal((await post('app_check_start', 'nope')).status, 400);

  const draft = await post('app_draft_start', app.id, { target: 'responses', criterion_id: C1 });
  assert.equal(draft.status, 200, await draft.clone().text());
  const badTarget = await post('app_draft_start', app.id, { target: 'essay' });
  assert.equal((await badTarget.json()).error.code, 'invalid_target');
  const badCrit = await post('app_draft_start', app.id, { target: 'responses', criterion_id: C2 });
  assert.equal((await badCrit.json()).error.code, 'invalid_criterion_id');
  assert.equal(started.length, 2);
});

test('drafts use Adam\'s own voice sources, never an agent persona', async () => {
  const { pickOwnWriting, ADAM_VOICE_PATH } = await import('../../netlify/functions/_shared/career-application-ann.mjs');
  const { applicationDraftPrompt } = await import('../../netlify/functions/_shared/career-application-prompts.mjs');
  assert.equal(ADAM_VOICE_PATH, 'config/humanizer/voices/adam.md');
  const long = (word) => `${word} `.repeat(60).trim();
  const apps = [
    { id: 'a1', updated_at: '2026-01-01', selection_criteria: [{ response: long('older'), response_source: null }] },
    { id: 'a2', updated_at: '2026-06-01', selection_criteria: [
      { response: long('mine'), response_source: 'adam' },
      { response: long('annwrote'), response_source: 'ann' },
      { response: 'too short', response_source: 'adam' }
    ] },
    { id: 'current', updated_at: '2026-07-01', selection_criteria: [{ response: long('current'), response_source: 'adam' }] }
  ];
  const picked = pickOwnWriting(apps, 'current');
  assert.equal(picked.length, 2);
  assert.ok(picked[0].startsWith('mine'));
  assert.ok(picked[1].startsWith('older'));
  const prompt = applicationDraftPrompt({ target: 'cover_letter', application: { position_title: 'Head of Science' }, ownWriting: picked });
  assert.match(prompt, /under his own name/);
  assert.doesNotMatch(prompt, /You ARE Ann/);
  assert.match(prompt, /mine mine/);
});
