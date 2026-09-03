import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeLastAgentSlug } from '@/ai/agents';
import { streamAiChat } from '@/ai/client';
import { pollAiJob, startAiJob, listAiJobs, resolveAiJob, AiJobConflictError } from '@/ai/jobs-client';
import type { AiJob } from '@/ai/jobs';
import type { AiProposal } from '@/ai/proposals';
import { mountAiPanel, type AiPanelHandle, type MountAiPanelOptions } from '@/teacher/ai-panel';

vi.mock('@/ai/client', () => ({ streamAiChat: vi.fn() }));
vi.mock('@/ai/jobs-client', () => {
  class MockConflict extends Error {
    jobId: string;
    status: string;
    constructor(jobId: string, status: string) {
      super('An unresolved job already exists for this lesson');
      this.name = 'AiJobConflictError';
      this.jobId = jobId;
      this.status = status;
    }
  }
  return {
    startAiJob: vi.fn(),
    pollAiJob: vi.fn(),
    listAiJobs: vi.fn(),
    resolveAiJob: vi.fn(),
    AiJobConflictError: MockConflict
  };
});

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const streamAiChatMock = vi.mocked(streamAiChat);
const startAiJobMock = vi.mocked(startAiJob);
const pollAiJobMock = vi.mocked(pollAiJob);
const listAiJobsMock = vi.mocked(listAiJobs);
const resolveAiJobMock = vi.mocked(resolveAiJob);

const SNAPSHOT = '2026-01-01T00:00:00.000Z';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const replaceLesson: AiProposal = {
  kind: 'replace_lesson',
  title: 'Built lesson',
  blocks: []
};

const insertTwoHeadings: AiProposal = {
  kind: 'insert_blocks',
  position: 'below',
  anchor_block_id: 'a',
  blocks: [
    {
      id: 'h1',
      type: 'block',
      block_type: 'heading',
      variant: 'section',
      visibility: 'student_teacher',
      content: { text: 'A' },
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1
    },
    {
      id: 'h2',
      type: 'block',
      block_type: 'heading',
      variant: 'section',
      visibility: 'student_teacher',
      content: { text: 'B' },
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1
    }
  ]
};

function workingJob(overrides: Partial<AiJob> = {}): AiJob {
  return {
    id: 'job_1',
    lesson_id: 'lesson_1',
    agent: 'clementine',
    status: 'working',
    snapshot_at: SNAPSHOT,
    message: 'Build a lesson',
    created_at: SNAPSHOT,
    ...overrides
  };
}

function mountPanel(overrides: Partial<MountAiPanelOptions> = {}): {
  host: HTMLElement;
  handle: AiPanelHandle;
  onAcceptProposal: ReturnType<typeof vi.fn>;
} {
  const host = document.createElement('div');
  document.body.append(host);
  const onAcceptProposal = vi.fn(() => ({ ok: true }));
  const handle = mountAiPanel(host, {
    lessonId: 'lesson_1',
    getSnapshotAt: () => SNAPSHOT,
    onAcceptProposal,
    ...overrides
  });
  return { host, handle, onAcceptProposal };
}

function composer(host: HTMLElement): {
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  send: HTMLButtonElement;
} {
  const form = host.querySelector<HTMLFormElement>('.ai-panel__composer');
  const input = host.querySelector<HTMLTextAreaElement>('.ai-panel__input');
  const send = host.querySelector<HTMLButtonElement>('.ai-panel__composer button[type="submit"]');
  if (!form || !input || !send) throw new Error('composer not found');
  return { form, input, send };
}

function submitMessage(host: HTMLElement, text: string): void {
  const { form, input } = composer(host);
  input.value = text;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function acceptButton(host: HTMLElement): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((btn) => btn.textContent === 'Accept');
}

describe('mountAiPanel', () => {
  let handle: AiPanelHandle | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    document.body.replaceChildren();
    streamAiChatMock.mockResolvedValue(undefined);
    startAiJobMock.mockResolvedValue({ id: 'job_1', status: 'working' });
    listAiJobsMock.mockResolvedValue({ jobs: [] });
    resolveAiJobMock.mockResolvedValue(workingJob({ status: 'done', resolution: 'accepted' }));
    pollAiJobMock.mockResolvedValue({
      ...workingJob(),
      status: 'done',
      proposal: replaceLesson
    });
    handle = undefined;
  });

  afterEach(() => {
    handle?.dispose();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('enables the composer with no block selected and does not use the old empty copy', () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    const { input, send, form } = composer(mounted.host);

    expect(form.hidden).toBe(false);
    expect(input.disabled).toBe(false);
    expect(send.disabled).toBe(false);
    expect(mounted.host.textContent).not.toContain('Select a block or section to work with.');

    handle.setSelection({ blockId: null, blockType: null, scope: 'lesson' });
    expect(composer(mounted.host).input.disabled).toBe(false);
    expect(composer(mounted.host).send.disabled).toBe(false);
  });

  it('routes Ann through a durable job and omits selected_block_id on empty selection', async () => {
    const mounted = mountPanel();
    handle = mounted.handle;

    submitMessage(mounted.host, 'Build a heading');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
    expect(streamAiChatMock).not.toHaveBeenCalled();

    const payload = startAiJobMock.mock.calls[0]?.[0];
    expect(payload?.agent).toBe('ann');
    expect(payload?.selected_block_id).toBeUndefined();
    expect(payload?.lesson_snapshot_at).toBe(SNAPSHOT);
    expect(JSON.stringify(payload)).not.toContain('"selected_block_id":null');
  });

  it('shows background progress and hands the bubble over to the finished response', async () => {
    let finishPoll: (job: AiJob) => void = () => undefined;
    pollAiJobMock.mockReset();
    pollAiJobMock
      .mockResolvedValueOnce(workingJob({ agent: 'ann', phase: 'searching' }))
      .mockImplementationOnce(
        () =>
          new Promise<AiJob>((resolve) => {
            finishPoll = resolve;
          })
      );

    const mounted = mountPanel({ random: () => 0 });
    handle = mounted.handle;
    submitMessage(mounted.host, 'Build a dual coding lesson');

    await vi.waitFor(() => {
      expect(mounted.host.textContent).toContain('Checking the teaching move…');
      expect(mounted.host.textContent).not.toContain('Searching the web…');
      expect(pollAiJobMock).toHaveBeenCalledTimes(2);
    });
    finishPoll(
      workingJob({
        agent: 'ann',
        status: 'done',
        phase: undefined,
        response: 'Here is the lesson.'
      })
    );
    await vi.waitFor(() => {
      expect(mounted.host.textContent).toContain('Here is the lesson.');
      expect(mounted.host.textContent).not.toContain('Checking the teaching move…');
    });
  });

  it('routes Clementine through jobs and pulses working until poll completes', async () => {
    writeLastAgentSlug('clementine');
    const onWorkingChange = vi.fn();
    const firstPoll = workingJob();
    const donePoll = workingJob({ status: 'done', proposal: replaceLesson });
    pollAiJobMock.mockReset();
    pollAiJobMock.mockResolvedValueOnce(firstPoll).mockResolvedValueOnce(donePoll);

    const mounted = mountPanel({ onWorkingChange });
    handle = mounted.handle;

    const clementineBtn = [...mounted.host.querySelectorAll('button')].find(
      (btn) => btn.title === 'Professor Clementine Haig'
    );
    expect(clementineBtn).toBeTruthy();

    submitMessage(mounted.host, 'Build a lesson on X with six block types');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
    expect(streamAiChatMock).not.toHaveBeenCalled();
    expect(mounted.host.classList.contains('ai-panel--working')).toBe(true);
    expect(handle.isWorking()).toBe(true);
    expect(onWorkingChange).toHaveBeenCalledWith(true);

    await vi.waitFor(() => {
      expect(pollAiJobMock).toHaveBeenCalledWith('job_1', expect.anything());
      expect(mounted.host.classList.contains('ai-panel--working')).toBe(false);
    });
    expect(handle.isWorking()).toBe(false);
    expect(onWorkingChange).toHaveBeenCalledWith(false);
    expect(mounted.host.querySelector('.ai-panel__proposal')).not.toBeNull();
    expect(mounted.host.querySelector('.confirm-card')).not.toBeNull();
    expect(mounted.host.querySelector('.confirm-card__actions')).not.toBeNull();
  });

  it('does not claim Job finished when Clementine is still working after the poll cap', async () => {
    vi.useFakeTimers();
    writeLastAgentSlug('clementine');
    pollAiJobMock.mockReset();
    pollAiJobMock.mockResolvedValue(workingJob());

    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Build a long lesson');

    try {
      await vi.runAllTimersAsync();
      expect(mounted.host.textContent).not.toContain('Job finished.');
      expect(mounted.host.textContent).toMatch(/timed out|still working/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves pending edits before asking, so a just-added block exists server-side', async () => {
    const order: string[] = [];
    const flushDraft = vi.fn(async () => {
      order.push('flush');
    });
    startAiJobMock.mockImplementation(async () => {
      order.push('job');
      return { id: 'job_1', status: 'working' };
    });

    const mounted = mountPanel({ flushDraft });
    handle = mounted.handle;
    handle.setSelection({ blockId: 'block_new', blockType: 'rich_text', scope: 'block' });

    submitMessage(mounted.host, 'Put three facts about Shakespeare in this box');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
    expect(flushDraft).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['flush', 'job']);
  });

  it('still asks when saving first fails', async () => {
    const flushDraft = vi.fn(async () => {
      throw new Error('offline');
    });

    const mounted = mountPanel({ flushDraft });
    handle = mounted.handle;

    submitMessage(mounted.host, 'Build a heading');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
  });

  it('keeps Ann selection and scope when starting a durable job', async () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    handle.setSelection({ blockId: 'block_1', blockType: 'heading', scope: 'block' });

    submitMessage(mounted.host, 'Rewrite this heading');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });
    expect(streamAiChatMock).not.toHaveBeenCalled();
    expect(startAiJobMock.mock.calls[0]?.[0]).toMatchObject({
      agent: 'ann',
      scope: 'block',
      selected_block_id: 'block_1',
      lesson_snapshot_at: SNAPSHOT
    });
  });

  it('keeps suggestion buttons out of the way until asked for', () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    handle.setSelection({ blockId: 'block_1', blockType: 'rich_text', scope: 'block' });

    const actions = mounted.host.querySelector<HTMLElement>('.ai-panel__actions');
    const toggle = mounted.host.querySelector<HTMLButtonElement>('.ai-panel__suggestions-toggle');
    expect(actions).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(actions!.hidden).toBe(true);
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');

    toggle!.click();
    expect(mounted.host.querySelector<HTMLElement>('.ai-panel__actions')!.hidden).toBe(false);
    expect(
      mounted.host.querySelector<HTMLButtonElement>('.ai-panel__suggestions-toggle')!
        .getAttribute('aria-expanded')
    ).toBe('true');

    toggle!.click();
    expect(mounted.host.querySelector<HTMLElement>('.ai-panel__actions')!.hidden).toBe(true);
  });

  it('remembers that suggestions were opened', () => {
    const first = mountPanel();
    first.handle.setSelection({ blockId: 'block_1', blockType: 'rich_text', scope: 'block' });
    first.host.querySelector<HTMLButtonElement>('.ai-panel__suggestions-toggle')!.click();
    first.handle.dispose();

    const second = mountPanel();
    handle = second.handle;
    handle.setSelection({ blockId: 'block_1', blockType: 'rich_text', scope: 'block' });

    expect(second.host.querySelector<HTMLElement>('.ai-panel__actions')!.hidden).toBe(false);
  });

  it('shows Lesson or Looking at hint and never disables send', () => {
    const mounted = mountPanel();
    handle = mounted.handle;
    const scopeChip = mounted.host.querySelector('.ai-panel__scope');

    expect(scopeChip?.textContent).toMatch(/Lesson/);
    expect(composer(mounted.host).send.disabled).toBe(false);

    handle.setSelection({ blockId: 'block_1', blockType: 'heading', scope: 'block' });
    expect(mounted.host.querySelector('.ai-panel__scope')?.textContent).toMatch(/Looking at:/);
    expect(composer(mounted.host).send.disabled).toBe(false);
  });

  it('calls onAcceptProposal when Accept is clicked on a replace_lesson proposal', async () => {
    pollAiJobMock.mockResolvedValue(workingJob({ status: 'done', proposal: replaceLesson }));
    const mounted = mountPanel();
    handle = mounted.handle;

    submitMessage(mounted.host, 'Replace the lesson');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    acceptButton(mounted.host)?.click();

    expect(mounted.onAcceptProposal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'replace_lesson' })
    );
  });

  it('asks onStaleAccept when the snapshot changed and leaves the proposal pending if apply is not called', async () => {
    let snapshot = 't1';
    const onStaleAccept = vi.fn();
    pollAiJobMock.mockResolvedValue(workingJob({ status: 'done', proposal: replaceLesson }));
    const mounted = mountPanel({
      getSnapshotAt: () => snapshot,
      onStaleAccept
    });
    handle = mounted.handle;

    submitMessage(mounted.host, 'Replace the lesson');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    snapshot = 't2';
    acceptButton(mounted.host)?.click();

    expect(onStaleAccept).toHaveBeenCalledTimes(1);
    expect(mounted.onAcceptProposal).not.toHaveBeenCalled();
    expect(acceptButton(mounted.host)).toBeTruthy();
    expect(mounted.host.textContent).toMatch(/Proposal:/);
    expect(mounted.host.textContent).not.toContain('Proposal accepted');
  });

  it('keeps Accept without a checklist for title-only replace_lesson', async () => {
    pollAiJobMock.mockResolvedValue(workingJob({ status: 'done', proposal: replaceLesson }));
    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Replace the lesson');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    expect(mounted.host.querySelector('.ai-panel__proposal-check')).toBeNull();
    expect(
      [...mounted.host.querySelectorAll('button')].some((btn) => btn.textContent === 'Accept selected')
    ).toBe(false);
  });

  it('shows Accept selected and checkboxes for a multi-block insert', async () => {
    pollAiJobMock.mockResolvedValue(
      workingJob({ agent: 'ann', status: 'done', proposal: insertTwoHeadings })
    );
    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Add two headings');

    await vi.waitFor(() => {
      expect(mounted.host.querySelectorAll('.ai-panel__proposal-check').length).toBe(2);
    });
    expect(
      [...mounted.host.querySelectorAll('button')].some((btn) => btn.textContent === 'Accept selected')
    ).toBe(true);
    expect(acceptButton(mounted.host)).toBeUndefined();
  });

  it('Accept selected applies only checked insert blocks', async () => {
    pollAiJobMock.mockResolvedValue(
      workingJob({ agent: 'ann', status: 'done', proposal: insertTwoHeadings })
    );
    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Add two headings');

    await vi.waitFor(() => {
      expect(mounted.host.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    });
    const boxes = [...mounted.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    boxes[1]!.checked = false;
    boxes[1]!.dispatchEvent(new Event('change', { bubbles: true }));

    const acceptSelected = [...mounted.host.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Accept selected'
    );
    acceptSelected?.click();

    expect(mounted.onAcceptProposal).toHaveBeenCalledTimes(1);
    const applied = mounted.onAcceptProposal.mock.calls[0]?.[0] as AiProposal;
    expect(applied.kind).toBe('insert_blocks');
    if (applied.kind !== 'insert_blocks') throw new Error('expected insert');
    expect(applied.blocks).toHaveLength(1);
    expect(applied.blocks[0]?.id).toBe('h1');
  });

  it('adds ai-panel--shelved when setShelved(true) and supports setWorking', () => {
    const onWorkingChange = vi.fn();
    const mounted = mountPanel({ onWorkingChange });
    handle = mounted.handle;

    handle.setShelved(true);
    expect(mounted.host.classList.contains('ai-panel--shelved')).toBe(true);
    handle.setShelved(false);
    expect(mounted.host.classList.contains('ai-panel--shelved')).toBe(false);

    expect(handle.isWorking()).toBe(false);
    handle.setWorking(true);
    expect(handle.isWorking()).toBe(true);
    expect(mounted.host.classList.contains('ai-panel--working')).toBe(true);
    expect(onWorkingChange).toHaveBeenCalledWith(true);
  });

  it('uses circular picker avatars without a full-body hero and can request hide', () => {
    const onRequestShelve = vi.fn();
    const onAgentChange = vi.fn();
    const mounted = mountPanel({ onRequestShelve, onAgentChange });
    handle = mounted.handle;

    expect(mounted.host.querySelector('.ai-panel__hero')).toBeNull();
    expect(mounted.host.querySelectorAll('.ai-panel__agent')).toHaveLength(4);
    expect(mounted.host.querySelector('[data-agent="hammond"]')).toBeTruthy();
    expect(onAgentChange).toHaveBeenCalledWith('ann');

    mounted.host.querySelector<HTMLButtonElement>('.ai-panel__hide')!.click();
    expect(onRequestShelve).toHaveBeenCalledTimes(1);
  });

  it('renders four to six one-sentence protocol pills for every personality', () => {
    const mounted = mountPanel();
    handle = mounted.handle;

    for (const slug of ['ann', 'clementine', 'hammond', 'clare']) {
      mounted.host.querySelector<HTMLButtonElement>(`.ai-panel__agent[data-agent="${slug}"]`)!.click();
      const tray = mounted.host.querySelector<HTMLElement>('.agent-protocol-pills');
      const pills = [...mounted.host.querySelectorAll<HTMLButtonElement>('.agent-protocol-pills .hub-pills__btn')];
      expect(tray?.textContent?.toLowerCase()).toContain(`${slug === 'clementine' ? 'clementine' : slug} can`);
      expect(pills.length).toBeGreaterThanOrEqual(4);
      expect(pills.length).toBeLessThanOrEqual(6);
      for (const pill of pills) {
        const tip = pill.querySelector<HTMLElement>('.agent-protocol-pills__tip');
        expect(tip?.getAttribute('role')).toBe('tooltip');
        expect(tip?.textContent).toMatch(/^[A-Z][^.?!]*[.?!]$/);
        expect(pill.getAttribute('aria-describedby')).toBe(tip?.id);
        expect(pill.getAttribute('title')).toBeNull();
      }
    }
  });

  it('tapping a pill starts a real agent job with protocol_id and no canned assistant explainer', async () => {
    let finishPoll: (job: AiJob) => void = () => undefined;
    pollAiJobMock.mockReset();
    pollAiJobMock.mockImplementation(
      () => new Promise<AiJob>((resolve) => { finishPoll = resolve; })
    );
    const mounted = mountPanel();
    handle = mounted.handle;

    mounted.host.querySelector<HTMLButtonElement>('[data-protocol-id="lesson-diagnosis"]')!.click();

    await vi.waitFor(() => expect(startAiJobMock).toHaveBeenCalledTimes(1));
    expect(startAiJobMock.mock.calls[0]?.[0]).toMatchObject({
      agent: 'ann',
      protocol_id: 'lesson-diagnosis'
    });
    const assistantRows = [...mounted.host.querySelectorAll('.ai-panel__msg--assistant')];
    expect(assistantRows).toHaveLength(1);
    expect(assistantRows.map((row) => row.textContent).join(' ')).not.toContain(
      'Diagnose the lesson before prescribing changes'
    );

    finishPoll(workingJob({ agent: 'ann', status: 'done', response: 'The opening task needs a clearer model.' }));
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('The opening task needs a clearer model.'));
  });

  it('rotates Ann wait lines instead of rendering generic job phases', async () => {
    let finishPoll: (job: AiJob) => void = () => undefined;
    pollAiJobMock.mockReset();
    pollAiJobMock
      .mockResolvedValueOnce(workingJob({ agent: 'ann', phase: 'searching' }))
      .mockImplementationOnce(() => new Promise<AiJob>((resolve) => { finishPoll = resolve; }));
    const mounted = mountPanel({ random: () => 0 });
    handle = mounted.handle;

    submitMessage(mounted.host, 'Review this lesson');

    await vi.waitFor(() => expect(pollAiJobMock).toHaveBeenCalledTimes(2));
    const copy = mounted.host.textContent ?? '';
    expect(copy).toMatch(/Reading the lesson closely…|Checking the teaching move…/);
    expect(copy).not.toMatch(/Thinking…|Searching the web…|Writing the reply…|Still working…/);

    finishPoll(workingJob({ agent: 'ann', status: 'done', response: 'Ready.' }));
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('Ready.'));
  });

  it('restores a finished job as a pending Accept card', async () => {
    listAiJobsMock.mockResolvedValue({
      jobs: [
        {
          id: 'job_1',
          lesson_id: 'lesson_1',
          lesson_title: 'Othello',
          agent: 'clementine',
          status: 'done',
          created_at: SNAPSHOT,
          message: 'Build a lesson'
        }
      ]
    });
    pollAiJobMock.mockResolvedValue({
      ...workingJob(),
      status: 'done',
      proposal: replaceLesson
    });

    const mounted = mountPanel();
    handle = mounted.handle;

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    expect(mounted.host.textContent).toContain('Build a lesson');

    acceptButton(mounted.host)?.click();
    expect(mounted.onAcceptProposal).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(resolveAiJobMock).toHaveBeenCalledWith('job_1', 'accepted');
    });
  });

  it('resumes an existing job when start returns a conflict', async () => {
    writeLastAgentSlug('clementine');
    startAiJobMock.mockRejectedValue(new AiJobConflictError('job_1', 'working'));
    pollAiJobMock
      .mockResolvedValueOnce(workingJob())
      .mockResolvedValue({
        ...workingJob(),
        status: 'done',
        proposal: replaceLesson
      });

    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'Build again');

    await vi.waitFor(() => {
      expect(acceptButton(mounted.host)).toBeTruthy();
    });
    expect(pollAiJobMock).toHaveBeenCalledWith('job_1', expect.anything());
    expect(mounted.host.textContent).toContain('Build a lesson');
    expect(mounted.host.textContent).not.toContain('Build again');
  });

  it('does not persist Aborted into the transcript when the request is cancelled', async () => {
    startAiJobMock.mockImplementation(
      (_payload, options) =>
        new Promise((_, reject) => {
          const fail = () => reject(new DOMException('Aborted', 'AbortError'));
          if (options?.signal?.aborted) {
            fail();
            return;
          }
          options?.signal?.addEventListener('abort', fail, { once: true });
        })
    );

    const mounted = mountPanel();
    handle = mounted.handle;
    submitMessage(mounted.host, 'hello');

    await vi.waitFor(() => {
      expect(startAiJobMock).toHaveBeenCalled();
    });

    mounted.handle.dispose();
    handle = undefined;
    await Promise.resolve();
    await Promise.resolve();

    const remounted = mountPanel();
    handle = remounted.handle;
    expect(remounted.host.textContent).not.toContain('Aborted');
    expect(localStorage.getItem('teaching_hub_ai_transcript_lesson_1') ?? '').not.toContain('Aborted');
  });
});
