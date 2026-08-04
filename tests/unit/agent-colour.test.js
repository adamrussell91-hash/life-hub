import test from 'node:test';
import assert from 'node:assert/strict';
import { agentColour, DEFAULT_AGENT_COLOUR } from '../../js/app/agent-colour.js';

const agentsConfig = {
  agents: [
    { slug: 'brisket', colour: '#F0B843' },
    { slug: 'hammond', colour: '#3A3A42' }
  ]
};

test('returns the configured colour for a known agent', () => {
  assert.equal(agentColour(agentsConfig, 'brisket'), '#F0B843');
  assert.equal(agentColour(agentsConfig, 'hammond'), '#3A3A42');
});

test('falls back to the default accent when the config is missing, empty, or the agent is unknown', () => {
  assert.equal(agentColour(null, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour(undefined, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour({ agents: [] }, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour(agentsConfig, 'unknown-agent'), DEFAULT_AGENT_COLOUR);
});

test('falls back to the default accent when a colour value is present but not a string', () => {
  assert.equal(agentColour({ agents: [{ slug: 'brisket', colour: null }] }, 'brisket'), DEFAULT_AGENT_COLOUR);
});

test('falls back to the default accent when agents is present but not an array', () => {
  assert.equal(agentColour({ agents: 'not-an-array' }, 'brisket'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour({ agents: {} }, 'brisket'), DEFAULT_AGENT_COLOUR);
});
