import {
  appendMessage,
  appendCnPatchProposal,
  appendRecordProposal,
  renderInlineMarkdown,
  setChatBusy,
  showChatError
} from './render-chat.js';
import { applyAgentAvatarToBubble, renderAgentHero, renderAgentPicker } from './render-agent-picker.js';
import { isHammondAuditTrigger, nextAuditPhase } from './hammond-audit.js';

const PARAGRAPH_BREAK = /\n{2,}/;
const HISTORY_WINDOW_MS = 20 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 30;
const MAX_HISTORY_ENTRY_CHARS = 1000;
const STATUS_BUBBLE_CLASS = 'chat-message--status';
const LIBRARY_SAVE_NUDGE_TEXT = 'That stayed in chat only — ask me to lock it onto Fitness so you get a Confirm card.';
const EMPTY_TURN_RECOVERY = 'That reply got cut off before it finished (usually a timeout while looking things up). Send the same message again and I’ll continue.';
const CANCEL_AUDIT_RE = /cancel audit|stop audit/i;
const SKIP_INTAKE_RE = /skip intake|continue audit|\bgo on\b/i;

// FakeElement (used in unit tests) only models `className` as a plain string, so
// classList is used when real DOM elements provide it and this string fallback
// covers the test harness without changing its shape.
function addStatusClass(element) {
  if (!element) return;
  if (element.classList?.add) {
    element.classList.add(STATUS_BUBBLE_CLASS);
    return;
  }
  const classes = (element.className ?? '').split(/\s+/).filter(Boolean);
  if (!classes.includes(STATUS_BUBBLE_CLASS)) {
    classes.push(STATUS_BUBBLE_CLASS);
    element.className = classes.join(' ');
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
  onUnreadChange
}) {
  if (!root || !chatApi) throw new TypeError('Chat controller dependencies are unavailable');

  let sending = false;
  let transcript = [];
  let lastAgentSlug = null;
  let lastAgentAt = 0;
  let pinnedAgentSlug = null;
  let activeAbort = null;
  let auditSession = null;

  function clearAuditSession() {
    auditSession = null;
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
  }

  function advanceAuditSession(message) {
    if (!auditSession) return;
    if (CANCEL_AUDIT_RE.test(message)) {
      clearAuditSession();
      return;
    }
    const phase = auditSession.phase;
    const flags = (phase === 'triage' || phase === 'intake')
      ? {
          askedIntakeQuestion: true,
          skipRemainingIntake: SKIP_INTAKE_RE.test(message),
          intakeComplete: SKIP_INTAKE_RE.test(message)
        }
      : {};
    auditSession = nextAuditPhase(auditSession, flags);
  }

  // Prunes anything outside the memory window as a side effect, then returns a
  // bounded, API-shaped slice of what's left -- called before the new user turn
  // is added, so it only ever reflects prior turns.
  function recentHistory() {
    const cutoff = now() - HISTORY_WINDOW_MS;
    transcript = transcript.filter(entry => entry.at >= cutoff);
    return transcript.slice(-MAX_HISTORY_MESSAGES).map(({ role, content }) => ({ role, content }));
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

  function selectAgent(slug) {
    if (!slug) return;
    if (slug !== 'hammond') clearAuditSession();
    pinnedAgentSlug = slug;
    lastAgentSlug = slug;
    lastAgentAt = now();
    applyAgentAccent(slug);
    renderAgentPicker(root, {
      selectedSlug: slug,
      onSelect: selectAgent
    });
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
    if (!slug || typeof agentColour !== 'function') return;
    const panel = root.querySelector('#chat-view');
    if (!panel?.style?.setProperty) return;
    panel.style.setProperty('--agent-accent', agentColour(getAgentsConfig?.(), slug));
  }

  function syncAccent() {
    const slug = stickyAgentSlug();
    if (slug) applyAgentAccent(slug);
    renderAgentPicker(root, {
      selectedSlug: slug ?? null,
      onSelect: selectAgent
    });
  }

  function remember(role, content) {
    const trimmed = content.trim();
    if (!trimmed) return;
    transcript.push({
      role,
      content: trimmed.length > MAX_HISTORY_ENTRY_CHARS ? trimmed.slice(0, MAX_HISTORY_ENTRY_CHARS) : trimmed,
      at: now()
    });
  }

  function bindForm() {
    const form = root.querySelector('#chat-form');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault();
      const input = root.querySelector('#chat-input');
      const message = input?.value.trim();
      if (!message || sending) return;
      input.value = '';
      void send(message);
    });
  }

  function bindNewChat() {
    const button = root.querySelector('#chat-new');
    if (!button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => startNewChat());
  }

  // Hard-reset the visible thread and API memory, but keep whoever Adam pinned
  // so the next message still goes to the same agent with the same accent.
  function startNewChat() {
    if (activeAbort) {
      try {
        activeAbort.abort('new-chat');
      } catch {
        /* ignore */
      }
      activeAbort = null;
    }
    transcript = [];
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
    renderAgentPicker(root, {
      selectedSlug: slug ?? null,
      onSelect: selectAgent
    });
    clearUnread();
  }

  async function send(message) {
    sending = true;
    setChatBusy(root, true);
    showChatError(root, '');
    let turnSignaled = false;
    let gotUsefulOutput = false;
    let sawExerciseLibrarySaved = false;
    let sawRecordProposal = false;
    const history = recentHistory();
    const priorAgentSlug = stickyAgentSlug();
    if (CANCEL_AUDIT_RE.test(message)) clearAuditSession();
    maybeStartAuditSession(message);
    const sessionForSend = auditSession && talkingToHammond(message) ? auditSession : undefined;
    remember('user', message);
    appendMessage(root, { role: 'user', text: message });

    let assistantSlug = stickyAgentSlug();
    let assistantBubble = null;
    let assistantBuffer = '';
    let assistantFullText = '';
    let workingBubble = appendMessage(root, {
      role: 'assistant',
      agentSlug: assistantSlug,
      text: 'On it…'
    });
    addStatusClass(workingBubble);
    const abort = new AbortController();
    activeAbort = abort;
    const timeoutId = setTimeout(() => abort.abort(), 90_000);

    function clearWorkingBubble() {
      if (!workingBubble) return;
      workingBubble.remove();
      workingBubble = null;
    }

    // Keeps a single sticky bubble alive across the "On it… → Looking that up…
    // → Researching…" turn instead of leaving a trail of separate wait bubbles.
    // Re-appended to the end each update so it stays below search chips and
    // library confirmations instead of getting stranded above them.
    function setWorkingStatus(text) {
      if (!workingBubble) {
        workingBubble = appendMessage(root, { role: 'assistant', agentSlug: assistantSlug, text });
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

    // Streamed text arrives as one long buffer; splitting on paragraph breaks into
    // separate bubbles reads like an actual back-and-forth instead of one wall of text.
    function renderLiveText(text) {
      if (!text) return;
      clearWorkingBubble();
      if (!assistantBubble) assistantBubble = appendMessage(root, { role: 'assistant', agentSlug: assistantSlug });
      const target = assistantBubble.querySelector?.('.chat-message__body') ?? assistantBubble;
      renderInlineMarkdown(root, target, text);
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
      if (list) list.scrollTop = list.scrollHeight;
    }

    try {
      for await (const event of chatApi.send(message, {
        history,
        priorAgentSlug,
        signal: abort.signal,
        ...(sessionForSend ? { auditSession: sessionForSend } : {})
      })) {
        if (event.type === 'agent') {
          if (event.slug !== 'hammond') clearAuditSession();
          assistantSlug = event.slug;
          lastAgentSlug = event.slug;
          lastAgentAt = now();
          if (!pinnedAgentSlug) {
            renderAgentPicker(root, { selectedSlug: event.slug, onSelect: selectAgent });
          }
          applyAgentAccent(event.slug);
          if (workingBubble) applyAgentAvatarToBubble(workingBubble, event.slug);
          if (assistantBubble) applyAgentAvatarToBubble(assistantBubble, event.slug);
        } else if (event.type === 'text') {
          turnSignaled = true;
          gotUsefulOutput = true;
          assistantBuffer += event.delta;
          assistantFullText += event.delta;
          let boundary;
          while ((boundary = PARAGRAPH_BREAK.exec(assistantBuffer))) {
            const paragraph = assistantBuffer.slice(0, boundary.index).trim();
            assistantBuffer = assistantBuffer.slice(boundary.index + boundary[0].length);
            renderLiveText(paragraph);
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
        } else if (event.type === 'cn_patch_proposal') {
          turnSignaled = true;
          gotUsefulOutput = true;
          clearWorkingBubble();
          endTextTurn();
          const proposal = appendCnPatchProposal(root, { patch: event.patch });
          bindCnPatchProposal(proposal, event.patch);
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
        } else if (event.type === 'error') {
          turnSignaled = true;
          clearWorkingBubble();
          showChatError(root, 'Chat is unavailable right now. Please try again.');
        } else if (event.type === 'status') {
          if (typeof event.text === 'string' && event.text.trim()) {
            setWorkingStatus(event.text.trim());
          }
        } else if (event.type === 'search') {
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `🔍 Searched the web: ${event.query ?? '…'}` });
          setWorkingStatus('Looking that up…');
        } else if (event.type === 'food_library_saved') {
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `📚 Saved "${event.name}" to the Food Library for next time.` });
          setWorkingStatus('Researching…');
        } else if (event.type === 'exercise_library_saved') {
          sawExerciseLibrarySaved = true;
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `Saved "${event.name}" to the Exercise Library.` });
          setWorkingStatus('Researching…');
        }
        // audit_phase SSE is informational only — client owns advancement
      }
      remember('assistant', assistantFullText);
      if (sawExerciseLibrarySaved && !sawRecordProposal && (!assistantSlug || assistantSlug === 'chadwick')) {
        turnSignaled = true;
        gotUsefulOutput = true;
        clearWorkingBubble();
        appendMessage(root, { role: 'assistant', agentSlug: assistantSlug, text: LIBRARY_SAVE_NUDGE_TEXT });
      }
      if (!turnSignaled) {
        turnSignaled = true;
        clearWorkingBubble();
        appendMessage(root, {
          role: 'assistant',
          agentSlug: assistantSlug,
          text: EMPTY_TURN_RECOVERY
        });
      } else if (gotUsefulOutput) {
        advanceAuditSession(message);
      }
    } catch (error) {
      turnSignaled = true;
      clearWorkingBubble();
      const abortedForNewChat = abort.signal.reason === 'new-chat';
      if (error?.name === 'AbortError') {
        if (!abortedForNewChat) {
          showChatError(root, 'That search took too long. Try again in a moment.');
        }
      } else {
        showChatError(root, 'Chat is unavailable right now. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (activeAbort === abort) activeAbort = null;
      clearWorkingBubble();
      sending = false;
      setChatBusy(root, false);
      if (turnSignaled) maybeMarkUnread();
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

  function bindCnPatchProposal(proposal, patch) {
    if (!proposal) return;
    proposal.confirm.addEventListener('click', () => {
      void confirmCnPatch(proposal, patch);
    });
    proposal.discard.addEventListener('click', () => proposal.card.remove());
  }

  async function confirmCnPatch(proposal, patch) {
    const previousLabel = proposal.confirm.textContent;
    proposal.confirm.disabled = true;
    proposal.confirm.textContent = 'Saving…';
    try {
      const result = await chatApi.confirm({
        kind: 'cn_patch',
        candidate: patch,
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

  bindForm();
  bindNewChat();
  {
    const slug = stickyAgentSlug() ?? null;
    if (slug) applyAgentAccent(slug);
    renderAgentPicker(root, {
      selectedSlug: slug,
      onSelect: selectAgent
    });
  }

  return {
    send,
    selectAgent,
    startNewChat,
    syncAccent,
    getSelectedAgentSlug: () => stickyAgentSlug() ?? null,
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

function slugFromPath(path) {
  return path.split('/').at(-1).replace(/\.md$/, '').split('-').slice(3).join('-');
}

function formatRejectionMessage(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Life Hub could not prepare that record. Try rephrasing it.';
  }
  return `Life Hub could not save that record: ${errors.join('; ')}`;
}
