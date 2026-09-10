import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClareChatController } from '@/chat/clare-controller';
import { buildChatView } from '@/chat/build-chat-view';
import { tasksApi } from '@/services/client-api';
import { onTasksChanged, resetTaskCache } from '@/services/task-cache';
import { PRODUCTIVITY_LAUNCH_MESSAGES } from '@/domain/clare-protocols';

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

async function* emptyChatStream() {
  yield { type: 'text', delta: 'Weekly review opened.' };
  yield { type: 'done' };
}

describe('Clare productivity chat routing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    streamChat.mockImplementation(() => emptyChatStream());
  });

  it('launches weekly-review via /api/chat with launch message, not dump-the-thing', async () => {
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();

    expect(tasksApi.briefWithClare).toHaveBeenCalled();
    expect(root.textContent).not.toMatch(/Dump the thing first/i);

    controller.pickProtocol('weekly-review');

    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: PRODUCTIVITY_LAUNCH_MESSAGES['weekly-review'],
        priorAgentSlug: 'clare',
        protocolId: 'weekly-review'
      })
    );
    expect(tasksApi.streamDumpWithClare).not.toHaveBeenCalled();
    expect(root.textContent).toContain(PRODUCTIVITY_LAUNCH_MESSAGES['weekly-review']);
    expect(root.textContent).not.toMatch(/Dump the thing first/i);
  });

  it('routes subsequent turns through chat while weekly-review is selected', async () => {
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();

    controller.pickProtocol('weekly-review');
    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));

    await controller.send('Here is my capture dump');
    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2));
    expect(streamChat).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'Here is my capture dump',
        protocolId: 'weekly-review'
      })
    );
    expect(tasksApi.streamDumpWithClare).not.toHaveBeenCalled();
  });

  it('routes freeform Clare chat through /api/chat even with no productivity protocol', async () => {
    const root = buildChatView();
    document.body.replaceChildren(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();

    await controller.send(
      'Finish organising the State finals excursion, start year 11 reports, and do Liv marking'
    );
    await vi.waitFor(() => expect(streamChat).toHaveBeenCalledTimes(1));
    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Finish organising the State finals excursion, start year 11 reports, and do Liv marking',
        priorAgentSlug: 'clare'
      })
    );
    expect(tasksApi.streamDumpWithClare).not.toHaveBeenCalled();
  });

  it('live-inserts tasks_changed events from /api/chat', async () => {
    resetTaskCache();
    const seen: Array<{ id: string; title: string }> = [];
    const stop = onTasksChanged((tasks) => {
      seen.push(...tasks.map((task) => ({ id: task.id, title: task.title })));
    });
    streamChat.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Added Buy bread.' };
      yield {
        type: 'tasks_changed',
        tasks: [
          {
            id: 'task_clare',
            title: 'Buy bread',
            domain: 'life',
            status: 'open',
            due_date: '2026-09-10'
          }
        ]
      };
      yield { type: 'done' };
    });
    const root = buildChatView();
    document.body.append(root);
    const controller = createClareChatController({ root, isVisible: () => true });
    await controller.start();
    await controller.send('Add buy bread to today');
    await vi.waitFor(() => expect(seen.some((task) => task.id === 'task_clare')).toBe(true));
    expect(seen[0]?.title).toBe('Buy bread');
    stop();
    resetTaskCache();
  });
});
