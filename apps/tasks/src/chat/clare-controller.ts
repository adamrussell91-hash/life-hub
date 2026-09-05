import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';
import type { AgentMutation } from '@/domain/agent-mutations';
import { mutationLabel } from '@/domain/agent-mutations';
import { briefingToMarkdown, toolkitToMarkdown, type ClareBriefing } from '@/domain/clare-desk';
import { isBriefingProtocol, type ClareProtocolId } from '@/domain/clare-protocols';
import { preferredDomains } from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createHubField, createHubFilter } from '@/views/hub-kit';
import { tasksApi } from '@/services/client-api';
import { agentBySlug, DEFAULT_AGENT_SLUG, type ChatAgentSlug } from '@/chat/agents';
import { paintProtocolTrays } from '@/chat/build-chat-view';
import {
  applyAgentAccent,
  renderAgentPicker
} from '@/chat/render-agent-picker';
import { syncChatChrome, toggleChatChrome } from '@/chat/chat-chrome';
import {
  appendMessage,
  appendSavedCard,
  appendChoiceCard,
  appendPlanStatusCard,
  renderInlineMarkdown,
  setChatBusy,
  setChatUnread,
  setConfirmBusy,
  showChatError
} from '@/chat/render-chat';

const SKIP_REASONING_KEY = 'tasks-hub-clare-skip-reasoning';

export function skipReasoning(): boolean {
  return localStorage.getItem(SKIP_REASONING_KEY) === '1';
}

export function setSkipReasoning(on: boolean): void {
  localStorage.setItem(SKIP_REASONING_KEY, on ? '1' : '0');
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markActive(root: ParentNode, id: string | undefined): void {
  for (const peer of root.querySelectorAll<HTMLButtonElement>('[data-protocol-id]')) {
    const active = peer.dataset.protocolId === id;
    peer.classList.toggle('is-active', active);
    peer.setAttribute('aria-pressed', String(active));
  }
}

function syncComposer(root: ParentNode, slug: ChatAgentSlug): void {
  const agent = agentBySlug(slug);
  const input = root.querySelector<HTMLTextAreaElement>('#chat-input');
  if (input) input.placeholder = agent.placeholder;
  const skip = root.querySelector<HTMLElement>('.clare-prefs__skip');
  if (skip) skip.hidden = slug !== 'clare';
}

export const STATUS_ROTATE_MS = 5000;

export function collectRecentThread(
  root: ParentNode
): Array<{ role: 'user' | 'assistant'; text: string }> {
  const list = root.querySelector('#chat-messages');
  if (!list) return [];
  const out: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  for (const node of list.querySelectorAll<HTMLElement>('.chat-message')) {
    if (node.classList.contains('chat-message--status')) continue;
    const role = node.classList.contains('chat-message--user')
      ? 'user'
      : node.classList.contains('chat-message--assistant')
        ? 'assistant'
        : null;
    if (!role) continue;
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) continue;
    out.push({ role, text: text.slice(0, 500) });
  }
  return out.slice(-12);
}

function appendProposalCard(
  root: ParentNode,
  proposal: ClareProposal,
  frameworks: FrameworkEntry[],
  onSaved: () => void
): void {
  const list = root.querySelector('#chat-messages');
  if (!list) return;
  const card = el('li', 'record-proposal confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h3', 'page-header__title', proposal.title));
  const meta = el('div', 'hub-chips');
  meta.append(
    el('span', 'chip', proposal.framework_name),
    el('span', 'chip chip--muted', proposal.domain),
    el('span', 'chip chip--muted', proposal.priority)
  );
  if (proposal.dump_kind === 'communication') {
    meta.append(el('span', 'chip chip--muted', 'comms'));
  }
  if (proposal.due_date) {
    meta.append(el('span', 'chip chip--muted', formatDisplayDate(proposal.due_date)));
  }
  card.append(meta);
  if (!skipReasoning()) {
    card.append(el('p', 'record-proposal__reasoning', proposal.reasoning));
  }
  if (proposal.calibration_note) {
    card.append(el('p', 'clare-bubble__note', proposal.calibration_note));
  }

  const fields = el('div', 'record-proposal__fields');
  const estimateRow = el('div', 'clare-estimate');
  estimateRow.append(el('span', 'chip chip--muted', `Clare: ${proposal.proposed_minutes}m`));
  const minutes = createHubField({
    ariaLabel: `Your estimate for ${proposal.title} (minutes)`,
    type: 'number',
    min: '5',
    step: '5',
    value: String(proposal.suggested_accepted_minutes)
  });
  estimateRow.append(el('span', 'clare-estimate__label', 'Your estimate'), minutes.el, el('span', 'clare-estimate__unit', 'min'));
  const framework = createHubFilter({
    key: 'Framework',
    label: `Framework for ${proposal.title}`,
    value: proposal.framework_id,
    defaultValue: proposal.framework_id,
    options: frameworks.map((fw) => ({ value: fw.id, label: fw.name }))
  });
  fields.append(estimateRow, framework.el);
  card.append(fields);

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost record-proposal__discard', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary record-proposal__confirm', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => card.remove());
  confirm.addEventListener('click', async () => {
    const previous = confirm.textContent || 'Confirm';
    setConfirmBusy(confirm, true);
    discard.disabled = true;
    try {
      await tasksApi.acceptClareBatch([
        {
          proposal,
          accepted_minutes: Number(minutes.input.value) || proposal.proposed_minutes,
          framework_id: framework.getValue() || proposal.framework_id
        }
      ]);
      appendSavedCard(card);
      onSaved();
    } catch (err) {
      setConfirmBusy(confirm, false, previous);
      discard.disabled = false;
      showChatError(root, err instanceof Error ? err.message : 'Saving that task failed. You can try again.');
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  list.append(card);
  list.scrollTop = list.scrollHeight;
}

function appendMutationCard(
  root: ParentNode,
  mutation: AgentMutation,
  agent: ChatAgentSlug,
  onSaved: () => void
): void {
  const list = root.querySelector('#chat-messages');
  if (!list) return;
  const card = el('li', 'record-proposal confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h3', 'page-header__title', mutation.summary));
  const meta = el('div', 'hub-chips');
  meta.append(el('span', 'chip', mutation.kind), el('span', 'chip chip--muted', mutationLabel(mutation)));
  card.append(meta);
  if (mutation.kind === 'repo_file') {
    card.append(el('p', 'record-proposal__reasoning', mutation.path));
  }
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost record-proposal__discard', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary record-proposal__confirm', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => card.remove());
  confirm.addEventListener('click', async () => {
    const previous = confirm.textContent || 'Confirm';
    setConfirmBusy(confirm, true);
    discard.disabled = true;
    try {
      const { results } = await tasksApi.applyAgentMutations([mutation]);
      const row = results[0];
      if (row && !row.ok) throw new Error(row.note);
      appendSavedCard(card);
      onSaved();
    } catch (err) {
      setConfirmBusy(confirm, false, previous);
      discard.disabled = false;
      showChatError(root, err instanceof Error ? err.message : 'Applying that change failed.');
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  list.append(card);
  list.scrollTop = list.scrollHeight;
  void agent;
}

function paintDump(
  root: ParentNode,
  result: ClareDumpResult,
  frameworks: FrameworkEntry[],
  onSaved: () => void,
  onDuplicateFollowUp?: (reply: string) => void | Promise<void>,
  options: { skipVoice?: boolean } = {}
): void {
  const agent = result.agent;
  if (!options.skipVoice) {
    appendMessage(root, { role: 'assistant', text: result.voice, agent });
  }
  if (result.toolkit) {
    appendMessage(root, { role: 'assistant', text: toolkitToMarkdown(result.toolkit), agent });
  }
  if (result.questions.length) {
    appendMessage(root, {
      role: 'assistant',
      agent,
      text: result.questions.map((question) => `- ${question}`).join('\n')
    });
    const hasDuplicateAsk = result.questions.some((question) =>
      /is already on the board/i.test(question)
    );
    if (hasDuplicateAsk) {
      const list = root.querySelector('#chat-messages');
      if (list) {
        const row = el('li', 'chat-message chat-message--assistant chat-message--actions');
        row.setAttribute('data-agent', agent);
        const actions = el('div', 'confirm-card__actions');
        const leave = el('button', 'btn btn--ghost', 'Leave it');
        leave.type = 'button';
        const makeNew = el('button', 'btn btn--primary', 'Make a new one');
        makeNew.type = 'button';
        leave.addEventListener('click', () => {
          leave.disabled = true;
          makeNew.disabled = true;
          void onDuplicateFollowUp?.('Leave it');
        });
        makeNew.addEventListener('click', () => {
          leave.disabled = true;
          makeNew.disabled = true;
          void onDuplicateFollowUp?.('Make a new one');
        });
        actions.append(leave, makeNew);
        row.append(actions);
        list.append(row);
        list.scrollTop = list.scrollHeight;
      }
    }
  }
  if (result.notes.length) {
    appendMessage(root, { role: 'assistant', text: `Parked: ${result.notes.join(' · ')}`, agent });
  }
  for (const proposal of result.proposals) {
    appendProposalCard(root, proposal, frameworks, onSaved);
  }
  for (const mutation of result.mutations ?? []) {
    appendMutationCard(root, mutation, agent, onSaved);
  }
}

export type ClareChatController = {
  start: () => Promise<void>;
  pickProtocol: (id: string) => void;
  selectAgent: (slug: ChatAgentSlug) => void;
  newChat: () => Promise<void>;
  send: (text?: string) => Promise<void>;
};

export function createClareChatController({
  root,
  isVisible,
  onUnreadChange
}: {
  root: ParentNode;
  isVisible?: () => boolean;
  onUnreadChange?: (unread: boolean) => void;
}): ClareChatController {
  let selectedProtocolId: string | undefined;
  let selectedSlug: ChatAgentSlug = DEFAULT_AGENT_SLUG;
  let frameworks: FrameworkEntry[] = [];
  let started = false;
  let sending = false;
  let turn = 0;
  let waitTimer: number | null = null;
  let waitIndex = 0;
  let statusBubble: HTMLElement | null = null;

  const input = () => root.querySelector<HTMLTextAreaElement>('#chat-input');
  const currentAgent = () => agentBySlug(selectedSlug);

  function paintRoster(): void {
    const agent = currentAgent();
    applyAgentAccent(root, selectedSlug);
    syncComposer(root, selectedSlug);
    renderAgentPicker(root, {
      selectedSlug,
      onSelect: selectAgent
    });
    paintProtocolTrays(root, {
      canEyebrow: agent.canEyebrow,
      canLabel: `${agent.firstName} protocols`,
      protocols: agent.protocols,
      stuckEyebrow: agent.stuckEyebrow,
      stuckLabel: `${agent.firstName} ADHD tools`,
      stuckProtocols: agent.stuckProtocols,
      onPick: pickProtocol
    });
    markActive(root, selectedProtocolId);
  }

  function clearThread(): void {
    root.querySelector('#chat-messages')?.replaceChildren();
    showChatError(root, '');
    syncChatChrome(root);
  }

  function markUnreadIfHidden(): void {
    if (isVisible?.()) {
      onUnreadChange?.(false);
      return;
    }
    onUnreadChange?.(true);
    setChatUnread(document, true);
  }

  function stopWait(): void {
    if (waitTimer !== null) {
      window.clearInterval(waitTimer);
      waitTimer = null;
    }
    statusBubble?.remove();
    statusBubble = null;
  }

  function showWaitLine(): void {
    const lines = currentAgent().waitLines;
    const line = lines[waitIndex % lines.length];
    waitIndex += 1;
    if (statusBubble) {
      const body = statusBubble.querySelector('.chat-message__body');
      if (body) body.textContent = line;
      return;
    }
    statusBubble = appendMessage(root, { role: 'status', text: line });
    statusBubble?.classList.add('canvas-status');
    statusBubble?.setAttribute('role', 'status');
    statusBubble?.setAttribute('aria-live', 'polite');
  }

  async function withWait<T>(work: () => Promise<T>): Promise<T | undefined> {
    const mine = ++turn;
    sending = true;
    setChatBusy(root, true);
    waitIndex = 0;
    showWaitLine();
    waitTimer = window.setInterval(showWaitLine, STATUS_ROTATE_MS);
    try {
      const result = await work();
      if (mine !== turn) return undefined;
      return result;
    } catch (err) {
      if (mine !== turn) return undefined;
      stopWait();
      showChatError(root, err instanceof Error ? err.message : `${currentAgent().firstName} could not reply.`);
      return undefined;
    } finally {
      if (mine === turn) {
        stopWait();
        sending = false;
        setChatBusy(root, false);
      }
    }
  }

  async function loadBriefing(protocolId: ClareProtocolId): Promise<void> {
    const briefing = await withWait(() => tasksApi.briefWithClare(protocolId));
    if (!briefing) return;
    appendBriefing(briefing);
    markUnreadIfHidden();
  }

  function appendBriefing(briefing: ClareBriefing): void {
    appendMessage(root, { role: 'assistant', text: briefingToMarkdown(briefing), agent: 'clare' });
  }

  async function submitDump(text: string): Promise<void> {
    const recent_thread = collectRecentThread(root);
    const body = {
      text,
      domain: preferredDomains()[0] ?? 'teaching',
      protocol_id: selectedProtocolId as ClareProtocolId | undefined,
      recent_thread,
      agent_slug: selectedSlug
    };
    const mine = ++turn;
    sending = true;
    setChatBusy(root, true);
    waitIndex = 0;
    showWaitLine();
    waitTimer = window.setInterval(showWaitLine, STATUS_ROTATE_MS);

    let voiceBubble: HTMLElement | null = null;
    let voiceText = '';
    let result: ClareDumpResult | null = null;
    let streamedVoice = false;

    try {
      for await (const event of tasksApi.streamDumpWithClare(body)) {
        if (mine !== turn) return;
        if (event.type === 'status') {
          showWaitLine();
          continue;
        }
        if (event.type === 'text' && typeof event.delta === 'string' && event.delta) {
          stopWait();
          streamedVoice = true;
          voiceText += event.delta;
          if (!voiceBubble) {
            voiceBubble = appendMessage(root, {
              role: 'assistant',
              text: voiceText,
              agent: selectedSlug
            });
          } else {
            const bodyEl = voiceBubble.querySelector('.chat-message__body');
            if (bodyEl instanceof HTMLElement) {
              renderInlineMarkdown(bodyEl, voiceText, { multiline: true });
            }
            const list = root.querySelector('#chat-messages');
            if (list) list.scrollTop = list.scrollHeight;
          }
          continue;
        }
        if (event.type === 'plan_status') {
          appendPlanStatusCard(root, {
            id: event.id,
            heading: event.heading,
            steps: Array.isArray(event.steps) ? event.steps : [],
            current: Number.isFinite(event.current) ? Number(event.current) : 0
          });
          continue;
        }
        if (event.type === 'choice') {
          stopWait();
          appendChoiceCard(root, {
            title: event.title,
            hint: event.hint,
            choices: Array.isArray(event.choices) ? event.choices : [],
            multi: Boolean(event.multi),
            confirmLabel: event.confirmLabel,
            onConfirm: (picks) => {
              const labels = picks.map((pick) => pick.label).filter(Boolean);
              if (!labels.length) return;
              void send(labels.join(', '));
            },
            onDismiss: () => {}
          });
          continue;
        }
        if (event.type === 'dump_result' && event.result) {
          result = event.result;
          continue;
        }
        if (event.type === 'error') {
          throw new Error(event.message || `${currentAgent().firstName} could not reply.`);
        }
      }
      if (mine !== turn) return;
      if (!result) throw new Error(`${currentAgent().firstName} returned an empty dump.`);
      paintDump(
        root,
        result,
        frameworks,
        () => {
          const field = input();
          if (field) field.value = '';
        },
        (reply) => send(reply),
        { skipVoice: streamedVoice }
      );
      markUnreadIfHidden();
    } catch (err) {
      if (mine !== turn) return;
      stopWait();
      showChatError(
        root,
        err instanceof Error ? err.message : `${currentAgent().firstName} could not reply.`
      );
    } finally {
      if (mine === turn) {
        stopWait();
        sending = false;
        setChatBusy(root, false);
      }
    }
  }

  async function send(raw?: string): Promise<void> {
    const field = input();
    const text = (raw ?? field?.value ?? '').trim();
    collapseTools();
    if (!text) {
      if (selectedSlug !== 'clare') {
        await submitDump(
          selectedProtocolId
            ? `Run protocol ${selectedProtocolId}`
            : 'Give me a sitrep from my inbox and what matters.'
        );
        return;
      }
      if (selectedProtocolId && isBriefingProtocol(selectedProtocolId as ClareProtocolId)) {
        await loadBriefing(selectedProtocolId as ClareProtocolId);
        return;
      }
      await loadBriefing('morning-sweep');
      return;
    }
    appendMessage(root, { role: 'user', text });
    if (field) field.value = '';
    await submitDump(text);
  }

  function collapseTools(): void {
    if (!(root instanceof HTMLElement)) return;
    if (root.dataset.chromeExpanded === 'true') {
      delete root.dataset.chromeExpanded;
      syncChatChrome(root);
    }
  }

  function pickProtocol(id: string): void {
    selectedProtocolId = id;
    markActive(root, id);
    collapseTools();
    const text = input()?.value.trim() ?? '';
    if (selectedSlug !== 'clare') {
      void send(text || `Run protocol ${id}`);
      return;
    }
    if (text) {
      void send(text);
      return;
    }
    if (isBriefingProtocol(id as ClareProtocolId)) {
      void loadBriefing(id as ClareProtocolId);
      return;
    }
    input()?.focus();
    appendMessage(root, {
      role: 'assistant',
      agent: 'clare',
      text: 'Dump the thing first — I cannot shrink a blank page.'
    });
  }

  function selectAgent(slug: ChatAgentSlug): void {
    if (slug === selectedSlug) return;
    selectedSlug = slug;
    selectedProtocolId = undefined;
    paintRoster();
    const empty = !root.querySelector('#chat-messages')?.childElementCount;
    if (empty) void newChat();
  }

  async function newChat(): Promise<void> {
    turn += 1;
    stopWait();
    sending = false;
    setChatBusy(root, false);
    selectedProtocolId = undefined;
    markActive(root, undefined);
    clearThread();
    paintRoster();
    if (selectedSlug !== 'clare') {
      await submitDump('Give me a sitrep from my inbox and what matters right now.');
      return;
    }
    await loadBriefing('morning-sweep');
  }

  function bindChrome(): void {
    root.querySelector('#chat-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void send();
    });
    input()?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      void send();
    });
    root.querySelector('#chat-new')?.addEventListener('click', () => {
      void newChat();
    });
    root.querySelector('#chat-tools')?.addEventListener('click', () => {
      toggleChatChrome(root);
    });
    const skip = root.querySelector<HTMLInputElement>('#chat-skip-reasoning');
    if (skip) {
      skip.checked = skipReasoning();
      skip.addEventListener('change', () => setSkipReasoning(skip.checked));
    }
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    bindChrome();
    paintRoster();
    const templates = await tasksApi.listTemplates();
    frameworks = templates.frameworks as FrameworkEntry[];
    await newChat();
  }

  return { start, pickProtocol, selectAgent, newChat, send };
}
