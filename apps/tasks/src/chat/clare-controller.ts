import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';
import { scheduleDiffFromMutation, scheduleGhostWeek, type ScheduleDiffItem } from '@/domain/schedule-diff';
import type { AgentMutation } from '@/domain/agent-mutations';
import { mutationLabel } from '@/domain/agent-mutations';
import { briefingToMarkdown, toolkitToMarkdown, type ClareBriefing } from '@/domain/clare-desk';
import {
  isBriefingProtocol,
  isProductivityProtocol,
  PRODUCTIVITY_LAUNCH_MESSAGES,
  type ClareProductivityId,
  type ClareProtocolId
} from '@/domain/clare-protocols';
import { preferredDomains } from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createHubField, createHubFilter } from '@/views/hub-kit';
import { tasksApi } from '@/services/client-api';
import { confirmChat, streamChat } from '@/services/chat-api';
import { ApiClientError } from '@/api/client';
import {
  setCalendarGhostBlocksForProposal,
  clearCalendarGhostBlocksForProposal
} from '@/views/calendar';
import type { WorkBlock } from '@/schemas/work-block';
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
  appendProductivityCard,
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

function paintScheduleGhostWeek(host: HTMLElement, diff: ScheduleDiffItem): void {
  host.replaceChildren();
  host.parentElement?.querySelector('.schedule-diff__note')?.remove();
  for (const day of scheduleGhostWeek(diff)) {
    const col = document.createElement('div');
    col.className = 'schedule-diff__day';
    col.dataset.date = day.dateKey;
    const head = document.createElement('span');
    head.className = 'schedule-diff__weekday';
    head.textContent = day.weekday;
    col.append(head);
    for (const chip of day.chips) {
      const node = document.createElement('span');
      node.className = `event-chip schedule-diff__chip schedule-diff__chip--${chip.role}`;
      node.dataset.taskId = chip.taskId;
      node.dataset.role = chip.role;
      node.title = `${chip.role}: ${chip.summary}`;
      const label = chip.summary.trim();
      node.textContent = label
        ? `${chip.role === 'from' ? '←' : '→'} ${label.length > 16 ? `${label.slice(0, 15)}…` : label}`
        : chip.role;
      col.append(node);
    }
    host.append(col);
  }
  if (diff.to == null) {
    const note = document.createElement('p');
    note.className = 'schedule-diff__note';
    note.textContent = 'Clears the due date';
    host.after(note);
  }
}

function clearActionProposalFailure(card: HTMLElement): void {
  card.querySelector('.confirm-card__failure')?.remove();
}

function showActionProposalFailure(card: HTMLElement, message: string): void {
  clearActionProposalFailure(card);
  const note = el('p', 'confirm-card__failure', message);
  note.setAttribute('role', 'alert');
  card.append(note);
}

/**
 * Format server-provided stale_schedule_collision details for the same Schedule Diff card.
 * Only surfaces fields that actually exist — never invents revised times.
 */
export function formatStaleScheduleCollisionDetails(details: unknown): string {
  const root =
    details && typeof details === 'object' && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;
  if (!root) {
    return 'Schedule collision — nothing was written. Ghosts kept. Review the revised schedule and confirm again.';
  }
  const revised =
    root.revised && typeof root.revised === 'object' && !Array.isArray(root.revised)
      ? (root.revised as Record<string, unknown>)
      : root;
  const lines: string[] = [
    'Schedule collision — nothing was written. This proposal is stale. Ghosts kept. The revision below is informational; create or confirm a new valid proposal before anything persists.'
  ];
  if (typeof revised.note === 'string' && revised.note.trim()) {
    lines.push(revised.note.trim());
  } else if (typeof revised.status === 'string' && revised.status.trim()) {
    lines.push(`Status: ${revised.status.trim()}`);
  }
  const conflicts = Array.isArray(revised.conflicts)
    ? revised.conflicts
    : Array.isArray(root.conflicts)
      ? root.conflicts
      : [];
  for (const raw of conflicts) {
    if (!raw || typeof raw !== 'object') continue;
    const conflict = raw as Record<string, unknown>;
    const blockId =
      (typeof conflict.temp_id === 'string' && conflict.temp_id) ||
      (typeof conflict.block_id === 'string' && conflict.block_id) ||
      (typeof conflict.id === 'string' && conflict.id) ||
      (typeof conflict.title === 'string' && conflict.title) ||
      'block';
    const reason =
      (typeof conflict.reason === 'string' && conflict.reason) ||
      (typeof conflict.message === 'string' && conflict.message) ||
      'conflicts with calendar';
    lines.push(`Conflict: ${blockId} — ${reason}`);
  }
  // Production detectStaleScheduleCollisions returns status/note/conflicts/hard_busy —
  // not invented suggested_start/end. Only render hard_busy when the server sent it.
  const hardBusy = Array.isArray(revised.hard_busy)
    ? revised.hard_busy
    : Array.isArray(root.hard_busy)
      ? root.hard_busy
      : [];
  for (const raw of hardBusy.slice(0, 6)) {
    if (!raw || typeof raw !== 'object') continue;
    const busy = raw as Record<string, unknown>;
    const title =
      (typeof busy.title === 'string' && busy.title) ||
      (typeof busy.kind === 'string' && busy.kind) ||
      'busy';
    const start =
      typeof busy.start === 'number'
        ? `${String(Math.floor(busy.start / 60)).padStart(2, '0')}:${String(busy.start % 60).padStart(2, '0')}`
        : typeof busy.start_time === 'string'
          ? busy.start_time
          : '';
    const end =
      typeof busy.end === 'number'
        ? `${String(Math.floor(busy.end / 60)).padStart(2, '0')}:${String(busy.end % 60).padStart(2, '0')}`
        : typeof busy.end_time === 'string'
          ? busy.end_time
          : '';
    const when = [start, end].filter(Boolean).join('–');
    lines.push(when ? `Hard busy: ${title} (${when})` : `Hard busy: ${title}`);
  }
  if (hardBusy.length > 6) {
    lines.push(`Hard busy: +${hardBusy.length - 6} more`);
  }
  return lines.join('\n');
}

function appendActionProposalCard(
  root: ParentNode,
  proposal: { intent?: string; writes?: Array<{ path?: string; mode?: string; diff?: string }> },
  pendingId: string | null,
  onSaved: () => void
): void {
  const list = root.querySelector('#chat-messages');
  if (!list) return;
  const card = el('li', 'record-proposal action-proposal confirm-card');
  card.dataset.state = 'ready';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed action'));
  card.append(
    el(
      'h3',
      'page-header__title',
      typeof proposal.intent === 'string' && proposal.intent.trim()
        ? proposal.intent.trim()
        : 'Proposed durable write'
    )
  );
  const writes = Array.isArray(proposal.writes) ? proposal.writes : [];
  if (writes.length) {
    const diffs = el('ul', 'hub-chips');
    for (const write of writes.slice(0, 8)) {
      diffs.append(
        el(
          'span',
          'chip chip--muted',
          typeof write.diff === 'string' && write.diff.trim()
            ? write.diff.trim()
            : String(write.path ?? 'write')
        )
      );
    }
    card.append(diffs);
  }
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost record-proposal__discard', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary record-proposal__confirm', 'Confirm');
  confirm.type = 'button';

  const setActionButtons = (busy: boolean, confirmLabel = 'Confirm') => {
    setConfirmBusy(confirm, busy, confirmLabel);
    discard.disabled = busy;
    discard.textContent = busy ? 'Discarding…' : 'Discard';
  };

  discard.addEventListener('click', () => {
    if (card.dataset.state === 'submitting') return;
    if (!pendingId) {
      card.dataset.state = 'discarded';
      card.remove();
      return;
    }
    clearActionProposalFailure(card);
    const previousConfirm = confirm.textContent || 'Confirm';
    card.dataset.state = 'submitting';
    setActionButtons(true);
    void (async () => {
      try {
        await confirmChat({ kind: 'action_dismiss', id: pendingId, slug: 'clare' });
        card.dataset.state = 'discarded';
        card.remove();
      } catch (err) {
        card.dataset.state = 'failed';
        setActionButtons(false, previousConfirm);
        const message =
          err instanceof Error ? err.message : 'Discard failed. The proposal is still available.';
        showActionProposalFailure(card, message);
        showChatError(root, message);
      }
    })();
  });

  confirm.addEventListener('click', async () => {
    if (card.dataset.state === 'submitting') return;
    if (!pendingId) {
      showChatError(root, 'That proposal has no pending id. Discard and ask again.');
      return;
    }
    const previous = confirm.textContent || 'Confirm';
    clearActionProposalFailure(card);
    card.dataset.state = 'submitting';
    setActionButtons(true);
    try {
      // Server treats pending id as authoritative; do not send a candidate that
      // could be mistaken for execution authority if the id were missing.
      await confirmChat({
        kind: 'action',
        id: pendingId,
        slug: 'clare'
      });
      card.dataset.state = 'confirmed';
      appendSavedCard(card);
      onSaved();
    } catch (err) {
      card.dataset.state = 'failed';
      setActionButtons(false, previous);
      const message =
        err instanceof Error ? err.message : 'Confirming that action failed. You can try again.';
      showActionProposalFailure(card, message);
      showChatError(root, message);
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
  if (mutation.kind === 'task_update' && 'due_date' in (mutation.patch ?? {})) {
    const ghost = document.createElement('div');
    ghost.className = 'schedule-diff';
    ghost.setAttribute('aria-label', 'Proposed schedule change');
    const label = document.createElement('p');
    label.className = 'schedule-diff__label';
    label.textContent = 'Proposed schedule';
    const row = document.createElement('p');
    row.className = 'schedule-diff__row';
    row.textContent = `… → ${mutation.patch.due_date == null ? 'unscheduled' : String(mutation.patch.due_date)}`;
    const weekHost = document.createElement('div');
    weekHost.className = 'schedule-diff__week';
    ghost.append(label, row, weekHost);
    paintScheduleGhostWeek(weekHost, {
      taskId: mutation.task_id,
      from: null,
      to: mutation.patch.due_date == null ? null : String(mutation.patch.due_date),
      summary: mutation.summary
    });
    card.append(ghost);
    void tasksApi.getTask(mutation.task_id).then((task) => {
      const diff = scheduleDiffFromMutation(mutation, task?.due_date ?? null);
      if (!diff) {
        ghost.remove();
        return;
      }
      row.textContent = `${diff.from ?? 'unscheduled'} → ${diff.to ?? 'unscheduled'}`;
      paintScheduleGhostWeek(weekHost, diff);
    });
  }
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


/** Resolve Confirm accept paths and reject anything outside this proposal's write set. */
export function assertAcceptPathsForProposal(
  accept: unknown,
  allowedWritePaths?: ReadonlySet<string> | null
): string[] {
  if (!Array.isArray(accept)) return [];
  const paths = accept
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const row = item as { write_path?: string; path?: string; id?: string };
      if (typeof row.write_path === 'string' && row.write_path.trim()) return row.write_path.trim();
      if (typeof row.path === 'string' && row.path.trim()) return row.path.trim();
      if (typeof row.id === 'string' && row.id.trim()) return row.id.trim();
      return '';
    })
    .filter(Boolean);
  if (allowedWritePaths && paths.length) {
    for (const path of paths) {
      if (!allowedWritePaths.has(path)) {
        throw new Error(`Write path is not part of this proposal: ${path}`);
      }
    }
  }
  return paths;
}

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
  /** True while a Tasks productivity workflow is in flight via /api/chat. */
  let productivityActive = false;
  /** Last action_proposal id — Confirm Selected/All bind here, not free-text. */
  let lastPendingActionId: string | null = null;

  const input = () => root.querySelector<HTMLTextAreaElement>('#chat-input');
  const currentAgent = () => agentBySlug(selectedSlug);

  function useChatRuntime(): boolean {
    return (
      selectedSlug === 'clare' &&
      (productivityActive || isProductivityProtocol(selectedProtocolId))
    );
  }

  function chatHistory() {
    return collectRecentThread(root).map((entry) => ({
      role: entry.role,
      content: entry.text
    }));
  }

  /** Drop the just-appended user turn so it is not duplicated in history. */
  function chatHistoryForSend(currentText: string) {
    const all = chatHistory();
    const last = all[all.length - 1];
    if (last?.role === 'user' && last.content === currentText) return all.slice(0, -1);
    return all;
  }

  async function confirmPendingAction(
    pendingId: string,
    accept?: unknown,
    options: { dismiss?: boolean; allowedWritePaths?: ReadonlySet<string> } = {}
  ): Promise<void> {
    const id = typeof pendingId === 'string' ? pendingId.trim() : '';
    if (!id) {
      throw new Error('This card has no proposal id. Re-run the protocol.');
    }
    const resolvePaths = (value: unknown): string[] => assertAcceptPathsForProposal(value, options.allowedWritePaths);
    try {
      if (options.dismiss) {
        await confirmChat({ kind: 'action_dismiss', id, slug: 'clare' });
        if (lastPendingActionId === id) lastPendingActionId = null;
        return;
      }
      const paths = resolvePaths(accept);
      await confirmChat({
        kind: 'action',
        id,
        slug: 'clare',
        ...(paths.length ? { accept: paths } : {})
      });
      if (lastPendingActionId === id) lastPendingActionId = null;
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Confirm failed. You can try again.';
      if (err instanceof ApiClientError && err.code === 'stale_schedule_collision') {
        message = formatStaleScheduleCollisionDetails(err.details);
        showChatError(root, message);
        throw new ApiClientError(
          { code: err.code, message, details: err.details },
          err.status
        );
      }
      showChatError(root, message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  function collectAllowedWritePaths(payload: Record<string, unknown>): Set<string> {
    const allowed = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) allowed.add(value.trim());
    };
    const writes = Array.isArray(payload.writes)
      ? payload.writes
      : Array.isArray((payload.proposal as { writes?: unknown } | undefined)?.writes)
        ? ((payload.proposal as { writes: unknown[] }).writes)
        : [];
    for (const write of writes) {
      if (!write || typeof write !== 'object') continue;
      add((write as { path?: string }).path);
      add((write as { write_path?: string }).write_path);
    }
    const blocks = Array.isArray(payload.blocks)
      ? payload.blocks
      : Array.isArray(payload.proposed)
        ? payload.proposed
        : [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      add((block as { write_path?: string }).write_path);
      add((block as { path?: string }).path);
      add((block as { id?: string }).id);
    }
    return allowed;
  }

  function paintProductivityCard(
    type: string,
    payload: Record<string, unknown>,
    title?: string,
    hint?: string
  ): void {
    // Cards bind only their own SSE pendingId — never the conversation's latest proposal.
    const cardPendingId =
      typeof payload.pendingId === 'string' && payload.pendingId.trim()
        ? payload.pendingId.trim()
        : null;
    const allowedWritePaths = collectAllowedWritePaths(payload);

    if (type === 'schedule-diff') {
      const rawBlocks = Array.isArray(payload.blocks)
        ? payload.blocks
        : Array.isArray(payload.proposed)
          ? payload.proposed
          : [];
      const ghosts = rawBlocks
        .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === 'object')
        .map((block, index) => {
          const id =
            typeof block.id === 'string' && block.id
              ? block.id
              : typeof block.temp_id === 'string' && block.temp_id
                ? block.temp_id
                : `ghost_${index}`;
          return {
            schema_version: 1,
            id,
            task_id: typeof block.task_id === 'string' ? block.task_id : null,
            project_id: typeof block.project_id === 'string' ? block.project_id : null,
            title: typeof block.title === 'string' ? block.title : 'Planned work',
            date: typeof block.date === 'string' ? block.date : '',
            start_time:
              typeof block.start_time === 'string'
                ? block.start_time
                : typeof block.start === 'string'
                  ? block.start
                  : '09:00',
            duration_minutes: Number(block.duration_minutes) || 30,
            depth: block.depth === 'deep' ? 'deep' : block.depth === 'admin' ? 'admin' : 'shallow',
            status: 'proposed',
            source: 'clare',
            locked: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          } satisfies WorkBlock;
        })
        .filter((block) => Boolean(block.date));
      if (cardPendingId) setCalendarGhostBlocksForProposal(cardPendingId, ghosts);
    }

    const runBoundConfirm = async (picks?: unknown, dismiss = false): Promise<void> => {
      if (!cardPendingId) {
        throw new Error('This card has no proposal id. Re-run the protocol.');
      }
      await confirmPendingAction(cardPendingId, picks, {
        dismiss,
        allowedWritePaths
      });
      if (type === 'schedule-diff') clearCalendarGhostBlocksForProposal(cardPendingId);
    };

    appendProductivityCard(root, type, {
      ...payload,
      pendingId: cardPendingId ?? undefined,
      title,
      hint,
      onConfirmSelected: (picks: unknown) => runBoundConfirm(picks),
      onConfirmAll: (picks: unknown) => runBoundConfirm(picks),
      onConfirm: (picks: unknown) => runBoundConfirm(picks),
      onDiscard: () => runBoundConfirm(undefined, true),
      onPreview: () => {},
      onClose: (payloadClose: unknown) => runBoundConfirm(payloadClose)
    });
  }

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
        {
          const raw = event as {
            type?: string;
            card_type?: string;
            kind?: string;
            payload?: Record<string, unknown>;
            options?: Record<string, unknown>;
            title?: string;
            hint?: string;
          };
          if (
            raw.type === 'productivity_card' ||
            raw.type === 'card' ||
            (typeof raw.card_type === 'string' && raw.card_type)
          ) {
            stopWait();
            const type =
              typeof raw.card_type === 'string'
                ? raw.card_type
                : typeof raw.kind === 'string'
                  ? raw.kind
                  : '';
            if (type) {
              paintProductivityCard(
                type,
                {
                  ...(typeof raw.payload === 'object' && raw.payload ? raw.payload : {}),
                  ...(typeof raw.options === 'object' && raw.options ? raw.options : {})
                },
                raw.title,
                raw.hint
              );
            }
            continue;
          }
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

  async function submitChat(text: string, protocolId?: string): Promise<void> {
    const mine = ++turn;
    sending = true;
    productivityActive = true;
    setChatBusy(root, true);
    waitIndex = 0;
    showWaitLine();
    waitTimer = window.setInterval(showWaitLine, STATUS_ROTATE_MS);

    let voiceBubble: HTMLElement | null = null;
    let voiceText = '';

    try {
      for await (const event of streamChat({
        message: text,
        history: chatHistoryForSend(text),
        priorAgentSlug: 'clare',
        protocolId: protocolId || (isProductivityProtocol(selectedProtocolId) ? selectedProtocolId : undefined)
      })) {
        if (mine !== turn) return;
        if (event.type === 'status') {
          showWaitLine();
          continue;
        }
        if (event.type === 'text' && typeof event.delta === 'string' && event.delta) {
          stopWait();
          voiceText += event.delta;
          if (!voiceBubble) {
            voiceBubble = appendMessage(root, {
              role: 'assistant',
              text: voiceText,
              agent: 'clare'
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
            id: typeof event.id === 'string' ? event.id : undefined,
            heading: typeof event.heading === 'string' ? event.heading : undefined,
            steps: Array.isArray(event.steps) ? (event.steps as string[]) : [],
            current: Number.isFinite(event.current) ? Number(event.current) : 0
          });
          continue;
        }
        if (event.type === 'choice') {
          stopWait();
          appendChoiceCard(root, {
            title: typeof event.title === 'string' ? event.title : undefined,
            hint: typeof event.hint === 'string' ? event.hint : undefined,
            choices: Array.isArray(event.choices)
              ? (event.choices as Array<{ id: string; label: string; detail?: string }>)
              : [],
            multi: Boolean(event.multi),
            confirmLabel: typeof event.confirmLabel === 'string' ? event.confirmLabel : undefined,
            onConfirm: (picks) => {
              const labels = picks.map((pick) => pick.label).filter(Boolean);
              if (!labels.length) return;
              void send(labels.join(', '));
            },
            onDismiss: () => {}
          });
          continue;
        }
        if (event.type === 'action_proposal') {
          stopWait();
          const pendingId =
            typeof event.id === 'string' && event.id.trim() ? event.id.trim() : null;
          if (pendingId) lastPendingActionId = pendingId;
          appendActionProposalCard(
            root,
            (event.proposal as {
              intent?: string;
              writes?: Array<{ path?: string; mode?: string; diff?: string }>;
            }) ?? {},
            pendingId,
            () => {
              lastPendingActionId = null;
            }
          );
          continue;
        }
        {
          const raw = event as {
            type?: string;
            card_type?: string;
            kind?: string;
            payload?: Record<string, unknown>;
            options?: Record<string, unknown>;
            title?: string;
            hint?: string;
          };
          if (
            raw.type === 'productivity_card' ||
            raw.type === 'card' ||
            (typeof raw.card_type === 'string' && raw.card_type)
          ) {
            stopWait();
            const type =
              typeof raw.card_type === 'string'
                ? raw.card_type
                : typeof raw.kind === 'string'
                  ? raw.kind
                  : '';
            if (type) {
              paintProductivityCard(
                type,
                {
                  ...(typeof raw.payload === 'object' && raw.payload ? raw.payload : {}),
                  ...(typeof raw.options === 'object' && raw.options ? raw.options : {})
                },
                raw.title,
                raw.hint
              );
            }
            continue;
          }
        }
        if (event.type === 'error') {
          const code = typeof event.code === 'string' ? event.code : '';
          throw new Error(
            code === 'turn_incomplete'
              ? `${currentAgent().firstName} stopped mid-turn. Try again.`
              : `${currentAgent().firstName} could not reply.`
          );
        }
      }
      if (mine !== turn) return;
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
      if (selectedSlug === 'clare' && isProductivityProtocol(selectedProtocolId)) {
        const launch = PRODUCTIVITY_LAUNCH_MESSAGES[selectedProtocolId];
        appendMessage(root, { role: 'user', text: launch });
        await submitChat(launch, selectedProtocolId);
        return;
      }
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
    if (useChatRuntime()) {
      await submitChat(
        text,
        isProductivityProtocol(selectedProtocolId) ? selectedProtocolId : undefined
      );
      return;
    }
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
    if (isProductivityProtocol(id)) {
      productivityActive = true;
      if (text) {
        void send(text);
        return;
      }
      const launch = PRODUCTIVITY_LAUNCH_MESSAGES[id as ClareProductivityId];
      appendMessage(root, { role: 'user', text: launch });
      void submitChat(launch, id);
      return;
    }
    productivityActive = false;
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
    productivityActive = false;
    lastPendingActionId = null;
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
    productivityActive = false;
    lastPendingActionId = null;
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
