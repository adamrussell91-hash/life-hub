import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderClareView } from '@/views/clare';
import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareProposal } from '@/domain/clare';
import type { ClareBriefing } from '@/domain/clare-desk';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTemplates: vi.fn(),
    listClareCalibrations: vi.fn(),
    briefWithClare: vi.fn(),
    processDumpWithClare: vi.fn(),
    proposeWithClare: vi.fn(),
    acceptClareProposal: vi.fn(),
    acceptClareBatch: vi.fn(),
    listAgentInbox: vi.fn()
  }
}));

const frameworks: FrameworkEntry[] = [
  {
    schema_version: 1,
    id: 'fw_timeboxing',
    name: 'Timeboxing',
    best_suited_task_pattern: 'Open-ended work',
    reasoning_template: 'Put a boundary around the work.'
  }
];

const proposal: ClareProposal = {
  title: 'Draft unit overview',
  domain: 'teaching' as const,
  description: '',
  priority: 'medium' as const,
  due_date: null,
  parent_project_id: null,
  framework_id: 'fw_timeboxing',
  framework_name: 'Timeboxing',
  reasoning: 'Start with the smallest concrete move.',
  proposed_minutes: 25,
  suggested_accepted_minutes: 25,
  calibration_note: null,
  protocol_id: 'shrink-first-step'
};

const briefing: ClareBriefing = {
  protocol_id: 'morning-sweep',
  lead: 'One thing before we start: Lock MindWorks term brief was due 22/08/26 and has not moved.',
  closer: 'That is your day. Dump away.',
  sections: [{ heading: 'Overdue', lines: ['Lock MindWorks term brief — was due 22/08/26, urgent.'] }],
  flags: []
};

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Clare protocol controls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks,
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.listClareCalibrations).mockResolvedValue([]);
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue(briefing);
    vi.mocked(tasksApi.listAgentInbox).mockResolvedValue([]);
  });

  it('renders five one-sentence hover cards on real protocol controls', async () => {
    const canvas = document.createElement('main');
    await renderClareView(canvas);

    const faces = [...canvas.querySelectorAll<HTMLImageElement>('#agent-picker img')];
    expect(faces).toHaveLength(4);
    expect(faces.map((img) => img.getAttribute('src'))).toEqual([
      '/assets/agents/clare.png',
      '/assets/agents/hammond.jpg',
      '/assets/agents/penelope.jpg',
      '/assets/agents/vera.jpg'
    ]);
    expect(canvas.querySelector('.chat-agent-hero')).toBeNull();
    expect(canvas.textContent).not.toMatch(/same chat window as life hub/i);
    expect(canvas.textContent).toMatch(/clare can/i);
    expect(canvas.textContent).toContain(briefing.closer);
    expect(canvas.querySelector('select.hub-filter')).toBeNull();
    expect(canvas.querySelector('#chat-form .hub-filter')).toBeNull();
    expect(canvas.querySelector('#chat-input')?.tagName).toBe('TEXTAREA');
    expect(canvas.querySelector('#chat-skip-reasoning')).not.toBeNull();
    expect(canvas.querySelector('.clare-prefs')).toBeNull();
    const pills = [...canvas.querySelectorAll<HTMLButtonElement>('[aria-label="Clare protocols"] [data-protocol-id]')];
    expect(pills).toHaveLength(5);
    for (const pill of pills) {
      expect(pill.title).toBe('');
      const tipId = pill.getAttribute('aria-describedby');
      const tip = tipId ? canvas.querySelector<HTMLElement>(`#${tipId}`) : null;
      expect(tip).not.toBeNull();
      expect(tip?.textContent).toMatch(/^[^.?!]+[.!?]$/);
    }
  });

  it('sends the selected protocol through Clare and rotates wait copy until the result arrives', async () => {
    vi.useFakeTimers();
    const pending = deferred<import('@/domain/clare').ClareDumpResult>();
    vi.mocked(tasksApi.processDumpWithClare).mockReturnValue(pending.promise);
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    const dump = canvas.querySelector<HTMLTextAreaElement>('#chat-input')!;
    dump.value = proposal.title;

    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="shrink-first-step"]')!.click();
    await vi.waitFor(() => expect(tasksApi.processDumpWithClare).toHaveBeenCalledTimes(1));
    expect(tasksApi.processDumpWithClare).toHaveBeenCalledWith(
      expect.objectContaining({ protocol_id: 'shrink-first-step', text: proposal.title })
    );
    const first = canvas.querySelector('.chat-message--status')?.textContent;
    expect(first).toBeTruthy();
    expect(first).not.toMatch(/thinking|working/i);

    await vi.advanceTimersByTimeAsync(1800);
    const second = canvas.querySelector('.chat-message--status')?.textContent;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    pending.resolve({
      voice: 'Right — one thing, and it actually has a shape. Here is my take.',
      proposals: [proposal],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: [],
      agent: 'clare'
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).toContain('Right — one thing');
    expect(canvas.textContent).toContain(proposal.title);
    expect(canvas.textContent).not.toContain('Here’s what that protocol means');
    vi.useRealTimers();
  });

  it('shows Saving… on Confirm then Saved. after the write', async () => {
    vi.mocked(tasksApi.processDumpWithClare).mockResolvedValue({
      voice: 'Right — one thing, and it actually has a shape. Here is my take.',
      proposals: [proposal],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: [],
      agent: 'clare'
    });
    const pending = deferred<unknown>();
    vi.mocked(tasksApi.acceptClareBatch).mockReturnValue(pending.promise as Promise<never>);
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    const dump = canvas.querySelector<HTMLTextAreaElement>('#chat-input')!;
    dump.value = proposal.title;
    canvas.querySelector<HTMLFormElement>('#chat-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(tasksApi.processDumpWithClare).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(canvas.querySelector('.record-proposal__confirm')).not.toBeNull());

    expect(canvas.querySelector('.record-proposal .page-header__title')?.textContent).toBe(proposal.title);
    expect(canvas.querySelector('.record-proposal__fields')).not.toBeNull();

    const confirm = canvas.querySelector<HTMLButtonElement>('.record-proposal__confirm')!;
    confirm.click();
    await vi.waitFor(() => expect(confirm.textContent).toBe('Saving…'));
    expect(confirm.disabled).toBe(true);

    pending.resolve({ tasks: [] });
    await vi.waitFor(() => expect(canvas.textContent).toMatch(/saved\./i));
    expect(tasksApi.acceptClareBatch).toHaveBeenCalledTimes(1);
  });

  it('drops a dump that finishes after New chat', async () => {
    const pending = deferred<import('@/domain/clare').ClareDumpResult>();
    vi.mocked(tasksApi.processDumpWithClare).mockReturnValue(pending.promise);
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    const dump = canvas.querySelector<HTMLTextAreaElement>('#chat-input')!;
    dump.value = proposal.title;
    canvas.querySelector<HTMLFormElement>('#chat-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(tasksApi.processDumpWithClare).toHaveBeenCalledTimes(1));

    canvas.querySelector<HTMLButtonElement>('#chat-new')!.click();
    pending.resolve({
      voice: 'Stale dump that should not land.',
      proposals: [proposal],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: [],
      agent: 'clare'
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(canvas.textContent).not.toContain('Stale dump that should not land.');
    expect(canvas.querySelector('.record-proposal__confirm')).toBeNull();
    expect(canvas.textContent).toContain(briefing.closer);
  });

  it('runs a sprint briefing when the dump is empty', async () => {
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue({
      ...briefing,
      protocol_id: 'weekly-reset',
      lead: 'Wednesday is the day to protect.',
      closer: 'That is the shape of the week. Dump the rest and I will sort it.'
    });
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    vi.mocked(tasksApi.briefWithClare).mockClear();
    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="weekly-reset"]')!.click();
    await vi.waitFor(() => expect(tasksApi.briefWithClare).toHaveBeenCalledWith('weekly-reset'));
  });

  it('switches the picker to Hammond and chats through the shared agent path', async () => {
    vi.mocked(tasksApi.processDumpWithClare).mockResolvedValue({
      voice: 'Ethics and Da Vinci overlap in the same fortnight. That is the board.',
      proposals: [],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: [],
      agent: 'hammond'
    });
    const canvas = document.createElement('main');
    await renderClareView(canvas);

    canvas.querySelector<HTMLButtonElement>('[data-agent-slug="hammond"]')!.click();
    expect(canvas.querySelector<HTMLElement>('#chat-view')?.style.getPropertyValue('--agent-accent')).toBe(
      '#2D2D2D'
    );
    expect(canvas.textContent).toMatch(/Hammond can/);
    expect(canvas.querySelector<HTMLTextAreaElement>('#chat-input')?.placeholder).toMatch(/running/i);
    expect(canvas.querySelector('#chat-domain')).toBeNull();
    expect(canvas.querySelector<HTMLElement>('.clare-prefs__skip')?.hidden).toBe(true);

    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="whats-running"]')!.click();
    await vi.waitFor(() =>
      expect(tasksApi.processDumpWithClare).toHaveBeenCalledWith(
        expect.objectContaining({ agent_slug: 'hammond' })
      )
    );
    await vi.waitFor(() => expect(canvas.textContent).toContain('Ethics and Da Vinci overlap'));
    const avatars = [...canvas.querySelectorAll<HTMLImageElement>('.chat-message--assistant .chat-message__avatar')];
    expect(avatars.at(-1)?.getAttribute('src')).toBe('/assets/agents/hammond.jpg');
  });
});
