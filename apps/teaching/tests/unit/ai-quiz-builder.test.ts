import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';
import { AI_TOOLS, parseToolProposal, type AiProposal } from '@/ai/proposals';
import { quizProposalIssues } from '@/ai/quiz-proposal';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { buildAiLessonContext } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import {
  runLessonAiJob,
  webSearchTool,
  type ModelReply,
  type ModelRequest
} from '@/ai/job-runner';
import { QUIZ_QUESTION_KINDS } from '@/quiz/core';
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
  return { ...block, content: { question: { id, marks: 1, ...question } as never } };
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

describe('quiz recipe and lesson context', () => {
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
    expect(requests[0]!.system[0]!.cache_control).toEqual({ type: 'ephemeral' });
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

  it('uses the right web search tool per model', () => {
    expect(webSearchTool('standard')).toMatchObject({ type: 'web_search_20260209', max_uses: 5 });
    expect(webSearchTool('fast')).toMatchObject({ type: 'web_search_20250305' });
  });
});
