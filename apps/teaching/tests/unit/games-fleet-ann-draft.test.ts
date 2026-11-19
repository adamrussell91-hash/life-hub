import { describe, expect, it } from 'vitest';
import type { Lesson } from '@/schemas/lesson';
import type { AiJob } from '@/ai/jobs';
import type { GameOf, QuestionItem } from '@/games/core/schema';
import type { UnitSources } from '@/games/api';
import { newGame } from '@/games/seed';
import { AI_TOOLS, parseToolProposal, type AiProposal } from '@/ai/proposals';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';
import { FLEET_BRIEF_HEAD, fleetDraftStage } from '@/ai/fleet-grid-draft';
import { PLAN_MARKER, checkProposalCall, runLessonAiJob, type ModelReply, type ModelRequest } from '@/ai/job-runner';
import { applyFleetGridDraft, estimateFleetDraft, fleetDraftBrief, fleetDraftPack } from '@/games/kinds/fleet-week/ann-draft';
import { fleetContent } from '@/games/kinds/fleet-week/editor';

// Invented content only: the play "The Lantern Keeper" and its made-up characters.

type Fleet = GameOf<'fleet_week'>;
const NOW = '2026-11-19T00:00:00.000Z';
const TOOL = 'propose_fleet_grid_draft';

const q = (prompt: string, accepted: string[] = ['the lighthouse']) => ({ prompt, accepted });
function draft(over: Record<string, unknown> = {}) {
  return {
    game_id: 'g_fleet',
    columns: ['Tomas', 'Mirela', 'The keeper', 'The tide', 'The town'],
    rows: ['Setting', 'Conflict', 'Symbols', 'Language', 'Themes'],
    squares: Array.from({ length: 25 }, (_, i) => ({ variants: [q(`Square ${i} A?`), q(`Square ${i} B?`, ['lamp', 'the lamp'])] })),
    recall: [q('Complete the line: “The tide keeps no …”', ['promises']), q('Name the term: a hint of what is to come', ['foreshadowing']), q('Who lights the lamp?', ['Tomas']), q('Where does the play open?')],
    ...over
  };
}

function fleetLesson(fleet: Fleet = newGame('fleet_week', 'g_fleet') as Fleet): Lesson {
  return {
    id: 'lesson_fw',
    type: 'lesson',
    title: 'Lantern Keeper games',
    slug: 'lantern-keeper-games',
    status: 'active',
    unit_id: 'unit_fw',
    sequence: 0,
    pedagogical_mode: 'game',
    blocks: [],
    game: { games: [fleet] },
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1
  } as unknown as Lesson;
}

const sa = (id: string, prompt: string, accepted: string[]) =>
  ({ id, shape: 'question', question: { id, kind: 'short_answer', prompt, marks: 1, accepted }, pieces: [], outcomes: [], skills: [], tech: [] }) as unknown as QuestionItem;

function job(message: string, extra: Partial<AiJob> = {}): AiJob {
  return { id: 'ai_job_fw', lesson_id: 'lesson_fw', agent: 'ann', status: 'working', snapshot_at: NOW, message, created_at: NOW, ...extra } as AiJob;
}

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
const draftCall = (input: unknown = draft()): ModelReply => ({ stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: 't1', name: TOOL, input }] });

describe('fleet_grid_draft proposal schema', () => {
  it('is a declared proposal tool', () => {
    expect(AI_TOOLS.map((t) => t.name)).toContain(TOOL);
  });

  it('accepts a full draft', () => {
    const parsed = parseToolProposal(TOOL, draft());
    expect(parsed).toMatchObject({ kind: 'fleet_grid_draft', game_id: 'g_fleet' });
    expect((parsed as Extract<AiProposal, { kind: 'fleet_grid_draft' }>).squares).toHaveLength(25);
  });

  it.each([
    ['a label over 40 characters', { columns: ['x'.repeat(41), 'b', 'c', 'd', 'e'] }],
    ['a blank label', { rows: ['', 'b', 'c', 'd', 'e'] }],
    ['four columns', { columns: ['a', 'b', 'c', 'd'] }],
    ['24 squares', { squares: draft().squares.slice(1) }],
    ['one variant in a square', { squares: [{ variants: [q('Only one?')] }, ...draft().squares.slice(1)] }],
    ['a prompt over the quiz limit', { squares: [{ variants: [q('x'.repeat(1001)), q('ok?')] }, ...draft().squares.slice(1)] }],
    ['no accepted answers', { recall: [q('Recall?', []), ...draft().recall.slice(1)] }],
    ['eleven accepted answers', { recall: [q('Recall?', Array.from({ length: 11 }, (_, i) => `a${i}`)), ...draft().recall.slice(1)] }],
    ['an answer over the quiz limit', { recall: [q('Recall?', ['x'.repeat(201)]), ...draft().recall.slice(1)] }],
    ['three recall lines', { recall: draft().recall.slice(1) }],
    ['no game id', { game_id: '' }]
  ])('refuses %s', (_label, over) => {
    expect(parseToolProposal(TOOL, draft(over))).toHaveProperty('error');
  });

  it('must name a fleet_week game in the lesson', () => {
    const lesson = fleetLesson();
    expect(checkProposalCall(TOOL, draft(), lesson)).toMatchObject({ kind: 'fleet_grid_draft' });
    expect(checkProposalCall(TOOL, draft({ game_id: 'g_missing' }), lesson)).toMatch(/not a game in this lesson/);
    const other = { ...lesson, game: { games: [newGame('crossword', 'g_fleet')] } } as unknown as Lesson;
    expect(checkProposalCall(TOOL, draft(), other)).toMatch(/not fleet_week/);
  });

  it('is accepted whole (no partial-accept units)', () => {
    const proposal = parseToolProposal(TOOL, draft()) as AiProposal;
    expect(listPartialAcceptUnits(proposal)).toEqual([]);
    expect(filterProposal(proposal, new Set())).toEqual({ ok: true, proposal });
  });
});

describe('applying a draft to blank slots only', () => {
  it('fills an empty game: labels, 50 variants and 4 recall lines', () => {
    let n = 0;
    const result = applyFleetGridDraft(fleetLesson(), draft(), () => `i_${n++}`);
    expect(result.ok).toBe(true);
    const game = result.lesson.game!.games[0] as Fleet;
    expect(game.columns).toEqual(draft().columns);
    expect(game.rows).toEqual(draft().rows);
    expect(game.squares.every((s) => s.variants.length === 2)).toBe(true);
    expect((game.squares[3]!.variants[1]!.question as unknown as { prompt: string; accepted: string[] })).toMatchObject({ kind: 'short_answer', prompt: 'Square 3 B?', accepted: ['lamp', 'the lamp'] });
    expect((game.recall[0]!.question as unknown as { accepted: string[] }).accepted).toEqual(['promises']);
    expect(result.added).toBe(10 + 50 + 4);
  });

  it('never overwrites a label, variant or recall line the teacher wrote', () => {
    const fleet = newGame('fleet_week', 'g_fleet') as Fleet;
    fleet.columns = ['Mine', '', '', '', ''];
    fleet.rows = ['', '', '', '', 'Kept row'];
    fleet.squares = Array.from({ length: 25 }, () => ({ variants: [] }));
    fleet.squares[0] = { variants: [sa('i_teacher_a', 'Teacher A?', ['one']), sa('i_teacher_b', 'Teacher B?', ['two'])] };
    fleet.squares[1] = { variants: [sa('i_teacher_c', 'Teacher C?', ['three'])] };
    fleet.recall = [sa('i_recall', 'My recall?', ['mine'])];
    let n = 0;
    const result = applyFleetGridDraft(fleetLesson(fleet), draft(), () => `i_${n++}`);
    const game = result.lesson.game!.games[0] as Fleet;
    expect(game.columns[0]).toBe('Mine');
    expect(game.columns[1]).toBe(draft().columns[1]);
    expect(game.rows[4]).toBe('Kept row');
    expect(game.squares[0]!.variants.map((v) => v.id)).toEqual(['i_teacher_a', 'i_teacher_b']);
    expect(game.squares[1]!.variants[0]!.id).toBe('i_teacher_c');
    expect((game.squares[1]!.variants[1]!.question as unknown as { prompt: string }).prompt).toBe('Square 1 A?');
    expect(game.recall[0]!.id).toBe('i_recall');
    expect(game.recall).toHaveLength(4);
    // 8 blank labels, 47 blank variants (three kept), 3 blank recall lines.
    expect(result.added).toBe(8 + 47 + 3);
  });

  it('changes nothing on a full grid and runs through Accept', () => {
    const full = applyFleetGridDraft(fleetLesson(), draft()).lesson;
    const again = applyProposalToLesson(full, { kind: 'fleet_grid_draft', ...draft({ columns: ['New', 'New', 'New', 'New', 'New'] }) } as AiProposal, () => 'b_x');
    expect(again.ok).toBe(true);
    expect(again.lesson.game).toEqual(full.game);
  });

  it('refuses a game that has gone', () => {
    const result = applyProposalToLesson(fleetLesson(), { kind: 'fleet_grid_draft', ...draft({ game_id: 'g_gone' }) } as AiProposal, () => 'b_x');
    expect(result.ok).toBe(false);
  });
});

describe('the priced plan gate', () => {
  const brief = `${FLEET_BRIEF_HEAD} for "Fleet" (game_id g_fleet).\n\nUnit quotes:\n- “The tide keeps no promises, sir.”`;
  const plan = { role: 'assistant' as const, content: `${PLAN_MARKER}\nColumns: the five characters. Price: about A$0.30.` };

  it('reads where a draft job stands', () => {
    expect(fleetDraftStage({ message: brief })).toBe('brief');
    expect(fleetDraftStage({ message: 'Yes', history: [{ role: 'user', content: brief }, plan] })).toBe('answer');
    expect(fleetDraftStage({ message: 'Yes', history: [{ role: 'user', content: 'Make a quiz' }, plan] })).toBeNull();
    expect(fleetDraftStage({ message: 'Make a quiz' })).toBeNull();
  });

  it('refuses a draft with no plan, even when told to go ahead', async () => {
    const first = scripted([draftCall(), { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: plan.content }] }]);
    const refused = await runLessonAiJob({ job: job(`${brief}\n\nGo ahead, just build it.`), lesson: fleetLesson(), agentName: 'Ann', protocol: '', complete: first.complete });
    expect(refused.proposal).toBeUndefined();
    expect(refused.checks[0]).toMatch(/needs a confirmed plan with its price/);
    expect(String(first.requests[0]!.messages.at(-1)!.content)).toContain('A Fleet week grid draft needs a confirmed plan');
  });

  it('refuses a draft outside the brief, however the chat started', async () => {
    const run = scripted([draftCall(), { stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'OK' }] }]);
    const result = await runLessonAiJob({ job: job('Yes', { history: [{ role: 'user', content: 'Make a quiz' }, plan] }), lesson: fleetLesson(), agentName: 'Ann', protocol: '', complete: run.complete });
    expect(result.proposal).toBeUndefined();
  });

  it('builds once the teacher answers the plan, with no notes or web tools', async () => {
    const run = scripted([draftCall()]);
    const result = await runLessonAiJob({
      job: job('Yes, go with that', { history: [{ role: 'user', content: brief }, plan] }),
      lesson: fleetLesson(),
      agentName: 'Ann',
      protocol: '',
      complete: run.complete,
      tools: [{ name: 'search_notes', input_schema: { type: 'object' } }],
      runTool: async () => ({}),
      webSearch: true
    });
    expect(result.status).toBe('done');
    expect(result.proposal).toMatchObject({ kind: 'fleet_grid_draft' });
    const names = run.requests[0]!.tools.map((t) => t.name);
    expect(names).toContain(TOOL);
    expect(names).not.toContain('search_notes');
    expect(names).not.toContain('web_search');
    expect(run.requests[0]!.model).toBe('claude-sonnet-5-5');
  });
});

describe('the brief', () => {
  const sources: UnitSources = {
    unit_id: 'unit_fw',
    terms: [{ section: 'Vocabulary', line_id: 'l1', item: { id: 't_l1', shape: 'term', term: 'Foreshadowing', accept: [], clues: [{ kind: 'definition', text: 'A hint of what is to come' }], banned: [], decoys: [], pieces: [], outcomes: [], skills: [], tech: [] } } as never],
    questions: [{ lesson_id: 'l_a', lesson_title: 'Act one', block_id: 'b1', item: sa('q_a1', 'Who lights the lamp in act one?', ['Tomas']) }],
    quotes: [{ lesson_id: 'l_b', lesson_title: 'Act two', block_id: 'b2', attribution: 'Mirela', item: { id: 'u_b1', shape: 'quote', text: 'The tide keeps no promises, sir.' } } as never]
  };

  it('carries the unit pack, the game id and a price, and fits the job limit', () => {
    const pack = fleetDraftPack(sources);
    expect(pack).toEqual({
      organiser: ['Foreshadowing: A hint of what is to come'],
      questions: ['Who lights the lamp in act one? → Tomas'],
      quotes: ['“The tide keeps no promises, sir.” (Mirela)']
    });
    const { brief, cost_aud } = fleetDraftBrief({ gameId: 'g_fleet', gameTitle: 'Lantern fleet', pack, lessonChars: 4000 });
    expect(brief.startsWith(FLEET_BRIEF_HEAD)).toBe(true);
    expect(fleetDraftStage({ message: brief })).toBe('brief');
    expect(brief).toContain('game_id g_fleet');
    expect(brief).toContain(PLAN_MARKER);
    expect(brief).toContain(`A$${cost_aud.toFixed(2)}`);
    expect(brief).not.toMatch(/go ahead|just build it/i);
    expect(cost_aud).toBeGreaterThan(0.05);
    expect(cost_aud).toBeLessThan(1);

    const huge = { organiser: Array.from({ length: 200 }, (_, i) => `Term ${i}: ${'clue '.repeat(30)}`), questions: [], quotes: [] };
    expect(fleetDraftBrief({ gameId: 'g_fleet', gameTitle: '', pack: huge, lessonChars: 4000 }).brief.length).toBeLessThanOrEqual(8000);
  });

  it('prices more input higher', () => {
    expect(estimateFleetDraft({ briefChars: 8000, lessonChars: 20000 }).cost_usd).toBeGreaterThan(estimateFleetDraft({ briefChars: 1000, lessonChars: 1000 }).cost_usd);
  });
});

describe('Ask Ann to draft in the editor', () => {
  const sources: UnitSources = {
    unit_id: 'unit_fw',
    terms: [],
    questions: [{ lesson_id: 'l_a', lesson_title: 'Act one', block_id: 'b1', item: sa('q_a1', 'Who lights the lamp in act one?', ['Tomas']) }],
    quotes: []
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows the price, then starts Ann with the brief only when the teacher asks', async () => {
    const briefs: string[] = [];
    const root = fleetContent(newGame('fleet_week', 'g_fleet') as Fleet, { onChange: () => {}, sources: async () => sources, startAnn: async (b) => void briefs.push(b) });
    document.body.append(root);
    (root.querySelector('.fw-ann-btn') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('.fw-ann__price')?.textContent).toMatch(/priced about A\$\d+\.\d\d/);
    expect(briefs).toEqual([]);
    (root.querySelector('.fw-ann__go') as HTMLButtonElement).click();
    await flush();
    expect(briefs).toHaveLength(1);
    expect(briefs[0]!.startsWith(FLEET_BRIEF_HEAD)).toBe(true);
    expect(briefs[0]).toContain('Who lights the lamp in act one? → Tomas');
    expect(root.querySelector('.fw-build-status')?.textContent).toMatch(/plan/);
    root.remove();
  });

  it('has no Ask Ann button without a server', () => {
    const root = fleetContent(newGame('fleet_week', 'g_fleet') as Fleet, { onChange: () => {} });
    expect(root.querySelector('.fw-ann-btn')).toBeNull();
  });
});
