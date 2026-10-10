import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventRepository } from '../../netlify/functions/_shared/event-repository.mjs';
import { projectNotionPdEvent } from '../../netlify/functions/_shared/notion-pd-events.mjs';
import { eventKey } from '../../netlify/functions/_shared/professional-blobs.mjs';

const row = { notion_id: 'a'.repeat(32), title: 'PD', start: '2026-09-01T00:00:00Z', end: '2026-09-01T01:00:00Z' };
const imported = projectNotionPdEvent(row);
const { source, notion_id, knowledge_notes, ...native } = imported;

function setup(initial, hooks = {}) {
  const values = new Map(initial ? [[eventKey(native.id), structuredClone(initial)]] : []);
  let revision = 1;
  const store = {
    async get(key, options) {
      if (key.startsWith('events/records/')) assert.equal(options.consistency, 'strong');
      return values.get(key) ?? null;
    },
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, 'strong');
      const entry = {data: structuredClone(values.get(key)), etag: String(revision)};
      hooks.beforeChange?.(values, () => { revision++; });
      return entry;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && key === eventKey(native.id)) hooks.beforeCreate?.(values);
      if (options.onlyIfNew && values.has(key)) return {modified: false};
      if (options.onlyIfMatch && options.onlyIfMatch !== String(revision)) return {modified: false};
      values.set(key, structuredClone(value));
      revision++;
      return {modified: true};
    },
    async list() { return {blobs: []}; }
  };
  const repo = createEventRepository({store, listImportedEvents: async () => [row]});
  return {repo, values};
}

test('an overlapping event edit cannot overwrite deletion', async () => {
  const {repo, values} = setup(native, {beforeChange(values, advance) {
    values.set(eventKey(native.id), {...native, deleted_at: '2026-10-10T00:00:00Z'});
    advance();
  }});
  await assert.rejects(() => repo.updateEvent(native.id, {title: 'Late autosave'}), {status: 409, code: 'event_changed'});
  assert.ok(values.get(eventKey(native.id)).deleted_at);
  await assert.rejects(() => repo.getEvent(native.id), {status: 404});
});

test('overlapping bootstrap reads preserve an already edited native event', async () => {
  const {repo} = setup(null, {beforeCreate(values) {
    values.set(eventKey(native.id), {...native, title: 'Already edited', hours: 3});
  }});
  const event = await repo.getEvent(native.id);
  assert.equal(event.title, 'Already edited');
  assert.equal(event.hours, 3);
});

test('overlapping bootstrap reads cannot replace an event tombstone', async () => {
  const {repo, values} = setup(null, {beforeCreate(values) {
    values.set(eventKey(native.id), {...native, deleted_at: '2026-10-10T00:00:00Z'});
  }});
  await assert.rejects(() => repo.getEvent(native.id), {status: 404});
  assert.ok(values.get(eventKey(native.id)).deleted_at);
});


test('a saved event without an index is recovered after its source disappears', async () => {
  const {repo, values} = setup(native);
  await repo.getEvent(native.id);
  assert.ok(values.has(`events/index/${native.id}`), 'direct reads repair an interrupted index write');
  values.delete(`events/index/${native.id}`);
  const store = {
    async get(key) { return values.get(key) ?? null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async list({prefix = ''} = {}) { return {blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({key}))}; }
  };
  const withoutSource = createEventRepository({store, listImportedEvents: async () => []});
  const events = await withoutSource.listEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].id, native.id);
  assert.ok(values.has(`events/index/${native.id}`), 'listing repairs the index from the native record');
});


test('optional note backfill cannot block native editing or deletion during a source outage', async () => {
  const saved = {...native, talks:[{id:'t_123', title:'My talk', time:null, presenter:null, hours:null}]};
  const values = new Map([[eventKey(native.id), saved]]);
  const store = { async get(key) { return values.get(key) ?? null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); } };
  const repo = createEventRepository({store, loadImportedEvent:async () => {throw new Error('Source unavailable');}});
  assert.equal((await repo.getEvent(native.id)).id, native.id);
  assert.equal((await repo.updateEvent(native.id, {title:'Still editable'})).title, 'Still editable');
  assert.equal((await repo.deleteEvent(native.id)).deleted, true);
});
