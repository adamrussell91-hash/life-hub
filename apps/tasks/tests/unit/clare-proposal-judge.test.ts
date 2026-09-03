import { describe, expect, it } from 'vitest';
import {
  CLARE_PROPOSAL_SYSTEM,
  parseClareProposalJudgment,
  type ClareProposalJudge
} from '@/ai/clare-proposal-judge';
import { buildClareDumpDigest } from '@/domain/clare-digest';
import { parseBrainDump } from '@/domain/clare-dump';
import { assembleJudgedDumpResult } from '@/domain/clare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('Clare dump digest clock', () => {
  it('puts Sydney today + weekday in the digest even on a UTC host clock', () => {
    const digest = buildClareDumpDigest({
      text: 'Today is Sunday the 30th. This is Sydney.',
      items: [],
      frameworks: seed.frameworks,
      tasks: [],
      projects: [],
      calibrations: [],
      preferredDomain: 'life',
      now: new Date('2026-08-29T22:05:00.000Z')
    });
    expect(digest.today).toBe('2026-08-30');
    expect(digest.today_weekday).toBe('Sunday');
    expect(digest.timezone).toBe('Australia/Sydney');
  });

  it('tells the model to converse and use clock/protocol tools', () => {
    expect(CLARE_PROPOSAL_SYSTEM).toMatch(/check_clock/);
    expect(CLARE_PROPOSAL_SYSTEM).toMatch(/update_protocol/);
    expect(CLARE_PROPOSAL_SYSTEM).toMatch(/Talk like Claude/);
    expect(CLARE_PROPOSAL_SYSTEM).toMatch(/mutations/);
    expect(CLARE_PROPOSAL_SYSTEM).toMatch(/repo_file/);
  });
});

describe('parseClareProposalJudgment', () => {
  const items = parseBrainDump('I really need to sort out my appraisal goal.', {
    now: new Date(2026, 7, 27),
    preferredDomain: 'teaching'
  });
  const digest = buildClareDumpDigest({
    text: 'I really need to sort out my appraisal goal.',
    items,
    frameworks: seed.frameworks,
    tasks: [],
    projects: [],
    calibrations: [],
    preferredDomain: 'teaching',
    now: new Date(2026, 7, 27)
  });

  it('parses fenced JSON items', () => {
    const judgment = parseClareProposalJudgment(
      '```json\n{"voice":"Right — one thing with a shape.","items":[{"title":"Draft term 2 appraisal SMART goals","kind":"task","description":"","domain":"teaching","priority":"medium","due_date":null,"framework_id":"fw_timeboxing","reasoning":"Timeboxing — appraisal writing expands without a stop.","proposed_minutes":45,"existing_task_id":null,"parent_project_id":null,"question":null}]}\n```',
      digest
    );
    expect(judgment.ok).toBe(true);
    expect(judgment.voice).toMatch(/one thing/);
    expect(judgment.items).toHaveLength(1);
    expect(judgment.items[0]?.title).toBe('Draft term 2 appraisal SMART goals');
    expect(judgment.items[0]?.framework_id).toBe('fw_timeboxing');
    expect(judgment.items[0]?.proposed_minutes).toBe(45);
  });

  it('splits a comma-spliced dump into its own items, ignoring the parser hint entirely', () => {
    const judgment = parseClareProposalJudgment(
      JSON.stringify({
        items: [
          { title: 'Sort out appraisal goal', kind: 'task', framework_id: 'fw_timeboxing', reasoning: 'ok', proposed_minutes: 60 },
          { title: 'Mark the mod B paper', kind: 'task', framework_id: 'fw_timeboxing', reasoning: 'ok', proposed_minutes: 60 }
        ]
      }),
      digest
    );
    expect(judgment.ok).toBe(true);
    expect(judgment.items).toHaveLength(2);
    expect(judgment.items.map((i) => i.title)).toEqual([
      'Sort out appraisal goal',
      'Mark the mod B paper'
    ]);
  });

  it('flags unparseable replies as not ok, so callers fall back instead of trusting an empty read', () => {
    const judgment = parseClareProposalJudgment('not json at all', digest);
    expect(judgment.ok).toBe(false);
    expect(judgment.items).toHaveLength(0);
  });

  it('drops an existing_task_id that does not match a real open task', () => {
    const judgment = parseClareProposalJudgment(
      JSON.stringify({
        items: [
          {
            title: 'Mark the mod B paper',
            kind: 'task',
            framework_id: 'fw_timeboxing',
            reasoning: 'ok',
            proposed_minutes: 60,
            existing_task_id: 'not-a-real-id'
          }
        ]
      }),
      digest
    );
    expect(judgment.items[0]?.existing_task_id).toBeNull();
  });
});

describe('assembleJudgedDumpResult', () => {
  it('builds proposal cards straight from the model rows — no parser item matching involved', async () => {
    const judge: ClareProposalJudge = async () => ({
      voice: 'Two things — both have a shape.',
      items: [
        {
          title: 'Email parents re excursion permission',
          description: '',
          kind: 'communication',
          domain: 'teaching',
          priority: 'medium',
          due_date: null,
          framework_id: 'fw_timeboxing',
          reasoning: 'Quick comms still need a boundary.',
          proposed_minutes: 20,
          existing_task_id: null,
          parent_project_id: null,
          question: null
        },
        {
          title: 'Mark Year 9 essay batch',
          description: '',
          kind: 'task',
          domain: 'teaching',
          priority: 'medium',
          due_date: '2026-08-26',
          framework_id: 'fw_timeboxing',
          reasoning: 'Marking expands — box it.',
          proposed_minutes: 90,
          existing_task_id: null,
          parent_project_id: null,
          question: null
        }
      ],
      model: 'test-judge',
      ok: true,
      mutations: []
    });

    const judgment = await judge(
      buildClareDumpDigest({
        text: 'email parents about the excursion, mark year 9 essays due tomorrow',
        items: [],
        frameworks: seed.frameworks,
        tasks: [],
        projects: [],
        calibrations: [],
        preferredDomain: 'teaching',
        now: new Date(2026, 7, 25)
      })
    );

    const result = assembleJudgedDumpResult(
      judgment.items,
      seed.frameworks,
      () => null,
      undefined,
      judgment.voice
    );

    expect(result.voice).toBe('Two things — both have a shape.');
    expect(result.proposals.map((p) => p.title)).toEqual([
      'Email parents re excursion permission',
      'Mark Year 9 essay batch'
    ]);
    expect(result.proposals[0]?.dump_kind).toBe('communication');
    expect(result.proposals[1]?.due_date).toBe('2026-08-26');
  });

  it('skips a row matched to an existing open task and asks instead of duplicating', () => {
    const result = assembleJudgedDumpResult(
      [
        {
          title: 'Finish lesson pack for Year 12',
          description: '',
          kind: 'task',
          domain: 'teaching',
          priority: 'high',
          due_date: null,
          framework_id: 'fw_timeboxing',
          reasoning: 'x',
          proposed_minutes: 60,
          existing_task_id: 't1',
          parent_project_id: null,
          question: null
        }
      ],
      seed.frameworks,
      () => null
    );
    expect(result.proposals).toHaveLength(0);
    expect(result.questions.some((q) => /already on the board/i.test(q))).toBe(true);
  });

  it('treats a successful empty judge read as authoritative — no heuristic cards', () => {
    const result = assembleJudgedDumpResult(
      [],
      seed.frameworks,
      () => null,
      undefined,
      'That line is feedback, not work — what should I capture?'
    );
    expect(result.proposals).toHaveLength(0);
    expect(result.voice).toMatch(/feedback, not work/i);
  });
});
