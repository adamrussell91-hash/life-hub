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
    ['chadwick', 'hyaluronica', 'penelope', 'sara', 'vera', 'brisket']
      .map(slug => [slug, { colour: bySlug[slug].colour, colour_source: bySlug[slug].colour_source }])
  ), {
    chadwick: { colour: '#2E7BD6', colour_source: 'confirmed' },
    hyaluronica: { colour: '#B99EE0', colour_source: 'confirmed' },
    penelope: { colour: '#C85A64', colour_source: 'confirmed' },
    sara: { colour: '#BBD9B4', colour_source: 'confirmed' },
    vera: { colour: '#37598A', colour_source: 'confirmed' },
    brisket: { colour: '#F0B843', colour_source: 'confirmed' }
  });
  assert.deepEqual(bySlug.hammond, {
    name: 'General Hammond',
    slug: 'hammond',
    domain: 'life_coaching',
    tab: 'Central Node',
    colour: '#142B51',
    colour_source: 'provisional_until_cover_migration',
    name_triggers: ['general hammond', 'hammond']
  });
});
