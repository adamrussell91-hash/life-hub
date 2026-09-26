import { afterEach, describe, expect, it, vi } from 'vitest';

const THREAD_ID = 'thread_00000000-0000-4000-8000-000000000001';
const THREAD_REF = `professional:thread:${THREAD_ID}`;
const S7 = 'professional:communication:communication_00000000-0000-4000-8000-000000000007';

vi.mock('@/api/threads', () => ({
  getThread: vi.fn(async () => ({ thread: {
    schema_version: 1, id: THREAD_ID, kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'case management',
    goals: [{ id: 'g1', text: 'Maths C → B', progress: 62, note: '31/50' }], status: 'open', created_at: '', updated_at: ''
  } })),
  patchThread: vi.fn(async (_id: string, patch: object) => ({ thread: { id: THREAD_ID, kind: 'case', goals: [], ...patch } }))
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => ref === THREAD_REF
    ? { outgoing: [], incoming: [
        { link: { id: 'm7', source_ref: S7, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-09-22T22:40:00.000Z' },
          endpoint: { ref: S7, kind: 'communication', display_label: 'Session 7 · fillable bar', href: '/professional/#/communication/communication_00000000-0000-4000-8000-000000000007' }, direction: 'incoming' }
      ] }
    : { outgoing: [
        { link: { id: 'p', source_ref: S7, target_ref: 'shared:person:p_fletcher', relationship_type: 'recipient', status: 'current' },
          endpoint: { ref: 'shared:person:p_fletcher', kind: 'person', display_label: 'Fletcher W.', href: null }, direction: 'outgoing' }
      ], incoming: [] })
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({ items: [
    { id: 'a', direction: 'they_owe', text: '2 hrs maths on the bar', status: 'open', comm_ref: S7 },
    { id: 'b', direction: 'you_owe', text: 'Email Amy the template', status: 'done', comm_ref: S7 }
  ] }))
}));

import { renderThreadPage } from '@/views/thread-page';

describe('thread page (case)', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows goals, the circle, the session ledger and promise stats', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderThreadPage(canvas, THREAD_ID, { isCurrent: () => true, onTitleReady: () => {} });
    expect(canvas.querySelector('[data-part="goals"]')?.textContent).toContain('Maths C → B');
    expect(canvas.querySelector('[data-part="circle"]')?.textContent).toContain('Fletcher W.');
    expect(canvas.querySelector('[data-part="sessions"]')?.textContent).toContain('Session 7 · fillable bar');
    expect(canvas.querySelector('[data-part="stats"]')?.textContent).toContain('1 of 2 kept');
    expect(canvas.querySelector('[data-part="export"]')).not.toBeNull();
  });
});
