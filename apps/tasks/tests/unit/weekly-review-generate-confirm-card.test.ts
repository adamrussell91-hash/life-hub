/**
 * WR16–WR18 — Structured Weekly Review Generate must render the authoritative
 * action_proposal Confirm card and bind Confirm/Discard to the returned pending id.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClareChatController } from '@/chat/clare-controller';
import { buildChatView } from '@/chat/build-chat-view';
import { tasksApi } from '@/services/client-api';
import { ApiClientError } from '@/api/client';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTemplates: vi.fn(),
    briefWithClare: vi.fn(),
    streamDumpWithClare: vi.fn()
  }
}));

const streamChat = vi.fn();
const confirmChat = vi.fn();
const clareWorkChat = vi.fn();

vi.mock('@/services/chat-api', () => ({
  streamChat: (...args: unknown[]) => streamChat(...args),
  confirmChat: (...args: unknown[]) => confirmChat(...args),
  clareWorkChat: (...args: unknown[]) => clareWorkChat(...args)
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

async function* streamReviewProgressCard() {
  yield { type: 'text', delta: 'Weekly Review is ready to confirm.' };
  yield {
    type: 'productivity_card',
    card_type: 'review-progress',
    payload: {
      reviewId: 'wr_ui_16',
      current: 'confirm',
      completed: ['capture', 'projects'],
      pendingChanges: [
        {
          id: 'next_action:proj_A',
          confirmable: true,
          selected: true,
          summary: 'Next action for proj_A: Score Year 10 essays'
        },
        {
          id: 'waiting:task_wait_B',
          confirmable: true,
          selected: true,
          summary: 'Follow up waiting task_wait_B'
        }
      ]
    }
  };
  yield { type: 'done' };
}

function actionProposalCard(root: ParentNode) {
  return root.querySelector<HTMLElement>('li.action-proposal.confirm-card');
}

function clickLabel(scope: ParentNode, label: string) {
  const btn = [...scope.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);
  expect(btn).toBeTruthy();
  btn!.click();
  return btn!;
}

describe('WR16–WR18 structured Generate → action_proposal Confirm card', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    document.body.replaceChildren();
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    } as never);
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue({
      protocol_id: 'morning-sweep',
      lead: 'Lead',
      closer: 'Closer',
      sections: [],
      flags: []
    } as never);
    confirmChat.mockResolvedValue({ ok: true });
  });

  it('WR16: Generate renders one authoritative Confirm card for selected_changes only', async () => {
    const pendingId = 'act_wr16_pending';
    streamChat.mockImplementation(() => streamReviewProgressCard());
    clareWorkChat.mockResolvedValue({
      pendingId,
      proposal: {
        intent: 'Weekly Review confirm',
        writes: [
          {
            path: 'tasks:task:task_next_A',
            mode: 'create',
            diff: 'Score Year 10 essays'
          }
        ]
      }
    });

    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Continue Weekly Review');
    await vi.waitFor(() =>
      expect(root.querySelector('[data-card-type="review-progress"]')).toBeTruthy()
    );

    const progress = root.querySelector<HTMLElement>('[data-card-type="review-progress"]')!;
    const waiting = progress.querySelector<HTMLInputElement>('input[value="waiting:task_wait_B"]');
    expect(waiting).toBeTruthy();
    waiting!.checked = false;
    waiting!.dispatchEvent(new Event('change', { bubbles: true }));

    clickLabel(progress, 'Generate Confirm proposal');
    await vi.waitFor(() => expect(clareWorkChat).toHaveBeenCalledTimes(1));
    expect(clareWorkChat).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'weekly_review',
        slug: 'clare',
        input: expect.objectContaining({
          confirm: true,
          advance: false,
          selected_changes: ['next_action:proj_A']
        })
      })
    );

    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());
    expect(root.querySelectorAll('li.action-proposal.confirm-card').length).toBe(1);
    const card = actionProposalCard(root)!;
    expect(card.textContent).toMatch(/Score Year 10 essays/);
    expect(card.textContent).not.toMatch(/task_wait_B|Follow up waiting/);
    expect([...card.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(
      expect.arrayContaining(['Confirm', 'Discard'])
    );
    expect(card.querySelector('.record-proposal__saved')).toBeNull();
    expect(card.textContent).not.toMatch(/^\s*Saved\.?\s*$/m);
  });

  it('WR17: Confirm on generated card uses returned pending id; Saved only after success', async () => {
    const pendingId = 'act_wr17_pending';
    streamChat.mockImplementation(() => streamReviewProgressCard());
    let resolveConfirm!: (value: unknown) => void;
    confirmChat.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        })
    );
    clareWorkChat.mockResolvedValue({
      pendingId,
      proposal: {
        intent: 'Weekly Review confirm',
        writes: [{ path: 'tasks:task:task_next_A', mode: 'create', diff: 'Score Year 10 essays' }]
      }
    });

    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Continue');
    await vi.waitFor(() =>
      expect(root.querySelector('[data-card-type="review-progress"]')).toBeTruthy()
    );
    clickLabel(root.querySelector('[data-card-type="review-progress"]')!, 'Generate Confirm proposal');
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());
    const card = actionProposalCard(root)!;
    clickLabel(card, 'Confirm');
    await vi.waitFor(() =>
      expect(confirmChat).toHaveBeenCalledWith({
        kind: 'action',
        id: pendingId,
        slug: 'clare'
      })
    );
    expect(card.dataset.state).toBe('submitting');
    expect(card.querySelector('.record-proposal__saved')).toBeNull();
    resolveConfirm({ ok: true });
    await vi.waitFor(() => expect(card.dataset.state).toBe('confirmed'));
    expect(card.querySelector('.record-proposal__saved')).toBeTruthy();
  });

  it('WR18: Discard uses action_dismiss with pending id; failure keeps card', async () => {
    const pendingId = 'act_wr18_pending';
    streamChat.mockImplementation(() => streamReviewProgressCard());
    clareWorkChat.mockResolvedValue({
      pendingId,
      proposal: {
        intent: 'Weekly Review confirm',
        writes: [{ path: 'tasks:task:task_next_A', mode: 'create', diff: 'Score Year 10 essays' }]
      }
    });

    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    controller.pickProtocol('plan-day');
    await controller.send('Continue');
    await vi.waitFor(() =>
      expect(root.querySelector('[data-card-type="review-progress"]')).toBeTruthy()
    );
    clickLabel(root.querySelector('[data-card-type="review-progress"]')!, 'Generate Confirm proposal');
    await vi.waitFor(() => expect(actionProposalCard(root)).toBeTruthy());

    confirmChat.mockRejectedValueOnce(
      new ApiClientError({ code: 'request_failed', message: 'discard boom' }, 500)
    );
    const card = actionProposalCard(root)!;
    clickLabel(card, 'Discard');
    await vi.waitFor(() =>
      expect(confirmChat).toHaveBeenCalledWith({
        kind: 'action_dismiss',
        id: pendingId,
        slug: 'clare'
      })
    );
    await vi.waitFor(() => expect(card.dataset.state).toBe('failed'));
    expect(card.isConnected).toBe(true);

    confirmChat.mockResolvedValueOnce({ ok: true });
    clickLabel(card, 'Discard');
    await vi.waitFor(() => expect(card.isConnected).toBe(false));
  });
});
