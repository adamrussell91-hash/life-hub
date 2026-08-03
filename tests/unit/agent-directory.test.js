import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { AGENTS, ROUTER_SLUG, findAgent, routeAgent } from '../../netlify/functions/_shared/agent-directory.mjs';

test('agent directory slugs, names, and triggers mirror config/agents.yml exactly', () => {
  const configured = load(readFileSync(new URL('../../config/agents.yml', import.meta.url), 'utf8'));
  assert.deepEqual(
    AGENTS.map(agent => ({ slug: agent.slug, name: agent.name, nameTriggers: agent.nameTriggers })),
    configured.agents.map(agent => ({ slug: agent.slug, name: agent.name, nameTriggers: agent.name_triggers }))
  );
});

test('routes to the agent whose trigger appears in the message', () => {
  assert.equal(routeAgent('Log a chest and curls session for Chadwick'), 'chadwick');
  assert.equal(routeAgent('what should I eat, brisket?'), 'brisket');
});

test('an earlier-listed agent wins when two triggers both appear', () => {
  assert.equal(routeAgent('brisket and sara should both weigh in'), 'brisket');
});

test('falls back to the router when no agent is named', () => {
  assert.equal(routeAgent('log today'), ROUTER_SLUG);
});

test('an unnamed message stays with the sticky agent from the current conversation', () => {
  assert.equal(routeAgent('actually make that 3 eggs', 'brisket'), 'brisket');
});

test('an explicit name always wins over a sticky agent from a different conversation', () => {
  assert.equal(routeAgent('chad, log a workout', 'brisket'), 'chadwick');
});

test('a stale or unknown sticky slug falls back to the router rather than being trusted blindly', () => {
  assert.equal(routeAgent('log today', 'not-a-real-agent'), ROUTER_SLUG);
  assert.equal(routeAgent('log today', 'router'), ROUTER_SLUG);
});

test('routeAgent requires a string message', () => {
  assert.throws(() => routeAgent(null), TypeError);
});

test('findAgent returns the matching agent or null', () => {
  assert.equal(findAgent('nope'), null);
  assert.deepEqual(findAgent('sara')?.recordTypes, ['weight', 'composition', 'measurements']);
});
