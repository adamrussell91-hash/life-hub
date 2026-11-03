import test from 'node:test';
import assert from 'node:assert/strict';
import { foldFadedRuns } from '../../netlify/functions/_shared/faded-fold.mjs';
import { migrateFadedRuns } from '../../scripts/migrate-faded-runs.mjs';

const old = (id, blanks = [], extra = {}, contentExtra = {}) => ({
  id, type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
  content: { prompt: 'p', extract: `e ${id}`, parts: [{ label: 'What', answer: 'a' }, { label: 'Why', answer: 'b' }], blanks, ...contentExtra },
  ...extra
});
const other = (id) => ({ id, type: 'block', block_type: 'section', visibility: 'student_teacher', content: { title: 'A second look', side_path: true, blocks: [] } });

test('adjacent old blocks fold, keeping each id as a step id', () => {
  const { blocks, folded } = foldFadedRuns([old('f1'), old('f2', [1], {}, { prompt: 'q' })]);
  assert.equal(folded, 2);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, 'f1');
  assert.deepEqual(blocks[0].content.steps.map((s) => s.id), ['f1', 'f2']);
  assert.equal(blocks[0].content.steps[1].prompt, 'q');
  assert.equal(blocks[0].content.steps[0].prompt, undefined);
  assert.deepEqual(Object.keys(blocks[0].content.criteria), ['Why']);
});

test('a side path keeps blocks apart, and a lone block is left alone', () => {
  const list = [old('f1', [1]), other('s1'), old('f2', [0, 1])];
  const { blocks, folded, skipped, oldBlocks } = foldFadedRuns(list);
  assert.equal(folded, 0);
  assert.equal(oldBlocks, 2);
  assert.deepEqual(skipped, []);
  assert.deepEqual(blocks[0], list[0]);
});

test('different parts or an attached sleeve are skipped and reported', () => {
  const diff = old('f2');
  diff.content.parts = [{ label: 'Effect', answer: 'x' }];
  assert.deepEqual(foldFadedRuns([old('f1'), diff]).skipped, ['f2']);
  const sleeved = foldFadedRuns([old('f1'), old('f2', [], { sleeves: [{ id: 'x' }] })]);
  assert.deepEqual(sleeved.skipped, ['f2']);
  assert.equal(sleeved.blocks.length, 2);
});

test('a skipped block can still start its own run', () => {
  const diff = (id) => { const b = old(id); b.content.parts = [{ label: 'Effect', answer: 'x' }]; return b; };
  const { blocks, skipped } = foldFadedRuns([old('f1'), diff('f2'), diff('f3')]);
  assert.deepEqual(skipped, ['f2']);
  assert.deepEqual(blocks.map((b) => b.id), ['f1', 'f2']);
  assert.deepEqual(blocks[1].content.steps.map((s) => s.id), ['f2', 'f3']);
});

test('folds inside sections, a switched-off gate carries over, and folding twice changes nothing', () => {
  const section = { ...other('s1'), content: { title: 'T', blocks: [old('f1', [], {}, { gate: false }), old('f2')] } };
  const once = foldFadedRuns([section]);
  assert.equal(once.blocks[0].content.blocks[0].content.gate, false);
  assert.equal(once.blocks[0].content.blocks.length, 1);
  const twice = foldFadedRuns(once.blocks);
  assert.equal(twice.folded, 0);
  assert.deepEqual(twice.blocks, once.blocks);
});

test('the dry run writes nothing and a real run writes only folded lessons', async () => {
  const data = new Map([
    ['lessons/a', { blocks: [old('f1'), old('f2')] }],
    ['lessons/b', { blocks: [old('f3')] }],
    ['published/lessons/a', { blocks: [other('s1')] }]
  ]);
  const writes = [];
  const store = {
    list: async ({ prefix }) => ({ blobs: [...data.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }),
    get: async (key) => data.get(key),
    setJSON: async (key, value) => { writes.push(key); data.set(key, value); }
  };
  const log = () => {};
  const dry = await migrateFadedRuns(store, { log });
  assert.deepEqual(writes, []);
  assert.deepEqual(dry, { lessons: 2, oldBlocks: 3, folded: 2, skipped: 0, written: 0 });
  const real = await migrateFadedRuns(store, { write: true, log });
  assert.deepEqual(writes, ['lessons/a']);
  assert.equal(real.written, 1);
  assert.equal(data.get('lessons/a').blocks.length, 1);
});
