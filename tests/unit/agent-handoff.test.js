/**
 * Phase 4 Hammond supervisor: handoff contracts, verification, Delivery.
 * Pack/kernel layer. Not a live conversational behaviour suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import {
  collectSpecialistReturn,
  createHandoffRequest,
  hammondShouldSupervise,
  selectHammondDelegates,
  verifyHandoff
} from '../../netlify/functions/_shared/agent-handoff.mjs';
import {
  agentKernelEnabled,
  planTurn,
  proposeAction,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';
import { runSurfaceAgentTurn } from '../../netlify/functions/_shared/agent-surface.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const HAMMOND = [
  'what is slipping across my life',
  "what's slipping",
  'cross hub status',
  'what should I pay attention to',
  'mission status',
  'coordinate this week',
  'open loops across life',
  "what's colliding",
  'life picture',
  "what's stalled",
  'priority check across life',
  "what's falling through",
  'give me the life status',
  'triage my week',
  "what's going on across the hubs",
  'sunday review',
  'weekly review please',
  'what needs attention',
  'hub supervision check',
  'what is slipping across the hubs'
];

function hitRate(messages) {
  return messages.filter(message => planTurn({ slug: 'hammond', message }).plan.workflow === 'cross_hub_supervision').length
    / messages.length;
}

test('Hammond is kernel-enabled on the flagged path', () => {
  assert.equal(agentKernelEnabled({ slug: 'hammond', flag: true }), true);
  assert.equal(agentKernelEnabled({ slug: 'hammond', env: {} }), false);
});

test('Hammond paraphrases select cross_hub_supervision (≥95% of 20)', () => {
  assert.equal(HAMMOND.length, 20);
  const rate = hitRate(HAMMOND);
  assert.ok(rate >= 0.95, `only ${Math.round(rate * 20)}/20`);
});

test('Hammond greetings stay workflow none', () => {
  assert.equal(planTurn({ slug: 'hammond', message: 'hey' }).plan.workflow, 'none');
  assert.equal(hammondShouldSupervise('hey'), false);
});

test('missing specialist return stays open, not complete', () => {
  const request = createHandoffRequest({ to: 'clare' });
  const open = verifyHandoff(request, null);
  assert.equal(open.status, 'open');
  assert.equal(open.reason, 'specialist_did_not_run');
  const empty = verifyHandoff(request, collectSpecialistReturn({ slug: 'clare', plan: { workflow: 'none' }, evidence: {} }));
  assert.equal(empty.status, 'open');
});

test('Hammond delegates and verifies Clare from a slipping ask', () => {
  const kernel = runAgentKernel({
    slug: 'hammond',
    message: 'what is slipping across my life',
    today: TODAY,
    now: NOW,
    stores: {
      tasks: [
        { id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10', domain: 'teaching', priority: 'high' }
      ],
      projects: [{ id: 'p1', title: 'Term 3 marking', status: 'open' }],
      workouts: [],
      meals: [],
      lessons: []
    }
  });
  assert.equal(kernel.plan.workflow, 'cross_hub_supervision');
  assert.ok(kernel.evidence.inspect_hub_signals);
  assert.ok(kernel.evidence.get_hammond_attention_pack);
  const clare = kernel.handoffs.find(item => item.to === 'clare');
  assert.ok(clare, 'clare handoff missing');
  assert.equal(clare.status, 'verified');
  assert.ok(clare.result.sourcesInspected.includes('get_tasks_focus'));
  assert.match(kernel.promptBlock, /Handoffs/);
  assert.match(kernel.interpretationBlock, /Open handoffs stay open|Verified returns/);
  assert.match(kernel.interpretationBlock, /pending until Confirm/);
});

test('unavailable tasks hub is named and does not look empty-by-design', () => {
  const kernel = runAgentKernel({
    slug: 'hammond',
    message: 'what is slipping across my life',
    today: TODAY,
    now: NOW,
    stores: {
      tasks: [],
      loadErrors: { tasks: 'blob_timeout' }
    }
  });
  assert.ok(kernel.limitations.some(item => item.kind === 'unavailable' && String(item.text).includes('tasks')));
  assert.match(kernel.interpretationBlock, /Unavailable hubs must be named/);
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    evidencePackBlock: kernel.promptBlock,
    kernelBlock: kernel.interpretationBlock
  });
  assert.match(prompt, /unavailable|blob_timeout|Do not treat a failed hub as empty-by-design/);
});

test('Hammond Delivery: do not invent specialist rows', () => {
  const kernel = runAgentKernel({
    slug: 'hammond',
    message: 'what is slipping across my life',
    today: TODAY,
    now: NOW,
    stores: { tasks: [], workouts: [], meals: [], lessons: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not invent a specialist row/);
});

test('Hammond decision record stays pending Confirm', () => {
  const kernel = runAgentKernel({
    slug: 'hammond',
    message: 'what is slipping across my life',
    today: TODAY,
    now: NOW,
    stores: { tasks: [] }
  });
  const proposed = proposeAction(kernel, {
    intent: 'decision_record',
    idempotencyKey: 'dec-1',
    risk: 'high'
  });
  assert.equal(proposed.duplicate, false);
  assert.equal(proposed.action.status, 'pending');
  const again = proposeAction(kernel, {
    intent: 'decision_record',
    idempotencyKey: 'dec-1',
    risk: 'high'
  });
  assert.equal(again.duplicate, true);
});

test('selectHammondDelegates stays broad on slipping and narrows on archive-only stores', () => {
  const slipping = selectHammondDelegates({
    message: 'what is slipping across my life',
    stores: { tasks: [], workouts: [], meals: [] }
  });
  assert.ok(slipping.includes('clare'));
  assert.ok(slipping.includes('chadwick'));
  assert.ok(slipping.includes('brisket'));
  assert.equal(slipping.includes('clementine'), false);

  const notes = selectHammondDelegates({
    message: 'what notes do I already have',
    stores: { pages: [{ id: 'n1', title: 'Load' }] }
  });
  assert.ok(notes.includes('clementine'));
});

test('Phase 5: Hammond Life surface uses the same supervisor kernel', () => {
  const turn = runSurfaceAgentTurn({
    surface: 'life',
    slug: 'hammond',
    message: 'what is slipping across my life',
    today: TODAY,
    now: NOW,
    stores: {
      tasks: [
        { id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10' }
      ]
    },
    flag: true
  });
  assert.equal(turn.kernel.plan.workflow, 'cross_hub_supervision');
  assert.ok(turn.kernel.handoffs.some(item => item.to === 'clare' && item.status === 'verified'));
  assert.match(turn.promptBlock, /Handoffs/);
  assert.match(turn.interpretationBlock, /pending until Confirm/);
});
