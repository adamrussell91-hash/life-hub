import { describe, expect, it } from 'vitest';
import {
  applyFilledBoxes,
  estimateLaddersDraft,
  estimateNextStepsFill,
  failingLines,
  fillBoxes,
  fillPrompt,
  laddersPrompt,
  readFillReply,
  readLaddersReply,
  runNextStepsFill,
  settleEntry
} from '@/ai/next-step-jobs';
import { USD_TO_AUD, type ModelReply, type ModelRequest } from '@/ai/job-runner';
import { bankSource, checkWording, rungIndex, RUNG_ORDER } from '@/progress/wording';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import type { Lesson } from '@/schemas/lesson';
import type { SkillsContinuum } from '@/skills/schema';

const LADDER = [
  'Open with one sentence that answers the question.',
  'Name the idea your answer argues in the first sentence.',
  'Make your opening claim one a reader could argue with.',
  'Shape your claim so it sets up your argument.',
  'Open with a claim that adds a fresh angle.'
];
const codes = [
  { id: 'comp_ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with a clear claim.', skill: 'arguing.thesis', ladder: LADDER },
  { id: 'comp_e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Use short evidence.', skill: 'arguing.evidence' },
  { id: 'comp_l', code: 'L', label: 'Length', group: 'composition', criterion: 3, colour: 'gold', descriptor: 'Balance detail.' }
] as FeedbackCode[];

const rung = (n: string) => ({ i_can: `I can ${n}.`, indicators: [], build: { formula: [], parts: [{ id: 'p', name: 'p', job: 'j', language: [] }], example: [['e', null]], why_here: 'w', checks: [], next_move: `Move toward ${n}.` } });
const continuum = {
  strands: [{ schema: 'skills_strand_v1', strand: 'arguing', name: 'Arguing', summary: '', rungs: [], sub_strands: [{ id: 'thesis', name: 'Thesis', in_hsc: '', draws_on: '', outcomes: [], focus_areas: [], points: [], rungs: { capable: rung('capable'), skilled: rung('skilled'), accomplished: rung('accomplished'), excellent: rung('excellent') } }] }]
} as unknown as SkillsContinuum;

function lessonWith(skills: string[] = ['arguing.thesis'], bank?: object): Pick<Lesson, 'blocks'> {
  return {
    blocks: [
      {
        id: 'qs1', type: 'block', block_type: 'question_set', visibility: 'student_teacher',
        content: { questions: [{ id: 'q1', prompt: 'How does the town change across the poem?', kind: 'short_answer', skills, ...(bank ? { next_steps: bank } : {}) }, { id: 'q2', prompt: 'Untagged?', kind: 'short_answer' }] }
      }
    ]
  } as unknown as Pick<Lesson, 'blocks'>;
}

const reply = (text: string): ModelReply => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 200 } });
const good = ['Open with one sentence that names how the town changes.', 'Name the change in the town in your first sentence.', 'Make a claim about the town a reader could argue with.', 'Shape your claim about the town so it sets up each step.', 'Open with a claim about the town that adds a fresh angle.'];

describe('next-step wording (client copy)', () => {
  it('matches the server rules', async () => {
    const server = await import('../../../../netlify/functions/_shared/next-steps.mjs');
    const lines = ['Open with a claim.', 'Do not retell.', 'Use a quote instead of a summary.', 'This is retelling.', 'Don’t list.', '', 'x'.repeat(161), 'Notice the verbs.'];
    for (const line of lines) expect(checkWording(line)).toEqual(server.checkWording(line));
    for (const r of [...RUNG_ORDER, null, 'secure']) expect(rungIndex(r)).toBe(server.rungIndex(r));
    expect(bankSource('Q', ['b.x', 'a.y'], LADDER)).toBe(server.bankSource('Q', ['a.y', 'b.x'], LADDER));
  });
});

describe('next_steps_fill', () => {
  it('finds tagged boxes with a linked laddered code, and the prompt carries question, skills and ladders', () => {
    const boxes = fillBoxes(lessonWith(), [{ block_id: 'qs1', index: 0 }, { block_id: 'qs1', index: 1 }, { block_id: 'nope', index: 0 }], codes);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.codes.map((c) => c.id)).toEqual(['comp_ts']);
    const prompt = fillPrompt(boxes, continuum);
    expect(prompt).toContain('How does the town change across the poem?');
    expect(prompt).toContain('arguing.thesis (Thesis)');
    expect(prompt).toContain('Move toward capable.');
    for (const line of LADDER) expect(prompt).toContain(line);
    expect(fillBoxes(lessonWith(['arguing.evidence']), [{ block_id: 'qs1', index: 0 }], codes)).toHaveLength(0);
  });

  it('keeps edited lines, takes the first passing attempt, and falls back to the ladder', () => {
    const existing = { lines: ['Mine.', 'b', 'c', 'd', 'e'], edited: [true, false, false, false, false], source: 'old' };
    const first = ['x', 'Do not retell.', good[2], 'Never list.', 'This is it.'];
    expect(failingLines(existing, first)).toEqual([1, 3, 4]);
    const fixes = [undefined, good[1], undefined, 'Still not right.'];
    const { entry, flagged } = settleEntry(existing, LADDER, 'new', [first, fixes]);
    expect(entry.lines).toEqual(['Mine.', good[1], good[2], LADDER[3], LADDER[4]]);
    expect(entry.edited).toEqual([true, false, false, false, false]);
    expect(entry.source).toBe('new');
    expect(flagged).toEqual([3, 4]);
  });

  it('runs once, retries failing lines once, and applies only to unchanged boxes', async () => {
    const requests: ModelRequest[] = [];
    const answers = [
      reply(`\`\`\`json\n${JSON.stringify({ boxes: [{ box: 1, codes: { comp_ts: [...good.slice(0, 4), 'Do not stop here.'] } }] })}\n\`\`\``),
      reply(JSON.stringify({ fixes: [{ box: 1, code: 'comp_ts', line: 5, text: 'Add a fresh angle on the town to close.' }] }))
    ];
    const lesson = lessonWith();
    const out = await runNextStepsFill({ lesson, targets: [{ block_id: 'qs1', index: 0 }], codes, continuum, complete: async (r) => (requests.push(r), answers.shift()!) });
    expect(out.status).toBe('done');
    expect(requests.map((r) => r.tier)).toEqual(['fast', 'fast']);
    expect(requests[0]!.tools).toEqual([]);
    expect(String(requests[1]!.messages[0]!.content)).toContain('Do not stop here.');
    const entry = out.boxes[0]!.next_steps.comp_ts!;
    expect(entry.lines[4]).toBe('Add a fresh angle on the town to close.');
    expect(entry.source).toBe(bankSource('How does the town change across the poem?', ['arguing.thesis'], LADDER));
    expect(out.flagged).toEqual([]);
    expect(out.cost_usd).toBeGreaterThan(0);

    const applied = applyFilledBoxes(lesson, out.boxes);
    expect(applied.applied).toBe(1);
    const q = (applied.lesson.blocks[0] as unknown as { content: { questions: Array<{ next_steps?: unknown }> } }).content.questions[0]!;
    expect(q.next_steps).toEqual(out.boxes[0]!.next_steps);
    const changed = lessonWith(['arguing.thesis', 'reading.inference']);
    expect(applyFilledBoxes(changed, out.boxes)).toMatchObject({ applied: 0, skipped: 1 });
  });

  it('an unreadable reply is an error and writes nothing', async () => {
    const out = await runNextStepsFill({ lesson: lessonWith(), targets: [{ block_id: 'qs1', index: 0 }], codes, continuum, complete: async () => reply('Sorry.') });
    expect(out.status).toBe('error');
    expect(out.boxes).toEqual([]);
  });

  it('reads replies loosely and skips junk', () => {
    const got = readFillReply('Here: {"boxes":[{"box":1,"codes":{"comp_ts":["a"]}},{"box":"x"}]}');
    expect([...got.keys()]).toEqual([1]);
  });

  it('estimates in A$ from the assembled prompt', () => {
    const est = estimateNextStepsFill({ lesson: lessonWith(), targets: [{ block_id: 'qs1', index: 0 }], codes, continuum });
    expect(est).toMatchObject({ kind: 'next_steps_fill', model: 'claude-haiku-5-5', boxes: 1, codes: 1, lines: 5 });
    expect(est.input_tokens).toBeGreaterThan(100);
    expect(est.cost_aud).toBeCloseTo(est.cost_usd * USD_TO_AUD, 4);
  });
});

describe('ladders_draft', () => {
  it('prompts with every code that has a skill and flags failing lines', () => {
    const prompt = laddersPrompt(codes, continuum);
    expect(prompt).toContain('Code comp_ts');
    expect(prompt).toContain('Code comp_e');
    expect(prompt).not.toContain('Code comp_l');
    const drafts = readLaddersReply(JSON.stringify({ codes: { comp_ts: { ladder: [...good.slice(0, 4), 'Never stop.'], descriptor: 'Open with a clear claim about the question.' }, comp_l: { ladder: good, descriptor: 'x' } } }), codes);
    expect(drafts.map((d) => d.id)).toEqual(['comp_ts']);
    expect(drafts[0]!.flags.ladder[4]).toEqual(['word:never']);
    expect(drafts[0]!.flags.descriptor).toEqual([]);
    expect(estimateLaddersDraft({ codes, continuum })).toMatchObject({ kind: 'ladders_draft', model: 'claude-sonnet-5-5', codes: 2 });
  });
});
