import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTodaysStatus,
  extractCrossAgentCoordination,
  extractRecentAgentActions,
  CROSS_AGENT_HEADING,
  TODAYS_STATUS_HEADING,
  RECENT_ACTIONS_HEADING
} from '../../apps/life/js/core/constraints.js';
import { trimCrossAgentSection } from '../../apps/life/js/core/central-node-write.js';
import {
  CENTRAL_NODE_UNAVAILABLE_MARKER,
  HUB_CONTEXT_UNAVAILABLE_MARKER,
  HUB_TASKS_UNAVAILABLE_MARKER,
  assertContextDelivered,
  evaluateConstraintBehaviour
} from '../../apps/life/js/core/context-integrity.js';
import { formatHubAgentContext } from '../../netlify/functions/_shared/hub-agent-context.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

const PAIN_LINE =
  '- Chadwick→Sara: Lower-body session — left knee: sharp anterior pain on descent; avoid loaded flexion.';

function fixtureCentralNode({ extraCrossAgent = [] } = {}) {
  return [
    `${TODAYS_STATUS_HEADING} (5 Sep 2026)`,
    '- Sleep: short',
    '- Flags: left knee pain (Chadwick)',
    '',
    CROSS_AGENT_HEADING,
    '*One-line directives only.*',
    PAIN_LINE,
    ...extraCrossAgent,
    '---',
    RECENT_ACTIONS_HEADING,
    '- Chadwick: logged lower-body session'
  ].join('\n');
}

function assembleThinLog(markdown) {
  return [
    extractTodaysStatus(markdown),
    extractCrossAgentCoordination(markdown),
    extractRecentAgentActions(markdown)
  ].filter(Boolean).join('\n\n');
}

test('Delivery: Chadwick final system prompt includes CN pain Cross-Agent line', () => {
  const cn = fixtureCentralNode();
  const centralNodeLog = assembleThinLog(cn);
  assert.match(centralNodeLog, /left knee/);

  const system = buildSystemPrompt({
    slug: 'chadwick',
    centralNodeLog,
    chadwickProtocol: '## Safety\nRespect new Central Node pain flags when programming.'
  });

  assertContextDelivered(system, PAIN_LINE, 'Chadwick→Sara pain line');
  assert.match(system, /MUST use the Central Node/i);
  assert.match(system, /Respect new Central Node pain flags/);
});

test('Delivery: Sara final system prompt receives the same Cross-Agent mailbox slice', () => {
  const centralNodeLog = assembleThinLog(fixtureCentralNode());
  const system = buildSystemPrompt({
    slug: 'sara',
    centralNodeLog
  });
  assertContextDelivered(system, 'left knee', 'Sara pain context');
});

test('Parity: Clare chat may read thin CN; that does not replace Chadwick Delivery proof', () => {
  const centralNodeLog = assembleThinLog(fixtureCentralNode());
  const clare = buildSystemPrompt({ slug: 'clare', centralNodeLog });
  assertContextDelivered(clare, 'left knee', 'Clare thin CN read');
  // Chadwick-specific programming obligation is not Clare's contract.
  assert.doesNotMatch(
    clare,
    /When designing a session you MUST use the Central Node/
  );
});

test('Parity: empty CN path does not prove Chadwick Delivery', () => {
  const chadwickEmpty = buildSystemPrompt({ slug: 'chadwick', centralNodeLog: '' });
  assert.throws(
    () => assertContextDelivered(chadwickEmpty, PAIN_LINE, 'pain line'),
    /Delivery failed/
  );
});

test('Fail-visible: hub Tasks load failure marker reaches Hammond system prompt', () => {
  const hubContext = formatHubAgentContext({
    now: new Date('2026-09-04T02:00:00Z'),
    loadErrors: { tasks: 'load_failed' }
  });
  const system = buildSystemPrompt({ slug: 'hammond', hubContext });
  assertContextDelivered(system, HUB_TASKS_UNAVAILABLE_MARKER, 'hub Tasks unavailable marker');
  assert.match(system, /Do not invent Tasks rows/);
});

test('Fail-visible: total hub-context load failure marker reaches Hammond system prompt', () => {
  const system = buildSystemPrompt({
    slug: 'hammond',
    hubContext: HUB_CONTEXT_UNAVAILABLE_MARKER
  });
  assertContextDelivered(system, HUB_CONTEXT_UNAVAILABLE_MARKER, 'hub context unavailable marker');
  assert.match(system, /Do not invent Tasks or Teaching rows/);
});

test('Fail-visible: CN load failure marker reaches Chadwick system prompt', () => {
  const system = buildSystemPrompt({
    slug: 'chadwick',
    centralNodeLog: CENTRAL_NODE_UNAVAILABLE_MARKER
  });
  assertContextDelivered(system, CENTRAL_NODE_UNAVAILABLE_MARKER, 'CN unavailable marker');
  assert.match(system, /Do not invent Status/);
});

test('Fail-visible: Cross-Agent trim records omitted count', () => {
  const directives = Array.from({ length: 15 }, (_, i) => `- Agent→Other: note ${i + 1}.`);
  const base = [
    CROSS_AGENT_HEADING,
    '*One-line directives only.*',
    ...directives,
    '---',
    RECENT_ACTIONS_HEADING
  ].join('\n');

  // Cap is passed explicitly — default MAX_CROSS_AGENT_LINES may move; the contract is the marker.
  const next = trimCrossAgentSection(base, { maxLines: 12 });
  assert.match(next, /life-hub:cross-agent-truncated kept=12 omitted=3/);
  assert.match(next, /- Agent→Other: note 1\./);
  assert.doesNotMatch(next, /- Agent→Other: note 15\./);

  const log = extractCrossAgentCoordination(next);
  assert.match(log, /life-hub:cross-agent-truncated kept=12 omitted=3/);
});

test('Behaviour fixture: constraint present → must-not prescribe as if clear', () => {
  const bad = evaluateConstraintBehaviour({
    constraintPresent: true,
    recommendation: 'Heavy back squat 5x5 @ 85% — push through the sticking point.',
    mustNotPatterns: [/back squat/i, /85\s*%/i, /push through/i]
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some(v => v.type === 'must-not'));

  const good = evaluateConstraintBehaviour({
    constraintPresent: true,
    recommendation: 'Swap to upper-body press and machine quad extension; keep knee flexion light.',
    mustNotPatterns: [/back squat/i, /push through/i]
  });
  assert.equal(good.ok, true);
});

test('Behaviour fixture negative control: without constraint, squat programming is allowed', () => {
  const result = evaluateConstraintBehaviour({
    constraintPresent: false,
    recommendation: 'Heavy back squat 5x5 @ 85%.',
    mustNotPatterns: [/back squat/i]
  });
  assert.equal(result.ok, true);
});
