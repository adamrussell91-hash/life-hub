import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLARE_PROTOCOL_IDS,
  isProductivityProtocol,
  readProtocolId
} from '../../netlify/functions/_shared/clare-protocols.mjs';
import {
  buildProductivityCardEvent,
  cardTypeForProductivityTool
} from '../../netlify/functions/_shared/productivity-card-map.mjs';

test('productivity protocol IDs survive readProtocolId', () => {
  for (const id of ['weekly-review', 'plan-day', 'project-plan', 'waiting', 'shutdown']) {
    assert.equal(readProtocolId(id), id);
    assert.equal(isProductivityProtocol(id), true);
    assert.ok(CLARE_PROTOCOL_IDS.has(id));
  }
});

test('readProtocolId still rejects unknown ids', () => {
  assert.equal(readProtocolId('not-a-real-protocol'), undefined);
  assert.equal(readProtocolId(''), undefined);
  assert.equal(isProductivityProtocol('morning-sweep'), false);
});

test('classic briefing and ADHD ids remain allowlisted', () => {
  assert.equal(readProtocolId('morning-sweep'), 'morning-sweep');
  assert.equal(readProtocolId('shatter-start'), 'shatter-start');
});

test('buildProductivityCardEvent maps Clare tool results to card types', () => {
  assert.equal(cardTypeForProductivityTool('clarify_dump'), 'clarify-stack');
  assert.equal(cardTypeForProductivityTool('weekly_review'), 'review-progress');
  assert.equal(cardTypeForProductivityTool('compose_schedule'), 'schedule-diff');
  assert.equal(cardTypeForProductivityTool('waiting_review'), 'waiting');
  assert.equal(cardTypeForProductivityTool('shutdown_day'), 'shutdown');

  const clarify = buildProductivityCardEvent('clarify_dump', {
    ok: true,
    items: [{ id: 'a', text: 'Buy milk', destination: 'next_action' }]
  });
  assert.equal(clarify?.type, 'productivity_card');
  assert.equal(clarify?.card_type, 'clarify-stack');
  assert.equal(clarify?.payload.items.length, 1);

  const weekly = buildProductivityCardEvent('weekly_review', {
    ok: true,
    stages: ['capture', 'confirm'],
    state: { current_stage: 'capture', completed: [] }
  });
  assert.equal(weekly?.card_type, 'review-progress');
  assert.equal(weekly?.payload.current, 'capture');

  const denied = buildProductivityCardEvent('clarify_dump', { ok: false, error: 'missing_text' });
  assert.equal(denied, null);
});

test('propose path emits card when surfaces are present and carries pendingId', () => {
  const event = buildProductivityCardEvent(
    'waiting_review',
    {
      kind: 'propose',
      proposal: {
        intent: 'Waiting follow_up',
        writes: [],
        surfaces: ['confirm_card', 'tasks_hub']
      }
    },
    { pendingId: 'pending_abc' }
  );
  assert.equal(event?.card_type, 'waiting');
  assert.equal(event?.payload.pendingId, 'pending_abc');

  const noSurfaces = buildProductivityCardEvent('waiting_review', {
    kind: 'propose',
    proposal: { intent: 'x', writes: [], surfaces: [] }
  });
  assert.equal(noSurfaces, null);
});

test('Hammond productivity tools map to design-kit card types', () => {
  assert.equal(cardTypeForProductivityTool('portfolio_meter'), 'active-projects-meter');
  assert.equal(cardTypeForProductivityTool('strategic_review'), 'strategic-review');
  assert.equal(cardTypeForProductivityTool('depth_budget'), 'depth-budget');

  const funnel = buildProductivityCardEvent('portfolio_meter', {
    ok: true,
    meter: { count: 2, limit: 5 },
    funnel: { selected: [], organised: [], scheduled: [] }
  });
  assert.equal(funnel?.card_type, 'productivity-funnel');
});
