import { renderBlock } from '@/blocks/render';
import { createBlockEditor } from '@/blocks/editors';
import { createBlock } from '@/blocks/create-block';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { applyHingeGates } from '@/blocks/hinge-question/gate';
import type { HingeBlock } from '@/blocks/hinge-question/shared';
import type { Block } from '@/schemas/block';
import '../styles/app.css';

/**
 * Hinge gate preview: a plain student lesson where a gated, independent hinge
 * holds back the reveal. An in-page fake server grades the answer.
 * ?view=student (default) | editor | teacher. Invented content only.
 */

const LESSON = 'lesson_preview';
const text = (id: string, html: string) => ({ ...createBlock('rich_text', id), content: { html } }) as Block;
const section = (id: string, title: string, blocks: Block[]) => {
  const s = createBlock('section', id) as Block & { content: { title: string; blocks: Block[] } };
  return { ...s, content: { ...s.content, title, blocks } } as Block;
};
const base = createBlock('hinge_question', 'prev_hinge') as HingeBlock;
const options = base.content.options.slice(0, 2).map((o, i) => ({ ...o, text: ['Recording 1', 'Recording 2'][i]!, misconception: i ? 'Rewarded confidence over analysis.' : '' }));
const hinge: HingeBlock = {
  ...base,
  content: { ...base.content, prompt: 'Which recording earned the A?', options, correct_id: options[0]!.id, pace: 'independent', gate: true }
};
const blocks: Block[] = [
  section('prev_s1', 'Listen and compare', [
    text('prev_t1', '<p><strong>Recording 1</strong> and <strong>Recording 2</strong> play here, side by side.</p>'),
    text('prev_t2', '<p>Venn: what the two answers share, and where they differ.</p>'),
    hinge,
    text('prev_t3', '<p>Hidden until you answer: a note under the hinge in the same part.</p>')
  ]),
  section('prev_s2', 'The reveal', [text('prev_t4', '<p>Recording 1 was the A. It analyses how a structural choice shapes meaning, with a precise quotation.</p>')]),
  section('prev_s3', 'Reflect', [text('prev_t5', '<p>Did you pick the A? What will you change in your own answers?</p>')])
];

let record: { pick: string } | null = null;
const ok = (data: unknown) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.pathname === `/api/published/hinge/${LESSON}/${hinge.id}`) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.action === 'independent_answer') record = { pick: body.pick };
    if (!record) return ok({ phase: 'independent', first: null, retry: null, done: false });
    const right = record.pick === hinge.content.correct_id;
    return ok({ phase: 'independent', first: { pick: record.pick, sure: null, tier: right ? 'right' : 'mixup', note: right ? '' : 'Listen again for how each one explains the effect.' }, retry: null, done: true, correct_id: hinge.content.correct_id });
  }
  if (url.pathname.startsWith(`/api/lessons/${LESSON}/hinge/`)) return ok({ phase: 'independent', students: [], counts: {} });
  return realFetch(input, init);
};

const mount = document.getElementById('mount')!;
const view = new URLSearchParams(location.search).get('view') ?? 'student';
if (view === 'editor') {
  mount.append(createBlockEditor(hinge, () => undefined));
} else if (view === 'teacher') {
  mount.append(renderBlock(hinge, 'teacher', { lessonId: LESSON }));
} else {
  const page = document.createElement('div');
  page.className = 'lesson-blocks';
  for (const b of filterBlocksForStudent(blocks) as Block[]) page.append(renderBlock(b, 'student', { lessonId: LESSON, pageBlocks: blocks }));
  applyHingeGates(page, blocks);
  mount.append(page);
}
