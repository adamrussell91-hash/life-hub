import { appendMessage, appendRecordProposal, setChatBusy, showChatError } from './render-chat.js';

export function createChatController({ root, chatApi, onRecordWritten }) {
  if (!root || !chatApi) throw new TypeError('Chat controller dependencies are unavailable');

  let sending = false;

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
    appendMessage(root, { role: 'user', text: message });
    let assistantBubble = null;

    try {
      for await (const event of chatApi.send(message)) {
        if (event.type === 'agent') {
          assistantBubble = appendMessage(root, { role: 'assistant', agentSlug: event.slug });
        } else if (event.type === 'text' && assistantBubble) {
          assistantBubble.textContent += event.delta;
        } else if (event.type === 'record_proposal') {
          const proposal = appendRecordProposal(root, event);
          bindProposal(proposal, event);
        } else if (event.type === 'record_rejected') {
          showChatError(root, formatRejectionMessage(event.errors));
        } else if (event.type === 'error') {
          showChatError(root, 'Chat is unavailable right now. Please try again.');
        } else if (event.type === 'search') {
          appendMessage(root, { role: 'assistant', text: `🔍 Searching the web: ${event.query ?? '…'}` });
        } else if (event.type === 'food_library_saved') {
          appendMessage(root, { role: 'assistant', text: `📚 Saved "${event.name}" to the Food Library for next time.` });
        }
      }
    } catch {
      showChatError(root, 'Chat is unavailable right now. Please try again.');
    } finally {
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
  return { send };
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
