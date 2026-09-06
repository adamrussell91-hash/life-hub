import { describe, expect, it } from 'vitest';
import {
  parseBrainDump,
  parseWordingCorrection,
  resolveDuplicateFollowUp,
  resolveWordingCorrectionFollowUp,
  splitDumpLines
} from '@/domain/clare-dump';
import { assembleDumpResult } from '@/domain/clare';
import type { FrameworkEntry } from '@/schemas/templates';

const frameworks: FrameworkEntry[] = [
  {
    schema_version: 1,
    id: 'fw_timeboxing',
    name: 'Timeboxing',
    best_suited_task_pattern: 'Open-ended work',
    reasoning_template: 'Put a boundary around the work.'
  },
  {
    schema_version: 1,
    id: 'fw_eat_the_frog',
    name: 'Eat the Frog',
    best_suited_task_pattern: 'Stuck work',
    reasoning_template: 'Eat the Frog, because this has been sitting untouched.'
  },
  {
    schema_version: 1,
    id: 'fw_eisenhower',
    name: 'Eisenhower matrix',
    best_suited_task_pattern: 'Priorities',
    reasoning_template: 'Eisenhower, because urgency and importance are fighting.'
  }
];

describe('brain dump parsing', () => {
  it('splits lines, bullets, and and-then without breaking Year 9 and 10', () => {
    expect(
      splitDumpLines('Email parents\n- marking year 9 and 10\nand then book the GP')
    ).toEqual(['Email parents', 'marking year 9 and 10', 'book the GP']);
  });

  it('classifies comms, dates, domains, and notes', () => {
    const items = parseBrainDump(
      'email parents about the excursion\nmarking year 9 essays due tomorrow\nremember: dex at 4\nflorist quote',
      { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
    );
    expect(items).toHaveLength(4);
    const email = items.find((i) => /email/i.test(i.title))!;
    expect(email.kind).toBe('communication');
    expect(email.domain).toBe('teaching');
    const marking = items.find((i) => /marking/i.test(i.title))!;
    expect(marking.title).toBe('Marking year 9 essays');
    expect(marking.due_date).toBe('2026-08-26');
    expect(marking.domain).toBe('teaching');
    const note = items.find((i) => /dex/i.test(i.title))!;
    expect(note.kind).toBe('note');
    const florist = items.find((i) => /florist/i.test(i.title))!;
    expect(florist.domain).toBe('wedding');
    expect(florist.question).toMatch(/due date|living its best life/i);
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.voice).toMatch(/1 looks like a note/);
    expect(result.proposals.map((p) => p.title)).toEqual([
      'Email parents about the excursion',
      'Marking year 9 essays',
      'Florist quote'
    ]);
  });

  it('strips I-need-to padding from dump titles', () => {
    const items = parseBrainDump(
      'tomorrow I need to prep for my lead mentoring meeting with Siran',
      { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Prep for lead mentoring meeting with Siran');
    expect(items[0]!.due_date).toBe('2026-08-26');
  });

  it('strips I-really-need-to and possessive filler from rambling dumps', () => {
    const items = parseBrainDump('I really need to sort out my appraisal goal.', {
      now: new Date(2026, 7, 27),
      preferredDomain: 'teaching'
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Sort out appraisal goal');
  });

  it('splits a comma-spliced dump into separate tasks instead of one giant title', () => {
    const items = parseBrainDump(
      'I have to sort out my appraisal goal, mark the last mod b paper, check my common module year 12 marks, give the craft materials to that tournament of minds team',
      { now: new Date(2026, 7, 27), preferredDomain: 'teaching' }
    );
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.title)).toEqual([
      'Sort out appraisal goal',
      'Mark the last mod b paper',
      'Check my common module year 12 marks',
      'Give the craft materials to that tournament of minds team'
    ]);
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.proposals).toHaveLength(4);
  });

  it('does not propose notes or existing titles', () => {
    const items = parseBrainDump('Finish lesson pack for Year 12\nremember: bring the USB', {
      now: new Date(2026, 7, 25),
      tasks: [
        {
          schema_version: 1,
          id: 't1',
          title: 'Finish lesson pack for Year 12',
          description: '',
          kind: 'task',
          bucket: 'active',
          step_order: 0,
          domain: 'teaching',
          framework_used: null,
          estimated_duration: 60,
          actual_duration: null,
          due_date: '2026-08-17',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
          completed_at: null,
          status: 'open',
          blocked_since: null,
          priority: 'high',
          parent_project_id: null,
          parent_task_id: null,
          depends_on: [],
          tags: [],
          recurrence_rule: null,
          due_time: null,
          remind_at: null,
          remind_dismissed_at: null,
          attachments: [],
          source: 'manual'
        }
      ]
    });
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.proposals).toHaveLength(0);
    expect(result.questions.some((q) => /already on the board/i.test(q))).toBe(true);
    expect(result.notes.some((n) => /usb/i.test(n))).toBe(true);
  });

  it('treats meta-commentary and corrections as non-actionable', () => {
    const items = parseBrainDump('It was a question not something to create', {
      now: new Date(2026, 7, 28),
      preferredDomain: 'teaching'
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('meta');
    expect(items[0]!.actionable).toBe(false);
    expect(items[0]!.question).toBeNull();

    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.proposals).toHaveLength(0);
    expect(result.questions).toHaveLength(0);
    expect(result.voice).toMatch(/listening|got it/i);
  });

  it('does not propose a wording correction as a new task', () => {
    const items = parseBrainDump('Encouraging is supposed to be incursion for both of those', {
      now: new Date(2026, 8, 6),
      preferredDomain: 'teaching'
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('meta');
    expect(items[0]!.actionable).toBe(false);
    expect(assembleDumpResult(items, frameworks, () => null).proposals).toHaveLength(0);
  });

  it('still treats scheduling "supposed to be" lines as real work', () => {
    const items = parseBrainDump('The meeting is supposed to be tomorrow', {
      now: new Date(2026, 8, 6),
      preferredDomain: 'teaching'
    });
    expect(parseWordingCorrection('The meeting is supposed to be tomorrow')).toBeNull();
    expect(items[0]!.kind).not.toBe('meta');
    expect(items[0]!.actionable).toBe(true);
  });

  it('rewrites the prior quoted title when Adam corrects a word', () => {
    const priorTitle =
      'At some point I need to put in the international neuroscience Olympiad encouraging request and the UN voice encouraging request as well';
    const thread = [
      { role: 'user' as const, text: priorTitle },
      {
        role: 'assistant' as const,
        text: `Is “${priorTitle}” due this week or next week?`
      }
    ];
    const correction = 'Encouraging is supposed to be incursion for both of those';
    expect(parseWordingCorrection(correction)).toEqual({
      wrong: 'Encouraging',
      right: 'incursion'
    });
    const resolved = resolveWordingCorrectionFollowUp(correction, thread);
    expect(resolved).not.toBeNull();
    expect(resolved!.correctedTitles.length).toBeGreaterThanOrEqual(1);
    expect(resolved!.correctedTitles.some((title) => /incursion/i.test(title))).toBe(true);
    expect(resolved!.correctedTitles.every((title) => !/encouraging/i.test(title))).toBe(true);

    const items = parseBrainDump(resolved!.correctedTitles.join('\n'), {
      now: new Date(2026, 8, 6),
      preferredDomain: 'teaching'
    });
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
    expect(result.proposals.every((p) => /incursion/i.test(p.title))).toBe(true);
    expect(result.proposals.every((p) => !/encouraging/i.test(p.title))).toBe(true);
    expect(result.proposals.every((p) => !/supposed to be/i.test(p.title))).toBe(true);
  });

  it('anchors "due today" to Australia/Sydney when the host clock is UTC', () => {
    // Saturday 29 Aug 2026 22:05 UTC = Sunday 30 Aug morning in Sydney
    const utcEvening = new Date('2026-08-29T22:05:00.000Z');
    const items = parseBrainDump('email parents due today', {
      now: utcEvening,
      preferredDomain: 'teaching'
    });
    expect(items[0]!.due_date).toBe('2026-08-30');
  });

  it('resolves leave / make-a-new-one replies from the prior duplicate question', () => {
    const thread = [
      { role: 'user' as const, text: 'Research fire ants for science club' },
      {
        role: 'assistant' as const,
        text: '- “Research fire ants for science club” is already on the board. Leave it, or make a new one?'
      }
    ];
    expect(resolveDuplicateFollowUp('Make a new one', thread)).toEqual({
      action: 'make_new',
      title: 'Research fire ants for science club'
    });
    expect(resolveDuplicateFollowUp('Leave it', thread)).toEqual({
      action: 'leave',
      title: 'Research fire ants for science club'
    });
    expect(resolveDuplicateFollowUp('Research something else entirely', thread)).toBeNull();
  });

  it('forceNewTitles proposes a twin instead of only asking about the existing one', () => {
    const task = {
      schema_version: 1 as const,
      id: 't1',
      title: 'Research fire ants for science club',
      description: '',
      kind: 'task' as const,
      bucket: 'active' as const,
      step_order: 0,
      domain: 'teaching' as const,
      framework_used: null,
      estimated_duration: 60,
      actual_duration: null,
      due_date: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      completed_at: null,
      status: 'open' as const,
      blocked_since: null,
      priority: 'medium' as const,
      parent_project_id: null,
      parent_task_id: null,
      depends_on: [] as string[],
      tags: [] as string[],
      recurrence_rule: null,
      due_time: null,
      remind_at: null,
      remind_dismissed_at: null,
      attachments: [] as [],
      source: 'manual' as const
    };
    const blocked = parseBrainDump('Research fire ants for science club', {
      now: new Date(2026, 7, 30),
      tasks: [task]
    });
    expect(blocked[0]!.existing_title).toBe(task.title);
    expect(assembleDumpResult(blocked, frameworks, () => null).proposals).toHaveLength(0);

    const forced = parseBrainDump('Research fire ants for science club', {
      now: new Date(2026, 7, 30),
      tasks: [task],
      forceNewTitles: true
    });
    expect(forced[0]!.existing_title).toBeNull();
    expect(assembleDumpResult(forced, frameworks, () => null).proposals.map((p) => p.title)).toEqual([
      'Research fire ants for science club'
    ]);
  });
});
