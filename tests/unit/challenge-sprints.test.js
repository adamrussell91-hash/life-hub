/**
 * Challenge sprints — Phase A+B unit coverage (brief §10 items 1–9).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSprintState,
  defaultCadenceForLength,
  decideSprintNudges,
  runEvidenceAdapter,
  resolveCadence,
  validateLaneAgent,
  EVIDENCE_ADAPTERS
} from '../../netlify/functions/_shared/sprint-evidence.mjs';
import {
  formatOpenSprintsForPrompt,
  sprintRosterForPrompt
} from '../../netlify/functions/_shared/sprint-prompt.mjs';
import { executeShortcut } from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { protocolsForSlug } from '../../apps/life/js/app/agent-protocols.js';
import { decideNotifications } from '../../netlify/functions/_shared/day-sense-notify.mjs';
import { createKnowledgeClementineChatHandler } from '../../netlify/functions/knowledge-clementine-chat.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';

const TODAY = '2026-10-04';

function blitzSprint(overrides = {}) {
  return {
    id: 'ch_blitz01',
    title: 'Belly Flab Blitz',
    goal: 'Trim midsection',
    kind: 'sprint',
    status: 'open',
    lead_agent: 'hammond',
    start_date: '2026-10-01',
    end_date: '2026-10-12',
    headline: {
      label: 'Midsection',
      metric: { label: 'Waist', unit: 'cm', direction: 'down', source: 'body.measurements.waist', baseline: 89 },
      secondary: [{ label: 'Hips', unit: 'cm', direction: 'down', source: 'body.measurements.hips' }]
    },
    cadence: defaultCadenceForLength(12),
    lanes: [
      {
        agent: 'brisket',
        role: 'Eating',
        lead_measures: [
          { id: 'protein', label: 'Protein ≥ target', per: 'day', target: 1, evidence: { source: 'nutrition.protein_target_met', target: 140 } },
          { id: 'logged', label: 'All meals logged', per: 'day', target: 1, evidence: { source: 'nutrition.meals_logged', min: 3 } }
        ],
        goal_ids: [],
        task_ids: [],
        status: 'active',
        note: ''
      },
      { agent: 'chadwick', role: 'Training', lead_measures: [{ id: 'wo', label: 'Workout', evidence: { source: 'fitness.workout_completed' } }], goal_ids: [], task_ids: [], status: 'active', note: '' },
      { agent: 'sara', role: 'Tape', lead_measures: [{ id: 'waist', label: 'Waist', evidence: { source: 'body.measurements.waist' } }], goal_ids: [], task_ids: [], status: 'active', note: '' },
      { agent: 'penelope', role: 'Diary', lead_measures: [{ id: 'diary', label: 'Diary', evidence: { source: 'mind.diary_entry' } }], goal_ids: [], task_ids: [], status: 'active', note: '' }
    ],
    checkins: [],
    progress: [],
    ...overrides
  };
}

function doctoralSprint() {
  return {
    id: 'ch_doc01',
    title: 'Doctoral application',
    goal: 'Draft sections',
    kind: 'sprint',
    status: 'open',
    lead_agent: 'clementine',
    start_date: '2026-10-01',
    end_date: '2026-10-21',
    headline: {
      label: 'Sections drafted',
      metric: { label: 'sections drafted', unit: '', direction: 'up', source: 'self_report' }
    },
    cadence: defaultCadenceForLength(21),
    lanes: [
      { agent: 'clementine', role: 'Writing', lead_measures: [{ id: 'pages', label: 'Pages', evidence: { source: 'self_report' } }], goal_ids: [], task_ids: [], status: 'active', note: '' },
      { agent: 'clare', role: 'Tasks', lead_measures: [{ id: 'tasks', label: 'Tasks', evidence: { source: 'self_report' } }], goal_ids: [], task_ids: [], status: 'active', note: '' },
      { agent: 'vera', role: 'Mind', lead_measures: [{ id: 'mind', label: 'Sessions', evidence: { source: 'self_report' } }], goal_ids: [], task_ids: [], status: 'active', note: '' }
    ],
    checkins: [],
    progress: []
  };
}

test('cadence defaults: 12-day daily+weekly+final; 30-day weekly+final; overrides persist', () => {
  const short = defaultCadenceForLength(12);
  assert.equal(short.daily_check, true);
  assert.equal(short.final_review, true);
  assert.equal(short.weekly_review_day, 'sun');
  const mid = defaultCadenceForLength(30);
  assert.equal(mid.daily_check, false);
  assert.equal(mid.final_review, true);
  const resolved = resolveCadence({
    start_date: '2026-10-01',
    end_date: '2026-10-30',
    cadence: { daily_check: true, daily_nudge_time: '18:00' }
  });
  assert.equal(resolved.daily_check, true);
  assert.equal(resolved.daily_nudge_time, '18:00');
});

test('computeSprintState: day N, ended_awaiting_review, unavailable ≠ missed', () => {
  const sprint = blitzSprint();
  const state = computeSprintState(sprint, [], TODAY);
  assert.equal(state.day_n, 4);
  assert.equal(state.length_days, 12);
  assert.equal(state.open, true);
  const ended = computeSprintState(sprint, [], '2026-10-13');
  assert.equal(ended.ended_awaiting_review, true);
  assert.equal(ended.status, 'ended_awaiting_review');

  const throwing = {
    ...EVIDENCE_ADAPTERS,
    'nutrition.protein_target_met'() { throw new Error('boom'); }
  };
  // Direct adapter path
  const bad = runEvidenceAdapter('no.such.source', [], TODAY);
  assert.equal(bad.status, 'unavailable');
  assert.notEqual(bad.status, 'missed');
});

test('protein meal flips Brisket lane met in computeSprintState (same function for prompt+card)', () => {
  const sprint = blitzSprint();
  const records = [
    { type: 'meal', date: '2026-10-02', protein_g: 150, calories: 2000 },
    { type: 'meal', date: '2026-10-02', protein_g: 0, calories: 100 },
    { type: 'meal', date: '2026-10-02', protein_g: 0, calories: 100 },
    { type: 'meal', date: '2026-10-03', protein_g: 150, calories: 2000 },
    { type: 'meal', date: '2026-10-03', protein_g: 0, calories: 100 },
    { type: 'meal', date: '2026-10-03', protein_g: 0, calories: 100 },
    { type: 'meal', date: TODAY, protein_g: 150, calories: 2000 },
    { type: 'meal', date: TODAY, protein_g: 0, calories: 100 },
    { type: 'meal', date: TODAY, protein_g: 0, calories: 100 }
  ];
  const state = computeSprintState(sprint, records, TODAY);
  const brisket = state.lanes.find(l => l.agent === 'brisket');
  assert.ok(brisket);
  const protein = brisket.todayEvidence.find(e => e.id === 'protein');
  assert.equal(protein.status, 'met');
  const prompt = formatOpenSprintsForPrompt([sprint], { slug: 'brisket', today: TODAY, records });
  assert.match(prompt, /YOUR LANE \(Brisket/);
  assert.match(prompt, /Protein/);
  assert.doesNotMatch(prompt, /\bmissed\b/i);
});

test('formatOpenSprintsForPrompt: doctoral Clementine lane + Life prompt inject', () => {
  const sprint = doctoralSprint();
  const block = formatOpenSprintsForPrompt([sprint], { slug: 'clementine', today: TODAY, records: [] });
  assert.match(block, /Doctoral application/);
  // Clementine is lead — sees all lanes in full (brief §2.1)
  assert.match(block, /Clementine · Writing/);
  const system = buildSystemPrompt({
    slug: 'clementine',
    today: TODAY,
    openSprints: block,
    digest: ''
  });
  assert.match(system, /OPEN SPRINT/);
  assert.match(system, /Clementine/);
});

test('validateLaneAgent denies unknown slug', () => {
  const bad = validateLaneAgent('not-an-agent');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Unknown agent/);
  assert.equal(validateLaneAgent('brisket').ok, true);
});

test('sprintRosterForPrompt lists roster from adapters', () => {
  const text = sprintRosterForPrompt();
  assert.match(text, /Brisket/);
  assert.match(text, /nutrition\.protein_target_met/);
  assert.match(text, /Clementine/);
});

test('Hammond sprint check-in pill only when dailyCheckOpen', () => {
  const hidden = protocolsForSlug('hammond', { sprintFlags: { dailyCheckOpen: false, anyOpen: false } });
  assert.ok(!hidden.pills.some(p => p.id === 'sprint-checkin'));
  const shown = protocolsForSlug('hammond', { sprintFlags: { dailyCheckOpen: true, anyOpen: true } });
  assert.ok(shown.pills.some(p => p.id === 'sprint-checkin'));
  assert.match(shown.pills.find(p => p.id === 'weekly-review').steer, /sprint/i);
});

test('sprint nudge fires in Sydney window, skips after check-in, no AI in decide path', () => {
  const sprint = blitzSprint({
    cadence: { ...defaultCadenceForLength(12), daily_nudge_time: '19:30' }
  });
  const nudges = decideSprintNudges({
    sprints: [sprint],
    records: [],
    today: TODAY,
    nowHour: 19.6,
    log: { sent: {} }
  });
  assert.equal(nudges.length, 1);
  assert.match(nudges[0].key, /^sprint-daily-/);
  assert.match(nudges[0].url, /protocol=sprint-checkin/);
  const after = decideSprintNudges({
    sprints: [{ ...sprint, checkins: [{ date: TODAY, kind: 'daily', by: 'hammond', lanes: {} }] }],
    records: [],
    today: TODAY,
    nowHour: 19.6,
    log: { sent: {} }
  });
  assert.equal(after.length, 0);
  const merged = decideNotifications({
    today: TODAY,
    nowHour: 19.6,
    med: null,
    schoolDay: false,
    leave: 16,
    reviewDone: true,
    log: { sent: {} },
    sprintNudges: nudges
  });
  assert.equal(merged[0].key, nudges[0].key);
});

function mockCtx(agentSlug = 'hammond') {
  const blobs = new Map();
  const tree = [];
  const writes = [];
  const client = {
    async writeFile({ path, content, message, sha }) {
      const nextSha = `sha_${blobs.size + 1}`;
      blobs.set(nextSha, content);
      const existing = tree.find(item => item.path === path);
      if (existing) existing.sha = nextSha;
      else tree.push({ path, type: 'blob', sha: nextSha });
      writes.push({ path, content, message, sha });
      return { sha: nextSha, path };
    },
    async resolveTree() { return { tree }; },
    async readBlob(sha) { return blobs.get(sha); }
  };
  return {
    writes,
    ctx: {
      agentSlug,
      today: TODAY,
      client,
      repoTree: tree,
      readBlob: async (sha) => blobs.get(sha)
    },
    seed(path, obj) {
      const sha = `seed_${path}`;
      blobs.set(sha, `${JSON.stringify(obj, null, 2)}\n`);
      tree.push({ path, type: 'blob', sha });
    }
  };
}

test('track_open_sprint Confirm + Phase-0 upgrade keeps id and progress', async () => {
  const { ctx, seed } = mockCtx('hammond');
  const existing = {
    id: 'ch_phase0',
    title: 'Belly Flab Blitz',
    goal: 'Trim',
    start_date: '2026-10-01',
    end_date: '2026-10-12',
    status: 'open',
    progress: [{ date: '2026-10-01', entry: 'opened', agent_id: 'hammond' }],
    owner_agent: 'hammond'
  };
  seed('data/challenges/2026-10-01-belly-flab-blitz.json', existing);
  const result = await executeShortcut('track_open_sprint', {
    challenge_id: 'ch_phase0',
    title: 'Belly Flab Blitz',
    goal: 'Trim midsection',
    lanes: [
      { agent: 'brisket', role: 'Eating', lead_measures: [{ id: 'p', label: 'Protein', evidence: { source: 'self_report' } }] },
      { agent: 'chadwick', role: 'Training', lead_measures: [{ id: 'w', label: 'Workout', evidence: { source: 'fitness.workout_completed' } }] }
    ],
    headline: { label: 'Midsection', metric: { label: 'Waist', unit: 'cm', direction: 'down', source: 'body.measurements.waist' } }
  }, ctx);
  assert.equal(result.kind, 'propose');
  const validated = validateProposeActionInput(result.proposal, { agentSlug: 'hammond' });
  assert.equal(validated.ok, true);
  const body = JSON.parse(result.proposal.writes[0].content);
  assert.equal(body.id, 'ch_phase0');
  assert.equal(body.kind, 'sprint');
  assert.equal(body.progress.length, 1);
  assert.equal(body.lanes.length, 2);
});

test('track_checkin_lane: own lane ok; other agent denied', async () => {
  const { ctx, seed } = mockCtx('brisket');
  seed('data/challenges/2026-10-01-belly-flab-blitz.json', blitzSprint());
  const ok = await executeShortcut('track_checkin_lane', {
    challenge_id: 'ch_blitz01',
    status: 'on_track',
    note: 'protein hit'
  }, ctx);
  assert.equal(ok.kind, 'ok');

  const { ctx: chad } = mockCtx('chadwick');
  // reuse tree by seeding again
  const mock = mockCtx('chadwick');
  mock.seed('data/challenges/2026-10-01-belly-flab-blitz.json', blitzSprint());
  // Chadwick trying to write Brisket's lane — tool writes own lane only; chadwick has a lane so ok on own
  const own = await executeShortcut('track_checkin_lane', {
    challenge_id: 'ch_blitz01',
    status: 'stalled',
    note: 'skipped'
  }, mock.ctx);
  assert.equal(own.kind, 'ok');

  const stranger = mockCtx('ann');
  stranger.seed('data/challenges/2026-10-01-belly-flab-blitz.json', blitzSprint());
  const denied = await executeShortcut('track_checkin_lane', {
    challenge_id: 'ch_blitz01',
    status: 'on_track'
  }, stranger.ctx);
  assert.equal(denied.kind, 'error');
  assert.match(denied.error, /own a lane|own lane/i);
});

test('track_open_sprint denies unknown lane agent', async () => {
  const { ctx } = mockCtx('hammond');
  const result = await executeShortcut('track_open_sprint', {
    title: 'X',
    goal: 'Y',
    lanes: [{ agent: 'ghost', role: 'Nope', lead_measures: [] }]
  }, ctx);
  assert.equal(result.kind, 'error');
  assert.match(result.error, /Unknown agent/);
});

test('Knowledge Clementine handler injects sprint lane and runs track_checkin_lane (W2)', async () => {
  const sprint = doctoralSprint();
  const openSprintsText = formatOpenSprintsForPrompt([sprint], { slug: 'clementine', today: TODAY, records: [] });
  let capturedSystem = '';
  const secret = 's'.repeat(32);
  const token = createSessionToken({
    now: Date.parse('2026-10-04T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 9)
  }, secret).token;
  const testEnv = {
    LIFE_HUB_PASSPHRASE_HASH: 'configured',
    SESSION_SECRET: secret,
    SITE_ORIGIN: 'https://life.example',
    RESEARCH_KERNEL_URL: 'https://example.invalid',
    RESEARCH_KERNEL_SHARED_SECRET: 'x'
  };
  const handler = createKnowledgeClementineChatHandler({
    env: testEnv,
    openSprintsText,
    cwd: process.cwd(),
    runSprintTool: async (name, input, meta) => {
      assert.equal(name, 'track_checkin_lane');
      assert.equal(meta.agentSlug, 'clementine');
      return { kind: 'ok', message: 'Lane check-in saved', challenge_id: input.challenge_id };
    },
    write: {
      start: async (input) => {
        capturedSystem = input.system || '';
        return { status: 'done', reply: 'ok' };
      },
      poll: async () => null
    },
    archivePull: async () => ({ findings: [], gaps: [] })
  });

  const toolRes = await handler(new Request('https://life.example/api/knowledge/clementine-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `life_hub_session=${token}`,
      origin: 'https://life.example'
    },
    body: JSON.stringify({
      hat: 'scoping',
      messages: [{ role: 'user', content: 'update my lane' }],
      sprint_tool: { name: 'track_checkin_lane', input: { challenge_id: 'ch_doc01', status: 'on_track' } }
    })
  }), { env: testEnv });
  assert.equal(toolRes.status, 200);
  const toolBody = await toolRes.json();
  const sprintTool = toolBody.data?.sprint_tool ?? toolBody.sprint_tool;
  assert.equal(sprintTool?.kind, 'ok');

  const chatRes = await handler(new Request('https://life.example/api/knowledge/clementine-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `life_hub_session=${token}`,
      origin: 'https://life.example'
    },
    body: JSON.stringify({
      hat: 'scoping',
      messages: [{ role: 'user', content: 'how is the sprint' }],
      compose: true
    })
  }), { env: testEnv });
  assert.equal(chatRes.status, 200);
  assert.match(capturedSystem, /OPEN SPRINT/);
  assert.match(capturedSystem, /Clementine/);
});
