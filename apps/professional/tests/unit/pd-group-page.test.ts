import { describe, expect, it, vi } from 'vitest';

const GROUP_ID = 'pd_group_00000000-0000-4000-8000-000000000001';
const GROUP_REF = `professional:pd_group:${GROUP_ID}`;
const ev = (n: number, start: string, hours: number, state: string, attendance: string | null) => ({
  id: `event_00000000-0000-4000-8000-00000000000${n}`, title: `Warlight ${n}`, start, end: start, hours,
  occurrence_state: state, attendance_state: attendance, time_zone: 'Australia/Sydney', event_type: 'professional_development'
});
const events = [ev(1, '2026-09-17T23:00:00.000Z', 6, 'completed', 'attended'), ev(2, '2026-10-29T22:00:00.000Z', 6, 'scheduled', 'registered')];

vi.mock('@/api/pd-groups', () => ({ getPdGroup: vi.fn(async () => ({ group: { id: GROUP_ID, shape: 'series', title: 'Warlight', provider: 'Warlight' } })) }));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [], incoming: events.map((event) => ({
    link: { id: event.id, source_ref: `professional:event:${event.id}`, target_ref: GROUP_REF, relationship_type: 'in_pd_group', status: 'current' },
    endpoint: { ref: `professional:event:${event.id}`, kind: 'event', display_label: event.title, href: null }, direction: 'incoming'
  })) }))
}));
vi.mock('@/api/events', () => ({ getEvent: vi.fn(async (id: string) => ({ event: events.find((event) => event.id === id) })) }));

import { renderPdGroupPage } from '@/views/pd-group-page';

describe('PD group page', () => {
  it('lists sessions in order with gaps and hours', async () => {
    const canvas = document.createElement('div');
    await renderPdGroupPage(canvas, GROUP_ID, { isCurrent: () => true, onTitleReady: () => {} });
    expect(canvas.textContent).toContain('6/12 h');
    expect([...canvas.querySelectorAll('[data-part="session"]')].map((node) => node.textContent)).toEqual([
      expect.stringContaining('18/09'), expect.stringContaining('30/10')
    ]);
    expect(canvas.textContent).toContain('6 wks');
  });
});
