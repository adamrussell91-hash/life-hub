import {
  appendMessage,
  appendActionProposal,
  appendChoiceCard,
  appendCnPatchProposal,
  appendRecordProposal,
  appendRecordSaved,
  appendSourcesCard,
  isChatPinned,
  renderChatMarkdown,
  setChatBusy,
  showChatError
} from './render-chat.js';
import { applyAgentAvatarToBubble, renderAgentHero, renderAgentPicker, renderChatEmpty } from './render-agent-picker.js';
import { bindChatComposer } from './chat-composer.js';
import { syncChatChrome, toggleChatChrome } from './chat-chrome.js';
import { renderProtocolPills } from './render-protocol-pills.js';
import { findProtocol, isAgentStatusLine, pickStatusLine } from './agent-protocols.js';
import { isHammondAuditTrigger, nextAuditPhase } from './hammond-audit.js';
import {
  loadStoredAuditSession,
  removeStoredAuditSession,
  saveStoredAuditSession
} from './hammond-audit-session-storage.js';
import { takeCompletedChatBlocks } from '../core/chat-blocks.js';
import { HISTORY_WINDOW_MS, keepNewestHistory } from '../core/chat-history.js';
import { shouldNudgeUnsavedWorkoutPlan } from '../core/workout-plan-detect.js';
import {
  MISSING_LOG_NUDGE_TEXT,
  shouldNudgeMissingLogEntry
} from '../core/log-finalize-detect.js';

const STATUS_BUBBLE_CLASS = 'chat-message--status';
const LIBRARY_SAVE_NUDGE_TEXT = 'That stayed in chat only — ask me to lock it onto Fitness so you get a Confirm card.';
const EMPTY_TURN_RECOVERY = 'That reply got cut off before it finished (usually a timeout while looking things up). Send the same message again and I’ll continue.';
const CANCEL_AUDIT_RE = /cancel audit|stop audit/i;
const SKIP_INTAKE_RE = /skip intake|continue audit|\bgo on\b/i;
export const VERA_SESSION_FLUSH_MESSAGE = "That's enough for today — record the session if there is one.";

// FakeElement (used in unit tests) only models `className` as a plain string, so
// classList is used when real DOM elements provide it and this string fallback
// covers the test harness without changing its shape.
function addStatusClass(element) {
  if (!element) return;
  if (element.classList?.add) {
    element.classList.add(STATUS_BUBBLE_CLASS);
  } else {
    const classes = (element.className ?? '').split(/\s+/).filter(Boolean);
    if (!classes.includes(STATUS_BUBBLE_CLASS)) {
      classes.push(STATUS_BUBBLE_CLASS);
      element.className = classes.join(' ');
    }
  }
  const body = element.querySelector?.('.chat-message__body') ?? element;
  if (body?.setAttribute) {
    body.setAttribute('role', 'status');
    body.setAttribute('aria-live', 'polite');
  }
}

export function createChatController({
  root,
  chatApi,
  onRecordWritten,
  now = () => Date.now(),
  getDefaultAgentSlug,
  agentColour,
  getAgentsConfig,
  isChatVisible,
  onUnreadChange,
  storage = globalThis.localStorage
}) {
  if (!root || !chatApi) throw new TypeError('Chat controller dependencies are unavailable');

  let sending = false;
  let transcript = [];
  let lastAgentSlug = null;
  let lastAgentAt = 0;
  let pinnedAgentSlug = null;
  let selectedProtocolId = null;
  let activeAbort = null;
  let stickToBottom = true;
  let syncJumpLatest = () => {};
  let auditSession = resumeAuditSession(storage);
  let savedMindSessionThisThread = false;
  let flushAttempted = false;
  let flushInFlight = null;

  function clearAuditSession() {
    auditSession = null;
    removeStoredAuditSession(storage);
  }

  function persistAuditSession() {
    if (auditSession) saveStoredAuditSession(storage, auditSession);
    else removeStoredAuditSession(storage);
  }

  function talkingToHammond(message) {
    if (stickyAgentSlug() === 'hammond') return true;
    return /\bhammond\b/i.test(message);
  }

  function maybeStartAuditSession(message) {
    if (auditSession) return;
    if (!isHammondAuditTrigger(message)) return;
    if (!talkingToHammond(message)) return;
    auditSession = { kind: 'cn_audit', phase: 'triage', intakeCount: 0 };
    persistAuditSession();
  }

  function advanceAuditSession(message, { governanceLogAppended = false } = {}) {
    if (!auditSession) return;
    if (CANCEL_AUDIT_RE.test(message)) {
      clearAuditSession();
      return;
    }
    const phase = auditSession.phase;
    if (phase === 'lock' && !governanceLogAppended) {
      // First mechanical required-tool gate in this codebase: lock must call
      // append_governance_log before the audit can end. Leave session on lock
      // so the next turn re-sends the lock phase contract.
      return;
    }
    const flags = (phase === 'triage' || phase === 'intake')
      ? {
          askedIntakeQuestion: true,
          skipRemainingIntake: SKIP_INTAKE_RE.test(message),
          intakeComplete: SKIP_INTAKE_RE.test(message)
        }
      : {};
    auditSession = nextAuditPhase(auditSession, flags);
    if (auditSession) persistAuditSession();
    else removeStoredAuditSession(storage);
  }

  // Prunes anything outside the memory window as a side effect, then returns a
  // bounded, API-shaped slice of what's left -- called before the new user turn
  // is added, so it only ever reflects prior turns.
  function recentHistory() {
    const cutoff = now() - HISTORY_WINDOW_MS;
    transcript = transcript.filter(entry => entry.at >= cutoff);
    return keepNewestHistory(transcript.map(({ role, content }) => ({ role, content })));
  }

  // Pinned avatar wins until another avatar is clicked. Otherwise keep talking to
  // the last agent inside the memory window, then fall back to section default.
  // An explicit name in the message still wins server-side in routeAgent.
  function stickyAgentSlug() {
    if (pinnedAgentSlug) return pinnedAgentSlug;
    if (lastAgentSlug && lastAgentSlug !== 'router' && now() - lastAgentAt <= HISTORY_WINDOW_MS) {
      return lastAgentSlug;
    }
    return getDefaultAgentSlug?.();
  }

  function paintRoster() {
    const slug = stickyAgentSlug() ?? null;
    renderAgentPicker(root, {
      selectedSlug: slug,
      onSelect: selectAgent
    });
    renderProtocolPills(root, {
      slug,
      selectedId: selectedProtocolId,
      onSelect: selectProtocol
    });
    renderChatEmpty(root, slug);
    syncChatChrome(root);
  }

  function applySelectAgent(slug) {
    if (slug !== 'hammond') clearAuditSession();
    if (slug !== pinnedAgentSlug) selectedProtocolId = null;
    pinnedAgentSlug = slug;
    lastAgentSlug = slug;
    lastAgentAt = now();
    applyAgentAccent(slug);
    paintRoster();
  }

  function selectProtocol(protocolId) {
    const slug = stickyAgentSlug();
    const pill = findProtocol(slug, protocolId);
    if (!pill) return Promise.resolve();
    if (selectedProtocolId === protocolId) {
      selectedProtocolId = null;
      paintRoster();
      return Promise.resolve();
    }
    selectedProtocolId = protocolId;
    paintRoster();
    if (sending) return Promise.resolve();
    const input = root.querySelector('#chat-input');
    const typed = input?.value.trim();
    if (input && typed) input.value = '';
    return send(typed || pill.label);
  }

  function selectAgent(slug) {
    if (!slug) return Promise.resolve();
    const leavingVera = slug !== 'vera' && (pinnedAgentSlug === 'vera' || lastAgentSlug === 'vera');
    if (leavingVera && shouldFlushVeraSession()) {
      return flushVeraSession().then(() => applySelectAgent(slug));
    }
    applySelectAgent(slug);
    return Promise.resolve();
  }

  // A stream "ending" (real text, a proposal, a rejection, or an error/abort) is
  // what should surface an unread indicator -- but only if the user isn't already
  // looking at Chat, so an open panel or the Chat section itself never flags itself.
  function maybeMarkUnread() {
    if (isChatVisible?.()) return;
    onUnreadChange?.(true);
  }

  function clearUnread() {
    onUnreadChange?.(false);
  }

  function applyAgentAccent(slug) {
    renderAgentHero(root, slug);
    renderChatEmpty(root, slug);
    syncChatChrome(root);
    if (!slug || typeof agentColour !== 'function') return;
    const panel = root.querySelector('#chat-view');
    if (!panel?.style?.setProperty) return;
    panel.style.setProperty('--agent-accent', agentColour(getAgentsConfig?.(), slug));
  }

  function syncAccent() {
    const slug = stickyAgentSlug();
    if (slug) applyAgentAccent(slug);
    paintRoster();
  }

  function remember(role, content) {
    const trimmed = content.trim();
    if (!trimmed) return;
    transcript.push({
      role,
      content: trimmed,
      at: now()
    });
  }

  function talkingToVera() {
    return (pinnedAgentSlug || lastAgentSlug) === 'vera';
  }

  function shouldFlushVeraSession() {
    if (flushAttempted) return false;
    if (!talkingToVera()) return false;
    if (savedMindSessionThisThread) return false;
    if (!transcript.some(entry => entry.role === 'assistant')) return false;
    return true;
  }

  async function waitUntilIdle() {
    while (sending) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async function flushVeraSession() {
    if (flushInFlight) return flushInFlight;
    if (!shouldFlushVeraSession()) return;
    flushAttempted = true;
    flushInFlight = send(VERA_SESSION_FLUSH_MESSAGE, { hiddenUser: true }).finally(() => {
      flushInFlight = null;
    });
    return flushInFlight;
  }

  function resetThread() {
    transcript = [];
    savedMindSessionThisThread = false;
    flushAttempted = false;
    clearAuditSession();
    lastAgentSlug = pinnedAgentSlug;
    lastAgentAt = pinnedAgentSlug ? now() : 0;
    sending = false;
    setChatBusy(root, false);
    showChatError(root, '');
    const list = root.querySelector('#chat-messages');
    list?.replaceChildren?.();
    const slug = stickyAgentSlug();
    if (slug) applyAgentAccent(slug);
    paintRoster();
    syncChatChrome(root);
    clearUnread();
  }

  function bindComposer() {
    bindChatComposer(root, {
      onSend: message => {
        if (!message || sending) return;
        void send(message);
      },
      onStop: () => {
        if (!activeAbort) return;
        try {
          activeAbort.abort('stop');
        } catch {
          /* ignore */
        }
      }
    });
  }

  function bindTools() {
    const button = root.querySelector('#chat-tools');
    if (!button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => toggleChatChrome(root));
  }

  function bindScrollLock() {
    const list = root.querySelector('#chat-messages');
    if (!list || list.dataset.scrollBound === '1') return;
    list.dataset.scrollBound = '1';

    let jumpLatest = null;
    let lastScrollTop = list.scrollTop || 0;
    let lastScrollHeight = list.scrollHeight || 0;

    function ensureJumpLatest() {
      if (jumpLatest) return jumpLatest;
      jumpLatest = root.querySelector('#chat-jump-latest');
      if (!jumpLatest) {
        jumpLatest = root.createElement('button');
        jumpLatest.id = 'chat-jump-latest';
        jumpLatest.type = 'button';
        jumpLatest.className = 'chat-jump-latest';
        jumpLatest.hidden = true;
        jumpLatest.textContent = 'Jump to latest';
        const form = root.querySelector('#chat-form');
        if (form?.parentNode?.insertBefore) {
          form.parentNode.insertBefore(jumpLatest, form);
        } else if (typeof form?.before === 'function') {
          form.before(jumpLatest);
        } else if (typeof list.after === 'function') {
          list.after(jumpLatest);
        } else {
          list.parentNode?.append?.(jumpLatest);
        }
      }
      jumpLatest.addEventListener?.('click', () => {
        stickToBottom = true;
        list.scrollTop = list.scrollHeight;
        syncJumpLatest();
      });
      return jumpLatest;
    }

    // Keep the controller-level sync so send() can hide the jump control.
    syncJumpLatest = () => {
      const jump = ensureJumpLatest();
      if (!jump) return;
      jump.hidden = stickToBottom;
    };

    list.addEventListener?.('scroll', () => {
      const scrollTop = list.scrollTop || 0;
      const scrollHeight = list.scrollHeight || 0;
      if (scrollTop < lastScrollTop && scrollHeight === lastScrollHeight) {
        stickToBottom = false;
      } else if (isChatPinned(list)) {
        stickToBottom = true;
      }
      lastScrollTop = scrollTop;
      lastScrollHeight = scrollHeight;
      syncJumpLatest();
    });

    if (typeof globalThis.ResizeObserver === 'function') {
      const ro = new globalThis.ResizeObserver(() => {
        if (stickToBottom) list.scrollTop = list.scrollHeight;
        lastScrollTop = list.scrollTop || 0;
        lastScrollHeight = list.scrollHeight || 0;
      });
      try {
        ro.observe(list);
      } catch {
        /* ignore — FakeElement / non-Element roots */
      }
    }

    syncJumpLatest();
  }

  function bindMessageActions() {
    const list = root.querySelector('#chat-messages');
    if (!list || list.dataset.actionsBound === '1') return;
    list.dataset.actionsBound = '1';
    list.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-chat-action]');
      if (!button) return;
      const item = button.closest?.('.chat-message');
      const body = item?.querySelector?.('.chat-message__body');
      const text = (body?.innerText ?? body?.textContent ?? '').trim();
      if (button.dataset.chatAction === 'copy') {
        void globalThis.navigator?.clipboard?.writeText?.(text);
        return;
      }
      if (button.dataset.chatAction === 'retry' && text && !sending) {
        void send(text);
      }
    });
  }

  function bindNewChat() {
    const button = root.querySelector('#chat-new');
    if (!button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => {
      void startNewChat();
    });
  }

  // Hard-reset the visible thread and API memory, but keep whoever Adam pinned
  // so the next message still goes to the same agent with the same accent.
  function startNewChat() {
    if (flushInFlight) {
      return flushInFlight.finally(() => {
        resetThread();
      });
    }
    if (activeAbort) {
      try {
        activeAbort.abort('new-chat');
      } catch {
        /* ignore */
      }
    }
    if (!shouldFlushVeraSession()) {
      resetThread();
      return Promise.resolve();
    }
    return waitUntilIdle()
      .then(() => flushVeraSession())
      .finally(() => {
        resetThread();
      });
  }

  async function send(message, { hiddenUser = false } = {}) {
    sending = true;
    setChatBusy(root, true);
    showChatError(root, '');
    let turnSignaled = false;
    let gotUsefulOutput = false;
    let sawDone = false;
    let sawIncompleteTurn = false;
    let sawExerciseLibrarySaved = false;
    let sawRecordProposal = false;
    let sawGovernanceLogAppended = false;
    const history = recentHistory();
    const priorAgentSlug = stickyAgentSlug();
    if (!hiddenUser) {
      if (CANCEL_AUDIT_RE.test(message)) clearAuditSession();
      maybeStartAuditSession(message);
    }
    const sessionForSend = !hiddenUser && auditSession && talkingToHammond(message) ? auditSession : undefined;
    if (!hiddenUser) {
      remember('user', message);
      appendMessage(root, { role: 'user', text: message });
    }

    let assistantSlug = stickyAgentSlug();
    let assistantBubble = null;
    let assistantBuffer = '';
    let assistantFullText = '';
    let statusLine = pickStatusLine(assistantSlug);
    stickToBottom = true;
    syncJumpLatest();
    let workingBubble = appendMessage(root, {
      role: 'assistant',
      agentSlug: assistantSlug,
      text: statusLine,
      actions: false
    });
    addStatusClass(workingBubble);
    const abort = new AbortController();
    activeAbort = abort;

    function clearWorkingBubble() {
      if (!workingBubble) return;
      workingBubble.remove();
      workingBubble = null;
    }

    // Keeps a single sticky bubble alive across wait/search/research instead of
    // leaving a trail of separate wait bubbles. Re-appended to the end each
    // update so it stays below search chips and library confirmations.
    function setWorkingStatus(text) {
      statusLine = text;
      if (!workingBubble) {
        workingBubble = appendMessage(root, { role: 'assistant', agentSlug: assistantSlug, text, actions: false });
      } else {
        const body = workingBubble.querySelector?.('.chat-message__body') ?? workingBubble;
        body.textContent = text;
        const list = root.querySelector('#chat-messages');
        if (list) {
          workingBubble.remove();
          list.append(workingBubble);
        }
      }
      addStatusClass(workingBubble);
      scrollChatToBottom();
    }

    function rotateWorkingStatus() {
      setWorkingStatus(pickStatusLine(assistantSlug, { exclude: statusLine }));
    }

    // Streamed text arrives as one long buffer. Completed blocks (blank lines or a
    // heading) become their own bubbles so the thread is a conversation, not a slab.
    function renderLiveText(text) {
      if (!text) return;
      clearWorkingBubble();
      if (!assistantBubble) assistantBubble = appendMessage(root, { role: 'assistant', agentSlug: assistantSlug });
      const target = assistantBubble.querySelector?.('.chat-message__body') ?? assistantBubble;
      renderChatMarkdown(root, target, text);
      scrollChatToBottom();
    }

    // Marks the current bubble as finished so the next bit of text starts a fresh one,
    // without touching assistantBuffer -- used mid-paragraph-loop where the buffer still
    // holds an unflushed remainder that must keep accumulating.
    function startNewBubble() {
      assistantBubble = null;
    }

    // Used when a non-text event (a proposal, a search note, ...) interrupts the
    // stream: whatever was mid-paragraph is already rendered, so drop the buffer too.
    function endTextTurn() {
      assistantBubble = null;
      assistantBuffer = '';
    }

    function scrollChatToBottom() {
      const list = root.querySelector('#chat-messages');
      if (list && stickToBottom) list.scrollTop = list.scrollHeight;
    }

    try {
      const protocolId = !hiddenUser && findProtocol(priorAgentSlug, selectedProtocolId)
        ? selectedProtocolId
        : undefined;
      for await (const event of chatApi.send(message, {
        history,
        priorAgentSlug,
        signal: abort.signal,
        ...(sessionForSend ? { auditSession: sessionForSend } : {}),
        ...(protocolId ? { protocolId } : {})
      })) {
        if (event.type === 'agent') {
          if (event.slug !== 'hammond') clearAuditSession();
          assistantSlug = event.slug;
          lastAgentSlug = event.slug;
          lastAgentAt = now();
          if (selectedProtocolId && !findProtocol(event.slug, selectedProtocolId)) {
            selectedProtocolId = null;
          }
          if (!pinnedAgentSlug) paintRoster();
          applyAgentAccent(event.slug);
          if (workingBubble) applyAgentAvatarToBubble(workingBubble, event.slug);
          if (assistantBubble) applyAgentAvatarToBubble(assistantBubble, event.slug);
          if (workingBubble && !isAgentStatusLine(event.slug, statusLine)) {
            rotateWorkingStatus();
          }
        } else if (event.type === 'text') {
          turnSignaled = true;
          gotUsefulOutput = true;
          assistantBuffer += event.delta;
          assistantFullText += event.delta;
          const taken = takeCompletedChatBlocks(assistantBuffer);
          assistantBuffer = taken.rest;
          for (const block of taken.blocks) {
            renderLiveText(block);
            startNewBubble();
          }
          renderLiveText(assistantBuffer);
        } else if (event.type === 'record_proposal') {
          turnSignaled = true;
          gotUsefulOutput = true;
          sawRecordProposal = true;
          clearWorkingBubble();
          endTextTurn();
          const proposal = appendRecordProposal(root, event);
          bindProposal(proposal, event);
        } else if (event.type === 'record_saved') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          if (event.record?.type === 'mind_session') savedMindSessionThisThread = true;
          const savedSummary = event.summary || 'Session logged.';
          appendRecordSaved(root, {
            summary: savedSummary,
            agentSlug: assistantSlug
          });
          assistantFullText += (assistantFullText ? '\n\n' : '') + savedSummary;
          onRecordWritten?.(event);
        } else if (event.type === 'cn_patch_proposal') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          const proposal = appendCnPatchProposal(root, { patch: event.patch });
          bindCnPatchProposal(proposal, event.patch, event.id ?? null);
        } else if (event.type === 'action_proposal') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          const proposal = appendActionProposal(root, { proposal: event.proposal });
          bindActionProposal(proposal, event.proposal, event.id ?? null);
        } else if (event.type === 'choice') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          appendChoiceCard(root, {
            title: event.title,
            hint: event.hint,
            choices: Array.isArray(event.choices) ? event.choices : [],
            multi: Boolean(event.multi),
            confirmLabel: event.confirmLabel,
            onConfirm: picks => {
              const labels = picks.map(pick => pick.label).filter(Boolean);
              if (!labels.length || sending) return;
              void send(labels.join(', '));
            },
            onDismiss: () => {}
          });
        } else if (event.type === 'sources') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          appendSourcesCard(root, {
            heading: event.heading,
            sources: Array.isArray(event.sources) ? event.sources : []
          });
        } else if (event.type === 'action_rejected') {
          turnSignaled = true;
          clearWorkingBubble();
          const detail = typeof event.detail === 'string' && event.detail.trim()
            ? ` (${event.detail.trim()})`
            : '';
          showChatError(root, `That action was blocked${detail}. Try a path inside this agent's allowlist.`);
        } else if (event.type === 'central_node_patched') {
          turnSignaled = true;
          gotUsefulOutput = true;
          endTextTurn();
          const summary = typeof event.summary === 'string' && event.summary.trim()
            ? event.summary.trim()
            : 'Central Node updated';
          // Success feedback mirrors food_library_saved — a chat line, not #chat-error.
          appendMessage(root, {
            role: 'assistant',
            agentSlug: assistantSlug,
            text: `Central Node updated: ${summary}`
          });
        } else if (event.type === 'record_rejected') {
          turnSignaled = true;
          clearWorkingBubble();
          showChatError(root, formatRejectionMessage(event.errors));
        } else if (event.type === 'done') {
          sawDone = true;
        } else if (event.type === 'error') {
          turnSignaled = true;
          clearWorkingBubble();
          if (event.code === 'turn_incomplete') {
            sawIncompleteTurn = true;
            if (!hiddenUser) {
              appendMessage(root, {
                role: 'assistant',
                agentSlug: assistantSlug,
                text: EMPTY_TURN_RECOVERY
              });
            }
          } else {
            showChatError(root, 'Chat is unavailable right now. Please try again.');
          }
        } else if (event.type === 'status') {
          if (typeof event.text === 'string' && event.text.trim()) {
            rotateWorkingStatus();
          }
        } else if (event.type === 'search') {
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `🔍 Searched the web: ${event.query ?? '…'}` });
          rotateWorkingStatus();
        } else if (event.type === 'food_library_saved') {
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `📚 Saved "${event.name}" to the Food Library for next time.` });
          rotateWorkingStatus();
        } else if (event.type === 'exercise_library_saved') {
          sawExerciseLibrarySaved = true;
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `Saved "${event.name}" to the Exercise Library.` });
          rotateWorkingStatus();
        } else if (event.type === 'governance_log_appended') {
          sawGovernanceLogAppended = true;
        }
        // audit_phase SSE is informational only — client owns advancement
      }
      remember('assistant', assistantFullText);
      if (shouldNudgeUnsavedWorkoutPlan({
        agentSlug: assistantSlug,
        assistantText: assistantFullText,
        sawRecordProposal,
        sawExerciseLibrarySaved
      })) {
        turnSignaled = true;
        gotUsefulOutput = true;
        clearWorkingBubble();
        appendMessage(root, { role: 'assistant', agentSlug: assistantSlug, text: LIBRARY_SAVE_NUDGE_TEXT });
      } else if (shouldNudgeMissingLogEntry({
        agentSlug: assistantSlug,
        assistantText: assistantFullText,
        sawRecordProposal
      })) {
        turnSignaled = true;
        gotUsefulOutput = true;
        clearWorkingBubble();
        appendMessage(root, { role: 'assistant', agentSlug: assistantSlug, text: MISSING_LOG_NUDGE_TEXT });
      }
      // Partial text with no done event (live 60s kill / dropped stream) is still a cut-off.
      if (gotUsefulOutput && !sawDone && !sawIncompleteTurn && !hiddenUser) {
        turnSignaled = true;
        clearWorkingBubble();
        appendMessage(root, {
          role: 'assistant',
          agentSlug: assistantSlug,
          text: EMPTY_TURN_RECOVERY
        });
      } else if (!turnSignaled) {
        if (hiddenUser) {
          clearWorkingBubble();
        } else {
          turnSignaled = true;
          clearWorkingBubble();
          appendMessage(root, {
            role: 'assistant',
            agentSlug: assistantSlug,
            text: EMPTY_TURN_RECOVERY
          });
        }
      } else if (gotUsefulOutput && sawDone && !hiddenUser) {
        advanceAuditSession(message, { governanceLogAppended: sawGovernanceLogAppended });
      }
    } catch (error) {
      turnSignaled = true;
      clearWorkingBubble();
      const abortedForNewChat = abort.signal.reason === 'new-chat';
      if (error?.name === 'AbortError') {
        if (!abortedForNewChat && abort.signal.reason !== 'stop') {
          showChatError(root, 'That search took too long. Try again in a moment.');
        }
      } else {
        showChatError(root, 'Chat is unavailable right now. Please try again.');
      }
    } finally {
      if (activeAbort === abort) activeAbort = null;
      clearWorkingBubble();
      sending = false;
      setChatBusy(root, false);
      if (turnSignaled && !hiddenUser) maybeMarkUnread();
    }
  }

  function bindProposal(proposal, event) {
    if (!proposal) return;
    proposal.confirm.addEventListener('click', () => {
      const overwrite = proposal.confirm.dataset.overwrite === '1';
      void confirmProposal(proposal, event, overwrite);
    });
    proposal.discard.addEventListener('click', () => proposal.card.remove());
  }

  function bindCnPatchProposal(proposal, patch, id = null) {
    if (!proposal) return;
    proposal.confirm.addEventListener('click', () => {
      void confirmCnPatch(proposal, patch, id);
    });
    proposal.discard.addEventListener('click', () => {
      proposal.card.remove();
      // Best-effort: clear the server-side queue entry too, so Discard actually
      // means gone rather than just hidden in this one tab. Fire-and-forget --
      // the card is already removed either way, and a stale entry self-purges.
      if (id) void chatApi.confirm({ kind: 'cn_patch_dismiss', id, slug: 'hammond' }).catch(() => undefined);
    });
  }

  function bindActionProposal(proposalUi, proposal, id = null) {
    if (!proposalUi) return;
    proposalUi.confirm.addEventListener('click', () => {
      void confirmAction(proposalUi, proposal, id);
    });
    proposalUi.discard.addEventListener('click', () => {
      proposalUi.card.remove();
      if (id) {
        const slug = stickyAgentSlug()
          || (typeof proposal?.agent === 'string' ? proposal.agent : null)
          || 'hammond';
        void chatApi.confirm({ kind: 'action_dismiss', id, slug }).catch(() => undefined);
      }
    });
  }

  async function confirmAction(proposalUi, proposal, id = null) {
    const previousLabel = proposalUi.confirm.textContent;
    proposalUi.confirm.disabled = true;
    proposalUi.confirm.textContent = 'Saving…';
    try {
      const slug = stickyAgentSlug()
        || (typeof proposal?.agent === 'string' ? proposal.agent : null)
        || 'hammond';
      const result = await chatApi.confirm({
        kind: 'action',
        candidate: proposal,
        ...(id ? { id } : {}),
        slug
      });
      const saved = root.createElement('p');
      saved.textContent = result?.intent
        ? `Saved: ${result.intent}`
        : 'Action applied.';
      proposalUi.card.replaceChildren(saved);
      onRecordWritten?.(result);
    } catch {
      proposalUi.confirm.disabled = false;
      proposalUi.confirm.textContent = previousLabel;
      showChatError(root, 'Saving that action failed. You can try again.');
    }
  }

  async function confirmCnPatch(proposal, patch, id = null) {
    const previousLabel = proposal.confirm.textContent;
    proposal.confirm.disabled = true;
    proposal.confirm.textContent = 'Saving…';
    try {
      const result = await chatApi.confirm({
        kind: 'cn_patch',
        candidate: patch,
        ...(id ? { id } : {}),
        slug: stickyAgentSlug() === 'hammond' ? stickyAgentSlug() : 'hammond'
      });
      const saved = root.createElement('p');
      saved.textContent = result?.summary
        ? `Central Node updated: ${result.summary}`
        : 'Central Node updated.';
      proposal.card.replaceChildren(saved);
      onRecordWritten?.(result);
    } catch {
      proposal.confirm.disabled = false;
      proposal.confirm.textContent = previousLabel;
      showChatError(root, 'Saving that Central Node change failed. You can try again.');
    }
  }

  async function confirmProposal(proposal, event, overwrite) {
    const previousLabel = proposal.confirm.textContent;
    proposal.confirm.disabled = true;
    proposal.confirm.textContent = 'Saving…';
    try {
      const edited = collectEdits(event.record, proposal.inputs);
      const slug = slugFromPath(event.path);
      const result = await chatApi.confirm({ candidate: toCandidate(edited), slug, overwrite });
      proposal.card.replaceChildren(Object.assign(root.createElement('p'), { textContent: 'Saved.' }));
      if (result?.centralNodeUpdated === false) {
        showChatError(root, 'Logged, but Central Node didn\u2019t update — try Refresh.');
      }
      // Earned hype: a genuine PB (Phase 1's library upsert) gets a specific, loud reaction
      // right in the transcript -- confirm is a plain POST, not an LLM turn, so this is a
      // templated in-voice line rather than a model-generated one. Workout-only: personalBests
      // is only ever meaningful on a completed workout confirm.
      if (event.record?.type === 'workout' && Array.isArray(result?.personalBests)) {
        for (const pb of result.personalBests) {
          appendMessage(root, { role: 'assistant', agentSlug: 'chadwick', text: personalBestHypeLine(pb) });
        }
      }
      if (result?.dayoneSent === false) {
        const reason = result.dayoneReason;
        const message = reason === 'not_configured'
          ? 'Diary saved, but Day One email isn\u2019t configured yet.'
          : reason === 'empty_notes'
            ? 'Diary saved, but there was no entry text to email to Day One.'
            : 'Diary saved, but Day One email didn\u2019t send — you can retry later.';
        showChatError(root, message);
      }
      onRecordWritten?.(result);
    } catch (error) {
      proposal.confirm.disabled = false;
      proposal.confirm.textContent = previousLabel;
      if (error.code === 'write_conflict' && !overwrite) {
        showChatError(root, 'A record already exists for that day. Confirm again to overwrite it.');
        proposal.confirm.dataset.overwrite = '1';
      } else {
        showChatError(root, 'Saving that record failed. You can try again.');
      }
    }
  }

  async function startCentralNodeAudit() {
    selectAgent('hammond');
    return send('central node audit');
  }

  bindComposer();
  bindNewChat();
  bindTools();
  bindScrollLock();
  bindMessageActions();
  {
    const slug = stickyAgentSlug() ?? null;
    if (slug) applyAgentAccent(slug);
    paintRoster();
  }

  return {
    send,
    selectAgent,
    selectProtocol,
    startNewChat,
    flushVeraSession,
    startCentralNodeAudit,
    syncAccent,
    getSelectedAgentSlug: () => stickyAgentSlug() ?? null,
    getSelectedProtocolId: () => selectedProtocolId,
    clearUnread
  };
}

function collectEdits(record, inputs) {
  const edited = { ...record };
  for (const [key, input] of Object.entries(inputs ?? {})) {
    const original = record[key];
    if (typeof original === 'number') {
      const parsed = input.value.trim() === '' ? NaN : Number(input.value);
      edited[key] = Number.isFinite(parsed) ? parsed : original;
    } else if (typeof original === 'boolean') {
      edited[key] = input.value === 'true';
    } else {
      edited[key] = input.value;
    }
  }
  return edited;
}

function toCandidate(record) {
  const { schema_version, id, created_at, updated_at, source, type, date, time, notes, ...fields } = record;
  return { type, date, ...(time ? { time } : {}), ...(notes ? { notes } : {}), fields };
}

// Deterministic, not model-generated -- see the call site in confirmProposal for why.
function personalBestHypeLine(pb) {
  const hasDelta = typeof pb?.previous_best_weight_kg === 'number';
  const delta = hasDelta ? Math.round((pb.best_weight_kg - pb.previous_best_weight_kg) * 10) / 10 : null;
  const deltaText = hasDelta ? ` — that's +${delta}kg over your old best` : '';
  return `NEW PB, bro. ${pb?.name ?? 'that move'} at ${pb?.best_weight_kg}kg${deltaText}. Absolute unit behavior — write that one down.`;
}

function slugFromPath(path) {
  return path.split('/').at(-1).replace(/\.md$/, '').split('-').slice(3).join('-');
}

function resumeAuditSession(storage) {
  const loaded = loadStoredAuditSession(storage);
  if (!loaded) return null;
  // A lock-phase session means the audit already reached its final turn — don't resume.
  if (loaded.phase === 'lock') {
    removeStoredAuditSession(storage);
    return null;
  }
  return loaded;
}

function formatRejectionMessage(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Life Hub could not prepare that record. Try rephrasing it.';
  }
  const medicalish = errors.every(error =>
    /record_type|lane|location_kind|cost_aud|follow_up_date|episode|title/.test(error)
  );
  if (medicalish) {
    return 'Life Hub could not prepare that medical visit yet. Sara will try again — a title and what happened is enough.';
  }
  return `Life Hub could not save that record: ${errors.join('; ')}`;
}
