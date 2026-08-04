const HIDDEN_FIELDS = new Set(['schema_version', 'id', 'type', 'date', 'created_at', 'updated_at', 'source']);

export function appendMessage(root, { role, agentSlug, text = '' }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const item = root.createElement('li');
  item.className = `chat-message chat-message--${role}`;
  if (agentSlug) item.dataset.agent = agentSlug;
  item.textContent = text;
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

// Renders a safe subset of markdown (**bold** and "- " bullet lists) as real DOM
// nodes -- never innerHTML, so model output can never be interpreted as markup.
// Single-line input (every existing streaming-chat caller) takes a fast path that
// reproduces the original flat span/strong output exactly, so chat bubbles are
// unaffected by the multi-line/bullet support added for Central Node's cards.
// Caller is responsible for scrolling the list into view afterwards.
export function renderInlineMarkdown(root, container, text) {
  container.replaceChildren();
  const lines = text.split('\n');
  if (lines.length === 1) {
    appendInlineSegments(root, container, text);
    return;
  }

  let currentList = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('- ')) {
      if (!currentList) {
        currentList = root.createElement('ul');
        container.append(currentList);
      }
      const item = root.createElement('li');
      appendInlineSegments(root, item, line.slice(2));
      currentList.append(item);
    } else {
      currentList = null;
      if (line === '') continue;
      const paragraph = root.createElement('p');
      appendInlineSegments(root, paragraph, line);
      container.append(paragraph);
    }
  }
}

function appendInlineSegments(root, container, text) {
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean);
  for (const segment of segments) {
    const isBold = segment.startsWith('**') && segment.endsWith('**') && segment.length > 4;
    const node = root.createElement(isBold ? 'strong' : 'span');
    node.textContent = isBold ? segment.slice(2, -2) : segment;
    container.append(node);
  }
}

export function appendRecordProposal(root, { path, record, notes }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const card = root.createElement('li');
  card.className = 'record-proposal';
  card.dataset.path = path;

  const summary = root.createElement('p');
  summary.textContent = `Proposed ${record.type} record for ${record.date}`;
  card.append(summary);

  const fields = root.createElement('dl');
  fields.className = 'record-proposal__fields';
  const inputs = {};
  for (const [key, value] of Object.entries(record)) {
    if (HIDDEN_FIELDS.has(key) || (typeof value === 'object' && value !== null)) continue;
    const dt = root.createElement('dt');
    dt.textContent = key;
    const dd = root.createElement('dd');
    const input = root.createElement('input');
    input.value = String(value ?? '');
    input.dataset.field = key;
    dd.append(input);
    fields.append(dt, dd);
    inputs[key] = input;
  }

  const notesDt = root.createElement('dt');
  notesDt.textContent = 'notes';
  const notesDd = root.createElement('dd');
  const notesInput = root.createElement('input');
  notesInput.value = notes ?? '';
  notesInput.dataset.field = 'notes';
  notesDd.append(notesInput);
  fields.append(notesDt, notesDd);
  inputs.notes = notesInput;

  card.append(fields);

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'record-proposal__confirm';
  confirm.textContent = 'Confirm';
  card.append(confirm);

  const discard = root.createElement('button');
  discard.type = 'button';
  discard.className = 'record-proposal__discard';
  discard.textContent = 'Discard';
  card.append(discard);

  list.append(card);
  list.scrollTop = list.scrollHeight;
  return { card, confirm, discard, inputs };
}

export function setChatBusy(root, busy) {
  const input = root.querySelector('#chat-input');
  const button = root.querySelector('#chat-send');
  if (input) input.disabled = busy;
  if (button) button.disabled = busy;
}

export function showChatError(root, message) {
  const banner = root.querySelector('#chat-error');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = !message;
}
