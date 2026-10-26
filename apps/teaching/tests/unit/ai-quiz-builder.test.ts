import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';
import { AI_TOOLS, parseToolProposal, type AiProposal } from '@/ai/proposals';
import { questionGiveaways, quizProposalIssues } from '@/ai/quiz-proposal';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { buildAiLessonContext } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import {
  estimateCostUsd,
  isBigBuild,
  planConfirmed,
  PLAN_MARKER,
  runLessonAiJob,
  webSearchTool,
  type ModelReply,
  type ModelRequest
} from '@/ai/job-runner';
import { QUIZ_QUESTION_KINDS, checkQuestion } from '@/quiz/core';
import { validateMutatingProposal } from '@/ai/validate-proposal';
import type { AiJob } from '@/ai/jobs';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';

const NOW = '2026-10-21T00:00:00.000Z';

function lesson(mode?: 'quiz' | 'direct_instruction', blocks: Block[] = [createBlock('heading', 'b_head')]): Lesson {
  return {
    id: 'lesson_ww1',
    type: 'lesson',
    title: 'Causes of WWI',
    slug: 'causes-of-ww1',
    status: 'active',
    unit_id: 'unit_1',
    sequence: 0,
    blocks,
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1,
    ...(mode ? { pedagogical_mode: mode } : {})
  } as Lesson;
}

function quizBlock(id: string, question: Record<string, unknown>): Block {
  const block = createBlock('quiz_question', id);
  if (block.block_type !== 'quiz_question') throw new Error('expected quiz_question');
  return { ...block, content: { question: { id, marks: 1, outcomes: ['EA12-1'], skills: ['reading.inference'], ...question } as never } };
}

const goodMc = quizBlock('q1', {
  kind: 'multiple_choice',
  prompt: 'Whose assassination in 1914 triggered the July Crisis?',
  options: [
    { id: 'a', text: 'Archduke Franz Ferdinand' },
    { id: 'b', text: 'Kaiser Wilhelm II' },
    { id: 'c', text: 'Tsar Nicholas II' }
  ],
  correct: ['a']
});

const goodTf = quizBlock('q2', {
  kind: 'true_false',
  prompt: 'The alliance system linked Britain, France and Russia.',
  answer: true
});

const badMc = quizBlock('q3', {
  kind: 'multiple_choice',
  prompt: 'Which empire was Serbia’s main protector?',
  options: [
    { id: 'a', text: 'Russia' },
    { id: 'b', text: 'Ottoman Empire' }
  ],
  correct: ['z']
});

function insertQuiz(blocks: Block[], setMode?: 'quiz'): AiProposal {
  return { kind: 'insert_blocks', position: 'below', anchor_block_id: 'b_head', blocks, ...(setMode ? { set_mode: setMode } : {}) };
}

function job(message: string, extra: Partial<AiJob> = {}): AiJob {
  return {
    id: 'ai_job_1',
    lesson_id: 'lesson_ww1',
    agent: 'ann',
    status: 'working',
    snapshot_at: NOW,
    message,
    created_at: NOW,
    ...extra
  };
}

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input };
}

/** A scripted model: each call returns the next reply and records the request. */
function scripted(replies: ModelReply[]) {
  const requests: ModelRequest[] = [];
  const complete = async (request: ModelRequest): Promise<ModelReply> => {
    requests.push(structuredClone(request));
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    return next;
  };
  return { complete, requests };
}

const usage = { input_tokens: 1000, output_tokens: 500 };

describe('quizProposalIssues', () => {
  it('passes complete questions in a quiz lesson', () => {
    expect(quizProposalIssues(insertQuiz([goodMc, goodTf]), lesson('quiz'))).toEqual([]);
  });

  it('asks for outcomes and a skill on every question', () => {
    const bare = quizBlock('q_bare', { kind: 'true_false', prompt: 'The alliance system linked Britain, France and Russia.', answer: true, outcomes: undefined, skills: undefined });
    const issues = quizProposalIssues(insertQuiz([goodMc, bare]), lesson('quiz'));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^Question 2 \(q_bare\): add outcomes/);
    expect(issues[1]).toMatch(/^Question 2 \(q_bare\): add skills/);
  });

  it('names the question and the fix when an answer is missing', () => {
    const issues = quizProposalIssues(insertQuiz([goodMc, badMc]), lesson('quiz'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Question 2 \(q3\): Tick the right answer\./);
  });

  it('asks for set_mode in a lesson that is not a quiz, and accepts it once set', () => {
    const issues = quizProposalIssues(insertQuiz([goodMc]), lesson('direct_instruction'));
    expect(issues.join(' ')).toMatch(/set_mode: "quiz"/);
    expect(issues.join(' ')).toMatch(/question_set/);
    expect(quizProposalIssues(insertQuiz([goodMc], 'quiz'), lesson('direct_instruction'))).toEqual([]);
  });

  it('accepts a fill-the-gap question written without a prompt key, and still asks other kinds for one', () => {
    // Live test 21 Oct: Ann left prompt out of a fill_gap question and the check said "Write the question."
    const gap = createBlock('quiz_question', 'q_gap');
    if (gap.block_type !== 'quiz_question') throw new Error('expected quiz_question');
    const noPrompt = { ...gap, content: { question: { id: 'q_gap', kind: 'fill_gap', marks: 2, passage: '[[Maiwar]] is the river.', outcomes: ['EA12-1'], skills: ['reading.inference'] } as never } } as Block;
    expect(quizProposalIssues(insertQuiz([noPrompt]), lesson('quiz'))).toEqual([]);
    expect(validateMutatingProposal(insertQuiz([noPrompt]), emptySearchPack(''))).toEqual({ ok: true });
    expect(checkQuestion({ id: 'q_tf', kind: 'true_false', marks: 1, answer: true })).toEqual({ ok: false, message: 'Write the question.' });
  });

  it('rejects set_mode without any quiz questions', () => {
    const heading = createBlock('heading', 'h2');
    expect(quizProposalIssues(insertQuiz([heading], 'quiz'), lesson())[0]).toMatch(/Only set set_mode/);
  });

  it('only allows images already in the lesson', () => {
    const image = createBlock('image', 'img1');
    if (image.block_type !== 'image') throw new Error('expected image');
    const withImage = { ...image, content: { ...image.content, url: 'https://cdn.example.com/map.png', alt_text: 'Map' } } as Block;
    const pinned = quizBlock('q4', {
      kind: 'label_image',
      prompt: 'Label the alliances.',
      image: { url: 'https://cdn.example.com/map.png', alt: 'Map' },
      pins: [
        { id: 'p1', x: 0.2, y: 0.3, label: 'Triple Entente' },
        { id: 'p2', x: 0.6, y: 0.4, label: 'Triple Alliance' }
      ]
    });
    expect(quizProposalIssues(insertQuiz([pinned]), lesson('quiz', [createBlock('heading', 'b_head'), withImage]))).toEqual([]);
    expect(quizProposalIssues(insertQuiz([pinned]), lesson('quiz'))[0]).toMatch(/image must be one already in the lesson/);
  });
});

describe('questions that give their answer away', () => {
  it('sends back a right answer far longer than the wrong ones, with extreme wrong answers', () => {
    const bad = quizBlock('q_ood', {
      kind: 'multiple_choice',
      prompt: "Oodgeroo Noonuccal's 1964 collection combined art with political resistance. What can you infer about how this tradition shapes Watson's poetry?",
      options: [
        { id: 'a', text: 'He writes within a lineage where Indigenous poetry can carry political meaning, which helps explain why his politics arrives through vivid imagery' },
        { id: 'b', text: 'He rejects all earlier Indigenous poets and writes without context' },
        { id: 'c', text: 'He writes only about nature and avoids politics' },
        { id: 'd', text: 'He copies her poems line for line' }
      ],
      correct: ['a']
    });
    const issues = quizProposalIssues(insertQuiz([bad]), lesson('quiz'));
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/^Question 1 \(q_ood\): the right answer is much longer/);
    expect(issues[1]).toMatch(/wrong answers are the extreme ones/);
  });

  it('sends back matching with three pairs', () => {
    const issues = questionGiveaways({
      kind: 'matching',
      pairs: [
        { id: 'a', left: 'Stolen Generations', right: 'Children removed from their families' },
        { id: 'b', left: 'Assimilation', right: 'Adopting a dominant culture' },
        { id: 'c', left: 'Performative', right: 'Words not backed by action' }
      ]
    });
    expect(issues).toEqual([expect.stringMatching(/at least 4 pairs \(it has 3\)/)]);
  });

  it('lets a fair question through, and an extreme right answer is not a giveaway', () => {
    expect(questionGiveaways(goodMc.content.question as Record<string, unknown>)).toEqual([]);
    expect(questionGiveaways({
      kind: 'multiple_choice',
      options: [{ id: 'a', text: 'Only the first stanza' }, { id: 'b', text: 'Every stanza' }, { id: 'c', text: 'The final two lines' }],
      correct: ['a']
    })).toEqual([]);
  });

  it('teaches Ann the item-writing rules', () => {
    expect(BLOCK_BUILD_RECIPES).toMatch(/## Writing questions that test something/);
    expect(BLOCK_BUILD_RECIPES).toMatch(/never teaches the answer/);
  });

  it('tells Ann to tag each question from the lists', () => {
    expect(BLOCK_BUILD_RECIPES).toMatch(/### Tag every question/);
    expect(BLOCK_BUILD_RECIPES).toMatch(/list_question_tags/);
  });
});

describe('quiz proposals on Accept', () => {
  it('switches the lesson to Quiz together with the inserted questions', () => {
    let n = 0;
    const result = applyProposalToLesson(lesson('direct_instruction'), insertQuiz([goodMc, goodTf], 'quiz'), () => `new_${++n}`);
    expect(result.ok).toBe(true);
    expect(result.lesson.pedagogical_mode).toBe('quiz');
    expect(result.lesson.blocks.map((b) => b.block_type)).toEqual(['heading', 'quiz_question', 'quiz_question']);
  });

  it('leaves the lesson type alone without set_mode', () => {
    const result = applyProposalToLesson(lesson('quiz'), insertQuiz([goodMc]), () => 'new_1');
    expect(result.lesson.pedagogical_mode).toBe('quiz');
  });

  it('switches the mode when quiz questions fill an empty lesson', () => {
    const proposal: AiProposal = { kind: 'insert_blocks', position: 'below', blocks: [goodMc], set_mode: 'quiz' };
    const result = applyProposalToLesson(lesson(undefined, []), proposal, () => 'new_1');
    expect(result.ok).toBe(true);
    expect(result.lesson.pedagogical_mode).toBe('quiz');
  });

  it('parses set_mode from the tool call and keeps it through partial accept', () => {
    const parsed = parseToolProposal('propose_insert_blocks', {
      position: 'below',
      anchor_block_id: 'b_head',
      blocks: [goodMc, goodTf],
      set_mode: 'quiz'
    });
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed).toMatchObject({ kind: 'insert_blocks', set_mode: 'quiz' });
    const units = listPartialAcceptUnits(parsed);
    expect(units.map((u) => u.label)).toEqual([
      'Multiple choice: Whose assassination in 1914 triggered the July …',
      'True or false: The alliance system linked Britain, France and …'
    ]);
    const filtered = filterProposal(parsed, new Set(['block:1']));
    expect(filtered).toMatchObject({ ok: true, proposal: { set_mode: 'quiz', blocks: [{ id: 'q2' }] } });
  });
});

describe('plan before a big build', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => quizBlock(`m${i}`, { kind: 'true_false', prompt: `Statement ${i + 1}.`, answer: true }));

  it('counts a build as big past 5 quiz questions or 8 blocks', () => {
    expect(isBigBuild(insertQuiz(many(5)))).toBe(false);
    expect(isBigBuild(insertQuiz(many(6)))).toBe(true);
    const headings = Array.from({ length: 9 }, (_, i) => createBlock('heading', `h${i}`));
    expect(isBigBuild({ kind: 'insert_blocks', position: 'below', anchor_block_id: 'b_head', blocks: headings })).toBe(true);
  });

  it('treats a sent plan, or being told to go ahead, as confirmed', () => {
    expect(planConfirmed({ message: 'Make a 20-question quiz' })).toBe(false);
    expect(planConfirmed({ message: 'Yes, but make it 15', history: [{ role: 'assistant', content: `${PLAN_MARKER}\n- 20 questions` }] })).toBe(true);
    expect(planConfirmed({ message: 'Make 20 questions, just build it' })).toBe(true);
  });

  it('tells the agent the plan status with the request', async () => {
    const { complete, requests } = scripted([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: `${PLAN_MARKER}: 20 questions…` }] }]);
    await runLessonAiJob({ job: job('Make a 20-question quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(String(requests[0]!.messages.at(-1)!.content)).toContain('[Plan status: no plan confirmed yet.');
  });

  it('refuses a big build without a confirmed plan, and builds once the plan is answered', async () => {
    const big = { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: many(6) })] };
    const first = scripted([structuredClone(big), { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: `${PLAN_MARKER}…` }] }]);
    const refused = await runLessonAiJob({ job: job('Make 6 questions'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete: first.complete });
    expect(refused.proposal).toBeUndefined();
    expect(refused.checks[0]).toMatch(/has not confirmed a plan/);

    const second = scripted([structuredClone(big)]);
    const built = await runLessonAiJob({
      job: job('Yes, go with that plan', { history: [{ role: 'user', content: 'Make 6 questions' }, { role: 'assistant', content: `${PLAN_MARKER}: 6 true/false` }] }),
      lesson: lesson('quiz'),
      agentName: 'Ann',
      protocol: '',
      complete: second.complete
    });
    expect(built.status).toBe('done');
    expect(built.proposal).toMatchObject({ kind: 'insert_blocks' });
    expect(String(second.requests[0]!.messages.at(-1)!.content)).toContain('[Plan status: the teacher has answered your plan');
  });
});

describe('quiz recipe and lesson context', () => {
  it('tells Ann every question, fill_gap included, needs a prompt', () => {
    expect(BLOCK_BUILD_RECIPES).toContain('Every question has prompt (always include it');
    expect(BLOCK_BUILD_RECIPES).not.toContain('No prompt needed');
  });

  it('describes every quiz question kind', () => {
    for (const kind of QUIZ_QUESTION_KINDS) expect(BLOCK_BUILD_RECIPES).toContain(`- ${kind}:`);
  });

  it('tells the agent whether the lesson is a quiz', () => {
    const base = { agentName: 'Ann', protocol: '', scope: 'lesson' as const, selectedBlockId: null, searchPack: emptySearchPack('') };
    expect(buildAiLessonContext({ ...base, lesson: lesson('quiz') })).toContain('Lesson type: quiz');
    expect(buildAiLessonContext({ ...base, lesson: lesson('direct_instruction') })).toContain('Lesson type: direct_instruction (not a quiz)');
  });

  it('asks for sources instead of a search pack when researching', () => {
    const prompt = buildAiLessonContext({
      agentName: 'Ann',
      protocol: '',
      lesson: lesson('quiz'),
      scope: 'lesson',
      selectedBlockId: null,
      searchPack: emptySearchPack(''),
      research: true
    });
    expect(prompt).toContain('## Research');
    expect(prompt).toContain('Sources:');
    expect(prompt).not.toContain('## Search pack');
  });
});

describe('runLessonAiJob', () => {
  it('researches, then returns a checked quiz proposal with its message', async () => {
    const { complete, requests } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'search_notes', { query: 'July Crisis' })] },
      {
        stop_reason: 'tool_use',
        usage,
        content: [
          { type: 'text', text: 'Here are two questions.\n\nSources:\n- Your note "July Crisis"' },
          toolUse('t2', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc, goodTf] })
        ]
      }
    ]);
    const phases: string[] = [];
    const result = await runLessonAiJob({
      job: job('Write a two question quiz on the July Crisis'),
      lesson: lesson('quiz'),
      agentName: "Ann O'Tation",
      protocol: 'Be Ann.',
      complete,
      tools: [{ name: 'search_notes', input_schema: { type: 'object' } }],
      runTool: async (name, input) => ({ name, input, hits: ['July Crisis'] }),
      webSearch: true,
      onPhase: (phase) => phases.push(phase)
    });
    expect(result.status).toBe('done');
    expect(result.proposal).toMatchObject({ kind: 'insert_blocks', blocks: [{ id: 'q1' }, { id: 'q2' }] });
    expect(result.response).toContain('Sources:');
    expect(result.turns).toBe(2);
    expect(result.cost_usd).toBeGreaterThan(0);
    expect(phases).toContain('searching');
    // The notes result went back to the model as a tool_result.
    const second = requests[1]!.messages.at(-1)!;
    expect(JSON.stringify(second.content)).toContain('July Crisis');
    // Judgement work runs on the standard model with the newer web search.
    expect(requests[0]!.model).toBe('claude-sonnet-5-5');
    expect(requests[0]!.tools.find((t) => t.name === 'web_search')?.type).toBe('web_search_20260209');
    expect(requests[0]!.system[0]!.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(requests[0]!.system[1]!.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('hands a failed quiz check back to the agent, which fixes it in the same job', async () => {
    const { complete, requests } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc, badMc] })] },
      {
        stop_reason: 'tool_use',
        usage,
        content: [
          { type: 'text', text: 'Accepting this also turns the lesson into a Quiz.' },
          toolUse('t2', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc, goodTf], set_mode: 'quiz' })
        ]
      }
    ]);
    const result = await runLessonAiJob({
      job: job('Quiz me on WWI'),
      lesson: lesson('direct_instruction'),
      agentName: 'Ann',
      protocol: '',
      complete
    });
    expect(result.status).toBe('done');
    expect(result.proposal).toMatchObject({ set_mode: 'quiz' });
    const feedback = JSON.stringify(requests[1]!.messages.at(-1)!.content);
    expect(feedback).toContain('Not shown to the teacher');
    expect(feedback).toContain('Tick the right answer');
    expect(feedback).toContain('set_mode');
    expect(feedback).toContain('is_error');
  });

  it('shows the note from the proposal call when the model writes no visible text', async () => {
    // Sonnet 5.5 returns text beside a tool call as hidden thinking, so the note rides in the call.
    const { complete } = scripted([
      {
        stop_reason: 'tool_use',
        usage,
        content: [
          { type: 'thinking', thinking: '' },
          toolUse('t1', 'propose_insert_blocks', {
            position: 'below',
            anchor_block_id: 'b_head',
            blocks: [goodMc],
            message: '  One question on the July Crisis.\n\nSources:\n- Britannica  '
          })
        ]
      }
    ]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.response).toBe('One question on the July Crisis.\n\nSources:\n- Britannica');
    expect(result.checks).toEqual([]);
  });

  it('records each failed check with its turn', async () => {
    const { complete } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [badMc] })] },
      { stop_reason: 'tool_use', usage, content: [toolUse('t2', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc], message: 'Fixed.' })] }
    ]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.status).toBe('done');
    expect(result.response).toBe('Fixed.');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatch(/^Turn 1: .*Tick the right answer/);
  });

  it('offers every proposal tool a message field', () => {
    for (const tool of AI_TOOLS.filter((t) => t.name.startsWith('propose_'))) {
      expect(Object.keys(tool.input_schema.properties)).toContain('message');
    }
  });

  it('gives up with the last problem after three failed proposals', async () => {
    const bad = { stop_reason: 'tool_use', usage, content: [toolUse('t', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [badMc] })] };
    const { complete } = scripted([structuredClone(bad), structuredClone(bad), structuredClone(bad)]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Tick the right answer/);
    expect(result.checks).toHaveLength(3);
  });

  it('asks for an anchor the editor can use before showing the card', async () => {
    const { complete, requests } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', blocks: [goodMc] })] },
      { stop_reason: 'tool_use', usage, content: [toolUse('t2', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'missing', blocks: [goodMc] })] },
      { stop_reason: 'tool_use', usage, content: [toolUse('t3', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc] })] }
    ]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.status).toBe('done');
    expect(JSON.stringify(requests[1]!.messages.at(-1)!.content)).toContain('anchor below its last block \\"b_head\\"');
    expect(JSON.stringify(requests[2]!.messages.at(-1)!.content)).toContain('is not in the lesson');
  });

  it('returns a plain answer when the agent proposes nothing', async () => {
    const { complete } = scripted([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'How many questions would you like?' }] }]);
    const result = await runLessonAiJob({ job: job('Make a quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result).toMatchObject({ status: 'done', response: 'How many questions would you like?' });
    expect(result.proposal).toBeUndefined();
  });

  it('carries on after a paused server search', async () => {
    const { complete, requests } = scripted([
      { stop_reason: 'pause_turn', usage, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'July Crisis' } }] },
      { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Done.' }] }
    ]);
    const result = await runLessonAiJob({ job: job('Research'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete, webSearch: true });
    expect(result.status).toBe('done');
    expect(requests[1]!.messages.at(-1)!.role).toBe('assistant');
  });

  it('starts conversions on the fast model and restarts on the standard one after a failed proposal', async () => {
    const { complete, requests } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [badMc] })] },
      { stop_reason: 'tool_use', usage, content: [toolUse('t2', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [goodMc] })] }
    ]);
    const result = await runLessonAiJob({
      job: job('Turn this glossary into a quiz'),
      lesson: lesson('quiz'),
      agentName: 'Ann',
      protocol: '',
      complete,
      webSearch: true
    });
    expect(result.status).toBe('done');
    expect(requests.map((r) => r.model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    expect(requests[0]!.tools.find((t) => t.name === 'web_search')?.type).toBe('web_search_20250305');
    // The standard model starts fresh: one user message carrying the earlier problem.
    expect(requests[1]!.messages).toHaveLength(1);
    expect(String(requests[1]!.messages[0]!.content)).toContain('Tick the right answer');
  });

  it('stops when the deadline passes', async () => {
    const controller = new AbortController();
    controller.abort();
    const { complete } = scripted([]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete, signal: controller.signal });
    expect(result).toMatchObject({ status: 'error', error: expect.stringMatching(/ran out of time/) });
  });

  it('records a reply cut off at the output limit', async () => {
    const { complete } = scripted([
      { stop_reason: 'max_tokens', usage, content: [{ type: 'text', text: 'Here are 30…' }] },
      { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Smaller.' }] }
    ]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.checks).toEqual(['Turn 1: reply cut off at the 48000-token output limit']);
  });

  it('names the exact field when a quiz question fails, not the generic publish message', async () => {
    const noOptions = quizBlock('q9', { kind: 'multiple_choice', prompt: 'Which?', correct: ['a'] });
    const { complete } = scripted([
      { stop_reason: 'tool_use', usage, content: [toolUse('t1', 'propose_insert_blocks', { position: 'below', anchor_block_id: 'b_head', blocks: [noOptions] })] },
      { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Stopping.' }] }
    ]);
    const result = await runLessonAiJob({ job: job('Quiz'), lesson: lesson('quiz'), agentName: 'Ann', protocol: '', complete });
    expect(result.checks[0]).toMatch(/Question 1 \(q9\): Fill in every option\. \(options: /);
    expect(result.checks[0]).not.toMatch(/Quiz question 1:/);
  });

  it('prices one-hour cache writes at twice the input rate', () => {
    const fiveMinute = estimateCostUsd('claude-sonnet-5-5', { cache_creation_input_tokens: 1_000_000 });
    const oneHour = estimateCostUsd('claude-sonnet-5-5', {
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000 }
    });
    expect(fiveMinute).toBe(2.5);
    expect(oneHour).toBe(4);
  });

  it('uses the right web search tool per model', () => {
    expect(webSearchTool('standard')).toMatchObject({ type: 'web_search_20260209', max_uses: 5 });
    expect(webSearchTool('fast')).toMatchObject({ type: 'web_search_20250305' });
  });

  it('converts several questions in one proposal, each keeping its block id', () => {
    const findIt = (id: string) =>
      quizBlock(id, {
        kind: 'find_it',
        prompt: 'Which line uses a simile?',
        segments: [
          { id: 's1', text: 'The night was black as ink.' },
          { id: 's2', text: 'The stars kept silent watch.' }
        ],
        correct: ['s1']
      });
    const spot = (id: string) =>
      quizBlock(id, {
        kind: 'spot_technique',
        prompt: 'Find the simile and name it.',
        passage: 'The night was black as ink.\nThe stars kept silent watch.',
        options: [
          { id: 'a', text: 'Simile' },
          { id: 'b', text: 'Metaphor' },
          { id: 'c', text: 'Personification' }
        ],
        targets: [{ id: 't1', quote: 'black as ink', correct: ['a'] }]
      });
    const quiz = lesson('quiz', [findIt('f1'), goodTf, findIt('f2')]);
    const parsed = parseToolProposal('propose_replace_blocks', { message: 'Converted both.', blocks: [spot('f1'), spot('f2')] });
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.kind).toBe('replace_blocks');
    expect(quizProposalIssues(parsed, quiz)).toEqual([]);
    expect(validateMutatingProposal(parsed, emptySearchPack('')).ok).toBe(true);
    const applied = applyProposalToLesson(quiz, parsed, () => 'new');
    if (!applied.ok) throw new Error(applied.message);
    expect(applied.lesson.blocks.map((b) => (b.block_type === 'quiz_question' ? b.content.question.kind : b.block_type))).toEqual([
      'spot_technique',
      'true_false',
      'spot_technique'
    ]);
    expect(applied.lesson.blocks.map((b) => b.id)).toEqual(['f1', 'q2', 'f2']);
    // Partial accept can keep just one of them.
    expect(listPartialAcceptUnits(parsed)).toHaveLength(2);
    const one = filterProposal(parsed, new Set(['block:1']));
    expect(one.ok && one.proposal.kind === 'replace_blocks' && one.proposal.blocks.map((b) => b.id)).toEqual(['f2']);
    // A replacement for a block that isn't there is refused, not added.
    const missing = parseToolProposal('propose_replace_blocks', { blocks: [spot('nope')] });
    if ('error' in missing) throw new Error(missing.error);
    expect(applyProposalToLesson(quiz, missing, () => 'new').ok).toBe(false);
    expect(AI_TOOLS.map((t) => t.name)).toContain('propose_replace_blocks');
  });
});
