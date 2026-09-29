import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingProposal,
  buildEventProposal,
  proposeMeetingSchema,
  proposeEventSchema
} from '../../netlify/functions/_shared/meeting-event-agent.mjs';
import {
  buildApplicationProposal,
  buildFutureProposal
} from '../../netlify/functions/_shared/career-agent.mjs';
import {
  buildTieDecisionProposal,
  proposeTieDecisionSchema
} from '../../netlify/functions/_shared/tie-decision-agent.mjs';
import {
  classifyWriteTarget,
  validateProposeActionInput,
  executeProposeActionWrites
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { acceptPlan, validateGhost, GHOST_KINDS } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { applyProfessionalStep } from '../../netlify/functions/calendar-ghosts.mjs';

test('meeting/event/tie/career tools are offered to Clare, Hammond and Ann', () => {
  resetCapabilityCaches();
  for (const slug of ['clare', 'hammond', 'ann']) {
    const ids = capabilityIdsForAgent(slug);
    assert.ok(ids.includes('professional.propose-meeting'), slug);
    assert.ok(ids.includes('professional.propose-event'), slug);
    assert.ok(ids.includes('people.propose-tie-decision'), slug);
    assert.ok(ids.includes('career.propose-application'), slug);
    assert.ok(ids.includes('career.propose-future'), slug);
    const names = buildAgentTools({ slug }).map(tool => tool.name);
    assert.ok(names.includes('propose_meeting'), slug);
    assert.ok(names.includes('propose_event'), slug);
    assert.ok(names.includes('propose_tie_decision'), slug);
    assert.ok(names.includes('propose_application'), slug);
    assert.ok(names.includes('propose_future'), slug);
    assert.equal(isPathAllowedForAgent(slug, 'professional:meeting:new-x', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'professional:tie:lp_1', { mode: 'write' }), true, slug);
  }
  assert.equal(proposeMeetingSchema().name, 'propose_meeting');
  assert.equal(proposeEventSchema().name, 'propose_event');
  assert.equal(proposeTieDecisionSchema().name, 'propose_tie_decision');
});

test('classifyWriteTarget recognises professional meeting/event/tie/career paths', () => {
  assert.deepEqual(classifyWriteTarget('professional:meeting:new-sync'), {
    store: 'professional', kind: 'meeting', id: 'new-sync', path: 'professional:meeting:new-sync'
  });
  assert.equal(classifyWriteTarget('professional:event:new-pd').kind, 'event');
  assert.equal(classifyWriteTarget('professional:application:new-job').kind, 'application');
  assert.equal(classifyWriteTarget('professional:future:new-role').kind, 'future');
  assert.equal(classifyWriteTarget('professional:tie:prop_abc').kind, 'tie');
  assert.equal(classifyWriteTarget('professional:mystery:x').store, 'unknown');
});

test('buildMeetingProposal yields Confirm write and timed ghost input', () => {
  const built = buildMeetingProposal({
    summary: 'Catch-up with Jo',
    title: 'Jo sync',
    scheduled_start: '2026-10-08T10:00',
    scheduled_end: '2026-10-08T10:30',
    attendee_refs: ['shared:person:person_11111111-1111-1111-1111-111111111111'],
    key: 'jo'
  });
  assert.equal(built.ok, true);
  assert.equal(built.proposal.writes[0].path, 'professional:meeting:new-jo');
  assert.equal(built.ghostInput.kind, 'pro_meeting');
  assert.equal(built.ghostInput.date, '2026-10-08');
  assert.equal(built.ghostInput.start, '10:00');
  const validated = validateProposeActionInput(built.proposal, { agentSlug: 'clare' });
  assert.equal(validated.ok, true);
});

test('buildEventProposal / application / future / tie proposals validate', () => {
  const event = buildEventProposal({
    summary: 'PD day',
    title: 'Curriculum workshop',
    start: '2026-10-09T09:00',
    end: '2026-10-09T15:00',
    key: 'pd1'
  });
  assert.equal(event.ok, true);
  assert.equal(event.ghostInput.kind, 'pro_event');
  assert.equal(validateProposeActionInput(event.proposal, { agentSlug: 'ann' }).ok, true);

  const app = buildApplicationProposal({
    summary: 'Apply to Example College',
    position_title: 'Head of English',
    advertisement: { title: 'HoE', url: 'https://example.edu/job' },
    organisation_ref: 'shared:organisation:organisation_33333333-3333-3333-3333-333333333333',
    key: 'hoe'
  });
  assert.equal(app.ok, true);
  assert.equal(validateProposeActionInput(app.proposal, { agentSlug: 'hammond' }).ok, true);

  const future = buildFutureProposal({
    summary: 'Track deputy role',
    title: 'Deputy Principal',
    where: 'NSW DoE',
    key: 'dp'
  });
  assert.equal(future.ok, true);
  assert.equal(validateProposeActionInput(future.proposal, { agentSlug: 'clare' }).ok, true);

  const ties = buildTieDecisionProposal({
    summary: 'Accept Jo↔Sam colleague',
    decisions: [{ proposal_id: 'lp_abc123', action: 'accept', role: 'colleague' }]
  });
  assert.equal(ties.ok, true);
  assert.equal(ties.proposal.writes[0].path, 'professional:tie:lp_abc123');
  assert.equal(validateProposeActionInput(ties.proposal, { agentSlug: 'ann' }).ok, true);
});

test('pro_meeting and pro_event ghosts are registered and Accept plan creates professional steps', () => {
  assert.ok(GHOST_KINDS.includes('pro_meeting'));
  assert.ok(GHOST_KINDS.includes('pro_event'));
  const meetingGhost = {
    id: 'clare-pro_meeting-2026-10-08',
    agent: 'clare',
    kind: 'pro_meeting',
    date: '2026-10-08',
    start: '10:00',
    end: '10:30',
    title: 'Jo sync',
    scheduled_start: '2026-10-07T23:00:00.000Z',
    scheduled_end: '2026-10-07T23:30:00.000Z',
    attendee_refs: ['shared:person:p1']
  };
  validateGhost(meetingGhost);
  const plan = acceptPlan(meetingGhost, { today: '2026-10-01' });
  const step = plan.steps.find(s => s.target === 'professional');
  assert.equal(step.action, 'create_meeting');
  assert.equal(step.title, 'Jo sync');
});

test('applyProfessionalStep create_meeting / create_event call injected deps', async () => {
  const calls = [];
  await applyProfessionalStep({
    createMeeting: async (input) => {
      calls.push(['meeting', input]);
      return { meeting: { id: 'meeting_x', title: input.title } };
    }
  }, {
    action: 'create_meeting',
    title: 'Sync',
    date: '2026-10-08',
    start: '10:00',
    end: '10:30',
    time_zone: 'Australia/Sydney',
    scheduled_start: '2026-10-07T23:00:00.000Z',
    scheduled_end: '2026-10-07T23:30:00.000Z',
    attendee_refs: ['shared:person:p1']
  });
  await applyProfessionalStep({
    createEvent: async (input) => {
      calls.push(['event', input]);
      return { event: { id: 'event_x', title: input.title } };
    }
  }, {
    action: 'create_event',
    title: 'PD',
    date: '2026-10-09',
    start: '09:00',
    end: '15:00',
    time_zone: 'Australia/Sydney',
    start_iso: '2026-10-08T22:00:00.000Z',
    end_iso: '2026-10-09T04:00:00.000Z',
    event_type: 'professional_development',
    attendee_refs: []
  });
  assert.equal(calls[0][0], 'meeting');
  assert.equal(calls[0][1].title, 'Sync');
  assert.equal(calls[0][1].links[0].relationship_type, 'attendee');
  assert.equal(calls[1][0], 'event');
  assert.equal(calls[1][1].event_type, 'professional_development');
});

test('executeProposeActionWrites routes professional:future through executor', async () => {
  const created = [];
  const executor = {
    async apply(write, target) {
      created.push({ path: write.path, kind: target.kind, body: JSON.parse(write.content) });
      return { ok: true, result: { path: write.path, mode: 'create', id: 'future_1' } };
    }
  };
  const built = buildFutureProposal({ summary: 'Track role', title: 'Deputy', key: 'dp' });
  const applied = await executeProposeActionWrites({}, built.proposal, {
    blobStores: { professional: executor }
  });
  assert.equal(applied.ok, true);
  assert.equal(created[0].kind, 'future');
  assert.equal(created[0].body.title, 'Deputy');
});
