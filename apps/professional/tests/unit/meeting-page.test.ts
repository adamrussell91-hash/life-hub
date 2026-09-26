import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const MEETING_REF = `professional:meeting:${MEETING_ID}`;
const meeting = {
  schema_version: 2, id: MEETING_ID, title: 'HALT NSW board meeting',
  scheduled_start: '2026-09-24T08:00:00.000Z', scheduled_end: '2026-09-24T09:15:00.000Z', time_zone: 'Australia/Sydney',
  location_text: 'Teams', agenda: '1. Minutes\n2. Treasurer’s report\n3. Medal ceremony run sheet', notes: null, state: 'scheduled',
  occurrence_history: [], created_at: '', updated_at: '', purpose: null, blocks: [], decisions: []
};

vi.mock('@/api/meetings', () => ({
  getMeeting: vi.fn(async () => ({ meeting })),
  updateMeeting: vi.fn(async (_id: string, patch: object) => ({ meeting: { ...meeting, ...patch } }))
}));
vi.mock('@/views/meetings', () => ({ buildMeetingTaskLinks: () => document.createElement('section') }));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [
    { link: { id: 'a1', source_ref: MEETING_REF, target_ref: 'shared:person:vicki', relationship_type: 'attendee', role: 'chair', status: 'current' },
      endpoint: { ref: 'shared:person:vicki', kind: 'person', display_label: 'Vicki Sheehan', href: null }, direction: 'outgoing' },
    { link: { id: 'a2', source_ref: MEETING_REF, target_ref: 'shared:person:greg', relationship_type: 'attendee', role: null, status: 'current' },
      endpoint: { ref: 'shared:person:greg', kind: 'person', display_label: 'Greg R.', href: null }, direction: 'outgoing' }
  ], incoming: [] })),
  createTask: vi.fn(async () => ({ id: 'task_1', title: 'x' }))
}));
vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(async () => ({ people: [
    { ref: 'shared:person:vicki', display_name: 'Vicki Sheehan', initials: 'VS', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'warm', created_at: '2024-01-01T00:00:00.000Z' },
    { ref: 'shared:person:greg', display_name: 'Greg R.', initials: 'GR', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'cooling', created_at: '2024-01-01T00:00:00.000Z' }
  ], organisations: [], counts: { people: 2, organisations: 1 } }))
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({ items: [] })),
  createLedgerItem: vi.fn(async (body: object) => ({ item: { id: 'l', status: 'open', ...body }, created: true })),
  patchLedger: vi.fn()
}));
let savedBlocks: unknown[] = [];
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement, options: { blocks: unknown[]; onSave: (blocks: unknown[]) => Promise<void> }) => {
    savedBlocks = options.blocks;
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => savedBlocks, dispose: () => {}, save: options.onSave };
  })
}));

import { renderMeetingPage } from '@/views/meeting-page';
import { mountBlockPage } from '@/components/block-page';
import { updateMeeting } from '@/api/meetings';

describe('meeting page', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-24T08:30:00.000Z') }));
  afterEach(() => {
    vi.useRealTimers();
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
});
