import test from 'node:test';
import assert from 'node:assert/strict';
import {findActiveSelfPerson} from '../../netlify/functions/_shared/career-overview.mjs';
import {assembleEntityOverview} from '../../netlify/functions/_shared/entity-overview.mjs';
import {makePerson, memoryStore, makeResolveEntity} from '../support/people-fixtures.mjs';

test('self lookup reads people in bounded parallel batches instead of one network round trip per person', async () => {
  const store = memoryStore();
  for (let i = 0; i < 24; i++) await makePerson(store, {display_name:`Colleague ${i}`});
  const self = await makePerson(store, {display_name:'Adam Russell', is_self:true});
  const get = store.get.bind(store);
  let active = 0;
  let peak = 0;
  store.get = async (key, options) => {
    if (!key.startsWith('entities/person/')) return get(key, options);
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    try { return await get(key, options); } finally { active--; }
  };
  const result = await findActiveSelfPerson(store, {env:{}});
  assert.equal(result.id, self.id);
  assert.ok(peak > 1, 'lookup must overlap the independent identity reads');
  assert.ok(peak <= 10, 'lookup must bound concurrent storage reads');
});

test('profile with no current organisation skips the population scan for shared workplaces', async () => {
  const store = memoryStore();
  const person = await makePerson(store, {display_name:'Genevieve Quoyle'});
  const list = store.list.bind(store);
  let populationScans = 0;
  store.list = async options => {
    if (options.prefix === 'entities/index/person/') populationScans++;
    return list(options);
  };
  const overview = await assembleEntityOverview(person.ref, {store, env:{}, resolveEntity:makeResolveEntity(store)});
  assert.equal(overview.entity.display_name, 'Genevieve Quoyle');
  assert.deepEqual(overview.shared_contexts_with_self, []);
  assert.equal(populationScans, 0, 'no shared workplace can exist without a subject workplace');
});
