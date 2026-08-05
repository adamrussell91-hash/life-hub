import { appendMessage, appendRecordProposal, renderInlineMarkdown, setChatBusy, showChatError } from './render-chat.js';
import { renderAgentPicker } from './render-agent-picker.js';

const PARAGRAPH_BREAK = /\n{2,}/;
const HISTORY_WINDOW_MS = 20 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_ENTRY_CHARS = 1000;

export function createChatController({
  root,
  chatApi,
  onRecordWritten,
  now = () => Date.now(),
  getDefaultAgentSlug,
  agentColour,
  getAgentsConfig
}) {
  if (!root || !chatApi) throw new TypeError('Chat controller dependencies are unavailable');

  let sending = false;
  let transcript = [];
  let lastAgentSlug = null;
  let lastAgentAt = 0;
  let pinnedAgentSlug = null;

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
    pinnedAgentSlug = slug;
    lastAgentSlug = slug;
    lastAgentAt = now();
    applyAgentAccent(slug);
    renderAgentPicker(root, {
      selectedSlug: slug,
      onSelect: selectAgent
    });
  }

  function applyAgentAccent(slug) {
    if (!slug || typeof agentColour !== 'function') return;
    const panel = root.querySelector('#chat-view');
    if (!panel?.style?.setProperty) return;
    panel.style.setProperty('--agent-accent', agentColour(getAgentsConfig?.(), slug));
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

  async function send(message) {
    sending = true;
    setChatBusy(root, true);
    showChatError(root, '');
    const history = recentHistory();
    const priorAgentSlug = stickyAgentSlug();
    remember('user', message);
    appendMessage(root, { role: 'user', text: message });

    let assistantSlug = null;
    let assistantBubble = null;
    let assistantBuffer = '';
    let assistantFullText = '';
    let searchWaitBubble = null;
    let workingBubble = appendMessage(root, { role: 'assistant', text: 'On it…' });
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 90_000);

    function clearWorkingBubble() {
      if (!workingBubble) return;
      workingBubble.remove();
      workingBubble = null;
    }

    // Streamed text arrives as one long buffer; splitting on paragraph breaks into
    // separate bubbles reads like an actual back-and-forth instead of one wall of text.
    function renderLiveText(text) {
      if (!text) return;
      clearWorkingBubble();
      if (searchWaitBubble) {
        searchWaitBubble.remove();
        searchWaitBubble = null;
      }
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
      for await (const event of chatApi.send(message, { history, priorAgentSlug, signal: abort.signal })) {
        if (event.type === 'agent') {
          assistantSlug = event.slug;
          lastAgentSlug = event.slug;
          lastAgentAt = now();
          if (!pinnedAgentSlug) {
            renderAgentPicker(root, { selectedSlug: event.slug, onSelect: selectAgent });
          }
          applyAgentAccent(event.slug);
        } else if (event.type === 'text') {
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
          clearWorkingBubble();
          endTextTurn();
          if (searchWaitBubble) {
            searchWaitBubble.remove();
            searchWaitBubble = null;
          }
          const proposal = appendRecordProposal(root, event);
          bindProposal(proposal, event);
        } else if (event.type === 'record_rejected') {
          clearWorkingBubble();
          showChatError(root, formatRejectionMessage(event.errors));
        } else if (event.type === 'error') {
          clearWorkingBubble();
          showChatError(root, 'Chat is unavailable right now. Please try again.');
        } else if (event.type === 'search') {
          clearWorkingBubble();
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `🔍 Searched the web: ${event.query ?? '…'}` });
          searchWaitBubble = appendMessage(root, { role: 'assistant', text: 'Looking that up…' });
          scrollChatToBottom();
        } else if (event.type === 'food_library_saved') {
          clearWorkingBubble();
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `📚 Saved "${event.name}" to the Food Library for next time.` });
        } else if (event.type === 'exercise_library_saved') {
          clearWorkingBubble();
          endTextTurn();
          appendMessage(root, { role: 'assistant', text: `Saved "${event.name}" to the Exercise Library.` });
        }
      }
      remember('assistant', assistantFullText);
    } catch (error) {
      clearWorkingBubble();
      if (error?.name === 'AbortError') {
        showChatError(root, 'That search took too long. Try again in a moment.');
      } else {
        showChatError(root, 'Chat is unavailable right now. Please try again.');
      }
    } finally {
      clearTimeout(timeoutId);
      clearWorkingBubble();
      if (searchWaitBubble) {
        searchWaitBubble.remove();
        searchWaitBubble = null;
      }
      sending = false;
      setChatBusy(root, false);
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

  async function confirmProposal(proposal, event, overwrite) {
    proposal.confirm.disabled = true;
    try {
      const edited = collectEdits(event.record, proposal.inputs);
      const slug = slugFromPath(event.path);
      const result = await chatApi.confirm({ candidate: toCandidate(edited), slug, overwrite });
      proposal.card.replaceChildren(Object.assign(root.createElement('p'), { textContent: 'Saved.' }));
      onRecordWritten?.(result);
    } catch (error) {
      proposal.confirm.disabled = false;
      if (error.code === 'write_conflict' && !overwrite) {
        showChatError(root, 'A record already exists for that day. Confirm again to overwrite it.');
        proposal.confirm.dataset.overwrite = '1';
      } else {
        showChatError(root, 'Saving that record failed. You can try again.');
      }
    }
  }

  bindForm();
  renderAgentPicker(root, {
    selectedSlug: stickyAgentSlug() ?? null,
    onSelect: selectAgent
  });

  return {
    send,
    selectAgent,
    getSelectedAgentSlug: () => stickyAgentSlug() ?? null
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
