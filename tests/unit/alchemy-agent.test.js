import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
import { runAlchemyAgent, renderLessonText, writeAgentSettings, LIMITS } from '../../netlify/functions/_shared/alchemy-agent.mjs';
import { patchBlock, applyPatchToEntity, editableFields, quoteAppears, PatchError } from '../../packages/alchemy/patches.js';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';

const validate = block => { const r = BlockSchema.safeParse(block); return r.success ? r.data : null; };
const stamp = { type: 'block', schema_version: 1, visibility: 'student_teacher', order: 0, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' };
const heading = (id, text) => ({ ...stamp, id, block_type: 'heading', variant: 'section', content: { text } });
const rich = (id, html) => ({ ...stamp, id, block_type: 'rich_text', variant: 'medium', content: { html } });

function fixture() {
  const store = memoryAlchemyStore();
  const lesson = { id: 'l1', title: 'Inventing a hook', unit_id: 'u1', blocks: [heading('h1', 'Warm up'), rich('r1', '<p>Students read the poem. Students read the poem again.</p><p>Discuss the ending.</p>')] };
  store.rows.set('lessons/l1', { data: lesson, etag: '0' });
  store.rows.set('lessons/l2', { data: { id: 'l2', title: 'Next lesson', unit_id: 'u1', blocks: [heading('h9', 'Drafting')] }, etag: '0' });
  store.rows.set('units/u1', { data: { id: 'u1', title: 'Invented unit', description: 'Poetry', lesson_ids: ['l1', 'l2'], blocks: [] }, etag: '0' });
  const notes = {
    rules: { id: 'rules', title: 'Lesson rules', body: 'Every lesson opens with a retrieval question.', area: 'notes', tags: [], origins: [] },
    spacing: { id: 'spacing', title: 'Spacing notes', body: 'Short low-stakes retrieval questions at the start of a lesson strengthen memory more than rereading.', area: 'university', tags: ['memory'], origins: [] }
  };
  const fetchImpl = async url => {
    const id = decodeURIComponent(String(url).split('/contents/')[1] ?? '').replace(/^pages\/|\.json$/g, '');
    const page = notes[id];
    return page ? new Response(JSON.stringify({ sha: 's', encoding: 'base64', content: Buffer.from(JSON.stringify(page)).toString('base64') })) : new Response('{}', { status: 404 });
  };
  const docs = Object.values(notes).map(n => ({ id: n.id, title: n.title, area: n.area, tags: n.tags, origins: n.origins, updated_at: '', text: n.body }));
  return { store, lesson, fetchImpl, docs };
}

/** Ann's turns, scripted: each entry is the tool calls for one turn. */
function scripted(turns) {
  const seen = [];
  let i = 0;
  const complete = async body => {
    seen.push(structuredClone(body));
    const calls = turns[i++] ?? [];
    return { stop_reason: calls.length ? 'tool_use' : 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 }, content: calls.map((c, j) => ({ type: 'tool_use', id: `t${i}_${j}`, name: c[0], input: c[1] })) };
  };
  return { complete, seen };
}
const toolResults = body => body.messages.at(-1).content.filter(b => b.type === 'tool_result');

test('the lesson is shown with exact editable paths and raw values', () => {
  const text = renderLessonText(fixture().lesson);
  assert.match(text, /\[block r1 · rich_text\]\n  content\.html:\n<<<\n<p>Students read the poem\./);
  assert.match(text, /\[block h1 · heading\]\n  content\.text:\n<<<\nWarm up\n>>>/);
});

test('Ann searches, opens a note, proposes a grounded patch and finishes', async () => {
  const { store, fetchImpl, docs } = fixture();
  await writeAgentSettings(store, { rulesNoteId: 'rules', rulesNoteTitle: 'Lesson rules' });
  const { complete, seen } = scripted([
    [['search_notes', { query: 'retrieval at the start of a lesson' }]],
    [['read_note', { id: 'spacing' }]],
    [['propose_edit', { blockId: 'h1', path: 'content.text', oldStr: 'Warm up', newStr: 'Warm up: what do you remember about last lesson’s poem?', why: 'Opens with retrieval.', source: { noteId: 'spacing', quote: 'Short low-stakes retrieval questions at the start of a lesson' } }]],
    [['finish', { summary: 'Added an opening retrieval question.' }]]
  ]);
  const progress = [];
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs }, onProgress: p => progress.push(p) });
  assert.equal(result.summary, 'Added an opening retrieval question.');
  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].source, { noteId: 'spacing', title: 'Spacing notes', quote: 'Short low-stakes retrieval questions at the start of a lesson' });
  assert.equal(result.rules.title, 'Lesson rules');
  assert.match(seen[0].messages[0].content, /<rules title="Lesson rules">\nEvery lesson opens with a retrieval question\./);
  assert.match(seen[0].messages[0].content, /- l2: Next lesson/);
  assert.match(toolResults(seen[1])[0].content, /spacing/);
  assert.ok(progress.includes('Reading: Spacing notes'));
  assert.ok(progress.some(p => p.startsWith('Drafted a suggestion for heading')));
});

test('a made-up quote, an unopened note and an ambiguous oldStr come back as errors to fix', async () => {
  const { store, fetchImpl, docs } = fixture();
  const { complete, seen } = scripted([
    [['read_note', { id: 'spacing' }]],
    [
      ['propose_edit', { blockId: 'h1', path: 'content.text', oldStr: 'Warm up', newStr: 'Quiz', why: 'x', source: { noteId: 'spacing', quote: 'Rereading is the best way to remember things.' } }],
      ['propose_edit', { blockId: 'h1', path: 'content.text', oldStr: 'Warm up', newStr: 'Quiz', why: 'x', source: { noteId: 'rules', quote: 'Every lesson opens with a retrieval question.' } }],
      ['propose_edit', { blockId: 'r1', path: 'content.html', oldStr: 'Students read the poem', newStr: 'Students read the poem aloud', why: 'x' }]
    ],
    [['finish', { summary: 'Done.' }]]
  ]);
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  const [fake, unopened, ambiguous] = toolResults(seen[2]);
  assert.match(fake.content, /quote is not in the note/);
  assert.match(unopened.content, /Cite only a note you opened/);
  assert.match(ambiguous.content, /appears 2 times/);
  assert.ok(fake.is_error && unopened.is_error && ambiguous.is_error);
  assert.equal(result.proposals.length, 0);
});

test('at most two suggestions may rest on Ann’s own expertise', async () => {
  const { store, fetchImpl, docs } = fixture();
  const own = (oldStr, newStr) => ['propose_edit', { blockId: 'r1', path: 'content.html', oldStr, newStr, why: 'Clearer.' }];
  const { complete, seen } = scripted([[own('Discuss the ending.', 'Discuss the ending in pairs.'), own('<p>Students read', '<p>First, students read'), own('Warm', 'Hot')], [['finish', { summary: 'ok' }]]]);
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.equal(result.proposals.length, 2);
  assert.match(toolResults(seen[1])[2].content, /two suggestions without a source/);
});

test('a block question only edits that block', async () => {
  const { store, fetchImpl, docs } = fixture();
  const { complete, seen } = scripted([[['propose_edit', { blockId: 'r1', path: 'content.html', oldStr: 'Discuss the ending.', newStr: 'Discuss.', why: 'x' }]], [['finish', { summary: 'ok' }]]]);
  await runAlchemyAgent({ kind: 'lesson', id: 'l1', blockId: 'h1', request: 'Make it punchier', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.match(seen[0].messages[0].content, /Adam asked about block h1 only[\s\S]*He said: Make it punchier/);
  assert.match(toolResults(seen[1])[0].content, /one block only/);
});

test('the turn limit stops the run, keeps proposals and warns Ann on her last turn', async () => {
  const { store, fetchImpl, docs } = fixture();
  const turns = Array.from({ length: 20 }, () => [['search_notes', { query: 'memory' }]]);
  turns[0] = [['propose_edit', { blockId: 'h1', path: 'content.text', oldStr: 'Warm up', newStr: 'Retrieval warm up', why: 'x' }]];
  const { complete, seen } = scripted(turns);
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.equal(seen.length, LIMITS.lesson.turns);
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.proposals.length, 1);
  assert.match(seen.at(-1).messages.at(-1).content.at(-1).text, /last turn/);
});

test('a refusal with nothing proposed is an error for the page', async () => {
  const { store, fetchImpl, docs } = fixture();
  const complete = async () => ({ stop_reason: 'refusal', content: [], usage: {} });
  await assert.rejects(runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } }), /could not review/);
});

test('patches refuse protected fields, missing text and invalid results', () => {
  const blocks = [rich('r1', '<p>One two</p>'), { ...stamp, id: 'img', block_type: 'image', content: { src: 'https://x.test/a.png', alt: 'A cat' } }];
  assert.throws(() => patchBlock(blocks, { blockId: 'r1', path: 'content.html', oldStr: 'three', newStr: 'x' }, validate), PatchError);
  assert.throws(() => patchBlock(blocks, { blockId: 'r1', path: 'id', oldStr: 'r1', newStr: 'x' }, validate), /not an editable text field/);
  assert.ok(!editableFields(blocks[1]).some(([p]) => p === 'content.src'));
  const next = applyPatchToEntity({ blocks }, { blockId: 'r1', path: 'content.html', oldStr: 'two', newStr: '$& three' }, validate);
  assert.equal(next.blocks[0].content.html, '<p>One $& three</p>');
});

test('quote checks ignore case, spacing and curly quotes but not words', () => {
  assert.ok(quoteAppears('He said “don’t   stop” here.', '"Don\'t stop" here'));
  assert.ok(!quoteAppears('He said stop here.', 'He said go here.'));
  assert.ok(!quoteAppears('short note', 'short'));
});

test('a note tagged alchemy-rules is used when Adam has not chosen one', async () => {
  const { store, fetchImpl, docs } = fixture();
  docs.find(d => d.id === 'rules').tags = ['Alchemy-Rules'];
  const { complete, seen } = scripted([[['finish', { summary: 'ok' }]]]);
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.match(seen[0].messages[0].content, /<rules title="Lesson rules">/);
  assert.equal(result.rules.id, 'rules');
});

test('a unit page is reviewed with its own notes shelf and no parent unit', async () => {
  const { store, fetchImpl, docs } = fixture();
  store.rows.set('units/u1', { data: { id: 'u1', title: 'Invented unit', lesson_ids: ['l1'], blocks: [heading('uh', 'Unit overview')] }, etag: '0' });
  const { complete, seen } = scripted([[['propose_edit', { blockId: 'uh', path: 'content.text', oldStr: 'Unit overview', newStr: 'Unit overview and big question', why: 'x' }]], [['finish', { summary: 'ok' }]]]);
  const result = await runAlchemyAgent({ kind: 'unit', id: 'u1', env: { GITHUB_TOKEN: 't' }, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.match(seen[0].messages[0].content, /kind="unit page"/);
  assert.doesNotMatch(seen[0].messages[0].content, /<unit>/);
  assert.equal(result.proposals[0].blockId, 'uh');
});

test('Ann opens a PDF attached to a note and quotes it; a PDF she did not open cannot be cited', async () => {
  const { store, docs } = fixture();
  const article = { id: 'article', title: 'Reading notes', body: 'My short summary.', area: 'notes', tags: [], origins: [], attachments: [{ id: 'attachment_study', kind: 'pdf', r2_key: 'notes/article/study.pdf', filename: 'study.pdf' }] };
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/capture')) return new Response(JSON.stringify({ text: 'Pupils who drew a quokkaplane before reading recalled more of the passage.' }));
    const id = decodeURIComponent(String(url).split('/contents/')[1] ?? '').replace(/^pages\/|\.json$/g, '');
    return id === 'article' ? new Response(JSON.stringify({ sha: 's', encoding: 'base64', content: Buffer.from(JSON.stringify(article)).toString('base64') })) : new Response('{}', { status: 404 });
  };
  const quote = 'Pupils who drew a quokkaplane before reading recalled more';
  const edit = { blockId: 'h1', path: 'content.text', oldStr: 'Warm up', newStr: 'Sketch it first', why: 'Drawing first helps recall.', source: { noteId: 'article', quote } };
  const { complete, seen } = scripted([
    [['read_note', { id: 'article' }]],
    [['propose_edit', edit]],
    [['read_note', { id: 'article', attachment: 'attachment_study' }]],
    [['propose_edit', edit]],
    [['finish', { summary: 'Grounded in the attached study.' }]]
  ]);
  const env = { GITHUB_TOKEN: 't', RESEARCH_KERNEL_SHARED_SECRET: 'k' };
  const result = await runAlchemyAgent({ kind: 'lesson', id: 'l1', env, store, deps: { complete, fetchImpl, noteIndex: async () => docs } });
  assert.match(toolResults(seen[1])[0].content, /"attachments":\[\{"id":"attachment_study","filename":"study.pdf"\}\]/);
  const refused = toolResults(seen[2])[0];
  assert.equal(refused.is_error, true);
  assert.match(refused.content, /quote is not in the note or the PDFs/);
  assert.match(toolResults(seen[3])[0].content, /drew a quokkaplane/);
  assert.equal(result.proposals.length, 1);
  assert.deepEqual(result.proposals[0].source, { noteId: 'article', title: 'Reading notes · study.pdf', quote });
});
