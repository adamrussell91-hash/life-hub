// tests/unit/question-book-copy.test.js
// The public-repo checks for the Question Book. No shipped string (catalogue, charts, the rules
// card, the Notice prompt, glyph titles, the app's copy) shares eight words in a row with the
// book; and the private questions file fits the catalogue and the answer shapes. Both need
// private files, so they run locally and skip where those are absent, as in CI. Point
// QB_BOOK_PACK at the pack and QB_QUESTIONS_FILE at the questions file, or clone life-hub-data
// beside this repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkQuestionBook, questionBookStrings } from '../../scripts/book-pack/copy-check.mjs';
import { CHAPTERS, CHARTS } from '../../packages/question-book/catalogue.mjs';
import { RESPONSE_TYPES, normalizeAnswer } from '../../packages/question-book/answers.mjs';
import { indexQuestions } from '../../netlify/functions/_shared/question-book.mjs';

const PACK = process.env.QB_BOOK_PACK ?? fileURLToPath(new URL('../../../life-hub-data/book-packs/question-book', import.meta.url));
const FILE = process.env.QB_QUESTIONS_FILE ?? fileURLToPath(new URL('../../../life-hub-data/data/tasks/question-book/questions.json', import.meta.url));
const packPresent = existsSync(`${PACK}/entries`);
const filePresent = existsSync(FILE);

test('the shipped strings include the catalogue, the Notice prompt and the glyph titles', async () => {
  const where = new Set((await questionBookStrings()).map(([w]) => w.split(' ')[0]));
  for (const kind of ['catalogue', 'prompt', 'glyph']) assert.ok(where.has(kind), kind);
});

test('no shipped string copies eight words in a row from the book', { skip: packPresent ? false : 'the private pack is not on disk' }, async () => {
  assert.deepEqual(await checkQuestionBook(PACK), []);
});

test('no book page numbers or printed-page claims ship', async () => {
  for (const [where, text] of await questionBookStrings()) {
    assert.doesNotMatch(text, /\b(pp?\.|pdf page|printed page)\s*\d/i, where);
    assert.doesNotMatch(text, /\bpage \d+\b/i, where);
  }
});

/** A filled-in value for any question, to prove every one can be answered. */
function sample(question, charts) {
  const r = question.response;
  switch (r.type) {
    case 'list': return Array(r.count).fill('x');
    case 'time': return '07:30';
    case 'image_choice': case 'choices': return r.options[0];
    case 'chart': return charts[r.chart].family === 'quadrant' ? { items: [{ label: 'a', cell: charts[r.chart].structure.cells[0].id }] } : { points: [{ label: 'a', x: 1, y: 10 }] };
    case 'continuum': return 0;
    case 'ranking': return [...r.items];
    case 'choice_table': return r.rows.map(() => r.columns[0]);
    case 'comparison': return r.questionRefs[0];
    case 'paired_times': case 'sibling_table': return r.columns.map(() => 'y');
    case 'three_circle_diagram': return Array(r.slots).fill('y');
    case 'profile': return r.scales.map(() => r.min);
    case 'topic_fields': return r.topics.map(() => 't');
    case 'paired_choices': return r.pairs.map((pair) => pair[0]);
    case 'scenario_fields': return r.fields.map(() => 's');
    case 'gauge': return r.min;
    case 'shares': return r.labels.map((_, i) => (i === 0 ? 100 : 0));
    case 'ladder_markers': return Object.fromEntries(Object.keys(r.markers).map((key) => [key, 0]));
    default: return 'words';
  }
}

test('the private questions file fits the catalogue and every question can be answered', { skip: filePresent ? false : 'the private questions file is not on disk' }, () => {
  const file = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(file.questions.length, 606);
  const source = indexQuestions(file);
  assert.equal(source.byId.size, 606);
  for (const ch of CHAPTERS) assert.equal(source.byChapter.has(ch.id), ch.kind === 'questions', ch.id);
  for (const c of CHARTS) assert.deepEqual(file.charts[c.id].structure, c.structure, c.id);
  for (const q of file.questions) {
    assert.ok(RESPONSE_TYPES.includes(q.response.type), q.id);
    const parts = Object.fromEntries((q.parts ?? []).map((part, i) => [i, part.options ? part.options[0] : 'because']));
    assert.ok(normalizeAnswer(q, { main: sample(q, source.charts), parts }, source.charts[q.response.chart]), q.id);
  }
});
