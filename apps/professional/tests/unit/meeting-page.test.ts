import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const MEETING_REF = `professional:meeting:${MEETING_ID}`;
const meeting = {
  schema_version: 2, id: MEETING_ID, title: 'HALT NSW board meeting',
  scheduled_start: '2026-09-24T08:00:00.000Z', scheduled_end: '2026-09-24T09:15:00.000Z', time_zone: 'Australia/Sydney',
  location_text: 'Teams', agenda: '1. Minutes\n2. Treasurer’s report\n3. Medal ceremony run sheet', notes: null, state: 'scheduled',
  occurrence_history: [], created_at: '', updated_at: '', purpose: 'Get a yes on the TeachMeet date', blocks: [], decisions: []
};

vi.mock('@/api/meetings', () => ({
  getMeeting: vi.fn(async () => ({ meeting })),
  updateMeeting: vi.fn(async (_id: string, patch: object) => ({ meeting: { ...meeting, ...patch } })),
  rescheduleMeeting: vi.fn(async (_id: string, body: object) => ({ meeting: { ...meeting, ...body, state: 'rescheduled' } })),
  meetingStateAction: vi.fn(async () => ({ meeting: { ...meeting, state: 'completed' } }))
}));
vi.mock('@/views/meetings', () => ({
  buildMeetingTaskLinks: () => {
    const host = document.createElement('div');
    for (const type of ['preparation', 'follow_up']) {
      const panel = document.createElement('section');
      panel.dataset.part = `task-link-${type}`;
      host.append(panel);
    }
    return host;
  },
  roleLabel: (role: string | null) => (role === 'chair' ? 'Chair' : role)
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [
    { link: { id: 'a1', source_ref: MEETING_REF, target_ref: 'shared:person:rachel', relationship_type: 'attendee', role: 'chair', status: 'current' },
      endpoint: { ref: 'shared:person:rachel', kind: 'person', display_label: 'Rachel Ford', href: null }, direction: 'outgoing' },
    { link: { id: 'a2', source_ref: MEETING_REF, target_ref: 'shared:person:ben', relationship_type: 'attendee', role: null, status: 'current' },
      endpoint: { ref: 'shared:person:ben', kind: 'person', display_label: 'Ben C.', href: null }, direction: 'outgoing' },
    { link: { id: 'a3', source_ref: MEETING_REF, target_ref: 'shared:person:blob-rohan', relationship_type: 'attendee', role: null, status: 'current' },
      endpoint: { ref: 'shared:person:blob-rohan', kind: 'person', display_label: 'Rohan Arianayagam', href: null }, direction: 'outgoing' }
  ], incoming: [] })),
  createTask: vi.fn(async () => ({ id: 'task_1', title: 'x' })),
  createUniversalLink: vi.fn(async () => ({ link: { id: 'a9' }, created: true })),
  endUniversalLink: vi.fn(async () => ({ link: { id: 'a2' } }))
}));
vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(async () => ({ people: [
    { ref: 'shared:person:rachel', display_name: 'Rachel Ford', initials: 'RF', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'warm', created_at: '2024-01-01T00:00:00.000Z' },
    { ref: 'shared:person:ben', display_name: 'Ben C.', initials: 'BC', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'cooling', created_at: '2024-01-01T00:00:00.000Z' }
  ], organisations: [], counts: { people: 2, organisations: 1 } })),
  fetchPersonLedger: vi.fn(async (ref: string) => ({
    you_owe: ref === 'shared:person:rachel' ? [{ id: 'p1', text: 'Send Rachel the medal list', status: 'open' }] : [],
    they_owe: [], you_owe_count: 0, they_owe_count: 0, open_item_count: 0
  }))
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({ items: [] })),
  createLedgerItem: vi.fn(async (body: object) => ({ item: { id: 'l', status: 'open', ...body }, created: true })),
  patchLedger: vi.fn()
}));
vi.mock('@/api/clare-comms', () => ({
  clareBrief: vi.fn(async () => ({ points: [{ text: 'Rachel wants the date locked', source: 'meeting 12/09/26' }], owed_line: null })),
  clareDrafts: vi.fn(async () => ({ drafts: [] })),
  clareProposeNext: vi.fn(),
  clarePurposeCheck: vi.fn(async () => ({ met: false, note: 'TeachMeet date was deferred to October.' })),
  clareSummary: vi.fn(async () => ({ summary: 'Board agreed the run sheet.', promises: [], numbers: [] })),
  clareHandwriting: vi.fn()
}));
let savedBlocks: unknown[] = [];
let notesDisposeCount = 0;
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement, options: { blocks: unknown[]; onSave: (blocks: unknown[]) => Promise<void> }) => {
    savedBlocks = options.blocks;
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return {
      flush: async () => {},
      current: () => savedBlocks,
      dispose: () => {
        notesDisposeCount += 1;
      },
      save: options.onSave
    };
  })
}));

import { renderMeetingPage } from '@/views/meeting-page';
import { mountBlockPage } from '@/components/block-page';
import { meetingStateAction, rescheduleMeeting, updateMeeting } from '@/api/meetings';
import { createUniversalLink, endUniversalLink } from '@/api/universal-links';

describe('meeting page', () => {
  beforeEach(() => {
    notesDisposeCount = 0;
    vi.useFakeTimers({ now: new Date('2026-09-24T08:30:00.000Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  async function render() {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderMeetingPage(canvas, MEETING_ID, { isCurrent: () => true, onTitleReady: () => {} });
    return canvas;
  }

  it('is live during the meeting, shows purpose and the room by organisation', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('during');
    expect(canvas.querySelector('[data-part="purpose"]')).not.toBeNull();
    const room = canvas.querySelector('[data-part="room"]')!;
    expect(room.textContent).toContain('HALT NSW');
    expect(room.querySelectorAll('[data-warmth="3"]').length).toBe(1);
  });

  it('seeds the notes with the agenda as headings', async () => {
    await render();
    const blocks = (mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].blocks as Array<{ block_type: string; content: { text?: string } }>;
    expect(blocks.filter((block) => block.block_type === 'heading').map((block) => block.content.text)).toEqual([
      'Minutes', 'Treasurer’s report', 'Medal ceremony run sheet'
    ]);
  });

  it('saving notes stores blocks and the decisions found in them', async () => {
    await render();
    const onSave = (mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].onSave as (blocks: unknown[]) => Promise<void>;
    await onSave([
      { id: 'h', block_type: 'heading', content: { text: 'Minutes' } },
      { id: 'r', block_type: 'rich_text', content: { html: '<p>✓ Minutes accepted</p>' } }
    ]);
    expect(updateMeeting).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({
      decisions: [expect.objectContaining({ text: 'Minutes accepted', agenda_heading: 'Minutes' })]
    }));
  });

  it('After: purpose check shows the verdict and offers to carry it forward', async () => {
    const { createLedgerItem } = await import('@/api/ledger');
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    canvas.querySelector<HTMLButtonElement>('[data-part="purpose-check"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(canvas.textContent).toContain('TeachMeet date was deferred to October.');
    canvas.querySelector<HTMLButtonElement>('[data-part="carry-purpose"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'you_owe', text: expect.stringContaining('Carried:') }));
  });

  it('shows when, where and who in the header', async () => {
    const canvas = await render();
    const facts = canvas.querySelector('[data-part="facts"]')!.textContent!;
    expect(facts).toContain('24/09/26');
    expect(facts).toContain('6:00 pm');
    expect(facts).toContain('Teams');
    expect(facts).toContain('with Rachel Ford, Ben C., Rohan Arianayagam');
  });

  it('an attendee the directory misses keeps their name (never "Unknown person")', async () => {
    const canvas = await render();
    const room = canvas.querySelector('[data-part="room"]')!;
    expect(room.textContent).toContain('Rohan Arianayagam');
    expect(room.textContent).not.toContain('Unknown person');
    expect(room.textContent).not.toContain('New to you');
  });

  it('the three phases show different work: brief + open promises / live strip / wrap-up', async () => {
    const canvas = await render();
    const parts = () => [...canvas.querySelectorAll('.meeting-page__main > [data-part]')].map((node) => node.getAttribute('data-part'));

    canvas.querySelector<HTMLButtonElement>('[data-set-phase="before"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(parts()).toEqual(['clare-brief', 'open-promises', 'notes']);
    expect(canvas.querySelector('[data-part="open-promises"]')!.textContent).toContain('Send Rachel the medal list');
    expect(canvas.querySelector<HTMLElement>('[data-part="task-link-preparation"]')!.hidden).toBe(false);
    expect(canvas.querySelector<HTMLElement>('[data-part="task-link-follow_up"]')!.hidden).toBe(true);
    canvas.querySelector<HTMLButtonElement>('[data-part="brief-me"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(canvas.querySelector('[data-part="clare-brief"]')!.textContent).toContain('Rachel wants the date locked');

    canvas.querySelector<HTMLButtonElement>('[data-set-phase="during"]')!.click();
    expect(parts()).toEqual(['live-strip', 'notes', 'actions', 'mentions']);
    expect(canvas.querySelector('[data-part="live-strip"]')!.textContent).toContain('30 min in · 45 min left');

    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    expect(parts()).toEqual(['purpose-check-card', 'wrap-up', 'actions', 'notes', 'mentions']);
    expect(canvas.querySelector<HTMLElement>('[data-part="task-link-preparation"]')!.hidden).toBe(true);
    expect(canvas.querySelector<HTMLElement>('[data-part="task-link-follow_up"]')!.hidden).toBe(false);
  });

  it('End completes the meeting and opens the wrap-up', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="end-meeting"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(meetingStateAction).toHaveBeenCalledWith(MEETING_ID, 'complete');
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('after');
  });

  it('Edit details saves a new title and moves the time', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="edit-details"]')!.click();
    const editor = canvas.querySelector<HTMLElement>('[data-part="details-editor"]')!;
    expect(editor.hidden).toBe(false);
    editor.querySelector<HTMLInputElement>('input[aria-label="Title"]')!.value = 'HALT NSW board';
    const start = editor.querySelector<HTMLInputElement>('input[aria-label="Start time"]')!;
    start.value = '19:00';
    start.dispatchEvent(new Event('input'));
    editor.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(updateMeeting).toHaveBeenCalledWith(MEETING_ID, { title: 'HALT NSW board', location_text: 'Teams' });
    expect(rescheduleMeeting).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({
      scheduled_start: '2026-09-24T09:00:00.000Z',
      scheduled_end: '2026-09-24T10:15:00.000Z'
    }));
  });

  it('removes a person from the room', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('button[aria-label="Remove Ben C."]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(endUniversalLink).toHaveBeenCalledWith('a2');
    expect(canvas.querySelector('[data-part="room"]')!.textContent).not.toContain('Ben C.');
    expect(createUniversalLink).not.toHaveBeenCalled();
  });

  it('empty Actions and Who said what say how they fill', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-part="actions"]')!.textContent).toContain('»me');
    expect(canvas.querySelector('[data-part="mentions"]')!.textContent).toContain('@Name');
  });

  it('does not remount notes when the clock asks for the same phase', async () => {
    const canvas = await render();
    const mounted = (mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.length;
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="during"]')!.click();
    expect((mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(mounted);
    expect(notesDisposeCount).toBe(0);
  });

  it('keeps the same notes editor when the page recycles to After', async () => {
    const canvas = await render();
    const notes = canvas.querySelector('[data-part="notes"]');
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    expect(canvas.querySelector('[data-part="notes"]')).toBe(notes);
    expect(notesDisposeCount).toBe(0);
    expect((mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
