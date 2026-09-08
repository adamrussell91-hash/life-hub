/**
 * Confirm integrity: each productivity card owns one immutable pending proposal id
 * and its own write paths. Success UI only after persistence. Ghosts are per-proposal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertAcceptPathsForProposal,
  createClareChatController,
  formatStaleScheduleCollisionDetails
} from '@/chat/clare-controller';
import { buildChatView } from '@/chat/build-chat-view';
import { tasksApi } from '@/services/client-api';
import {
  getCalendarGhostBlocks,
  getCalendarGhostBlocksForProposal
} from '@/views/calendar';
import { ApiClientError } from '@/api/client';
import { createDecisionStackCard } from '../../design-kit/js/agent-productivity-cards.js';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTemplates: vi.fn(),
    briefWithClare: vi.fn(),
    streamDumpWithClare: vi.fn()
  }
}));

const streamChat = vi.fn();
const confirmChat = vi.fn();

vi.mock('@/services/chat-api', () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
  confirmChat: (...args: unknown[]) => confirmChat(...args)
}));

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});

function block(id: string, title: string, date = '2026-09-09') {
  return {
    id,
    write_path: id,
    title,
    date,
    start_time: '09:00',
    duration_minutes: 45,
    depth: 'deep'
  };
}

async function* streamWithCards(
  cards: Array<{ card_type: string; payload: Record<string, unknown> }>
) {
  yield { type: 'text', delta: 'Here is a proposal.' };
  for (const card of cards) {
    yield {
      type: 'productivity_card',
      card_type: card.card_type,
      payload: card.payload
    };
  }
  yield { type: 'done' };
}

function scheduleCards(aId: string, bId: string) {
  return [
    {
      card_type: 'schedule-diff',
      payload: {
        pendingId: aId,
        blocks: [block('tasks:work_block:a1', 'Mark essays A')]
      }
    },
    {
      card_type: 'schedule-diff',
      payload: {
        pendingId: bId,
        blocks: [block('tasks:work_block:b1', 'Mark essays B', '2026-09-10')]
      }
    }
  ];
}

function cardNodes(root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>('[data-card-type="schedule-diff"]')];
}

function clickLabel(card: HTMLElement, label: string) {
  const btn = [...card.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
  expect(btn).toBeTruthy();
  btn!.click();
}


async function* streamWithActionProposal(
  id: string,
  proposal: { intent?: string; writes?: Array<{ path?: string; mode?: string; diff?: string }> }
) {
  yield { type: 'text', delta: 'Proposed action.' };
  yield { type: 'action_proposal', id, proposal };
  yield { type: 'done' };
}

function actionProposalCard(root: ParentNode) {
  return root.querySelector<HTMLElement>('li.action-proposal.confirm-card');
}


describe('Confirm proposal identity binding', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    document.body.replaceChildren();
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue({
      protocol_id: 'morning-sweep',
      lead: 'Lead',
      closer: 'Closer',
      sections: [],
      flags: []
    });
    confirmChat.mockResolvedValue({ ok: true });
  });

  it('A: confirming older card A writes only A; B stays pending and confirmable', async () => {
    streamChat.mockImplementation(() => streamWithCards(scheduleCards('pending_a', 'pending_b')));
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan two days');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(2));

    const [cardA, cardB] = cardNodes(root);
    clickLabel(cardA, 'Confirm Selected');
    await vi.waitFor(() => expect(confirmChat).toHaveBeenCalledTimes(1));
    expect(confirmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'action',
        id: 'pending_a',
        accept: ['tasks:work_block:a1']
      })
    );
    await vi.waitFor(() => expect(cardA.dataset.state).toBe('confirmed'));
    expect(cardB.dataset.state).toBe('ready');
    expect(getCalendarGhostBlocksForProposal('pending_b').length).toBeGreaterThan(0);
    expect(getCalendarGhostBlocksForProposal('pending_a')).toEqual([]);

    clickLabel(cardB, 'Confirm Selected');
    await vi.waitFor(() => expect(confirmChat).toHaveBeenCalledTimes(2));
    expect(confirmChat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'pending_b', accept: ['tasks:work_block:b1'] })
    );
  });

  it('B: confirming B first then A writes each proposal separately', async () => {
    streamChat.mockImplementation(() => streamWithCards(scheduleCards('pending_a', 'pending_b')));
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan two days');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(2));
    const [cardA, cardB] = cardNodes(root);

    clickLabel(cardB, 'Confirm Selected');
    await vi.waitFor(() => expect(confirmChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'pending_b' })));
    clickLabel(cardA, 'Confirm Selected');
    await vi.waitFor(() => expect(confirmChat).toHaveBeenCalledTimes(2));
    expect(confirmChat.mock.calls.map((call) => call[0].id)).toEqual(['pending_b', 'pending_a']);
  });

  it('C: discarding A leaves B pending and confirmable', async () => {
    streamChat.mockImplementation(() => streamWithCards(scheduleCards('pending_a', 'pending_b')));
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan two days');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(2));
    const [cardA, cardB] = cardNodes(root);

    clickLabel(cardA, 'Discard');
    await vi.waitFor(() =>
      expect(confirmChat).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'action_dismiss', id: 'pending_a' })
      )
    );
    await vi.waitFor(() => expect(cardA.dataset.state).toBe('discarded'));
    expect(cardB.dataset.state).toBe('ready');
    expect(getCalendarGhostBlocksForProposal('pending_b').length).toBeGreaterThan(0);

    clickLabel(cardB, 'Confirm Selected');
    await vi.waitFor(() =>
      expect(confirmChat).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'pending_b' }))
    );
  });

  it('D: Confirm Selected on A rejects a write path belonging to B', () => {
    const allowed = new Set(['tasks:work_block:a1']);
    expect(() =>
      assertAcceptPathsForProposal(['tasks:work_block:a1', 'tasks:work_block:b1'], allowed)
    ).toThrow(/not part of this proposal/i);
    expect(assertAcceptPathsForProposal(['tasks:work_block:a1'], allowed)).toEqual([
      'tasks:work_block:a1'
    ]);
  });

  it('E: durable card without pending id does not fall back to the latest proposal', async () => {
    streamChat.mockImplementation(async function* () {
      yield {
        type: 'action_proposal',
        id: 'pending_latest',
        proposal: { intent: 'latest', writes: [{ path: 'tasks:work_block:latest' }] }
      };
      yield {
        type: 'productivity_card',
        card_type: 'schedule-diff',
        payload: { blocks: [block('tasks:work_block:orphan', 'Orphan')] }
      };
      yield { type: 'done' };
    });
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(1));
    const card = cardNodes(root)[0];
    expect(card.dataset.state).toBe('failed');
    expect(card.textContent).toMatch(/no proposal id/i);
    const confirmBtn = [...card.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Confirm Selected')
    );
    expect(confirmBtn?.disabled).toBe(true);
    expect(confirmChat).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'action' }));
  });

  it('F: confirm endpoint failure does not show Confirmed and restores buttons/ghosts', async () => {
    confirmChat.mockRejectedValueOnce(
      new ApiClientError({ code: 'request_failed', message: 'boom' }, 500)
    );
    streamChat.mockImplementation(() =>
      streamWithCards([
        {
          card_type: 'schedule-diff',
          payload: {
            pendingId: 'pending_a',
            blocks: [block('tasks:work_block:a1', 'A')]
          }
        }
      ])
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(1));
    const card = cardNodes(root)[0];
    expect(getCalendarGhostBlocksForProposal('pending_a').length).toBe(1);

    clickLabel(card, 'Confirm Selected');
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    expect(card.textContent).not.toMatch(/Confirmed 1 block/);
    expect(getCalendarGhostBlocksForProposal('pending_a').length).toBe(1);
    expect(getCalendarGhostBlocks().length).toBe(1);
    const confirmBtn = [...card.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Confirm Selected')
    );
    expect(confirmBtn?.disabled).toBe(false);
  });

  it('G: stale_schedule_collision keeps ghosts and leaves the card actionable', async () => {
    confirmChat.mockRejectedValueOnce(
      new ApiClientError(
        {
          code: 'stale_schedule_collision',
          message: 'collision',
          details: { revised: { note: 'Calendar moved' } }
        },
        409
      )
    );
    streamChat.mockImplementation(() =>
      streamWithCards([
        {
          card_type: 'schedule-diff',
          payload: {
            pendingId: 'pending_stale',
            blocks: [block('tasks:work_block:s1', 'Stale')]
          }
        }
      ])
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(1));
    const card = cardNodes(root)[0];
    clickLabel(card, 'Confirm Selected');
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    expect(root.textContent).toMatch(/Schedule collision|Ghosts kept|collision/i);
    expect(getCalendarGhostBlocksForProposal('pending_stale').length).toBe(1);
    expect(
      [...card.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Confirm Selected'))
        ?.disabled
    ).toBe(false);
  });

  it('M: stale_schedule_collision renders exact revised server details on the Schedule Diff card', async () => {
    const revised = {
      status: 'needs_recompose',
      note: 'Calendar changed since proposal — confirm blocked. Recompose against current hard busy.',
      conflicts: [
        {
          temp_id: 'wb_mark_essays',
          reason: 'Collides with Year 10 Pastoral'
        }
      ],
      suggested_blocks: [
        {
          temp_id: 'wb_mark_essays',
          title: 'Mark essays',
          date: '2026-09-09',
          start_time: '14:30'
        }
      ],
      suggested_start: '14:30',
      suggested_end: '15:15'
    };
    confirmChat.mockRejectedValueOnce(
      new ApiClientError(
        {
          code: 'stale_schedule_collision',
          message: 'collision',
          details: revised
        },
        409
      )
    );
    streamChat.mockImplementation(() =>
      streamWithCards([
        {
          card_type: 'schedule-diff',
          payload: {
            pendingId: 'pending_stale_detail',
            blocks: [block('tasks:work_block:s1', 'Mark essays')]
          }
        }
      ])
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(1));
    const card = cardNodes(root)[0];
    clickLabel(card, 'Confirm Selected');
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    const cardText = card.textContent ?? '';
    expect(cardText).toContain('wb_mark_essays');
    expect(cardText).toContain('Collides with Year 10 Pastoral');
    expect(cardText).toContain('Mark essays → 2026-09-09 14:30');
    expect(cardText).toContain('14:30');
    expect(cardText).toContain('15:15');
    expect(cardText).toMatch(/nothing was written|stale/i);
    expect(getCalendarGhostBlocksForProposal('pending_stale_detail').length).toBe(1);
    expect(
      [...card.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Confirm Selected'))
        ?.disabled
    ).toBe(false);
    // Formatter itself preserves the same concrete values.
    const formatted = formatStaleScheduleCollisionDetails(revised);
    expect(formatted).toContain('wb_mark_essays');
    expect(formatted).toContain('Collides with Year 10 Pastoral');
    expect(formatted).toContain('Mark essays → 2026-09-09 14:30');
  });

  it('H: successful schedule Confirm becomes receipt only after persistence and clears that proposal ghosts', async () => {
    let resolveConfirm!: (value: unknown) => void;
    confirmChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        })
    );
    streamChat.mockImplementation(() =>
      streamWithCards([
        {
          card_type: 'schedule-diff',
          payload: {
            pendingId: 'pending_ok',
            blocks: [block('tasks:work_block:ok1', 'OK')]
          }
        }
      ])
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(1));
    const card = cardNodes(root)[0];
    clickLabel(card, 'Confirm Selected');
    await vi.waitFor(() => expect(card.dataset.state).toBe('submitting'));
    expect(card.textContent).not.toMatch(/Confirmed 1 block/);
    expect(getCalendarGhostBlocksForProposal('pending_ok').length).toBe(1);
    resolveConfirm({ ok: true });
    await vi.waitFor(() => expect(card.dataset.state).toBe('confirmed'));
    expect(card.textContent).toMatch(/Confirmed/);
    expect(getCalendarGhostBlocksForProposal('pending_ok')).toEqual([]);
  });

  it('I: successful Discard clears only that proposal ghosts and never writes', async () => {
    streamChat.mockImplementation(() => streamWithCards(scheduleCards('pending_a', 'pending_b')));
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Plan');
    await vi.waitFor(() => expect(cardNodes(root).length).toBe(2));
    const [cardA] = cardNodes(root);
    clickLabel(cardA, 'Discard');
    await vi.waitFor(() => expect(cardA.dataset.state).toBe('discarded'));
    expect(confirmChat).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'action_dismiss', id: 'pending_a' })
    );
    expect(confirmChat.mock.calls.every((call) => call[0].kind !== 'action')).toBe(true);
    expect(getCalendarGhostBlocksForProposal('pending_a')).toEqual([]);
    expect(getCalendarGhostBlocksForProposal('pending_b').length).toBeGreaterThan(0);
  });

  it('J: legacy action_proposal failed Confirm keeps the card actionable with no Saved state', async () => {
    confirmChat.mockRejectedValueOnce(
      new ApiClientError({ code: 'request_failed', message: 'confirm boom' }, 500)
    );
    streamChat.mockImplementation(() =>
      streamWithActionProposal('pending_action_j', {
        intent: 'Create task Alpha',
        writes: [{ path: 'tasks:task:task_alpha', mode: 'create', diff: 'new task Alpha' }]
      })
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Propose');
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());
    const card = actionProposalCard(root)!;
    clickLabel(card, 'Confirm');
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    expect(card.isConnected).toBe(true);
    expect(card.textContent).not.toMatch(/^\s*Saved\.?\s*$/m);
    expect(card.querySelector('.record-proposal__saved')).toBeNull();
    expect(card.textContent).toMatch(/confirm boom|failed/i);
    const confirmBtn = [...card.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Confirm');
    const discardBtn = [...card.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Discard');
    expect(confirmBtn?.disabled).toBe(false);
    expect(discardBtn?.disabled).toBe(false);
  });

  it('K: legacy action_proposal failed Discard keeps the card and leaves the proposal actionable', async () => {
    confirmChat.mockRejectedValueOnce(
      new ApiClientError({ code: 'request_failed', message: 'discard boom' }, 500)
    );
    streamChat.mockImplementation(() =>
      streamWithActionProposal('pending_action_k', {
        intent: 'Create task Beta',
        writes: [{ path: 'tasks:task:task_beta', mode: 'create', diff: 'new task Beta' }]
      })
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Propose');
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());
    const card = actionProposalCard(root)!;
    clickLabel(card, 'Discard');
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    expect(card.isConnected).toBe(true);
    expect(card.dataset.state).not.toBe('discarded');
    expect(card.textContent).toMatch(/discard boom|failed/i);
    expect([...card.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Confirm')?.disabled).toBe(
      false
    );
    expect([...card.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Discard')?.disabled).toBe(
      false
    );
  });

  it('L: legacy action_proposal successful Discard removes the card only after the request resolves', async () => {
    let resolveDiscard!: (value: unknown) => void;
    confirmChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDiscard = resolve;
        })
    );
    streamChat.mockImplementation(() =>
      streamWithActionProposal('pending_action_l', {
        intent: 'Create task Gamma',
        writes: [{ path: 'tasks:task:task_gamma', mode: 'create', diff: 'new task Gamma' }]
      })
    );
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Propose');
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());
    const card = actionProposalCard(root)!;
    clickLabel(card, 'Discard');
    await vi.waitFor(() => expect(card.dataset.state).toBe('submitting'));
    expect(card.isConnected).toBe(true);
    expect(confirmChat).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'action_dismiss', id: 'pending_action_l' })
    );
    resolveDiscard({ ok: true });
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeNull());
    expect(card.isConnected).toBe(false);
  });


});

describe('Durable card async receipts (kit)', () => {
  it('decision stack waits for callback resolution before Confirmed', async () => {
    let resolve!: () => void;
    const card = createDecisionStackCard(document, {
      pendingId: 'pending_clarify',
      items: [{ id: 'i1', text: 'Email parent', destination: 'next_action' }],
      onConfirmAll: () =>
        new Promise<void>((res) => {
          resolve = res;
        })
    });
    document.body.append(card);
    clickLabel(card, 'Confirm All');
    await vi.waitFor(() => expect(card.dataset.state).toBe('submitting'));
    expect(card.textContent).not.toMatch(/Confirmed all/);
    resolve();
    await vi.waitFor(() => expect(card.dataset.state).toBe('confirmed'));
  });
});
