import test from 'node:test';
import assert from 'node:assert/strict';
import { agentColour, DEFAULT_AGENT_COLOUR } from '../../js/app/agent-colour.js';

const agentsConfig = {
  agents: [
    { slug: 'brisket', colour: '#EEB046' },
    { slug: 'hammond', colour: '#2D2D2D' }
  ]
};

test('returns the configured colour for a known agent', () => {
  assert.equal(agentColour(agentsConfig, 'brisket'), '#EEB046');
  assert.equal(agentColour(agentsConfig, 'hammond'), '#2D2D2D');
});

test('falls back to the client roster colour when config is missing', () => {
  assert.equal(agentColour(null, 'brisket'), '#EEB046');
  assert.equal(agentColour(undefined, 'hyaluronica'), '#C7AEEA');
  assert.equal(agentColour({ agents: [] }, 'chadwick'), '#D9683A');
});

test('falls back to the default accent only for unknown agents', () => {
  assert.equal(agentColour(agentsConfig, 'unknown-agent'), DEFAULT_AGENT_COLOUR);
  assert.equal(agentColour(null, 'unknown-agent'), DEFAULT_AGENT_COLOUR);
});

test('falls back to roster when a colour value is present but not a string', () => {
  assert.equal(agentColour({ agents: [{ slug: 'brisket', colour: null }] }, 'brisket'), '#EEB046');
});

test('falls back to roster when agents is present but not an array', () => {
  assert.equal(agentColour({ agents: 'not-an-array' }, 'brisket'), '#EEB046');
  assert.equal(agentColour({ agents: {} }, 'sara'), '#BED3BC');
});
