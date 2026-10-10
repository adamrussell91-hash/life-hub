import { afterEach, describe, expect, it, vi } from 'vitest';

const EVENT_ID = 'event_00000000-0000-4000-8000-000000000001';
const EVENT_REF = `professional:event:${EVENT_ID}`;
const GROUP_ID = 'pd_group_00000000-0000-4000-8000-000000000001';
const base = {
  schema_version: 2, id: EVENT_ID, title: 'Warlight: Critical Study of Literature', event_type: 'professional_development',
  start: '2026-09-17T23:00:00.000Z', end: '2026-09-18T05:00:00.000Z', time_zone: 'Australia/Sydney', all_day: false,
  occurrence_state: 'completed', location_text: "St Aloysius' College", accreditation_category: null, priority_area: null,
  hours: 6, attendance_state: 'attended', certificate: null, created_at: '', updated_at: '',
  talks: [{ id: 't1', time: '09:00', title: 'Keynote · Reading against the grain', presenter: 'Dr Mia L.', hours: 1.5 }],
  blocks: []
};
let current = { ...base };

vi.mock('@/api/events', () => ({
  getEvent: vi.fn(async () => ({ event: current })),
  updateEvent: vi.fn(async (_id: string, patch: object) => { current = { ...current, ...patch }; return { event: current }; })
}));
vi.mock('@/views/events', () => ({
  renderEventNewView: vi.fn(async () => {}),
  buildLearningTaskPanel: () => Object.assign(document.createElement('section'), { className: 'learning-stub' }),
  buildPdFields: () => Object.assign(document.createElement('section'), { className: 'pd-fields-stub' })
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => ref === EVENT_REF
    ? { outgoing: [
        { link: { id: 'g', source_ref: EVENT_REF, target_ref: `professional:pd_group:${GROUP_ID}`, relationship_type: 'in_pd_group', status: 'current' },
          endpoint: { ref: `professional:pd_group:${GROUP_ID}`, kind: 'pd_group', display_label: 'Warlight', href: null }, direction: 'outgoing' }
      ], incoming: [] }
    : { outgoing: [], incoming: [
        { link: { id: 'g', source_ref: EVENT_REF, target_ref: `professional:pd_group:${GROUP_ID}`, relationship_type: 'in_pd_group', status: 'current' },
          endpoint: { ref: EVENT_REF, kind: 'event', display_label: 'Warlight 1', href: null }, direction: 'incoming' }
      ] }),
  createUniversalLink: vi.fn(async () => ({ link: { id: 'new' }, created: true }))
}));
vi.mock('@/api/pd-groups', () => ({
  getPdGroup: vi.fn(async () => ({ group: { id: GROUP_ID, shape: 'series', title: 'Warlight', provider: 'Warlight', schema_version: 1, created_at: '', updated_at: '' } })),
  createPdGroup: vi.fn(async (body: object) => ({ group: { id: GROUP_ID, ...body } }))
}));
vi.mock('@/api/knowledge-notes', () => ({ createKnowledgeNote: vi.fn(async () => ({ id: 'page_1', title: 'Keynote' })) }));
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement) => {
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => [], dispose: () => {} };
  })
}));

import { renderEventNewView } from '@/views/events';
import { renderEventPage } from '@/views/event-page';
import { mountBlockPage } from '@/components/block-page';
import { updateEvent } from '@/api/events';
import { createKnowledgeNote } from '@/api/knowledge-notes';
import { createUniversalLink } from '@/api/universal-links';

async function render() {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderEventPage(canvas, EVENT_ID, { isCurrent: () => true, onTitleReady: () => {} });
  return canvas;
}

describe('event page', () => {
  afterEach(() => {
    document.body.replaceChildren();
    current = { ...base };
  });

  it('PD event shows the switch on, shape, series strip, talks and PD panels', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-part="pd-switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(canvas.querySelector('[data-part="shape"] [aria-checked="true"]')?.textContent).toContain('Series');
    expect(canvas.querySelector('[data-part="series"]')).not.toBeNull();
    expect(canvas.querySelector('[data-part="talks"]')?.textContent).toContain('Keynote · Reading against the grain');
    expect(canvas.querySelector('.pd-fields-stub')).not.toBeNull();
    expect(canvas.querySelector('.learning-stub')).not.toBeNull();
    expect(canvas.querySelector('.block-page-stub')).not.toBeNull();
  });

  it('turning PD off makes it a general event and hides the PD panels', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="pd-switch"]')!.click();
    await vi.waitFor(() => expect(updateEvent).toHaveBeenCalledWith(EVENT_ID, { event_type: 'general' }));
    await vi.waitFor(() => expect(canvas.querySelector('.pd-fields-stub')).toBeNull());
  });

  it('an existing PD event keeps its knowledge note and offers editing', async () => {
    current = {
      ...base,
      source: 'notion',
      hours: null,
      talks: [{ id: 't_page', time: null, title: 'NESA update', presenter: null, hours: null }],
      knowledge_notes: [{ talk_id: 't_page', page_id: 'page_notion_abc', title: 'NESA update', href: '/knowledge/#page/page_notion_abc' }]
    } as unknown as typeof base;
    const canvas = await render();
    expect(canvas.querySelector('a.kn')?.getAttribute('href')).toBe('/knowledge/#page/page_notion_abc');
    expect(canvas.querySelector('[data-talk-note]')).toBeNull();
    expect(canvas.querySelector('.talk-add')).not.toBeNull();
    expect(canvas.querySelector('.pd-fields-stub')).not.toBeNull();
    expect(canvas.querySelector('[data-part="shape"]')).not.toBeNull();
    expect(canvas.textContent).not.toMatch(/notion|brought across/i);
    expect(mountBlockPage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ editable: true }));
    expect((canvas.querySelector('[data-part="pd-switch"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Edit event loads the current fields and saves changes to the same event', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="edit-event"]')!.click();
    expect(renderEventNewView).toHaveBeenLastCalledWith(canvas, expect.objectContaining({
      draft: expect.objectContaining({ title: base.title, hours: base.hours })
    }));
    const options = vi.mocked(renderEventNewView).mock.calls.at(-1)![1]!;
    await options.onSave!({ title: 'Revised PD', location: null, allDay: false, hours: 2,
      accreditation: null, priorityArea: null, certificate: null, startIso: base.start,
      endIso: base.end, timeZone: base.time_zone, pendingLinks: [] });
    expect(updateEvent).toHaveBeenLastCalledWith(EVENT_ID, expect.objectContaining({ title: 'Revised PD', hours: 2 }));
  });

  it('Make note creates a Knowledge page and links it to the talk', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-talk-note="t1"]')!.click();
    await vi.waitFor(() => expect(createKnowledgeNote).toHaveBeenCalled());
    expect(createUniversalLink).toHaveBeenCalledWith({
      source_ref: EVENT_REF, target_ref: 'knowledge:page:page_1', relationship_type: 'talk_note', metadata: { talk_id: 't1' }
    });
  });
});
