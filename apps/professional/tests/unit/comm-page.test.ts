import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const COMM_ID = 'communication_00000000-0000-4000-8000-000000000001';
const COMM_REF = `professional:communication:${COMM_ID}`;
const PREV_REF = 'professional:communication:communication_00000000-0000-4000-8000-000000000000';
const THREAD_REF = 'professional:thread:thread_00000000-0000-4000-8000-000000000001';

const record = {
  schema_version: 2, id: COMM_ID, direction: 'outbound', channel: 'in_person',
  occurred_at: '2026-10-14T00:50:00.000Z', subject: 'Ollie P. · essay feedback', summary: '',
  status: 'completed', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: '2026-10-14T01:05:00.000Z',
  time_zone: 'Australia/Sydney', purpose_tag: 'feedback', agenda: [], blocks: []
};

vi.mock('@/api/communications', () => ({
  getCommunication: vi.fn(async () => ({ communication: record })),
  updateCommunication: vi.fn(async (_id: string, patch: object) => ({ communication: { ...record, ...patch } })),
  retryFollowUpTask: vi.fn(),
  createFollowUpTask: vi.fn(),
  isFollowUpIncompleteError: () => false,
  createCommunication: vi.fn(async () => ({ communication: { id: 'communication_sent' }, created: true }))
}));
vi.mock('@/api/clare-comms', () => ({
  clareBrief: vi.fn(async () => ({ points: [{ text: 'His redraft came in yesterday.', source: 'Canvas, 13/10' }], owed_line: 'Send Denielle the summary after this one.' })),
  clareSummary: vi.fn(async () => ({ summary: 'Good progress.', promises: [{ direction: 'they_owe', person_ref: 'shared:person:p_declan', text: 'Rewrite the fence paragraph', due: '2026-10-19' }], numbers: [] })),
  clareDrafts: vi.fn(async () => ({ drafts: [{ person_ref: 'shared:person:p_denielle', to: 'Denielle J.', subject: 'Declan update', body: 'Hi Denielle,' }] })),
  clareProposeNext: vi.fn(async () => ({ date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly.', ghost_id: 'g', queued: true })),
  clareHandwriting: vi.fn(async () => ({ text: 'quote → so what?' }))
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => {
    if (ref === COMM_REF) {
      return {
        outgoing: [
          { link: { id: 'l1', source_ref: COMM_REF, target_ref: 'shared:person:p_ollie', relationship_type: 'recipient', status: 'current' },
            endpoint: { ref: 'shared:person:p_ollie', kind: 'person', display_label: 'Ollie P.', href: null }, direction: 'outgoing' },
          { link: { id: 'l2', source_ref: COMM_REF, target_ref: 'shared:person:p_grace', relationship_type: 'about_person', status: 'current' },
            endpoint: { ref: 'shared:person:p_grace', kind: 'person', display_label: 'Grace P.', href: null }, direction: 'outgoing' },
          { link: { id: 'l3', source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current' },
            endpoint: { ref: THREAD_REF, kind: 'thread', display_label: 'Ollie P. · study approach', href: null }, direction: 'outgoing' }
        ],
        incoming: []
      };
    }
    return {
      outgoing: [],
      incoming: [
        { link: { id: 'm0', source_ref: PREV_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-09-25T02:00:00.000Z' },
          endpoint: { ref: PREV_REF, kind: 'communication', display_label: 'Ollie · quote bank', href: null }, direction: 'incoming' },
        { link: { id: 'm1', source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-10-01T00:00:00.000Z' },
          endpoint: { ref: COMM_REF, kind: 'communication', display_label: 'Ollie P. · essay feedback', href: null }, direction: 'incoming' }
      ]
    };
  }),
  createUniversalLink: vi.fn(async () => ({ link: { id: 'link_new' }, created: true })),
  endUniversalLink: vi.fn(async () => ({})),
  createTask: vi.fn(async () => ({ id: 'task_1', title: 'x' }))
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({
    items: [
      { id: 'ledger_1', person_ref: 'shared:person:p_ollie', direction: 'you_owe', text: 'Send Ollie the quote bank', comm_ref: PREV_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_2', person_ref: 'shared:person:p_ollie', direction: 'they_owe', text: 'Redraft paragraph 2', comm_ref: PREV_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_3', person_ref: 'shared:person:p_grace', direction: 'you_owe', text: 'Email Grace the summary', comm_ref: COMM_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_4', person_ref: 'shared:person:p_ollie', direction: 'they_owe', text: 'Rewrite the fence paragraph', comm_ref: COMM_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null }
    ]
  })),
  createLedgerItem: vi.fn(async (body: object) => ({ item: { id: 'ledger_new', status: 'open', ...body }, created: true })),
  patchLedger: vi.fn(async (id: string, patch: object) => ({ item: { id, ...patch } }))
}));
vi.mock('@/api/threads', () => ({ listThreads: vi.fn(async () => ({ threads: [] })) }));
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement) => {
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => [], append: () => {}, dispose: () => {} };
  })
}));

import { renderCommPage } from '@/views/comm-page';
import { patchLedger } from '@/api/ledger';

describe('comm page', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-14T00:40:00.000Z') }));
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  async function render() {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderCommPage(canvas, COMM_ID, { isCurrent: () => true, onTitleReady: () => {} });
    return canvas;
  }

  it('opens in Before with carried promises, people and the thread', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('before');
    expect(canvas.textContent).toContain('Send Ollie the quote bank');
    expect(canvas.textContent).toContain('Grace P.');
    expect(canvas.textContent).toContain('Ollie P. · study approach');
    expect(canvas.querySelector('[data-part="carried"] [data-owner="you"]')).not.toBeNull();
  });

  it('ticking a carried promise marks it done and checked in here', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-ledger-id="ledger_1"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(patchLedger).toHaveBeenCalledWith('ledger_1', { status: 'done', checked_in_ref: COMM_REF });
  });

  it('switches to During at the start time and shows the block page', async () => {
    const canvas = await render();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('during');
    expect(canvas.querySelector('.block-page-stub')).not.toBeNull();
  });

  it('manual switch to After shows the promise ledger with Task switches for yours', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    expect(canvas.querySelector('[data-part="ledger"]')).not.toBeNull();
    expect(canvas.querySelectorAll('[data-part="ledger"] [role="switch"]').length).toBe(1);
  });

  it('joins the single matching thread and says so, with Undo', async () => {
    const links = await import('@/api/universal-links');
    const threads = await import('@/api/threads');
    // This comm has people but no thread yet.
    (links.listUniversalLinksForEntity as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      outgoing: [
        { link: { id: 'l1', source_ref: COMM_REF, target_ref: 'shared:person:p_ollie', relationship_type: 'recipient', status: 'current' },
          endpoint: { ref: 'shared:person:p_ollie', kind: 'person', display_label: 'Ollie P.', href: null }, direction: 'outgoing' }
      ],
      incoming: []
    }));
    (threads.listThreads as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ threads: [
      { id: 'thread_00000000-0000-4000-8000-000000000001', kind: 'general', title: 'Ollie P. · study approach', purpose_tag: 'feedback', goals: [], status: 'open', schema_version: 1, created_at: '', updated_at: '2026-09-25T02:00:00.000Z' }
    ] });
    const canvas = await render();
    await vi.advanceTimersByTimeAsync(0);
    expect(links.createUniversalLink).toHaveBeenCalledWith(expect.objectContaining({
      source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread'
    }));
    expect(canvas.textContent).toContain('Added to Ollie P. · study approach');
    expect(canvas.querySelector('[data-part="thread-undo"]')).not.toBeNull();
  });

  it('Before shows Clare’s brief with sources', async () => {
    const canvas = await render();
    await vi.advanceTimersByTimeAsync(0);
    const brief = canvas.querySelector('[data-part="clare-brief"]')!;
    expect(brief.textContent).toContain('His redraft came in yesterday.');
    expect(brief.textContent).toContain('Canvas, 13/10');
    expect(brief.textContent).toContain('Send Denielle the summary after this one.');
  });

  it('After: Summarise fills the summary and adds ticked promises to the ledger', async () => {
    const { createLedgerItem } = await import('@/api/ledger');
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    canvas.querySelector<HTMLButtonElement>('[data-part="clare-summarise"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(canvas.querySelector<HTMLTextAreaElement>('.comm-page__summary-text')!.value).toBe('Good progress.');
    canvas.querySelector<HTMLButtonElement>('[data-part="clare-add-promises"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ text: 'Rewrite the fence paragraph', direction: 'they_owe', due: '2026-10-19' }));
  });

  it('After: Mark as sent logs an outbound comm to that person and ticks the promise', async () => {
    const comms = await import('@/api/communications');
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    canvas.querySelector<HTMLButtonElement>('[data-part="clare-drafts"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    canvas.querySelector<HTMLButtonElement>('[data-part="mark-sent"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(comms.createCommunication).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'outbound', channel: 'email', subject: 'Declan update',
      links: [{ relationship_type: 'recipient', target_ref: 'shared:person:p_denielle' }]
    }));
  });
});
