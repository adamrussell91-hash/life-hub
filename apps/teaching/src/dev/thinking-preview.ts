import { renderBlock } from '@/blocks/render';
import { createBlockEditor } from '@/blocks/editors';
import { createBlock, createChoiceBoard } from '@/blocks/create-block';
import { filterBlocksForStudent } from '@/blocks/visibility';
import type { Block } from '@/schemas/block';
import '../styles/app.css';

/**
 * Level 2 thinking blocks preview with an in-page fake class server, so the
 * student, teacher and Display views run without Netlify.
 * ?block=d9|venn|choice|combining|appositive|expansion|notes
 * ?view=editor|teacher|display|student|print. Invented texts and students only.
 */

const LESSON = 'lesson_preview';
type Rec = { at: string; kind: string; initials: string; data: Record<string, unknown> };
const records = new Map<string, Map<string, Rec>>();
const store = (blockId: string) => {
  if (!records.has(blockId)) records.set(blockId, new Map());
  return records.get(blockId)!;
};

const CARDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];
const shuffle = (seed: number) => {
  const a = [...CARDS];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = (seed * (i + 7)) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const fakeStudents = ['JT', 'RK', 'MO', 'AL', 'SP', 'HN'];
fakeStudents.forEach((initials, i) => {
  const first = i < 4 ? CARDS : shuffle(i + 3);
  const rerank = i % 2 ? [...first.slice(0, 4).reverse(), ...first.slice(4)] : first;
  store('prev_d9').set(`dev_${i}`, {
    at: `2026-11-11T09:0${i}:00Z`, kind: 'diamond', initials,
    data: { rounds: { first: { slots: first, reasons: { [first[0]!]: 'It sets up the clock image the whole poem turns on.', [first[8]!]: 'It is only scenery here.' } }, rerank: { slots: rerank, reasons: {}, why: {} } } }
  });
  store('prev_venn').set(`dev_${i}`, {
    at: `2026-11-11T09:1${i}:00Z`, kind: 'venn', initials,
    data: {
      synthesis: 'Both texts explore waiting, but where the poem makes it patient, the film makes it restless.',
      points: [
        { id: `p${i}a`, text: 'Set by the sea', region: 'ab', depth: 'surface', quotes: {}, differs: { a: 'A calm harbour', b: 'A storm coast' } },
        { id: `p${i}b`, text: 'Time as something owed', region: 'a', depth: 'deep', quotes: { a: '“the tide keeps its accounts”' }, differs: {} },
        { id: `p${i}c`, text: 'Hope arrives late', region: i % 2 ? 'ab' : 'b', depth: 'deep', quotes: {}, differs: i % 2 ? { a: 'as a promise', b: 'as a rescue' } : {} }
      ]
    }
  });
  store('prev_choice').set(`dev_${i}`, {
    at: `2026-11-11T09:2${i}:00Z`, kind: 'choice', initials,
    data: { picks: [0, 3, 6].map((index) => ({ tab: `prev_choice_t${index + 1 + (i % 3)}`, index: index + (i % 3), tier: (i % 3) + 1, reason: 'I want to try the harder reading.', started: true, finished: i > 2, rating: 2, learned: 'The refrain changes meaning each time.' })) }
  });
});

const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  const path = url.pathname;
  const list = (blockId: string) => ({ lesson_id: LESSON, block_id: blockId, responses: [...store(blockId).values()] });
  if (path === `/api/published/thinking/${LESSON}`) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    const kind = String(body.block_id).includes('d9') ? 'diamond' : String(body.block_id).includes('venn') ? 'venn' : 'choice';
    store(body.block_id).set(body.device_id, { at: new Date().toISOString(), kind, initials: body.initials ?? '', data: body.data });
    const layouts = [...store(body.block_id).values()].map((r) => (r.data.rounds as { first?: { slots?: string[] } } | undefined)?.first?.slots).filter(Boolean);
    return ok(kind === 'diamond' && body.data?.rounds?.first ? { saved: true, class: { layouts } } : { saved: true });
  }
  if (path === `/api/lessons/${LESSON}/thinking`) {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'));
      store(body.block_id).clear();
      return ok(list(body.block_id));
    }
    return ok(list(url.searchParams.get('block_id') ?? ''));
  }
  return realFetch(input, init);
};

const CARD_TEXT = [
  'The harbour clock that stops at high tide',
  '“the tide keeps its accounts”',
  'The daughter who waits on the pier',
  'The repeated line about salt',
  'The final stanza’s single word',
  'The gulls that circle twice',
  'The father’s unopened letter',
  'The switch from past to present tense',
  'The title'
];

function sample(kind: string): Block {
  if (kind === 'venn') {
    const b = createBlock('venn', 'prev_venn') as Extract<Block, { block_type: 'venn' }>;
    return { ...b, content: { ...b.content, prompt: 'How do the two texts present waiting?', texts: [{ label: 'The Tide Clock' }, { label: 'Salt Roads' }], preload: [{ id: 'pre1', text: 'A character keeps watch' }, { id: 'pre2', text: 'Weather mirrors feeling' }] } };
  }
  if (kind === 'choice') {
    const b = createChoiceBoard('prev_choice');
    const labels = ['Retell the poem in six lines', 'Map the tide images', 'Rewrite the ending', 'Find three verbs of time', 'Compare two stanzas', 'Write the daughter’s letter', 'Explain the title', 'Argue for the key line', 'Design a cover with a quote'];
    const kinds = ['Write', 'Analyse', 'Create'];
    return { ...b, content: { ...b.content, choice: { pick: 3, columns: 3, rule: 'each_column' }, tabs: b.content.tabs.map((t, i) => ({ ...t, label: labels[i]!, kind: kinds[i % 3]!, blocks: [{ ...(createBlock('question_set', `prev_q${i}`) as Block), content: { questions: [{ id: `prev_q${i}_1`, prompt: `${labels[i]}.`, kind: 'short_answer', response_space: 'medium' }] } } as Block] })) } } as Block;
  }
  const formats: Record<string, [string, Record<string, unknown>[]]> = {
    combining: ['sentence_combining', [
      { kernels: ['The clock stops.', 'The tide is high.'], conjunction: 'when', model_answer: 'The clock stops when the tide is high.' },
      { kernels: ['The daughter waits on the pier.', 'The boat is late.'], conjunction: 'although', model_answer: 'Although the boat is late, the daughter waits on the pier.' },
      { kernels: ['The letter stays sealed.', 'Her father wrote it.'], conjunction: 'which', model_answer: 'The letter, which her father wrote, stays sealed.' }
    ]],
    appositive: ['appositive', [
      { kernels: ['The clock stops at high tide.'], model_answer: 'The clock, a gift from the harbour master, stops at high tide.' },
      { kernels: ['The daughter waits on the pier.'], model_answer: 'The daughter, the poem’s only voice, waits on the pier.' }
    ]],
    expansion: ['sentence_expansion', [
      { kernels: ['She waits.'], question_words: ['who', 'where', 'why'], model_answer: 'The daughter waits on the pier because her father’s boat is due.' },
      { kernels: ['The clock stops.'], question_words: ['when', 'why'], model_answer: 'At high tide the clock stops, as if time owes the sea.' },
      { kernels: ['The gulls circle.'], question_words: ['where', 'how'], model_answer: 'The gulls circle twice over the harbour, slow as a countdown.' }
    ]],
    notes: ['note_to_topic', [
      { kernels: ['clock = time', 'stops at high tide', 'sea controls time'], model_answer: 'In the poem the sea, not the clock, decides when time moves.' },
      { kernels: ['daughter waits', 'letter unopened', 'hope delayed'], model_answer: 'The poem shows hope as something kept sealed until it can be risked.' }
    ]]
  };
  if (formats[kind]) {
    const [format, items] = formats[kind]!;
    const b = createBlock('question_set', `prev_${kind}`) as Extract<Block, { block_type: 'question_set' }>;
    return { ...b, content: { ...b.content, format: format as never, sentence: { fade: true, word_limit: 25 }, questions: items.map((it, i) => ({ id: `prev_${kind}_${i}`, prompt: '', kind: 'short_answer' as const, ...it })) } } as Block;
  }
  const b = createBlock('diamond_nine', 'prev_d9') as Extract<Block, { block_type: 'diamond_nine' }>;
  return { ...b, content: { ...b.content, title: 'What matters most in The Tide Clock?', criterion: 'Most significant to the poem’s meaning', second_criterion: 'Most memorable for a first-time reader', frame: true, cards: b.content.cards.map((c, i) => ({ ...c, id: CARDS[i]!, kind: i === 1 ? 'quote' as const : 'text' as const, text: CARD_TEXT[i]!, ...(i === 1 ? { source: 'stanza 2' } : {}) })) } };
}

const params = new URLSearchParams(location.search);
const kind = params.get('block') ?? 'd9';
const view = params.get('view') ?? 'student';
let block = sample(kind);
const mount = document.getElementById('mount')!;
const nav = document.createElement('p');
const link = (k: string, v: string) => `?block=${k}&amp;view=${v}`;
nav.innerHTML = ['d9', 'venn', 'choice', 'combining', 'appositive', 'expansion', 'notes']
  .map((k) => `<b>${k}</b>: ${['editor', 'teacher', 'display', 'student', 'print'].map((v) => `<a href="${link(k, v)}">${v}</a>`).join(' ')}`)
  .join(' · ');

if (view === 'editor') {
  let current: Block = block;
  const host = document.createElement('div');
  const paint = () => host.replaceChildren(renderBlock(current, 'teacher', {}));
  const editor = createBlockEditor(block, (next) => { current = next; paint(); }, () => current, { lessonId: LESSON });
  paint();
  mount.replaceChildren(nav, editor, document.createElement('hr'), host);
} else if (view === 'student') {
  block = filterBlocksForStudent([block])[0] as Block;
  mount.replaceChildren(nav, renderBlock(block, 'student', { lessonId: LESSON }));
} else if (view === 'print') {
  mount.replaceChildren(nav, renderBlock(block, 'print', { lessonId: LESSON }));
} else {
  mount.replaceChildren(nav, renderBlock(block, 'teacher', { lessonId: LESSON, display: view === 'display' }));
}
