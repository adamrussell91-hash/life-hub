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

function setup(minutes: MeetingRecord['minutes'] = null, minutesPending: MeetingRecord['minutes_pending'] = null, minutesDraft: string | null = null, minutesNotes: MeetingRecord['minutes_notes'] = []) {
  const record = { id: MEETING_ID, decisions: [], minutes, minutes_pending: minutesPending, minutes_draft: minutesDraft, minutes_notes: minutesNotes } as unknown as MeetingRecord;
  const deps: MinutesCardDeps = {
    read: vi.fn(async () => review),
    save: vi.fn(async (input) => ({ record: { ...record, minutes: { sections: input.sections, file_key: null, source: 'page', added_at: 'x', saved_counts: { tasks: 1, promises: 2, decisions: 1 } } } as MeetingRecord, counts: { tasks: 1, promises: 2, decisions: 1 } })),
    openFile: vi.fn(async () => undefined),
    fetchPdf: vi.fn(async () => 'JVBERi0xLjQK'),
    fetchText: vi.fn(async () => 'Pasted minutes'),
    dismissPending: vi.fn(async () => ({ ...record, minutes_pending: null }) as MeetingRecord),
    saveDraft: vi.fn(async () => undefined),
    saveItemNotes: vi.fn(async () => undefined),
    commitItemNote: vi.fn(async () => [])
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
  describe('notes under each item', () => {
    const MINUTES = {
      sections: [
        { heading: '5. Financial update', text: 'Balance is healthy.' },
        { heading: '6. Memberships update', text: '134 members.' }
      ],
      file_key: null, source: 'page', added_at: '2026-11-03T07:00:00.000Z', saved_counts: { tasks: 0, promises: 0, decisions: 0 }
    } as unknown as MeetingRecord['minutes'];
    const folds = (card: HTMLElement) => [...card.querySelectorAll<HTMLDetailsElement>('[data-part="minutes-item"]')];
    const write = (fold: HTMLElement, text: string) => {
      const area = fold.querySelector('textarea') as HTMLTextAreaElement;
      area.value = text;
      area.dispatchEvent(new Event('input'));
      return area;
    };

    it('shows a closed fold per item, each with its own notes box', () => {
      const { card } = setup(MINUTES);
      expect(folds(card).map((fold) => fold.querySelector('summary span')?.textContent)).toEqual(['5. Financial update', '6. Memberships update']);
      expect(folds(card).every((fold) => !fold.open)).toBe(true);
      expect(card.querySelectorAll('textarea')).toHaveLength(2);
    });

    it('Open all opens every item, then closes them', () => {
      const { card } = setup(MINUTES);
      const all = card.querySelector('[data-part="minutes-fold-all"]') as HTMLButtonElement;
      all.click();
      expect(folds(card).every((fold) => fold.open)).toBe(true);
      expect(all.textContent).toBe('Close all');
      all.click();
      expect(folds(card).every((fold) => !fold.open)).toBe(true);
    });

    it('saves a note keyed to its item, without filing promises until the box is left', async () => {
      const { card, deps } = setup(MINUTES);
      const area = write(folds(card)[1]!, '»me chase the software');
      await new Promise((resolve) => setTimeout(resolve, 850));
      expect(deps.saveItemNotes).toHaveBeenCalledWith([{ key: 'memberships update', heading: '6. Memberships update', text: '»me chase the software' }]);
      expect(deps.commitItemNote).not.toHaveBeenCalled();
      area.dispatchEvent(new Event('blur'));
      await flush();
      await flush();
      expect(deps.commitItemNote).toHaveBeenCalledWith('»me chase the software');
    });

    it('sends the other items’ notes too, so saving one never drops another', async () => {
      const kept = [{ key: 'financial update', heading: '5. Financial update', text: 'Check the CommBank access' }];
      const { card, deps } = setup(MINUTES, null, null, kept);
      write(folds(card)[1]!, 'New note').dispatchEvent(new Event('blur'));
      await flush();
      expect(vi.mocked(deps.saveItemNotes).mock.calls[0]![0]).toEqual([...kept, { key: 'memberships update', heading: '6. Memberships update', text: 'New note' }]);
    });

    it('marks items with notes and reopens with the text in place', () => {
      const { card } = setup(MINUTES, null, null, [{ key: 'financial update', heading: '5. Financial update', text: 'Check access' }]);
      expect((folds(card)[0]!.querySelector('.meeting-minutes__has-note') as HTMLElement).hidden).toBe(false);
      expect((folds(card)[1]!.querySelector('.meeting-minutes__has-note') as HTMLElement).hidden).toBe(true);
      expect((folds(card)[0]!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Check access');
    });

    it('says what to do when a » name is not in the room', async () => {
      const { card, deps } = setup(MINUTES);
      vi.mocked(deps.commitItemNote).mockResolvedValueOnce(['Kerryn']);
      write(folds(card)[0]!, '»Kerryn send it').dispatchEvent(new Event('blur'));
      await flush();
      await flush();
      expect(folds(card)[0]!.querySelector('.meeting-minutes__note-status')?.textContent).toContain('Add Kerryn to The room');
    });

    it('explains »me when nobody is in the room', async () => {
      const { card, deps } = setup(MINUTES);
      vi.mocked(deps.commitItemNote).mockResolvedValueOnce(['me']);
      write(folds(card)[0]!, '»me send it').dispatchEvent(new Event('blur'));
      await flush();
      await flush();
      expect(folds(card)[0]!.querySelector('.meeting-minutes__note-status')?.textContent).toContain('»me needs someone in The room');
    });

    it('says so when a note fails to save, and the next save carries it', async () => {
      const { card, deps } = setup(MINUTES);
      vi.mocked(deps.saveItemNotes).mockRejectedValueOnce(new Error('offline'));
      const area = write(folds(card)[0]!, 'Keep me');
      area.dispatchEvent(new Event('blur'));
      await flush();
      expect(folds(card)[0]!.querySelector('.meeting-minutes__note-status')?.textContent).toContain('Not saved yet');
      area.dispatchEvent(new Event('blur'));
      await flush();
      expect(deps.saveItemNotes).toHaveBeenCalledTimes(2);
    });

    it('keeps a note whose item is gone from the minutes, as its own item', () => {
      const { card } = setup(MINUTES, null, null, [{ key: 'old business', heading: '9. Old business', text: 'Still matters' }]);
      const last = folds(card).at(-1)!;
      expect(last.querySelector('summary span')?.textContent).toBe('9. Old business');
      expect((last.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Still matters');
      expect(card.textContent).toContain('from earlier minutes');
    });
  });

  describe('typed text', () => {
    const SAVED_MINUTES = { sections: [{ heading: null, text: 'Old minutes.' }], file_key: null, source: 'page', added_at: '2026-10-31T23:00:00.000Z', saved_counts: { tasks: 0, promises: 0, decisions: 0 } } as unknown as MeetingRecord['minutes'];
    const typeText = (card: HTMLElement, text: string) => {
      const area = card.querySelector('textarea') as HTMLTextAreaElement;
      area.value = text;
      area.dispatchEvent(new Event('input'));
      return area;
    };
    const read = (card: HTMLElement) => (card.querySelector('[data-part="minutes-read-text"]') as HTMLButtonElement).click();

    it('saves on leaving the box without pressing Read', async () => {
      const { card, deps } = setup();
      const area = typeText(card, 'Notes from the meeting');
      area.dispatchEvent(new Event('blur'));
      await flush();
      expect(deps.saveDraft).toHaveBeenCalledWith('Notes from the meeting');
      expect(card.querySelector('.meeting-minutes__draft-status')?.textContent).toBe('Saved on this meeting.');
    });

    it('saves by itself soon after typing stops', async () => {
      vi.useFakeTimers();
      try {
        const { card, deps } = setup();
        typeText(card, 'Notes');
        expect(deps.saveDraft).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(800);
        expect(deps.saveDraft).toHaveBeenCalledWith('Notes');
      } finally {
        vi.useRealTimers();
      }
    });

    it('says so when the save fails, and tries again on the next chance', async () => {
      const { card, deps } = setup();
      vi.mocked(deps.saveDraft).mockRejectedValueOnce(new Error('offline'));
      const area = typeText(card, 'Notes');
      area.dispatchEvent(new Event('blur'));
      await flush();
      expect(card.querySelector('.meeting-minutes__draft-status')?.textContent).toContain('Not saved yet');
      area.dispatchEvent(new Event('blur'));
      await flush();
      expect(deps.saveDraft).toHaveBeenCalledTimes(2);
      expect(card.querySelector('.meeting-minutes__draft-status')?.textContent).toBe('Saved on this meeting.');
    });

    it('opens with saved text showing, even when the meeting already has minutes', () => {
      const { card } = setup(SAVED_MINUTES, null, 'Still here');
      expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Still here');
      expect((card.querySelector('.meeting-minutes__paste') as HTMLElement).hidden).toBe(false);
    });

    it('offers the text back after Cancel on a meeting with minutes', () => {
      const { card } = setup(SAVED_MINUTES, null, 'Still here');
      (card.querySelector('[data-part="minutes-cancel"]') as HTMLButtonElement).click();
      (card.querySelector('[data-part="minutes-back-to-text"]') as HTMLButtonElement).click();
      expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Still here');
    });

    it('gets back to the text from the review, and clears it only once minutes read from it are saved', async () => {
      const { card, deps } = setup();
      typeText(card, 'Notes from the meeting');
      read(card);
      await flush();
      await flush();
      expect(deps.saveDraft).toHaveBeenCalledWith('Notes from the meeting');
      (card.querySelector('[data-part="minutes-back-to-text"]') as HTMLButtonElement).click();
      expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Notes from the meeting');
      read(card);
      await flush();
      await flush();
      (card.querySelector('[data-part="minutes-save"]') as HTMLButtonElement).click();
      await flush();
      expect(deps.save).toHaveBeenCalledWith(expect.objectContaining({ clearDraft: true }));
    });

    it('gets back to the text when Clare cannot read it', async () => {
      const { card, deps } = setup();
      vi.mocked(deps.read).mockRejectedValueOnce(new Error('nope'));
      typeText(card, 'Notes');
      read(card);
      await flush();
      await flush();
      (card.querySelector('[data-part="minutes-back-to-text"]') as HTMLButtonElement).click();
      expect((card.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Notes');
    });

    it('keeps the text when a PDF from chat is saved instead', async () => {
      const { card, deps } = setup(null, pending, 'Notes');
      (card.querySelector('[data-part="minutes-pending-review"]') as HTMLButtonElement).click();
      await flush();
      await flush();
      (card.querySelector('[data-part="minutes-save"]') as HTMLButtonElement).click();
      await flush();
      expect(vi.mocked(deps.save).mock.calls[0]![0]).not.toHaveProperty('clearDraft');
      expect(card.querySelector('textarea[aria-label="Paste the minutes"]')).toBeNull();
      expect(card.querySelector('[data-part="minutes-back-to-text"]')).not.toBeNull();
    });
  });

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
    it('reviews minutes pasted into chat as text', async () => {
      const textKey = PENDING_KEY.replace(/\.pdf$/, '.txt');
      const { card, deps } = setup(null, { ...pending, file_key: textKey });
      (card.querySelector('[data-part="minutes-pending-review"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(deps.read).toHaveBeenCalledWith({ text: 'Pasted minutes' }));
      expect(deps.fetchText).toHaveBeenCalledWith(textKey);
      expect(deps.fetchPdf).not.toHaveBeenCalled();
    });

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
