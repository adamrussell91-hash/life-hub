import { describe, expect, it, vi } from 'vitest';
import {
  dueTomorrow,
  followUpQuestion,
  followUpTaskTitle,
  markNotesSent,
  saveFollowUpNo,
  saveFollowUpYes,
  shouldAskFollowUp,
  type FollowUpDeps
} from '@/views/notes-follow-up';
import type { MeetingRecord, NotesFollowUp } from '@/domain/types';

const NOW = new Date(2026, 10, 16, 15, 0);

function deps(overrides: Partial<FollowUpDeps> = {}, stored: { followUp?: NotesFollowUp | null } = {}): FollowUpDeps {
  let ledgerN = 0;
  return {
    createTask: vi.fn(async (body) => ({ id: 'task_1', title: body.title })),
    linkMeetingTask: vi.fn(async () => ({ meeting: {} as MeetingRecord, operation: {} as never })),
    createLedgerItem: vi.fn(async () => ({ item: { id: `ledger_${++ledgerN}` } as never, created: true })),
    patchLedger: vi.fn(async () => ({ item: {} as never })),
    updateMeeting: vi.fn(async (_id, patch) => ({ meeting: { notes_follow_up: patch.notes_follow_up } as MeetingRecord })),
    getMeeting: vi.fn(async () => ({ meeting: { id: 'meeting_1', notes_follow_up: stored.followUp ?? null } as MeetingRecord })),
    setTaskDone: vi.fn(async () => undefined),
    now: () => NOW,
    ...overrides
  };
}

const people = [
  { ref: 'professional:person:p1', name: 'Mia Hart' },
  { ref: 'professional:person:p2', name: 'Theo Lane' }
];

describe('shouldAskFollowUp', () => {
  it('asks on a completed meeting with no answer and no sheet out', () => {
    expect(shouldAskFollowUp({ state: 'completed', notes_follow_up: null }, false)).toBe(true);
  });

  it('stays quiet once answered, once shared, or before the meeting is completed', () => {
    expect(shouldAskFollowUp({ state: 'completed', notes_follow_up: { answer: 'no', answered_at: NOW.toISOString() } }, false)).toBe(false);
    expect(shouldAskFollowUp({ state: 'completed', notes_follow_up: null }, true)).toBe(false);
    for (const state of ['scheduled', 'cancelled', 'no_show', 'rescheduled'] as const) {
      expect(shouldAskFollowUp({ state, notes_follow_up: null }, false)).toBe(false);
    }
  });
});

describe('wording', () => {
  it('names up to three people, then counts the rest', () => {
    expect(followUpQuestion([])).toBe('Send your notes from this meeting?');
    expect(followUpQuestion(['Mia'])).toBe('Send your notes to Mia?');
    expect(followUpQuestion(['Mia', 'Theo'])).toBe('Send your notes to Mia and Theo?');
    expect(followUpQuestion(['Mia', 'Theo', 'Ana'])).toBe('Send your notes to Mia, Theo and Ana?');
    expect(followUpQuestion(['Mia', 'Theo', 'Ana', 'Jo', 'Kit'])).toBe('Send your notes to Mia, Theo, Ana +2?');
  });

  it('titles the task after the meeting', () => {
    expect(followUpTaskTitle('Year 9 planning')).toBe('Send notes: Year 9 planning');
    expect(followUpTaskTitle('  ')).toBe('Send notes: meeting');
  });

  it('is due the next local day, across a month end', () => {
    expect(dueTomorrow(NOW)).toBe('2026-11-17');
    expect(dueTomorrow(new Date(2026, 10, 30, 23, 30))).toBe('2026-12-01');
  });
});

describe('saveFollowUpYes', () => {
  it('makes the task, links it, adds a promise per person and saves the answer', async () => {
    const d = deps();
    const answer = await saveFollowUpYes({ id: 'meeting_1', title: 'Year 9 planning' }, people, d);
    expect(d.createTask).toHaveBeenCalledWith({ title: 'Send notes: Year 9 planning', due_date: '2026-11-17' });
    expect(d.linkMeetingTask).toHaveBeenCalledWith('meeting_1', { relationship_type: 'follow_up', task_id: 'task_1' });
    expect(d.createLedgerItem).toHaveBeenCalledTimes(2);
    expect(d.createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({
      person_ref: 'professional:person:p1', direction: 'you_owe', text: 'Send meeting notes', comm_ref: 'professional:meeting:meeting_1'
    }));
    expect(d.patchLedger).toHaveBeenCalledWith('ledger_1', { task_ref: 'tasks:task:task_1' });
    expect(answer).toEqual({ answer: 'yes', answered_at: NOW.toISOString(), task_id: 'task_1', ledger_ids: ['ledger_1', 'ledger_2'], sent_at: null });
    expect(d.updateMeeting).toHaveBeenCalledWith('meeting_1', { notes_follow_up: answer });
  });

  it('saves nothing when the task fails, so Yes can be pressed again', async () => {
    const d = deps({ createTask: vi.fn(async () => { throw new Error('down'); }) });
    await expect(saveFollowUpYes({ id: 'meeting_1', title: 'T' }, people, d)).rejects.toThrow('down');
    expect(d.createLedgerItem).not.toHaveBeenCalled();
    expect(d.updateMeeting).not.toHaveBeenCalled();
  });

  it('still saves the answer when a promise or the link fails', async () => {
    let calls = 0;
    const d = deps({
      linkMeetingTask: vi.fn(async () => { throw new Error('link'); }),
      createLedgerItem: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('ledger');
        return { item: { id: 'ledger_9' } as never, created: true };
      })
    });
    const answer = await saveFollowUpYes({ id: 'meeting_1', title: 'T' }, people, d);
    expect(answer).toMatchObject({ answer: 'yes', task_id: 'task_1', ledger_ids: ['ledger_9'] });
    expect(d.updateMeeting).toHaveBeenCalledTimes(1);
  });
});

describe('saveFollowUpNo', () => {
  it('saves a no and makes nothing', async () => {
    const d = deps();
    expect(await saveFollowUpNo('meeting_1', d)).toEqual({ answer: 'no', answered_at: NOW.toISOString() });
    expect(d.createTask).not.toHaveBeenCalled();
  });
});

describe('markNotesSent', () => {
  const yes: NotesFollowUp = { answer: 'yes', answered_at: '2026-11-16T04:00:00.000Z', task_id: 'task_1', ledger_ids: ['ledger_1', 'ledger_2'], sent_at: null };

  it('ticks the task and every promise, then notes when', async () => {
    const d = deps({}, { followUp: yes });
    const next = await markNotesSent('meeting_1', d);
    expect(d.setTaskDone).toHaveBeenCalledWith('task_1');
    expect(d.patchLedger).toHaveBeenCalledWith('ledger_1', { status: 'done' });
    expect(d.patchLedger).toHaveBeenCalledWith('ledger_2', { status: 'done' });
    expect(next).toMatchObject({ sent_at: NOW.toISOString() });
  });

  it('does nothing for a no, no answer, or notes already sent', async () => {
    for (const followUp of [null, { answer: 'no', answered_at: NOW.toISOString() } as NotesFollowUp, { ...yes, sent_at: NOW.toISOString() }]) {
      const d = deps({}, { followUp });
      expect(await markNotesSent('meeting_1', d)).toBeNull();
      expect(d.setTaskDone).not.toHaveBeenCalled();
      expect(d.updateMeeting).not.toHaveBeenCalled();
    }
  });

  it('keeps going when ticking the task fails', async () => {
    const d = deps({ setTaskDone: vi.fn(async () => { throw new Error('tasks down'); }) }, { followUp: yes });
    const next = await markNotesSent('meeting_1', d);
    expect(d.patchLedger).toHaveBeenCalledTimes(2);
    expect(next).toMatchObject({ sent_at: NOW.toISOString() });
  });
});
