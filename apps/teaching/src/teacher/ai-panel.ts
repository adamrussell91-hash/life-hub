import {
  AGENTS,
  agentColour,
  readLastAgentSlug,
  writeLastAgentSlug,
  type AgentSlug
} from '@/ai/agents';
import { actionsForScope } from '@/ai/capabilities';
import { pickAgentWaitLine, protocolsForAgent } from '@/ai/agent-protocols';
import type { ArchiveCitation } from '@/ai/client';
import { aiFailureCopy } from '@/app/failure';
import { pollAiJob, startAiJob, listAiJobs, resolveAiJob, AiJobConflictError } from '@/ai/jobs-client';
import { AI_JOB_STALE_MS } from '@/ai/jobs';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';
import type { AiProposal, AiScope } from '@/ai/proposals';
import type { Block } from '@/schemas/block';
import {
  readBuilderChromePrefs,
  writeBuilderChromePrefs
} from '@/teacher/lesson-canvas/prefs';

export interface AiPanelHandle {
  setSelection(selection: {
    blockId: string | null;
    blockType: Block['block_type'] | null;
    scope: AiScope;
  }): void;
  setWorking(working: boolean): void;
  setShelved(shelved: boolean): void;
  isWorking(): boolean;
  dispose(): void;
}

export interface MountAiPanelOptions {
  lessonId: string;
  getSnapshotAt: () => string;
  /**
   * Saves pending canvas edits. The agent reads the stored draft, so without
   * this a block added seconds ago is invisible to it.
   */
  flushDraft?: () => Promise<void>;
  onAcceptProposal: (proposal: AiProposal) => { ok: boolean; message?: string };
  onWorkingChange?: (working: boolean) => void;
  onStaleAccept?: (apply: () => void) => void;
  onAgentChange?: (slug: AgentSlug) => void;
  onRequestShelve?: () => void;
  random?: () => number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  agent?: AgentSlug;
  text: string;
  /** Live phase copy shown only while the bubble has no reply text yet. */
  status?: string;
  proposal?: AiProposal;
  proposalStatus?: 'pending' | 'accepted' | 'rejected';
  selectedKeys?: string[];
  proposalError?: string;
  snapshotAt?: string;
  citations?: ArchiveCitation[];
  archiveFailed?: boolean;
  jobId?: string;
}

const POLL_MS = import.meta.env.MODE === 'test' ? 50 : 1000;
const MAX_POLLS = Math.ceil(AI_JOB_STALE_MS / 1000);
function transcriptKey(lessonId: string): string {
  return `teaching_hub_ai_transcript_${lessonId}`;
}

function loadTranscript(lessonId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(transcriptKey(lessonId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveTranscript(lessonId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(transcriptKey(lessonId), JSON.stringify(messages.slice(-40)));
  } catch {
    /* ignore */
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isMutatingProposal(proposal: AiProposal | undefined): boolean {
  return Boolean(proposal && proposal.kind !== 'review_only');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export function mountAiPanel(host: HTMLElement, options: MountAiPanelOptions): AiPanelHandle {
  host.classList.add('ai-panel');

  let agentSlug = readLastAgentSlug();
  let selectedBlockId: string | null = null;
  let selectedBlockType: Block['block_type'] | null = null;
  let scope: AiScope = 'lesson';
  let messages = loadTranscript(options.lessonId);
  let busy = false;
  let abort: AbortController | null = null;
  let msgCounter = 0;
  const random = options.random ?? Math.random;

  const toolbar = document.createElement('div');
  toolbar.className = 'ai-panel__toolbar';

  const picker = document.createElement('div');
  picker.className = 'ai-panel__picker';
  picker.setAttribute('role', 'listbox');
  picker.setAttribute('aria-label', 'AI agents');

  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'btn btn--ghost ai-panel__hide';
  hideBtn.textContent = 'Hide';
  hideBtn.setAttribute('aria-label', 'Hide chat');
  hideBtn.addEventListener('click', () => options.onRequestShelve?.());
  toolbar.append(picker, hideBtn);

  const protocolTray = document.createElement('div');
  protocolTray.className = 'agent-protocol-pills';

  const scopeChip = document.createElement('p');
  scopeChip.className = 'ai-panel__scope';

  // Ten suggestion buttons pushed the thread off a laptop screen, so they stay
  // folded away until the teacher asks for them.
  let suggestionsOpen = readBuilderChromePrefs().suggestions === 'open';

  const suggestionsToggle = document.createElement('button');
  suggestionsToggle.type = 'button';
  suggestionsToggle.className = 'btn btn--ghost ai-panel__suggestions-toggle';

  const actionsBar = document.createElement('div');
  actionsBar.className = 'ai-panel__actions';

  function renderSuggestionsToggle(): void {
    const count = actionsForScope(scope, selectedBlockType).length;
    suggestionsToggle.hidden = count === 0;
    suggestionsToggle.textContent = suggestionsOpen
      ? 'Hide suggestions'
      : `Suggestions (${count})`;
    suggestionsToggle.setAttribute('aria-expanded', suggestionsOpen ? 'true' : 'false');
    actionsBar.hidden = !suggestionsOpen || count === 0;
  }

  suggestionsToggle.addEventListener('click', () => {
    suggestionsOpen = !suggestionsOpen;
    writeBuilderChromePrefs({
      ...readBuilderChromePrefs(),
      suggestions: suggestionsOpen ? 'open' : 'shelved'
    });
    renderSuggestionsToggle();
  });

  const empty = document.createElement('p');
  empty.className = 'ai-panel__empty';
  empty.textContent = 'Ask an agent to build or edit this lesson.';

  const thread = document.createElement('div');
  thread.className = 'ai-panel__thread';

  const composer = document.createElement('form');
  composer.className = 'ai-panel__composer';

  const input = document.createElement('textarea');
  input.className = 'ai-panel__input';
  input.rows = 3;
  input.placeholder = 'Ask the selected agent…';
  input.setAttribute('aria-label', 'Message');

  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'btn btn--primary';
  sendBtn.textContent = 'Send';

  composer.append(input, sendBtn);
  host.replaceChildren(
    toolbar,
    protocolTray,
    scopeChip,
    suggestionsToggle,
    actionsBar,
    empty,
    thread,
    composer
  );

  function nextMsgId(): string {
    msgCounter += 1;
    return `m_${Date.now()}_${msgCounter}`;
  }

  function currentSnapshot(): string {
    return options.getSnapshotAt?.() ?? new Date().toISOString();
  }

  function setWorkingState(working: boolean): void {
    busy = working;
    host.classList.toggle('ai-panel--working', working);
    options.onWorkingChange?.(working);
    renderShell();
  }

  function renderPicker(): void {
    picker.replaceChildren();
    for (const agent of AGENTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-panel__agent';
      if (agent.slug === agentSlug) btn.classList.add('ai-panel__agent--active');
      btn.style.setProperty('--agent-colour', agent.colour);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', agent.slug === agentSlug ? 'true' : 'false');
      btn.title = agent.name;
      btn.dataset.agent = agent.slug;

      const img = document.createElement('img');
      img.src = agent.avatarSrc;
      img.alt = agent.name;
      img.className = 'ai-panel__agent-avatar';
      btn.append(img);
      btn.addEventListener('click', () => {
        agentSlug = agent.slug;
        writeLastAgentSlug(agent.slug);
        options.onAgentChange?.(agent.slug);
        renderPicker();
        renderProtocols();
      });
      picker.append(btn);
    }
  }

  function renderProtocols(): void {
    const pack = protocolsForAgent(agentSlug);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'agent-protocol-pills__eyebrow page-header__eyebrow';
    eyebrow.textContent = `${pack.firstName} can`;

    const row = document.createElement('div');
    row.className = 'hub-pills';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${pack.firstName} protocols`);

    for (const pill of pack.pills) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hub-pills__btn';
      button.dataset.protocolId = pill.id;
      button.disabled = busy;

      const label = document.createElement('span');
      label.className = 'agent-protocol-pills__label';
      label.textContent = pill.label;

      const tip = document.createElement('span');
      tip.className = 'agent-protocol-pills__tip';
      tip.id = `teaching-protocol-tip-${agentSlug}-${pill.id}`;
      tip.setAttribute('role', 'tooltip');
      tip.textContent = pill.explain;
      button.setAttribute('aria-describedby', tip.id);

      button.append(label, tip);
      button.addEventListener('click', () => {
        void sendMessage(pill.label, undefined, pill.id);
      });
      row.append(button);
    }

    protocolTray.replaceChildren(eyebrow, row);
  }

  function renderScope(): void {
    if (!selectedBlockId) {
      scopeChip.textContent = 'Lesson';
      return;
    }
    if (scope === 'section') {
      scopeChip.textContent = 'Looking at: Section';
      return;
    }
    const typeLabel = selectedBlockType ? selectedBlockType.replaceAll('_', ' ') : 'Block';
    scopeChip.textContent = `Looking at: ${typeLabel}`;
  }

  function renderActions(): void {
    actionsBar.replaceChildren();
    const actions = actionsForScope(scope, selectedBlockType);
    renderSuggestionsToggle();
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost ai-panel__action';
      btn.textContent = action.label;
      btn.disabled = busy;
      btn.addEventListener('click', () => {
        void sendMessage(`Please ${action.label.toLowerCase()} the selected content.`, action.id);
      });
      actionsBar.append(btn);
    }
  }

  function attachProposal(
    assistant: ChatMessage,
    proposal: AiProposal,
    snapshotAt: string
  ): void {
    assistant.proposal = proposal;
    if (proposal.kind === 'review_only') {
      if (!assistant.text.trim()) assistant.text = proposal.summary;
      return;
    }
    assistant.proposalStatus = 'pending';
    assistant.snapshotAt = snapshotAt;
    if (!assistant.text.trim()) {
      assistant.text = 'Proposed a change — review and Accept to apply.';
    }
  }

  function applyPendingProposal(msg: ChatMessage, proposal: AiProposal = msg.proposal!): void {
    const result = options.onAcceptProposal(proposal);
    msg.proposalStatus = result.ok ? 'accepted' : 'pending';
    if (!result.ok) {
      messages.push({
        id: nextMsgId(),
        role: 'system',
        text: result.message ?? 'Could not apply proposal'
      });
    }
    saveTranscript(options.lessonId, messages);
    renderThread();
    if (result.ok && msg.jobId) {
      void resolveAiJob(msg.jobId, 'accepted');
    }
  }

  function acceptProposal(msg: ChatMessage, proposal: AiProposal = msg.proposal!): void {
    if (isMutatingProposal(msg.proposal) && msg.snapshotAt && currentSnapshot() !== msg.snapshotAt) {
      const apply = () => applyPendingProposal(msg, proposal);
      if (options.onStaleAccept) {
        options.onStaleAccept(apply);
        return;
      }
      if (!window.confirm('The lesson has changed since this proposal was made. Apply it anyway?')) {
        return;
      }
    }
    applyPendingProposal(msg, proposal);
  }

  function acceptSelected(msg: ChatMessage): void {
    if (!msg.proposal) return;
    const units = listPartialAcceptUnits(msg.proposal);
    const keys = new Set(msg.selectedKeys ?? units.map((unit) => unit.key));
    const filtered = filterProposal(msg.proposal, keys);
    if (!filtered.ok) {
      msg.proposalError = filtered.message;
      renderThread();
      return;
    }
    msg.proposalError = undefined;
    acceptProposal(msg, filtered.proposal);
  }

  function renderThread(): void {
    thread.replaceChildren();
    for (const msg of messages) {
      const row = document.createElement('div');
      row.className = `ai-panel__msg ai-panel__msg--${msg.role}`;
      if (msg.agent) {
        row.style.setProperty('--agent-colour', agentColour(msg.agent));
        row.dataset.agent = msg.agent;
      }

      if (msg.role === 'assistant' && msg.agent) {
        const agent = AGENTS.find((a) => a.slug === msg.agent);
        if (agent) {
          const wrap = document.createElement('span');
          wrap.className = 'ai-panel__msg-avatar-wrap';
          wrap.dataset.agent = agent.slug;
          const avatar = document.createElement('img');
          avatar.className = 'ai-panel__msg-avatar';
          avatar.src = agent.avatarSrc;
          avatar.alt = agent.name;
          wrap.append(avatar);
          row.append(wrap);
        }
      }

      const bubble = document.createElement('div');
      bubble.className = 'ai-panel__bubble';
      bubble.textContent = msg.text || msg.status || '';
      row.append(bubble);

      if (msg.archiveFailed) {
        const fail = document.createElement('p');
        fail.className = 'ai-panel__citations';
        fail.textContent = 'Archive pull failed — she is working from the lesson only.';
        row.append(fail);
      } else if (msg.citations?.length) {
        const list = document.createElement('ul');
        list.className = 'ai-panel__citations';
        for (const citation of msg.citations) {
          const item = document.createElement('li');
          item.textContent = `${citation.title} (${citation.stance})`;
          list.append(item);
        }
        row.append(list);
      }

      if (msg.proposal && msg.proposal.kind !== 'review_only') {
        const card = document.createElement('div');
        card.className = 'confirm-card ai-panel__proposal';
        const title = document.createElement('p');
        title.className = 'page-header__eyebrow ai-panel__proposal-title';
        title.textContent =
          msg.proposalStatus === 'accepted'
            ? 'Proposal accepted'
            : msg.proposalStatus === 'rejected'
              ? 'Proposal rejected'
              : `Proposal: ${msg.proposal.kind.replaceAll('_', ' ')}`;
        card.append(title);

        if (msg.proposalStatus === 'pending') {
          const units = listPartialAcceptUnits(msg.proposal);
          const partial = units.length >= 2;
          const actions = document.createElement('div');
          actions.className = 'confirm-card__actions ai-panel__proposal-actions';
          const accept = document.createElement('button');
          accept.type = 'button';
          accept.className = 'btn btn--primary';
          accept.textContent = partial ? 'Accept selected' : 'Accept';
          accept.addEventListener('click', () => {
            if (partial) acceptSelected(msg);
            else acceptProposal(msg);
          });
          if (partial) {
            if (!msg.selectedKeys) msg.selectedKeys = units.map((unit) => unit.key);
            const selected = new Set(msg.selectedKeys);
            accept.disabled = !units.some((unit) => selected.has(unit.key));
            const list = document.createElement('ul');
            list.className = 'ai-panel__proposal-list';
            for (const unit of units) {
              const item = document.createElement('li');
              const label = document.createElement('label');
              label.className = unit.group
                ? 'ai-panel__proposal-check ai-panel__proposal-check--nested'
                : 'ai-panel__proposal-check';
              const box = document.createElement('input');
              box.type = 'checkbox';
              box.checked = selected.has(unit.key);
              box.addEventListener('change', () => {
                const next = new Set(msg.selectedKeys ?? units.map((u) => u.key));
                if (box.checked) next.add(unit.key);
                else next.delete(unit.key);
                msg.selectedKeys = [...next];
                accept.disabled = !units.some((u) => next.has(u.key));
              });
              label.append(box, document.createTextNode(unit.label));
              item.append(label);
              list.append(item);
            }
            card.append(list);
          }
          if (msg.proposalError) {
            const error = document.createElement('p');
            error.className = 'ai-panel__proposal-error';
            error.textContent = msg.proposalError;
            card.append(error);
          }
          const reject = document.createElement('button');
          reject.type = 'button';
          reject.className = 'btn btn--secondary';
          reject.textContent = 'Reject';
          reject.addEventListener('click', () => {
            msg.proposalStatus = 'rejected';
            saveTranscript(options.lessonId, messages);
            renderThread();
            if (msg.jobId) void resolveAiJob(msg.jobId, 'rejected');
          });
          const regen = document.createElement('button');
          regen.type = 'button';
          regen.className = 'btn btn--ghost';
          regen.textContent = 'Regenerate';
          regen.addEventListener('click', () => {
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (lastUser) void sendMessage(lastUser.text);
          });
          actions.append(accept, reject, regen);
          card.append(actions);
        }
        row.append(card);
      } else if (msg.proposal?.kind === 'review_only') {
        const note = document.createElement('p');
        note.className = 'ai-panel__review';
        note.textContent = msg.proposal.summary;
        row.append(note);
      }

      thread.append(row);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function renderShell(): void {
    empty.hidden = messages.length > 0;
    composer.hidden = false;
    thread.hidden = false;
    input.disabled = busy;
    sendBtn.disabled = busy;
    renderProtocols();
    renderScope();
    renderActions();
    renderThread();
  }

  async function pollJobUntilSettled(
    jobId: string,
    assistantId: string,
    snapshotAt: string,
    signal: AbortSignal
  ): Promise<void> {
    const assistant = messages.find((m) => m.id === assistantId);
    if (assistant) assistant.jobId = jobId;
    let job = await pollAiJob(jobId, { signal });
    if (assistant && job.status === 'working' && assistant.agent) {
      assistant.status = pickAgentWaitLine(assistant.agent, { exclude: assistant.status, random });
      renderThread();
    }
    let polls = 1;
    while (job.status === 'working' && !signal.aborted && polls < MAX_POLLS) {
      polls += 1;
      await sleep(POLL_MS, signal);
      job = await pollAiJob(jobId, { signal });
      if (assistant && job.status === 'working' && assistant.agent) {
        assistant.status = pickAgentWaitLine(assistant.agent, { exclude: assistant.status, random });
        renderThread();
      }
    }
    if (!assistant) return;
    assistant.status = undefined;
    if (job.status === 'error') {
      assistant.text = job.error ?? 'AI job failed';
      renderThread();
      return;
    }
    if (job.status === 'working') {
      assistant.text = 'This job is still working and timed out after 10 minutes.';
      renderThread();
      return;
    }
    if (job.response) assistant.text = job.response;
    if (job.proposal) {
      attachProposal(assistant, job.proposal, job.snapshot_at || snapshotAt);
      if (job.archiveFailed) assistant.archiveFailed = true;
    } else if (!assistant.text.trim()) {
      assistant.text = 'Job finished.';
    }
    renderThread();
  }

  async function runAgentJob(
    message: string,
    userId: string,
    assistantId: string,
    snapshotAt: string,
    signal: AbortSignal,
    turnAgent: AgentSlug,
    protocolId: string | undefined,
    action: string | undefined,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void> {
    let jobId: string;
    try {
      const started = await startAiJob(
        {
          lesson_id: options.lessonId,
          agent: turnAgent,
          scope,
          selected_block_id: selectedBlockId ?? undefined,
          lesson_snapshot_at: snapshotAt,
          message,
          ...(protocolId ? { protocol_id: protocolId } : {}),
          action,
          history
        },
        { signal }
      );
      jobId = started.id;
    } catch (error) {
      if (error instanceof AiJobConflictError) {
        const existing = await pollAiJob(error.jobId, { signal });
        const user = messages.find((entry) => entry.id === userId);
        const assistant = messages.find((entry) => entry.id === assistantId);
        if (user) user.text = existing.message;
        if (assistant) {
          assistant.agent = existing.agent;
          assistant.jobId = existing.id;
        }
        jobId = error.jobId;
      } else {
        throw error;
      }
    }
    await pollJobUntilSettled(jobId, assistantId, snapshotAt, signal);
  }

  async function resumeOpenJob(): Promise<void> {
    try {
      const inbox = await listAiJobs();
      const row = inbox.jobs.find((job) => job.lesson_id === options.lessonId);
      if (!row) return;
      const job = await pollAiJob(row.id);
      if (messages.some((msg) => msg.jobId === job.id)) return;
      messages.push({ id: nextMsgId(), role: 'user', text: job.message });
      const assistantId = nextMsgId();
      messages.push({
        id: assistantId,
        role: 'assistant',
        agent: job.agent,
        text: '',
        status: pickAgentWaitLine(job.agent, { random }),
        jobId: job.id
      });
      if (job.status === 'working') {
        abort?.abort();
        abort = new AbortController();
        setWorkingState(true);
        try {
          await pollJobUntilSettled(job.id, assistantId, job.snapshot_at, abort.signal);
        } finally {
          setWorkingState(false);
        }
      } else if (job.status === 'error') {
        const assistant = messages.find((msg) => msg.id === assistantId);
        if (assistant) assistant.text = job.error ?? 'AI job failed';
      } else {
        const assistant = messages.find((msg) => msg.id === assistantId);
        if (assistant && job.response) assistant.text = job.response;
        if (assistant && job.proposal) attachProposal(assistant, job.proposal, job.snapshot_at);
      }
      saveTranscript(options.lessonId, messages);
      renderShell();
    } catch {
      /* inbox is optional on load */
    }
  }

  async function sendMessage(text: string, action?: string, protocolId?: string): Promise<void> {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const turnAgent = agentSlug;

    setWorkingState(true);

    // A failed save is not a reason to refuse the request; the agent falls back
    // to lesson scope when it cannot find the block.
    try {
      await options.flushDraft?.();
    } catch {
      /* keep going with whatever the server already has */
    }

    const snapshotAt = currentSnapshot();

    const userId = nextMsgId();
    messages.push({ id: userId, role: 'user', text: trimmed });
    const assistantId = nextMsgId();
    messages.push({
      id: assistantId,
      role: 'assistant',
      agent: turnAgent,
      text: '',
      status: pickAgentWaitLine(turnAgent, { random })
    });
    saveTranscript(options.lessonId, messages);
    renderThread();

    abort?.abort();
    abort = new AbortController();

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .filter((m) => m.text.trim())
      .slice(-12)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text
      }));

    try {
      await runAgentJob(
        trimmed,
        userId,
        assistantId,
        snapshotAt,
        abort.signal,
        turnAgent,
        protocolId,
        action,
        history
      );
    } catch (err) {
      if (isAbortError(err)) {
        messages = messages.filter((msg) => msg.id !== assistantId || Boolean(msg.text));
      } else {
        const assistant = messages.find((m) => m.id === assistantId);
        if (assistant && !assistant.text) {
          assistant.text = err instanceof Error ? err.message : aiFailureCopy(true);
        }
      }
    } finally {
      // A phase line is only true mid-turn; it must never outlive the request.
      const assistant = messages.find((m) => m.id === assistantId);
      if (assistant) assistant.status = undefined;
      setWorkingState(false);
      saveTranscript(options.lessonId, messages);
      renderShell();
    }
  }

  composer.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    void sendMessage(value);
  });

  renderPicker();
  renderProtocols();
  options.onAgentChange?.(agentSlug);
  renderShell();
  void resumeOpenJob();

  return {
    setSelection(selection) {
      selectedBlockId = selection.blockId;
      selectedBlockType = selection.blockType;
      scope = selection.scope;
      renderShell();
    },
    setWorking(working) {
      setWorkingState(working);
    },
    setShelved(shelved) {
      host.classList.toggle('ai-panel--shelved', shelved);
    },
    isWorking() {
      return busy;
    },
    dispose() {
      abort?.abort();
      host.replaceChildren();
      host.classList.remove('ai-panel', 'ai-panel--working', 'ai-panel--shelved');
    }
  };
}
