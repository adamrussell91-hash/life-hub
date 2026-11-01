import { describe, expect, it, vi } from 'vitest';
import { chipPicker } from '@/skills/chip-picker';
import { nextStepBank, nextStepTargets, boxQuestion, type BankItem } from '@/blocks/next-step-bank';
import { costText, makeNextSteps, runNextStepJob, type NextStepJobDeps } from '@/blocks/next-step-run';
import { bankSource } from '@/progress/wording';
import type { FeedbackCode } from '@/blocks/feedback-codes';
import type { SkillsContinuum } from '@/skills/schema';
import type { Block } from '@/schemas/block';

const skills = {
  strands: [
    { strand: 'arguing', name: 'Arguing', sub_strands: [{ id: 'thesis', name: 'Building a thesis' }, { id: 'evidence', name: 'Using evidence' }] },
    { strand: 'reading', name: 'Reading', sub_strands: [{ id: 'inference', name: 'Inference' }, { id: 'context', name: 'Context' }, { id: 'form', name: 'Form' }] }
  ]
} as unknown as SkillsContinuum;

const ladder = ['Start with one sentence that answers the question.', 'Name the idea your paragraph proves.', 'Make your opening a claim to argue with.', 'Build your opening around a concept.', 'Let your opening hold a tension.'];
const codes: FeedbackCode[] = [
  { id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'lilac', descriptor: 'Open with your claim.', skill: 'arguing.thesis', ladder },
  { id: 'e', code: 'E', label: 'Evidence', group: 'composition', criterion: 2, colour: 'blue', descriptor: 'Add a quote.', skill: 'arguing.evidence', ladder },
  { id: 'ex', code: 'EX', label: 'Expression', group: 'composition', criterion: 3, colour: 'gold', descriptor: 'Choose a precise verb.' }
];
const question = 'How does the poet use the river to show change in the town?';
const entry = (source: string) => ({ lines: ladder.map((l) => `${l} (river)`), edited: [false, false, false, false, false], source });

describe('skill chip picker', () => {
  it('opens the strand groups, presses chips and stops at the limit', () => {
    const onChange = vi.fn();
    const root = chipPicker(['arguing.thesis'], skills, onChange, 2);
    expect(root.querySelector('[data-skill="arguing.thesis"]')!.getAttribute('aria-pressed')).toBe('true');
    (root.querySelector('.nst-chip--add') as HTMLButtonElement).click();
    expect([...root.querySelectorAll('.nst-chips__strand')].map((n) => n.textContent)).toEqual(['Arguing', 'Reading']);
    (root.querySelector('.nst-chips__groups [data-skill="reading.inference"]') as HTMLButtonElement).click();
    expect(onChange).toHaveBeenLastCalledWith(['arguing.thesis', 'reading.inference']);
    expect((root.querySelector('.nst-chips__groups [data-skill="reading.form"]') as HTMLButtonElement).disabled).toBe(true);
    (root.querySelector('.nst-chips__row [data-skill="arguing.thesis"]') as HTMLButtonElement).click();
    expect(onChange).toHaveBeenLastCalledWith(['reading.inference']);
  });

  it('keeps saved skills by id while the continuum loads', () => {
    const root = chipPicker(['arguing.thesis'], null, vi.fn());
    expect(root.querySelector('[data-skill="arguing.thesis"]')!.textContent).toBe('arguing.thesis');
    expect((root.querySelector('.nst-chip--add') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('next steps bank panel', () => {
  it('stays hidden until the box has skills', () => {
    const bank = nextStepBank({ prompt: question }, codes, vi.fn());
    expect(bank.el.hidden).toBe(true);
    bank.update({ prompt: question, skills: ['arguing.thesis'] });
    expect(bank.el.hidden).toBe(false);
    expect(bank.el.querySelector('.nst-bank__meta')!.textContent).toBe('Not made yet');
  });

  it('counts the codes, edits a line as edited and flags its wording', () => {
    const item: BankItem = { prompt: question, skills: ['arguing.thesis', 'arguing.evidence'] };
    item.next_steps = { ts: entry(bankSource(boxQuestion(item), item.skills!, ladder)) };
    const onChange = vi.fn();
    const bank = nextStepBank(item, codes, onChange);
    document.body.append(bank.el);
    expect(bank.el.querySelector('.nst-bank__meta')!.textContent).toBe('1 code · 5 lines');
    (bank.el.querySelector('.nst-bank__head') as HTMLButtonElement).click();
    expect(bank.el.querySelectorAll('.nst-tab')).toHaveLength(2);
    expect([...bank.el.querySelectorAll('.nst-rung__name')].map((n) => n.firstChild!.textContent)).toEqual(['Building to Capable', 'Capable', 'Skilled', 'Accomplished', 'Excellent']);
    const line = bank.el.querySelectorAll<HTMLElement>('.nst-rung__text')[2]!;
    line.textContent = 'Write a claim, not a summary.';
    line.dispatchEvent(new Event('input'));
    const saved = onChange.mock.lastCall![0];
    expect(saved.ts.lines[2]).toBe('Write a claim, not a summary.');
    expect(saved.ts.edited).toEqual([false, false, true, false, false]);
    expect(line.closest('.nst-rung')!.classList.contains('is-edited')).toBe(true);
    expect(line.closest('.nst-rung')!.querySelector('.nst-flag')!.textContent).toBe('Try wording this as something to do (it has “not”).');
    expect(bank.el.querySelector('.nst-stale')).toBeNull();
    bank.el.remove();
  });

  it('notes Ladder changed when the question text moves on', () => {
    const item: BankItem = { prompt: question, skills: ['arguing.thesis'] };
    item.next_steps = { ts: entry(bankSource(boxQuestion(item), item.skills!, ladder)) };
    const bank = nextStepBank(item, codes, vi.fn());
    (bank.el.querySelector('.nst-bank__head') as HTMLButtonElement).click();
    bank.update({ ...item, prompt: 'How does the poet use the bridge to show change?' });
    expect(bank.el.querySelector('.nst-bank__meta')!.textContent).toContain('Ladder changed');
    expect(bank.el.querySelector('.nst-stale')!.textContent).toBe('Ladder changed');
  });
});

describe('Make next steps for all boxes', () => {
  it('sends tagged boxes with empty or stale banks, and only their stale codes', () => {
    const fresh: BankItem = { prompt: 'Fresh question', skills: ['arguing.thesis', 'arguing.evidence'] };
    fresh.next_steps = { ts: entry(bankSource(boxQuestion(fresh), fresh.skills!, ladder)) };
    const blocks = [
      { id: 'qs1', block_type: 'question_set', content: { questions: [
        { id: 'q1', kind: 'short_answer', ...fresh },
        { id: 'q2', kind: 'short_answer', prompt: 'Untagged question' },
        { id: 'q3', kind: 'short_answer', prompt: 'New question', skills: ['arguing.thesis'] }
      ] } },
      { id: 'quiz1', block_type: 'quiz_question', content: { question: { id: 'quiz1', kind: 'extended_response', prompt: 'Explain the river.', skills: ['reading.inference'] } } }
    ] as unknown as Block[];
    expect(nextStepTargets(blocks, codes)).toEqual([{ block_id: 'qs1', index: 0, code_ids: ['e'] }, { block_id: 'qs1', index: 2 }]);
  });
});

describe('next step job runs', () => {
  const deps = (replies: Record<string, unknown>[], jobs: Array<Record<string, unknown>>): NextStepJobDeps & { sent: unknown[] } => {
    const sent: unknown[] = [];
    return {
      sent,
      post: async <T>(body: Record<string, unknown>) => { sent.push(body); return replies.shift() as T; },
      poll: async () => jobs.shift() as never,
      sleep: async () => undefined
    };
  };

  it('shows the A$ estimate and runs only after the yes, then reloads the draft', async () => {
    const d = deps([{ estimate: { kind: 'next_steps_fill', boxes: 1, codes: 2, lines: 10, cost_aud: 0.031 } }, { id: 'job1', status: 'working' }], [{ id: 'job1', status: 'working' }, { id: 'job1', status: 'done', response: 'Next steps made for 1 box.', applied: 1 }]);
    const status = document.createElement('div');
    const reload = vi.fn().mockResolvedValue(undefined);
    const run = makeNextSteps(status, { lessonId: 'les1', flush: async () => undefined, reload }, [{ block_id: 'qs1', index: 0 }], d);
    await vi.waitFor(() => expect(status.querySelector('.nst-ask')).not.toBeNull());
    expect(status.textContent).toContain('10 lines for 1 box, about A$0.03.');
    expect(d.sent).toEqual([{ kind: 'next_steps_fill', lesson_id: 'les1', targets: [{ block_id: 'qs1', index: 0 }], dry_run: true }]);
    (status.querySelector('.btn--primary') as HTMLButtonElement).click();
    await run;
    expect(d.sent).toHaveLength(2);
    expect(reload).toHaveBeenCalledWith(expect.objectContaining({ applied: 1 }));
    expect(status.textContent).toBe('Next steps made for 1 box.');
  });

  it('starts nothing on Cancel', async () => {
    const d = deps([{ estimate: { kind: 'next_steps_fill', boxes: 1, codes: 1, lines: 5, cost_aud: 0.001 } }], []);
    const status = document.createElement('div');
    const run = makeNextSteps(status, { lessonId: 'les1', flush: async () => undefined, reload: vi.fn() }, [{ block_id: 'qs1', index: 0 }], d);
    await vi.waitFor(() => expect(status.querySelector('.nst-ask')).not.toBeNull());
    expect(status.textContent).toContain('under A$0.01');
    (status.querySelector('.btn--ghost') as HTMLButtonElement).click();
    await run;
    expect(d.sent).toHaveLength(1);
  });

  it('throws the job error', async () => {
    const d = deps([{ id: 'job1', status: 'working' }], [{ id: 'job1', status: 'error', error: 'The model is busy.' }]);
    await expect(runNextStepJob({ kind: 'ladders_draft' }, d)).rejects.toThrow('The model is busy.');
    expect(costText({ cost_aud: 1.234 })).toBe('about A$1.23');
  });
});
