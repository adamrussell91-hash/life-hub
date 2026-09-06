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

test('a sticky conversation never changes agent from the message text', () => {
  const stealers = [
    'Chadwick said I should eat more protein',
    'chad, log a workout',
    'log a chest and curls session for Chadwick',
    'what should I eat, brisket?',
    'hey ann, what do you think',
    'talk to vera about this',
    'Ann: gifted education audit?',
    "they're planning a gifted education audit",
    'several teachers mentioned it',
    'I cannot tell yet',
    'I should declare this later',
    'after my workout I want a burger'
  ];
  for (const agent of AGENTS) {
    for (const message of stealers) {
      assert.equal(
        routeAgent(message, agent.slug),
        agent.slug,
        `${agent.slug} must keep the thread for ${JSON.stringify(message)}`
      );
    }
  }
});

test('ordinary words do not count as naming an agent on a fresh conversation', () => {
  assert.equal(routeAgent("they're planning a gifted education audit"), ROUTER_SLUG);
  assert.equal(routeAgent('several teachers mentioned it'), ROUTER_SLUG);
  assert.equal(routeAgent('I cannot tell yet'), ROUTER_SLUG);
  assert.equal(routeAgent('I should declare this later'), ROUTER_SLUG);
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
  assert.deepEqual(findAgent('sara')?.recordTypes, ['weight', 'composition', 'measurements', 'medical']);
});
