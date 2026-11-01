import { describe, expect, it } from 'vitest';
import {
  LONG_BATCH,
  NO_CRITERIA,
  estimateAnswerMarking,
  markingCalls,
  markingPrompt,
  markingSummary,
  readMarkingReply,
  runAnswerMarking,
  type MarkingAnswer,
  type MarkingQuestion
} from '@/ai/answer-marking-jobs';
import { TEACHING_AI_MODELS, type ModelReply, type ModelRequest } from '@/ai/job-runner';

const short: MarkingQuestion = { ref: 'q1', kind: 'short_answer', marks: 1, prompt: 'Name the technique in “the wind howled”.', accepted: ['personification'], looking_for: 'Gives the wind a human action.' };
const gap: MarkingQuestion = { ref: 'q2', kind: 'fill_gap', marks: 2, prompt: '', passage: 'Shall I [gap g1] thee to a summer’s [gap g2]?', gaps: { g1: ['compare'], g2: ['day', 'morning'] } };
const essay: MarkingQuestion = { ref: 'q3', kind: 'extended_response', marks: 4, prompt: 'How does the ending change the town?', guide: '1 for a claim, 2 for evidence, 1 for effect.' };
const bare: MarkingQuestion = { ref: 'q4', kind: 'explain_effect', marks: 3, prompt: 'Explain the effect.', quote: 'The wind howled.' };

const reply = (text: string): ModelReply => ({ content: [{ type: 'text', text }], usage: { input_tokens: 800, output_tokens: 120 } });
const recorder = (texts: string[]) => {
  const requests: ModelRequest[] = [];
  const complete = async (request: ModelRequest) => {
    requests.push(request);
    return reply(texts.shift() ?? '{}');
  };
  return { requests, complete };
};

describe('AI answer marking job', () => {
  it('marks short answers right, wrong or unsure', async () => {
    const answers: MarkingAnswer[] = [
      { id: 'a1', question: 'q1', text: 'personifcation' },
      { id: 'a2', question: 'q1', text: 'a simile' },
      { id: 'a3', question: 'q1', text: 'it makes the wind seem alive' }
    ];
    const { requests, complete } = recorder([
      JSON.stringify({ marks: [{ id: 'a1', verdict: 'right', reason: 'Misspelt, same term.' }, { id: 'a2', verdict: 'wrong', reason: 'Names a simile.' }, { id: 'a3', verdict: 'unsure', reason: 'Describes the effect, names nothing.' }] })
    ]);
    const done = await runAnswerMarking({ complete, questions: [short], answers });
    expect(done.status).toBe('done');
    expect(done.marks.map((m) => [m.id, m.verdict, m.marks])).toEqual([['a1', 'right', 1], ['a2', 'wrong', 0], ['a3', 'unsure', null]]);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.model).toBe(TEACHING_AI_MODELS.fast);
    const prompt = String(requests[0]!.messages[0]!.content);
    expect(prompt).toContain('Looking for: Gives the wind a human action.');
    expect(prompt).toContain('{"id":"a1","text":"personifcation"}');
    expect(markingSummary(done.marks, done.waiting)).toBe('Marked 2 · 1 for you to check');
  });

  it('marks fill the gap per gap, with exact gaps right already', () => {
    const answers: MarkingAnswer[] = [
      { id: 'a1', question: 'q2', gaps: { g1: 'compare', g2: 'evening' } },
      { id: 'a2', question: 'q2', gaps: { g1: 'liken', g2: 'dya' } },
      { id: 'a3', question: 'q2', gaps: { g1: 'contrast', g2: 'day' } }
    ];
    // Only the gaps that need the AI are sent.
    expect(markingPrompt(gap, answers)).toContain('{"id":"a1","gaps":{"g2":"evening"}}');
    const marks = readMarkingReply(
      JSON.stringify({ marks: [{ id: 'a1', gaps: { g2: 'wrong' }, reason: 'Evening changes the time.' }, { id: 'a2', gaps: { g1: 'right', g2: 'right' }, reason: 'Synonym and a typo.' }, { id: 'a3', gaps: { g1: 'unsure' }, reason: 'Opposite sense.' }] }),
      gap,
      answers,
      'm'
    );
    expect(marks.map((m) => [m.id, m.marks, m.gaps])).toEqual([
      ['a1', 1, { g1: 'right', g2: 'wrong' }],
      ['a2', 2, { g1: 'right', g2: 'right' }],
      ['a3', null, { g1: 'unsure', g2: 'right' }]
    ]);
    // A gap the AI was asked about but skipped leaves the answer waiting.
    expect(readMarkingReply(JSON.stringify({ marks: [{ id: 'a2', gaps: { g1: 'right' }, reason: 'x' }] }), gap, answers, 'm')).toEqual([]);
  });

  it('marks long answers with marks and feedback on the standard lane, in calls of 12', async () => {
    const answers: MarkingAnswer[] = Array.from({ length: LONG_BATCH + 2 }, (_, i) => ({ id: `a${i + 1}`, question: 'q3', text: `Answer ${i + 1} about the town.` }));
    const row = (id: string) => ({ id, marks: 2.5, unsure: false, reason: 'Clear claim, thin evidence.', feedback: 'You open with a clear claim about the town. Add a quote that shows the change.' });
    const { requests, complete } = recorder([
      JSON.stringify({ marks: answers.slice(0, LONG_BATCH).map((a) => row(a.id)) }),
      JSON.stringify({ marks: [row(`a${LONG_BATCH + 1}`), { id: `a${LONG_BATCH + 2}`, marks: 3, unsure: true, reason: 'Could be 2 or 3.', feedback: 'You explain the effect well. Add how the ending links back.' }] })
    ]);
    const done = await runAnswerMarking({ complete, questions: [essay], answers });
    expect(requests.map((r) => [r.model, r.tier])).toEqual([[TEACHING_AI_MODELS.standard, 'standard'], [TEACHING_AI_MODELS.standard, 'standard']]);
    expect(String(requests[0]!.messages[0]!.content)).toContain('How to mark it: 1 for a claim');
    expect(done.marks).toHaveLength(LONG_BATCH + 2);
    expect(done.marks[0]).toMatchObject({ marks: 2.5, feedback: expect.stringContaining('Add a quote') });
    expect(done.marks.at(-1)).toMatchObject({ marks: null, suggested: 3 });
  });

  it('marks a long answer with no criteria against the question, and says so', () => {
    const answers: MarkingAnswer[] = [{ id: 'a1', question: 'q4', text: 'The howl makes the wind seem angry.' }];
    expect(markingPrompt(bare, answers)).toContain('No criteria given');
    const [mark] = readMarkingReply(JSON.stringify({ marks: [{ id: 'a1', marks: 2, unsure: false, reason: 'Names an effect.', feedback: 'You name the mood. Add what the howl suggests about the storm.' }] }), bare, answers, 'm');
    expect(mark!.reason.startsWith(NO_CRITERIA)).toBe(true);
  });

  it('a malformed reply leaves every answer waiting', async () => {
    const answers: MarkingAnswer[] = [{ id: 'a1', question: 'q1', text: 'simile' }, { id: 'a2', question: 'q1', text: 'metaphor' }];
    const done = await runAnswerMarking({ complete: recorder(['Sorry, here are the marks: right, wrong']).complete, questions: [short], answers });
    expect(done.status).toBe('done');
    expect(done.marks).toEqual([]);
    expect(done.waiting).toBe(2);
    expect(markingSummary(done.marks, done.waiting)).toBe('Marked 0 · 2 for you to check');
  });

  it('drops unknown ids, bad verdicts and out-of-range marks', () => {
    const shorts: MarkingAnswer[] = [{ id: 'a1', question: 'q1', text: 'simile' }];
    expect(readMarkingReply(JSON.stringify({ marks: [{ id: 'a9', verdict: 'right', reason: 'x' }, { id: 'a1', verdict: 'maybe', reason: 'x' }] }), short, shorts, 'm')).toEqual([]);
    const longs: MarkingAnswer[] = [{ id: 'a1', question: 'q3', text: 'Text' }, { id: 'a2', question: 'q3', text: 'Text' }];
    const marks = readMarkingReply(
      JSON.stringify({ marks: [{ id: 'a1', marks: 5, reason: 'x', feedback: 'You add detail.' }, { id: 'a2', marks: -1, reason: 'x', feedback: 'You add detail.' }] }),
      essay,
      longs,
      'm'
    );
    expect(marks).toEqual([]);
  });

  it('never sends an empty answer, and makes no call when nothing is left', async () => {
    const answers: MarkingAnswer[] = [
      { id: 'a1', question: 'q1', text: '   ' },
      { id: 'a2', question: 'q2', gaps: { g1: '', g2: 'day' } }
    ];
    expect(markingCalls([short, gap], answers)).toEqual([]);
    const { requests, complete } = recorder([]);
    const done = await runAnswerMarking({ complete, questions: [short, gap], answers });
    expect(requests).toHaveLength(0);
    expect(done.status).toBe('error');
  });

  it('estimates without calling a model: one call per short question', () => {
    const answers: MarkingAnswer[] = Array.from({ length: 28 }, (_, i) => ({ id: `a${i + 1}`, question: 'q1', text: `answer ${i}` }));
    const estimate = estimateAnswerMarking({ questions: [short], answers });
    expect(estimate).toMatchObject({ kind: 'quiz_ai_mark', answers: 28, questions: 1, calls: 1 });
    expect(estimate.cost_aud).toBeGreaterThan(0);
    expect(estimate.cost_aud).toBeLessThan(0.05);
  });
});
