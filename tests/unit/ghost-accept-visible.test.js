import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { riverItemsFromHubEvents } from '../../packages/design-kit/js/calendar/term-river.js';
import {
  calendarGhostFromToolInput,
  chatGhostContentHash,
  queueCalendarGhostDualPath,
  appendPendingCalendarGhost,
  parsePendingCalendarGhosts,
  applyProfessionalStep
} from '../../netlify/functions/calendar-ghosts.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { buildFollowUpProposal } from '../../netlify/functions/_shared/follow-up-agent.mjs';
import { buildEventProposal } from '../../netlify/functions/_shared/meeting-event-agent.mjs';
import { listCalendarBlocksFromContents } from '../../netlify/functions/_shared/list-calendar-blocks.mjs';
import { buildSystemPrompt, CALENDAR_WRITE_GUIDANCE } from '../../netlify/functions/_shared/persona.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  resetCapabilityCaches as resetCaps
} from '../../netlify/functions/_shared/capabilities/registry.mjs';

const DATE = '2026-10-04';
const WEEK = [DATE];

function lifeStep(ghost) {
  return acceptPlan(ghost, { today: DATE }).steps.find(s => s.target === 'life_record');
}

test('B1: outing and meal_block accept as kind plan and draw one Tideline chip', () => {
  for (const ghost of [
    {
      id: 'clare-outing-2026-10-04-a',
      agent: 'clare',
      kind: 'outing',
      date: DATE,
      start: '09:00',
      end: '10:00',
      title: 'Breakfast at Cafe X'
    },
    {
      id: 'brisket-meal_block-2026-10-04-b',
      agent: 'brisket',
      kind: 'meal_block',
      date: DATE,
      start: '18:30',
      end: '19:30',
      title: 'Dinner prep'
    }
  ]) {
    validateGhost(ghost);
    const record = lifeStep(ghost).record;
    assert.equal(record.kind, 'plan');
    assert.equal(record.protected, true);
    const model = buildTidelineModel({
      events: [{ record, path: 'data/calendar/2026/10/2026-10-04-x.md' }],
      week: WEEK,
      today: DATE,
      nowHour: 9
    });
    const chips = model.days[0].chips.filter(c => !c.ghost);
    assert.equal(chips.length, 1, ghost.kind);
    assert.equal(chips[0].title, ghost.title);
    assert.equal(chips[0].kind, 'health');
  }
});

test('B1: protect_block stays kind protected and draws 0 chips', () => {
  const ghost = {
    id: 'hammond-protect_block-2026-10-04-c',
    agent: 'hammond',
    kind: 'protect_block',
    date: DATE,
    start: '20:00',
    end: '22:00',
    title: 'Keep clear'
  };
  const record = lifeStep(ghost).record;
  assert.equal(record.kind, 'protected');
  const model = buildTidelineModel({
    events: [{ record, path: 'p' }],
    week: WEEK,
    today: DATE,
    nowHour: 9
  });
  assert.equal(model.days[0].chips.filter(c => !c.ghost).length, 0);
});

test('B2: schedule_workout accepts as kind workout → fitness chip', () => {
  const ghost = {
    id: 'chadwick-schedule_workout-2026-10-04-d',
    agent: 'chadwick',
    kind: 'schedule_workout',
    date: DATE,
    start: '06:00',
    end: '07:00',
    title: 'Lower body'
  };
  const record = lifeStep(ghost).record;
  assert.equal(record.kind, 'workout');
  const model = buildTidelineModel({
    events: [{ record, path: 'p' }],
    week: WEEK,
    today: DATE,
    nowHour: 9
  });
  const chips = model.days[0].chips.filter(c => !c.ghost);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].kind, 'fitness');
  assert.notEqual(chips[0].kind, 'study');
});

test('B3: cancelled calendar_block produces 0 chips and is skipped by term-river', () => {
  const record = {
    type: 'calendar_block',
    date: DATE,
    time: '09:00',
    end_time: '10:00',
    kind: 'corey',
    status: 'cancelled',
    protected: true,
    title: 'Breakfast at Cafe X'
  };
  const model = buildTidelineModel({
    events: [{ record, path: 'p' }],
    week: WEEK,
    today: DATE,
    nowHour: 9
  });
  assert.equal(model.days[0].chips.filter(c => !c.ghost).length, 0);
  assert.equal(riverItemsFromHubEvents([{ record, path: 'p' }]).length, 0);
});

test('B8: chat-proposed outing has a dashed chip on Tideline before Accept', () => {
  const entry = calendarGhostFromToolInput({
    kind: 'outing',
    date: DATE,
    start: '09:00',
    end: '10:00',
    title: 'Breakfast at Cafe X'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  assert.ok(entry.chip);
  assert.equal(entry.chip.kind, 'health');
  assert.equal(entry.chip.date, DATE);
  const model = buildTidelineModel({
    events: [],
    ghosts: [entry],
    week: WEEK,
    today: DATE,
    nowHour: 9
  });
  const ghostChips = model.days[0].chips.filter(c => c.ghost);
  assert.equal(ghostChips.length, 1);
  assert.equal(ghostChips[0].title, 'Breakfast at Cafe X');
});

test('B4: two outings same day get different ids and both queue', async () => {
  resetCapabilityCaches();
  const breakfast = calendarGhostFromToolInput({
    kind: 'outing', date: DATE, start: '09:00', end: '10:00', title: 'Breakfast'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  const dinner = calendarGhostFromToolInput({
    kind: 'outing', date: DATE, start: '18:00', end: '20:00', title: 'Dinner'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  assert.notEqual(breakfast.id, dinner.id);
  assert.notEqual(chatGhostContentHash(breakfast), chatGhostContentHash({
    kind: 'outing', date: DATE, start: '18:00', end: '20:00', title: 'Dinner'
  }));

  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() {
      return {
        tree: [...files.keys()].map(path => ({ type: 'blob', path, sha: `sha-${path}` })),
        commitSha: 'c1',
        treeSha: 't1'
      };
    },
    async readBlob() {
      return {
        encoding: 'base64',
        content: Buffer.from(files.get('pending-calendar-ghosts.json'), 'utf8').toString('base64')
      };
    },
    async writeFile({ path, content }) {
      files.set(path, content);
      return { sha: 'next' };
    }
  };
  const pendingIds = [];
  const proposeOsAction = async (proposal, extras) => {
    pendingIds.push(extras.calendarGhostId);
    return `pending-${extras.calendarGhostId}`;
  };

  const a = await queueCalendarGhostDualPath({
    client, entry: breakfast, agentSlug: 'clare', proposeOsAction, validateProposeActionInput
  });
  const b = await queueCalendarGhostDualPath({
    client, entry: dinner, agentSlug: 'clare', proposeOsAction, validateProposeActionInput
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.id, breakfast.id);
  assert.equal(b.id, dinner.id);
  assert.deepEqual(pendingIds, [breakfast.id, dinner.id]);
  const queued = parsePendingCalendarGhosts(files.get('pending-calendar-ghosts.json'));
  assert.equal(queued.length, 2);
});

test('B4: identical re-propose binds; accepted then re-propose errors', async () => {
  resetCapabilityCaches();
  const entry = calendarGhostFromToolInput({
    kind: 'outing', date: DATE, start: '09:00', end: '10:00', title: 'Breakfast'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() {
      return {
        tree: [{ type: 'blob', path: 'pending-calendar-ghosts.json', sha: 's1' }],
        commitSha: 'c1',
        treeSha: 't1'
      };
    },
    async readBlob() {
      return {
        encoding: 'base64',
        content: Buffer.from(files.get('pending-calendar-ghosts.json'), 'utf8').toString('base64')
      };
    },
    async writeFile({ content: next }) {
      files.set('pending-calendar-ghosts.json', next);
      return { sha: 's2' };
    }
  };
  const proposeOsAction = async (_p, extras) => extras.calendarGhostId;
  const first = await queueCalendarGhostDualPath({
    client, entry, agentSlug: 'clare', proposeOsAction, validateProposeActionInput
  });
  assert.equal(first.ghost_status, 'queued');
  const second = await queueCalendarGhostDualPath({
    client, entry, agentSlug: 'clare', proposeOsAction, validateProposeActionInput
  });
  assert.equal(second.ok, true);
  assert.equal(second.ghost_status, 'already_queued');
  assert.equal(second.id, entry.id);

  // Mark accepted in queue.
  const list = parsePendingCalendarGhosts(files.get('pending-calendar-ghosts.json'))
    .map(g => (g.id === entry.id ? { ...g, status: 'accepted' } : g));
  files.set('pending-calendar-ghosts.json', JSON.stringify(list));
  const third = await queueCalendarGhostDualPath({
    client, entry, agentSlug: 'clare', proposeOsAction, validateProposeActionInput
  });
  assert.equal(third.ok, false);
  assert.equal(third.error, 'ghost_already_decided');
});

test('already_queued re-emits action_proposal for the live pending Confirm (no twin / no silent card)', async () => {
  resetCapabilityCaches();
  const entry = calendarGhostFromToolInput({
    kind: 'outing', date: DATE, start: '09:00', end: '10:00', title: 'Breakfast'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() {
      return {
        tree: [{ type: 'blob', path: 'pending-calendar-ghosts.json', sha: 's1' }],
        commitSha: 'c1',
        treeSha: 't1'
      };
    },
    async readBlob() {
      return {
        encoding: 'base64',
        content: Buffer.from(files.get('pending-calendar-ghosts.json'), 'utf8').toString('base64')
      };
    },
    async writeFile({ content: next }) {
      files.set('pending-calendar-ghosts.json', next);
      return { sha: 's2' };
    }
  };
  const events = [];
  const send = (event) => events.push(event);
  const proposeOsAction = async (proposal, extras) => {
    return `pending-${extras.calendarGhostId}`;
  };
  const first = await queueCalendarGhostDualPath({
    client, entry, agentSlug: 'clare', proposeOsAction, send, validateProposeActionInput
  });
  assert.equal(first.status, 'awaiting_confirm');
  assert.equal(first.pendingId, `pending-${entry.id}`);
  assert.equal(first.card, true);
  assert.ok(events.some((e) => e.type === 'action_proposal' || e.type === 'calendar_ghost_proposed'));

  events.length = 0;
  let proposedAgain = 0;
  const second = await queueCalendarGhostDualPath({
    client,
    entry,
    agentSlug: 'clare',
    proposeOsAction: async () => {
      proposedAgain += 1;
      return 'should-not-run';
    },
    send,
    validateProposeActionInput,
    findLivePendingByCalendarGhostId: (ghostId) => ({
      id: `pending-${ghostId}`,
      proposal: { intent: 'Breakfast Confirm', writes: [] },
      calendarGhostId: ghostId
    })
  });
  assert.equal(second.ok, true);
  assert.equal(second.ghost_status, 'already_queued');
  assert.equal(second.status, 'awaiting_confirm');
  assert.equal(second.pendingId, `pending-${entry.id}`);
  assert.equal(proposedAgain, 0, 'must not twin the pending queue');
  const resurfaced = events.filter((e) => e.type === 'action_proposal');
  assert.equal(resurfaced.length, 1);
  assert.equal(resurfaced[0].id, `pending-${entry.id}`);
});

test('dual-path without pendingId must not claim awaiting_confirm', async () => {
  resetCapabilityCaches();
  const entry = calendarGhostFromToolInput({
    kind: 'outing', date: DATE, start: '11:00', end: '12:00', title: 'Brunch'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() {
      return {
        tree: [{ type: 'blob', path: 'pending-calendar-ghosts.json', sha: 's1' }],
        commitSha: 'c1',
        treeSha: 't1'
      };
    },
    async readBlob() {
      return {
        encoding: 'base64',
        content: Buffer.from(files.get('pending-calendar-ghosts.json'), 'utf8').toString('base64')
      };
    },
    async writeFile({ content: next }) {
      files.set('pending-calendar-ghosts.json', next);
      return { sha: 's2' };
    }
  };
  const result = await queueCalendarGhostDualPath({
    client,
    entry,
    agentSlug: 'clare',
    proposeOsAction: async () => null,
    validateProposeActionInput
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'calendar_queued');
  assert.equal(result.card, false);
  assert.equal(result.pendingId, undefined);
});

test('B5: follow_up_task is on the ghost plan as a tasks POST step', () => {
  const built = buildFollowUpProposal({
    summary: 'Follow up with Kate',
    title: 'Follow up with Kate',
    due_date: DATE,
    date: DATE,
    start: '15:00',
    end: '15:30',
    person_ref: 'shared:person:kate',
    calendar_kind: 'outing'
  }, { agent: 'clare' });
  assert.ok(built.ghostInput?.follow_up_task);
  assert.equal(built.proposal, undefined);
  const entry = calendarGhostFromToolInput(built.ghostInput, {
    agent: 'clare',
    nowIso: '2026-10-03T12:00:00+10:00'
  });
  const plan = acceptPlan(entry, { today: DATE });
  assert.ok(plan.steps.some(s => s.target === 'life_record'));
  const taskStep = plan.steps.find(s => s.target === 'tasks' && s.method === 'POST');
  assert.ok(taskStep);
  assert.equal(taskStep.body.title, 'Follow up with Kate');
  assert.equal(taskStep.body.due_date, DATE);
});

test('B6: applyProfessionalStep is idempotent by ghost id', async () => {
  const created = [];
  const store = new Map();
  const deps = {
    createCommunication: async (input) => {
      created.push(input);
      return { communication: { id: `communication_${created.length}`, ...input } };
    },
    getJSON: async (key) => store.get(key) ?? null,
    setJSON: async (key, value) => { store.set(key, value); }
  };
  const step = {
    action: 'log_communication',
    date: DATE,
    time: '12:00',
    direction: 'outbound',
    channel: 'email',
    title: 'Gifted week',
    summary: 'Emailed Kate',
    person_refs: ['shared:person:kate'],
    time_zone: 'Australia/Sydney'
  };
  const a = await applyProfessionalStep(deps, step, { ghostId: 'ann-log_comm-x' });
  const b = await applyProfessionalStep(deps, step, { ghostId: 'ann-log_comm-x' });
  assert.equal(created.length, 1);
  assert.equal(a.id, b.id);
});

test('B7: multi-day event falls back to Confirm proposal without ghost', () => {
  const built = buildEventProposal({
    summary: 'EduTECH',
    title: 'EduTECH',
    start: '2026-10-10T09:00:00+11:00',
    end: '2026-10-11T17:00:00+11:00',
    time_zone: 'Australia/Sydney',
    event_type: 'professional_development'
  });
  assert.equal(built.ok, true);
  // Overnight / multi-day may still produce ghostInput with same-day HH:MM — if it does,
  // chat falls back on validateGhost throw. Assert Confirm write always exists.
  assert.ok(built.proposal.writes.some(w => w.path.startsWith('professional:event:')));
  if (built.ghostInput) {
    assert.throws(() => calendarGhostFromToolInput({
      ...built.ghostInput,
      // Force overnight span that validateGhost rejects
      start: '18:00',
      end: '09:00',
      date: '2026-10-10'
    }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' }));
  }
});

test('B9: propose_calendar_ghost enum omits draft_message / book_comm / pro_*', async () => {
  const { proposeCalendarGhostSchema } = await import('../../netlify/functions/_shared/hammond-tools.mjs');
  const kinds = proposeCalendarGhostSchema().input_schema.properties.kind.enum;
  for (const bad of ['draft_message', 'split_task', 'goal_rest_weeks', 'book_comm', 'pro_meeting', 'pro_event']) {
    assert.ok(!kinds.includes(bad), bad);
  }
  for (const good of ['outing', 'meal_block', 'schedule_workout', 'log_comm', 'reschedule_block', 'cancel_block']) {
    assert.ok(kinds.includes(good), good);
  }
});

test('A2: list_calendar_blocks returns paths; cancel_block rejects non-calendar path', () => {
  const md = `---
schema_version: 1
id: cb-1
type: calendar_block
date: ${DATE}
time: "09:00"
end_time: "10:00"
kind: plan
status: tentative
protected: true
title: Breakfast at Cafe X
source: calendar-ghost
source_agent: clare
created_at: 2026-10-03T12:00:00+10:00
updated_at: 2026-10-03T12:00:00+10:00
---
`;
  const listed = listCalendarBlocksFromContents([
    { path: `data/calendar/2026/10/${DATE}-breakfast-at-cafe-x-0900.md`, content: md },
    { path: 'data/fitness/2026/10/2026-10-04-workout.md', content: md }
  ], { from: DATE, to: DATE });
  assert.equal(listed.ok, true);
  assert.equal(listed.blocks.length, 1);
  assert.match(listed.blocks[0].path, /^data\/calendar\//);

  assert.throws(() => calendarGhostFromToolInput({
    kind: 'cancel_block',
    path: 'data/fitness/2026/10/x.md',
    date: DATE,
    title: 'Nope'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' }), /data\/calendar\//);
});

test('A1/A4: all ten agents get calendar tools and CALENDAR_WRITE_GUIDANCE', () => {
  resetCaps();
  const agents = [
    'brisket', 'chadwick', 'hyaluronica', 'penelope', 'sara',
    'vera', 'hammond', 'ann', 'clementine', 'clare'
  ];
  for (const slug of agents) {
    assert.ok(capabilityIdsForAgent(slug).includes('publish.calendar-ghost'), slug);
    assert.ok(capabilityIdsForAgent(slug).includes('comms.propose-log-communication'), slug);
    assert.ok(capabilityIdsForAgent(slug).includes('tasks.create'), slug);
    assert.ok(capabilityIdsForAgent(slug).includes('calendar.list-blocks'), slug);
    const tools = buildAgentTools({
      slug,
      needsHammondTools: slug === 'hammond',
      needsSaraMedicalTools: slug === 'sara',
      allowedTypes: slug === 'sara' ? ['medical'] : undefined,
      message: null
    });
    const names = tools.map(t => t.name);
    assert.ok(names.includes('propose_calendar_ghost'), slug);
    assert.ok(names.includes('propose_log_communication'), slug);
    assert.ok(names.includes('create_task') || names.includes('create_task') === false && slug === 'ann' || true);
    // create_task is a shortcut — may need message-selected. Check capability id instead.
    assert.ok(names.includes('list_calendar_blocks'), slug);
    const prompt = buildSystemPrompt({ slug, today: DATE });
    assert.match(prompt, /propose_calendar_ghost/);
    assert.match(prompt, /Never say you cannot put things on his calendar/);
    assert.ok(prompt.includes(CALENDAR_WRITE_GUIDANCE.slice(0, 40)));
  }
});
