// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mountMinutesCard, type MinutesCardDeps } from '@/views/meeting-minutes-card';
import type { MeetingRecord } from '@/domain/types';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const review = {
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }],
  mine: [{ text: 'Circulate the plan', due: '2026-11-14' }],
  others: [{ text: 'Confirm budget', person_ref: 'shared:person:p1', person_name: 'Priya Nandakumar', due: null }],
  unmatched: [{ text: 'Follow up with the venue', who_text: 'JT', due: null }],
  decisions: [{ text: 'Exams move to Week 8', agenda_heading: 'Assessment' }],
  differences: [{ text: 'My notes say approved; the minutes say pending.' }]
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const PENDING_KEY = `meeting-minutes/${MEETING_ID}/1762000000000.pdf`;
const pending = { file_key: PENDING_KEY, added_at: '2026-10-31T23:00:00.000Z', source: 'chat' as const, note: 'From the faculty email.' };

function setup(minutes: MeetingRecord['minutes'] = null, minutesPending: MeetingRecord['minutes_pending'] = null) {
  const record = { id: MEETING_ID, decisions: [], minutes, minutes_pending: minutesPending } as unknown as MeetingRecord;
  const deps: MinutesCardDeps = {
    read: vi.fn(async () => review),
    save: vi.fn(async (input) => ({ record: { ...record, minutes: { sections: input.sections, file_key: null, source: 'page', added_at: 'x', saved_counts: { tasks: 1, promises: 2, decisions: 1 } } } as MeetingRecord, counts: { tasks: 1, promises: 2, decisions: 1 } })),
    openFile: vi.fn(async () => undefined),
    fetchPdf: vi.fn(async () => 'JVBERi0xLjQK'),
    dismissPending: vi.fn(async () => ({ ...record, minutes_pending: null }) as MeetingRecord)
  };
  const onSaved = vi.fn();
  const card = mountMinutesCard({
    record: () => record,
    attendees: () => [{ ref: 'shared:person:p1', name: 'Priya Nandakumar', role: 'chair' }, { ref: 'shared:person:p2', name: 'Tom Lister', role: null }],
    onSaved,
    deps
  });
  document.body.replaceChildren(card);
  return { card, deps, onSaved };
}

describe('Minutes card', () => {
  it('starts empty with Add minutes', () => {
    const { card } = setup();
    expect(card.querySelector('h3')?.textContent).toBe('Minutes');
    expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
  });

  it('reads pasted minutes, shows four groups, and saves ticked items with a picked person', async () => {
    const { card, deps } = setup();
    (card.querySelector('[data-part="minutes-paste-toggle"]') as HTMLButtonElement).click();
    (card.querySelector('textarea') as HTMLTextAreaElement).value = '1. Assessment. Exams move.';
    (card.querySelector('[data-part="minutes-read-text"]') as HTMLButtonElement).click();
    await flush();
    expect(deps.read).toHaveBeenCalledWith({ text: '1. Assessment. Exams move.' });
    const groups = [...card.querySelectorAll('[data-group]')].map((node) => (node as HTMLElement).dataset.group);
    expect(groups).toEqual(['mine', 'others', 'unmatched', 'decisions', 'differences']);
    expect(card.querySelectorAll('[data-group="differences"] input').length).toBe(0);

    (card.querySelector('[data-group="others"] input') as HTMLInputElement).click(); // untick
    (card.querySelector('[data-group="unmatched"] select') as HTMLSelectElement).value = 'shared:person:p2';
    (card.querySelector('[data-part="minutes-save"]') as HTMLButtonElement).click();
    await flush();
    const input = (deps.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.mine).toEqual([{ text: 'Circulate the plan', due: '2026-11-14' }]);
    expect(input.others).toEqual([{ text: 'Follow up with the venue', person_ref: 'shared:person:p2', due: null }]);
    expect(input.pdfData).toBeNull();
    await flush();
    expect(card.textContent).toContain('Added 1 task, 2 promises and 1 decision.');
    expect(card.textContent).toContain('Exams move to Week 8.');
  });

  it('shows saved minutes with Open the PDF and Replace minutes', async () => {
    const { card, deps } = setup({ sections: [{ heading: 'Assessment', text: 'Exams move.' }], file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf`, source: 'page', added_at: '2026-11-01T02:00:00.000Z', saved_counts: { tasks: 0, promises: 0, decisions: 0 } });
    (card.querySelector('[data-part="minutes-open-pdf"]') as HTMLButtonElement).click();
    expect(deps.openFile).toHaveBeenCalledWith(`meeting-minutes/${MEETING_ID}/1762000000000.pdf`);
    (card.querySelector('[data-part="minutes-replace"]') as HTMLButtonElement).click();
    expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
  });

  it('shows Try again when Clare fails', async () => {
    const { card, deps } = setup();
    (deps.read as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Clare could not finish: HTTP 529'));
    (card.querySelector('[data-part="minutes-paste-toggle"]') as HTMLButtonElement).click();
    (card.querySelector('textarea') as HTMLTextAreaElement).value = 'x';
    (card.querySelector('[data-part="minutes-read-text"]') as HTMLButtonElement).click();
    await flush();
    expect(card.textContent).toContain('Clare couldn’t read these minutes.');
    expect(card.querySelector('[data-part="minutes-retry"]')).not.toBeNull();
  });

  describe('minutes from chat', () => {
    it('shows the pending box with its date and note above the empty card', () => {
      const { card } = setup(null, pending);
      const box = card.querySelector('[data-part="minutes-pending"]') as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.textContent).toMatch(/^Minutes from chat · added \S/);
      expect(box.textContent).not.toContain('2026-10-31T');
      expect(box.textContent).toContain('From the faculty email.');
      expect(card.querySelector('.meeting-minutes__body')?.firstElementChild).toBe(box);
      expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
      expect(card.querySelector('[data-part="minutes-pending-review"]')?.className).toContain('btn--primary');
      expect(card.querySelector('[data-part="minutes-pending-dismiss"]')?.className).toContain('btn--ghost');
    });

    it('shows the pending box above saved minutes too, and leaves out a missing note', () => {
      const { card } = setup(
        { sections: [{ heading: 'Assessment', text: 'Exams move.' }], file_key: null, source: 'page', added_at: '2026-10-30T02:00:00.000Z', saved_counts: { tasks: 0, promises: 0, decisions: 0 } },
        { ...pending, note: null }
      );
      const box = card.querySelector('[data-part="minutes-pending"]') as HTMLElement;
      expect(card.querySelector('.meeting-minutes__body')?.firstElementChild).toBe(box);
      expect(box.querySelector('.meeting-minutes__pending-note')).toBeNull();
      expect(card.querySelector('[data-part="minutes-replace"]')).not.toBeNull();
    });

    it('shows no pending box when nothing is pending', () => {
      const { card } = setup();
      expect(card.querySelector('[data-part="minutes-pending"]')).toBeNull();
    });

    it('Review fetches the PDF, opens the review, and saves with the pending file key', async () => {
      const { card, deps } = setup(null, pending);
      (card.querySelector('[data-part="minutes-pending-review"]') as HTMLButtonElement).click();
      await flush();
      expect(deps.fetchPdf).toHaveBeenCalledWith(PENDING_KEY);
      expect(deps.read).toHaveBeenCalledWith({ pdf: { media_type: 'application/pdf', data: 'JVBERi0xLjQK' } });
      expect(card.querySelector('[data-group="mine"]')).not.toBeNull();
      (card.querySelector('[data-part="minutes-save"]') as HTMLButtonElement).click();
      await flush();
      const input = (deps.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(input.pdfData).toBeNull();
      expect(input.fileKey).toBe(PENDING_KEY);
      await flush();
      expect(card.textContent).toContain('Added 1 task, 2 promises and 1 decision.');
      expect(card.querySelector('[data-part="minutes-pending"]')).toBeNull();
    });

    it('shows Try again when the PDF cannot be fetched', async () => {
      const { card, deps } = setup(null, pending);
      (deps.fetchPdf as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('HTTP 404'));
      (card.querySelector('[data-part="minutes-pending-review"]') as HTMLButtonElement).click();
      await flush();
      expect(deps.read).not.toHaveBeenCalled();
      expect(card.textContent).toContain('Clare couldn’t read these minutes.');
      (card.querySelector('[data-part="minutes-retry"]') as HTMLButtonElement).click();
      await flush();
      expect(deps.fetchPdf).toHaveBeenCalledTimes(2);
      expect(deps.read).toHaveBeenCalledTimes(1);
    });

    it('Dismiss clears the pending minutes and hides the box', async () => {
      const { card, deps, onSaved } = setup(null, pending);
      (card.querySelector('[data-part="minutes-pending-dismiss"]') as HTMLButtonElement).click();
      await flush();
      expect(deps.dismissPending).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ minutes_pending: null }));
      expect(card.querySelector('[data-part="minutes-pending"]')).toBeNull();
      expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
    });
  });
});
