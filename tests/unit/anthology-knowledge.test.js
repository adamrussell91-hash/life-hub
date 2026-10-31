import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeAction, MAX_PER_INITIALS } from '../../netlify/functions/_shared/anthology-knowledge.mjs';

const anthologyBlock = { id: 'anth1', block_type: 'anthology', visibility: 'student_teacher', content: { title: 'Map' } };
const noteBlock = {
  id: 'ann1',
  block_type: 'annotation',
  visibility: 'student_teacher',
  content: {
    text: { kind: 'verse', stanzas: [{ id: 's1', lines: [{ id: 'l1', text: 'An invented line about rain.' }] }] },
    layers: [{ id: 'layer1', name: 'General Notes', kind: 'family', family: 'Descriptive' }],
    annotations: [
      {
        id: 'note1',
        layer_id: 'layer1',
        anchor: { granularity: 'line', stanza: 's1', line: 'l1', quote: { exact: 'An invented line about rain.' } },
        anthology: { include: true, themes: ['Hope and growth'], concepts: ['Perspective'] },
        body: { html: '<p>Invented note.</p>' }
      }
    ]
  }
};

function storeFixture({ mapIn = 'unit' } = {}) {
  const lessonBlocks = mapIn === 'lesson' ? [noteBlock, anthologyBlock] : [noteBlock];
  const data = new Map([
    ['units/unit1', { title: 'Invented unit', lesson_ids: ['lesson1'], blocks: mapIn === 'unit' ? [anthologyBlock] : [] }],
    ['published/lessons/lesson1', { lesson_id: 'lesson1', unit_id: 'unit1', title: 'Poem one', blocks: lessonBlocks }]
  ]);
  return {
    data,
    async get(key, options) {
      assert.equal(options.consistency, 'strong');
      return structuredClone(data.get(key) ?? null);
    },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix }) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}
const add = (store, extra = {}) =>
  knowledgeAction(store, 'unit1', 'POST', {
    action: 'add',
    title: 'Rain as renewal',
    quote: 'An invented sentence from an invented article.',
    info: 'The article says rain marks a fresh start.',
    themes: ['Hope and growth'],
    concepts: [],
    initials: 'ab',
    ...extra
  });
const studentList = (store) => knowledgeAction(store, 'unit1', 'GET', {});
const teacher = (store, method, body = {}) => knowledgeAction(store, 'unit1', method, body, { teacher: true });

test('a clean item shows at once and students never see initials', async () => {
  const store = storeFixture();
  const sent = await add(store);
  assert.equal(sent.status, 'shown');
  const { items } = await studentList(store);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Rain as renewal');
  assert.equal('initials' in items[0], false);
  const all = await teacher(store, 'GET');
  assert.equal(all.items[0].initials, 'AB');
  assert.equal(all.items[0].status, 'shown');
});

test("only the unit's own themes and concepts are kept; none left is refused", async () => {
  const store = storeFixture();
  await add(store, { themes: ['Hope and growth', 'Made up'], concepts: ['Perspective', 'Nope'] });
  const [item] = (await studentList(store)).items;
  assert.deepEqual(item.themes, ['Hope and growth']);
  assert.deepEqual(item.concepts, ['Perspective']);
  await assert.rejects(add(store, { themes: ['Made up'], concepts: [] }), { code: 'no_tags' });
});

test('title, quote and initials are required, and long text is cut', async () => {
  const store = storeFixture();
  await assert.rejects(add(store, { title: '  ' }), { code: 'missing_title' });
  await assert.rejects(add(store, { quote: '' }), { code: 'missing_quote' });
  await assert.rejects(add(store, { initials: 'a' }), { code: 'bad_initials' });
  await add(store, { title: 'x'.repeat(200) });
  assert.equal((await studentList(store)).items[0].title.length, 80);
});

test('a flagged item waits for the teacher, who can show it', async () => {
  const store = storeFixture();
  const sent = await add(store, { info: 'what a load of sh1t' });
  assert.equal(sent.status, 'waiting');
  assert.equal((await studentList(store)).items.length, 0);
  const [waiting] = (await teacher(store, 'GET')).items;
  assert.equal(waiting.status, 'waiting');
  await teacher(store, 'POST', { action: 'show', id: waiting.id });
  assert.equal((await studentList(store)).items.length, 1);
});

test('the teacher can hide and delete', async () => {
  const store = storeFixture();
  await add(store);
  const [item] = (await teacher(store, 'GET')).items;
  await teacher(store, 'POST', { action: 'hide', id: item.id });
  assert.equal((await studentList(store)).items.length, 0);
  assert.equal((await teacher(store, 'GET')).items[0].status, 'hidden');
  await teacher(store, 'POST', { action: 'delete', id: item.id });
  assert.equal((await teacher(store, 'GET')).items.length, 0);
});

test('one set of initials can add only so many', async () => {
  const store = storeFixture();
  for (let i = 0; i < MAX_PER_INITIALS; i++) await add(store, { title: `Idea ${i}` });
  await assert.rejects(add(store), { code: 'too_many' });
});

test('a unit with no Anthology block anywhere has no class map', async () => {
  await assert.rejects(add(storeFixture({ mapIn: 'none' })), { code: 'not_found' });
});

test('an Anthology block in a published lesson is enough', async () => {
  const store = storeFixture({ mapIn: 'lesson' });
  assert.equal((await add(store)).status, 'shown');
});

test('students cannot moderate', async () => {
  const store = storeFixture();
  await add(store);
  const [item] = (await teacher(store, 'GET')).items;
  await assert.rejects(knowledgeAction(store, 'unit1', 'POST', { action: 'hide', id: item.id }), { code: 'bad_action' });
});
