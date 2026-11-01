import { describe, expect, it, vi } from 'vitest';
import { keepMinutesDecisions, mergeMinutesDecisions, ownerForMine, savedLine, saveMinutesReview, PDF_MAX_BYTES } from '@/lib/meeting-minutes';
import type { LedgerItem, MeetingRecord } from '@/domain/types';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const record = { id: MEETING_ID, decisions: [{ id: 'd_1', text: 'Notes decision', agenda_heading: null }], minutes: null } as unknown as MeetingRecord;

describe('decision merging', () => {
  it('adds only new minutes decisions, ignoring case and spacing', () => {
    const out = mergeMinutesDecisions(
      [...record.decisions!, { id: 'dm_1', text: 'Exams move to Week 8', agenda_heading: 'Assessment', source: 'minutes' }],
      [{ text: 'exams  move to week 8', agenda_heading: 'Assessment' }, { text: 'Bus booked', agenda_heading: null }]
    );
    expect(out.added).toBe(1);
    expect(out.decisions.at(-1)).toEqual({ id: 'dm_2', text: 'Bus booked', agenda_heading: null, source: 'minutes' });
  });

  it('keeps minutes decisions when notes are rebuilt', () => {
    const out = keepMinutesDecisions(
      [{ id: 'd_1', text: 'Old', agenda_heading: null }, { id: 'dm_1', text: 'From minutes', agenda_heading: null, source: 'minutes' }],
      [{ text: 'New from notes', agenda_heading: 'Assessment' }]
    );
    expect(out).toEqual([
      { id: 'd_1', text: 'New from notes', agenda_heading: 'Assessment' },
      { id: 'dm_1', text: 'From minutes', agenda_heading: null, source: 'minutes' }
    ]);
  });
});

describe('who Adam owes', () => {
  it('prefers the chair, then the first attendee', () => {
    expect(ownerForMine([{ ref: 'a', role: null }, { ref: 'b', role: 'chair' }])).toBe('b');
    expect(ownerForMine([{ ref: 'a', role: null }])).toBe('a');
    expect(ownerForMine([])).toBeNull();
  });
});

describe('saveMinutesReview', () => {
  const deps = () => ({
    uploadFile: vi.fn(async () => ({ file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf` })),
    createLedgerItem: vi.fn(async (body: { text: string }) => ({ item: { id: `l_${body.text}`, text: body.text } as unknown as LedgerItem, created: body.text !== 'Already there' })),
    makeActionTask: vi.fn(async (item: LedgerItem) => item),
    createLooseTask: vi.fn(async () => undefined),
    saveMeeting: vi.fn(async (patch: object) => ({ ...record, ...patch }) as MeetingRecord),
    now: () => new Date('2026-11-01T02:00:00.000Z')
  });

  it('uploads, makes tasks and promises, merges decisions and saves minutes', async () => {
    const d = deps();
    const out = await saveMinutesReview({
      record, meetingRef: `professional:meeting:${MEETING_ID}`, attendees: [{ ref: 'shared:person:p1', role: 'chair' }],
      pdfData: 'JVBER', sections: [{ heading: 'Assessment', text: 'Exams move.' }],
      mine: [{ text: 'Circulate the plan', due: '2026-11-14' }, { text: 'Already there', due: null }],
      others: [{ text: 'Confirm budget', person_ref: 'shared:person:p1', due: null }],
      decisions: [{ text: 'Exams move to Week 8', agenda_heading: 'Assessment' }]
    }, d);
    expect(d.uploadFile).toHaveBeenCalledWith(MEETING_ID, 'JVBER');
    expect(d.makeActionTask).toHaveBeenCalledTimes(1);
    expect(d.createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'they_owe', person_ref: 'shared:person:p1', text: 'Confirm budget' }));
    expect(out.counts).toEqual({ tasks: 1, promises: 1, decisions: 1 });
    const patch = d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string; source: string; added_at: string } };
    expect(patch.minutes).toMatchObject({ file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf`, source: 'page', added_at: '2026-11-01T02:00:00.000Z' });
  });

  it('makes a loose task when nobody else is in the meeting, and keeps an old file for pasted text', async () => {
    const d = deps();
    const withFile = { ...record, minutes: { file_key: 'meeting-minutes/old.pdf' } } as unknown as MeetingRecord;
    await saveMinutesReview({ record: withFile, meetingRef: 'm', attendees: [], pdfData: null, sections: [{ heading: '', text: 'T' }],
      mine: [{ text: 'Do it', due: null }], others: [], decisions: [] }, d);
    expect(d.createLooseTask).toHaveBeenCalledWith('Do it', 'm');
    expect(d.uploadFile).not.toHaveBeenCalled();
    expect((d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string } }).minutes.file_key).toBe('meeting-minutes/old.pdf');
  });

  it('uses a pending file key over the old file, and always clears minutes_pending', async () => {
    const d = deps();
    const withFile = { ...record, minutes: { file_key: 'meeting-minutes/old.pdf' } } as unknown as MeetingRecord;
    const pendingKey = `meeting-minutes/${MEETING_ID}/1762000000000.pdf`;
    await saveMinutesReview({ record: withFile, meetingRef: 'm', attendees: [], pdfData: null, fileKey: pendingKey,
      sections: [{ heading: '', text: 'T' }], mine: [], others: [], decisions: [] }, d);
    expect(d.uploadFile).not.toHaveBeenCalled();
    const patch = d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string }; minutes_pending: unknown };
    expect(patch.minutes.file_key).toBe(pendingKey);
    expect(patch).toHaveProperty('minutes_pending', null);
  });

  it('a new upload wins over a pending file key', async () => {
    const d = deps();
    await saveMinutesReview({ record, meetingRef: 'm', attendees: [], pdfData: 'JVBER', fileKey: 'meeting-minutes/pending.pdf',
      sections: [], mine: [], others: [], decisions: [] }, d);
    const patch = d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string }; minutes_pending: unknown };
    expect(patch.minutes.file_key).toBe(`meeting-minutes/${MEETING_ID}/1762000000000.pdf`);
    expect(patch).toHaveProperty('minutes_pending', null);
  });
});

it('savedLine reads naturally and the size cap is 4 MB', () => {
  expect(savedLine({ tasks: 1, promises: 2, decisions: 0 })).toBe('Added 1 task and 2 promises.');
  expect(savedLine({ tasks: 0, promises: 0, decisions: 0 })).toBe('Nothing new to add.');
  expect(PDF_MAX_BYTES).toBe(4_000_000);
});
