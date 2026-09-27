import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHubPeople } from '../../scripts/lib/notion-comms/load-people.mjs';

test('loadHubPeople bounds CLI-backed identity reads', async () => {
  let active = 0; let maximum = 0;
  const people = await loadHubPeople({
    store: {},
    listKeys: async () => Array.from({ length: 23 }, (_, index) => `person-${index}`),
    getJSON: async (_store, key) => {
      active += 1; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { id: key, display_name: `Person ${key}`, aliases: [] };
    },
    parse: (person) => person
  });
  assert.equal(people.length, 23);
  assert.ok(maximum <= 10);
});
