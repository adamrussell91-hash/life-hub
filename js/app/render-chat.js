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

export function appendRecordProposal(root, { path, record }) {
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
