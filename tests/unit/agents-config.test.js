import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

const registry = load(await readFile(new URL('../../config/agents.yml', import.meta.url), 'utf8'));

test('agent registry preserves the approved roster and confirmed colours', () => {
  const bySlug = Object.fromEntries(registry.agents.map(agent => [agent.slug, agent]));
  assert.deepEqual(Object.keys(bySlug).sort(), [
    'brisket', 'chadwick', 'hammond', 'hyaluronica', 'penelope', 'sara', 'vera'
  ]);
  assert.deepEqual(Object.fromEntries(
    ['chadwick', 'hyaluronica', 'penelope', 'sara', 'vera', 'brisket', 'hammond']
      .map(slug => [slug, { colour: bySlug[slug].colour, colour_source: bySlug[slug].colour_source }])
  ), {
    chadwick: { colour: '#D9683A', colour_source: 'confirmed' },
    hyaluronica: { colour: '#C7AEEA', colour_source: 'confirmed' },
    penelope: { colour: '#8F373E', colour_source: 'confirmed' },
    sara: { colour: '#BED3BC', colour_source: 'confirmed' },
    vera: { colour: '#37598A', colour_source: 'confirmed' },
    brisket: { colour: '#EEB046', colour_source: 'confirmed' },
    hammond: { colour: '#2D2D2D', colour_source: 'confirmed' }
  });
  assert.deepEqual(bySlug.hammond, {
    name: 'General Hammond',
    slug: 'hammond',
    domain: 'life_coaching',
    tab: 'Central Node',
    colour: '#2D2D2D',
    colour_source: 'confirmed',
    name_triggers: ['general hammond', 'hammond']
  });
});
