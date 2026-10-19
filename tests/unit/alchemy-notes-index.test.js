import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { plainText, tarEntries, refreshNoteIndex, searchNotes, noteFilters, bestPassage, readNoteText, readAttachmentText, NOTE_INDEX_KEY } from '../../netlify/functions/_shared/alchemy-notes-index.mjs';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';

/** A minimal ustar archive with a top folder, as GitHub's tarball has. */
export function tarGz(files) {
  const blocks = [];
  for (const [path, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write('repo-abc123/' + path, 0, 100);
    header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136); header.write('        ', 148); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
    let sum = 0; for (const byte of header) sum += byte;
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const page = (id, title, body, extra = {}) => ({ id, title, body, area: 'notes', tags: [], origins: [], updated_at: '2026-10-01T00:00:00.000Z', ...extra });
const githubFile = value => new Response(JSON.stringify({ sha: 's', encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') }));

function archive(pages, { removed = [] } = {}) {
  const calls = { tarball: 0, pages: [] };
  const manifest = pages.filter(p => !removed.includes(p.id)).map(p => ({ id: p.id, title: p.title, area: p.area, tags: p.tags, excerpt: p.body.slice(0, 157), updated_at: p.updated_at, origins: p.origins }));
  const fetchImpl = async url => {
    const href = String(url);
    if (href.includes('/tarball/')) { calls.tarball++; return new Response(tarGz(Object.fromEntries(pages.map(p => ['pages/' + p.id + '.json', JSON.stringify(p)])))); }
    const path = decodeURIComponent(href.split('/contents/')[1]);
    if (path === 'manifest.json') return githubFile(manifest);
    const id = path.replace(/^pages\/|\.json$/g, '');
    calls.pages.push(id);
    const found = pages.find(p => p.id === id);
    return found ? githubFile(found) : new Response('{}', { status: 404 });
  };
  return { fetchImpl, calls };
}

const env = { GITHUB_TOKEN: 'test' };

test('plain text drops markup but keeps the words', () => {
  assert.equal(plainText('<p>Use <b>cold calling</b></p><p>then wait</p>'), 'Use cold calling\nthen wait');
  assert.equal(plainText('## Heading\n\nSee [the article](https://x.test) and *this*'), 'Heading\n\nSee the article and this');
});

test('tar entries drop the top folder and return each file', () => {
  const entries = [...tarEntries(tarGz({ 'manifest.json': '[]', 'pages/a.json': '{"id":"a"}' }))];
  assert.deepEqual(entries.map(e => e.path), ['manifest.json', 'pages/a.json']);
  assert.equal(entries[1].data.toString(), '{"id":"a"}');
});

test('first build reads the archive once and indexes whole notes, not the excerpt', async () => {
  const long = 'Opening paragraph about classroom routines. '.repeat(10) + 'Retrieval practice works best when spaced across lessons.';
  const pages = Array.from({ length: 45 }, (_, i) => page('n' + i, 'Note ' + i, 'Filler text ' + i));
  pages.push(page('deep', 'Memory research', long));
  const { fetchImpl, calls } = archive(pages);
  const store = memoryAlchemyStore();
  const docs = await refreshNoteIndex({ store, env, fetchImpl });
  assert.equal(calls.tarball, 1);
  assert.equal(docs.length, 46);
  const hits = searchNotes(docs, { query: 'spaced retrieval practice' });
  assert.equal(hits[0].id, 'deep');
  assert.match(hits[0].passage, /Retrieval practice works best when spaced/);
  assert.ok(store.rows.has(NOTE_INDEX_KEY));
});

test('a refresh re-reads only changed notes and drops deleted ones', async () => {
  const pages = Array.from({ length: 45 }, (_, i) => page('n' + i, 'Note ' + i, 'Filler ' + i));
  const store = memoryAlchemyStore();
  await refreshNoteIndex({ store, env, fetchImpl: archive(pages).fetchImpl });
  pages[3] = { ...pages[3], body: 'Now about questioning', updated_at: '2026-10-05T00:00:00.000Z' };
  const second = archive(pages, { removed: ['n7'] });
  const docs = await refreshNoteIndex({ store, env, fetchImpl: second.fetchImpl });
  assert.equal(second.calls.tarball, 0);
  assert.deepEqual(second.calls.pages, ['n3']);
  assert.equal(docs.length, 44);
  assert.ok(!docs.some(d => d.id === 'n7'));
  assert.equal(searchNotes(docs, { query: 'questioning' })[0].id, 'n3');
});

test('filters are exact: tags, origin and area', () => {
  const docs = [
    { id: 'a', title: 'Feedback', area: 'university', tags: ['Assessment'], origins: [{ kind: 'degree', label: 'Master of Teaching' }], updated_at: '', text: 'feedback loops' },
    { id: 'b', title: 'Feedback', area: 'notes', tags: ['Reading'], origins: [{ kind: 'book', label: 'Invented Book' }], updated_at: '', text: 'feedback loops' }
  ];
  assert.deepEqual(searchNotes(docs, { query: 'feedback', tags: ['assessment'] }).map(h => h.id), ['a']);
  assert.deepEqual(searchNotes(docs, { query: 'feedback', origin_kind: 'book' }).map(h => h.id), ['b']);
  assert.deepEqual(searchNotes(docs, { query: 'feedback', area: 'university' }).map(h => h.id), ['a']);
  assert.deepEqual(searchNotes(docs, { query: '', origin_label: 'master' }).map(h => h.id), ['a']);
  const filters = noteFilters(docs);
  assert.equal(filters.notes, 2);
  assert.deepEqual(filters.tags.map(t => t.name), ['Assessment', 'Reading']);
});

test('best passage picks the window with the most query words', () => {
  const text = 'Unrelated start. Another unrelated line. Worked examples reduce load for novices. Closing words.';
  assert.match(bestPassage(text, ['worked', 'example', 'novice'], 40), /Worked examples reduce load/);
});

test('reading a note returns live text in pages and refuses deleted notes', async () => {
  const body = 'x'.repeat(15000);
  const pages = [page('big', 'Big', body), page('gone', 'Gone', 'old', { status: 'trashed' })];
  const { fetchImpl } = archive(pages);
  const first = await readNoteText('big', { env, fetchImpl });
  assert.equal(first.text.length, 12000);
  assert.equal(first.next, 12000);
  const second = await readNoteText('big', { env, fetchImpl, offset: first.next });
  assert.equal(second.text.length, 3000);
  assert.equal(second.next, null);
  assert.equal(await readNoteText('gone', { env, fetchImpl }), null);
});

// PDF attachments: the kernel's /capture stands in for Workers AI reading the file in R2.
const kernelEnv = { GITHUB_TOKEN: 'test', RESEARCH_KERNEL_SHARED_SECRET: 'k' };
const pdf = (pageId, filename) => ({ id: 'attachment_' + filename.replace(/\W/g, ''), kind: 'pdf', r2_key: `notes/${pageId}/${filename}`, filename, content_type: 'application/pdf' });
const ARTICLE = 'Abstract. Students who sketched a quokkaplane diagram before reading recalled more. The effect held across three invented schools.';

function withKernel({ fetchImpl }, texts, { fail = [] } = {}) {
  const extracted = [];
  const wrapped = async (url, init) => {
    if (String(url).endsWith('/capture')) {
      const { r2_key } = JSON.parse(init.body);
      extracted.push(r2_key);
      if (fail.includes(r2_key)) return new Response(JSON.stringify({ error: 'unreadable' }), { status: 502 });
      return new Response(JSON.stringify({ text: texts[r2_key] ?? '' }));
    }
    return fetchImpl(url, init);
  };
  return { fetchImpl: wrapped, extracted };
}

test('a note is found by words only in its PDF, and the PDF is extracted once', async () => {
  const pages = [
    page('article', 'Reading notes', 'My summary of the drawing study.', { attachments: [pdf('article', 'study.pdf'), { id: 'img', kind: 'image', r2_key: 'notes/article/pic.png', filename: 'pic.png' }] }),
    page('other', 'Other note', 'Nothing about diagrams here.')
  ];
  const store = memoryAlchemyStore();
  const kernel = withKernel(archive(pages), { 'notes/article/study.pdf': ARTICLE });
  const progress = [];
  const docs = await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: kernel.fetchImpl, onProgress: p => progress.push(p) });
  assert.deepEqual(kernel.extracted, ['notes/article/study.pdf']);
  assert.ok(progress.includes('Reading the PDFs attached to your notes'));
  const [hit] = searchNotes(docs, { query: 'quokkaplane' });
  assert.equal(hit.id, 'article');
  assert.match(hit.passage, /sketched a quokkaplane diagram/);
  assert.deepEqual(hit.passage_from, { attachment: 'attachment_studypdf', filename: 'study.pdf' });
  assert.deepEqual(hit.attachments, [{ id: 'attachment_studypdf', filename: 'study.pdf', readable: true }]);
  assert.equal(searchNotes(docs, { query: 'summary drawing' })[0].passage_from, undefined);

  // Unchanged notes: no second extraction. A re-read note keeps its PDF text.
  const again = withKernel(archive(pages), {});
  await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: again.fetchImpl });
  pages[0] = { ...pages[0], body: 'Edited summary.', updated_at: '2026-10-09T00:00:00.000Z' };
  const edited = withKernel(archive(pages), {});
  const docs2 = await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: edited.fetchImpl });
  assert.deepEqual([...again.extracted, ...edited.extracted], []);
  assert.equal(searchNotes(docs2, { query: 'quokkaplane' })[0].id, 'article');
});

test('PDF text waits when the kernel is unbound and a failed PDF is retried a day later', async () => {
  const pages = [page('a', 'Note with PDFs', 'Short note.', { attachments: [pdf('a', 'good.pdf'), pdf('a', 'bad.pdf')] })];
  const store = memoryAlchemyStore();
  const unbound = withKernel(archive(pages), {});
  const docs = await refreshNoteIndex({ store, env, fetchImpl: unbound.fetchImpl, now: Date.parse('2026-10-10T00:00:00Z') });
  assert.deepEqual(unbound.extracted, []);
  assert.deepEqual(docs[0].attachments.map(a => a.state), ['pending', 'pending']);

  const texts = { 'notes/a/good.pdf': 'The zebrafinch protocol uses two prompts.' };
  const first = withKernel(archive(pages), texts, { fail: ['notes/a/bad.pdf'] });
  const filled = await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: first.fetchImpl, now: Date.parse('2026-10-10T01:00:00Z') });
  assert.deepEqual(filled[0].attachments.map(a => a.state), ['ok', 'failed']);
  assert.equal(searchNotes(filled, { query: 'zebrafinch' })[0].id, 'a');

  const soon = withKernel(archive(pages), texts);
  await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: soon.fetchImpl, now: Date.parse('2026-10-10T05:00:00Z') });
  assert.deepEqual(soon.extracted, []);
  const later = withKernel(archive(pages), { 'notes/a/bad.pdf': 'Recovered words.' });
  const retried = await refreshNoteIndex({ store, env: kernelEnv, fetchImpl: later.fetchImpl, now: Date.parse('2026-10-11T02:00:00Z') });
  assert.deepEqual(later.extracted, ['notes/a/bad.pdf']);
  assert.deepEqual(retried[0].attachments.map(a => a.state), ['ok', 'ok']);
});

test('reading a PDF returns its text in pages, extracting it on demand', async () => {
  const long = 'Invented article sentence. '.repeat(600);
  const pages = [page('n', 'Note', 'Note body.', { attachments: [pdf('n', 'long.pdf')] }), page('gone', 'Gone', 'x', { status: 'trashed', attachments: [pdf('gone', 'x.pdf')] })];
  const store = memoryAlchemyStore();
  const kernel = withKernel(archive(pages), { 'notes/n/long.pdf': long });
  const note = await readNoteText('n', { env: kernelEnv, fetchImpl: kernel.fetchImpl });
  assert.deepEqual(note.attachments, [{ id: 'attachment_longpdf', filename: 'long.pdf' }]);
  const first = await readAttachmentText('n', 'attachment_longpdf', { store, env: kernelEnv, fetchImpl: kernel.fetchImpl });
  assert.deepEqual(first.attachment, { id: 'attachment_longpdf', filename: 'long.pdf' });
  assert.equal(first.text.length, 12000);
  const second = await readAttachmentText('n', 'long.pdf', { store, env: kernelEnv, fetchImpl: kernel.fetchImpl, offset: first.next });
  assert.equal(second.offset, 12000);
  assert.equal(kernel.extracted.length, 1);
  assert.match((await readAttachmentText('n', 'missing', { store, env: kernelEnv, fetchImpl: kernel.fetchImpl })).error, /no PDF/);
  assert.equal(await readAttachmentText('gone', 'attachment_xpdf', { store, env: kernelEnv, fetchImpl: kernel.fetchImpl }), null);
});
