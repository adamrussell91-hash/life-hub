import { formatExerciseSets, formatExerciseTitle, humanizeFieldLabel } from './format-exercise.js';
import { applyAgentAvatarToBubble } from './render-agent-picker.js';
import { showEphemeralMessage } from './ephemeral-message.js';

const HIDDEN_FIELDS = new Set(['schema_version', 'id', 'type', 'date', 'created_at', 'updated_at', 'source', 'exercises', 'focus', 'pain_flags', 'tags', 'highlights', 'challenges', 'products']);
const UNREAD_SELECTOR = '.floating-chat-button, [data-section="chat"]';
const UNREAD_CLASS = 'has-unread';

// FakeElement-friendly toggle, mirroring the classList-vs-string fallback used
// elsewhere for the status bubble class -- real DOM elements have classList,
// the lighter test harnesses only model className as a plain string.
function toggleClass(element, name, add) {
  if (element.classList?.add && element.classList?.remove) {
    if (add) element.classList.add(name);
    else element.classList.remove(name);
    return;
  }
  const classes = (element.className ?? '').split(/\s+/).filter(Boolean).filter(cls => cls !== name);
  if (add) classes.push(name);
  element.className = classes.join(' ');
}

// Session-only unread indicator: toggles a class (for styling) and a dataset
// flag (for anything that wants to query state) on every chat entry point --
// the floating chat FABs and the Chat nav item in both the rail and mobile nav.
export function setChatUnread(root, unread) {
  const targets = root.querySelectorAll?.(UNREAD_SELECTOR) ?? [];
  for (const target of targets) {
    toggleClass(target, UNREAD_CLASS, unread);
    if (unread) target.dataset.unread = 'true';
    else delete target.dataset.unread;
  }
}

export function appendMessage(root, { role, agentSlug, text = '' }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const item = root.createElement('li');
  item.className = `chat-message chat-message--${role}`;
  if (agentSlug) {
    item.dataset.agent = agentSlug;
    applyAgentAvatarToBubble(item, agentSlug);
  }
  const body = root.createElement('div');
  body.className = 'chat-message__body';
  body.textContent = text;
  item.append(body);
  list.append(item);
  list.scrollTop = list.scrollHeight;
  return item;
}

// Renders a safe subset of markdown as real DOM nodes -- never innerHTML, so model
// output can never be interpreted as markup. Multi-line/bullet-list parsing
// ("- " lines grouped into <ul>, other non-blank lines as <p>) is opt-in via
// { multiline: true } -- with no options, this is byte-for-byte identical to the
// function's original single-pass bold-segment behaviour regardless of what's in
// `text` (including any embedded single "\n"), so every existing streaming-chat
// call site is provably unaffected. Central Node's card renderer passes
// { multiline: true } explicitly for its multi-paragraph/list markdown blocks.
// Caller is responsible for scrolling the list into view afterwards.
export function renderInlineMarkdown(root, container, text, { multiline = false } = {}) {
  container.replaceChildren();
  if (!multiline) {
    appendInlineSegments(root, container, text);
    return;
  }

  const lines = text.split('\n');
  if (lines.length === 1) {
    appendInlineSegments(root, container, text);
    return;
  }

  let currentList = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
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
  const displayRecord = { ...record };
  // Always surface sodium on meal proposals so a missing estimate is obvious to edit.
  if (record.type === 'meal' && displayRecord.sodium_mg == null) displayRecord.sodium_mg = '';
  for (const [key, value] of Object.entries(displayRecord)) {
    if (HIDDEN_FIELDS.has(key) || (typeof value === 'object' && value !== null)) continue;
    const dt = root.createElement('dt');
    dt.textContent = humanizeFieldLabel(key);
    const dd = root.createElement('dd');
    const input = root.createElement('input');
    input.value = String(value ?? '');
    input.dataset.field = key;
    dd.append(input);
    fields.append(dt, dd);
    inputs[key] = input;
  }

  const notesDt = root.createElement('dt');
  notesDt.textContent = humanizeFieldLabel('notes');
  const notesDd = root.createElement('dd');
  const notesInput = root.createElement('input');
  notesInput.value = notes ?? '';
  notesInput.dataset.field = 'notes';
  notesDd.append(notesInput);
  fields.append(notesDt, notesDd);
  inputs.notes = notesInput;

  card.append(fields);

  if (Array.isArray(record.exercises) && record.exercises.length > 0) {
    const heading = root.createElement('p');
    heading.className = 'record-proposal__exercises-heading';
    heading.textContent = 'Exercises';
    card.append(heading);
    const exercisesList = root.createElement('ul');
    exercisesList.className = 'record-proposal__exercises';
    for (const exercise of record.exercises) {
      const item = root.createElement('li');
      const title = root.createElement('strong');
      title.textContent = formatExerciseTitle(exercise);
      item.append(title);
      const sets = formatExerciseSets(exercise);
      if (sets) {
        const detail = root.createElement('div');
        detail.className = 'record-proposal__sets';
        detail.textContent = sets;
        item.append(detail);
      }
      exercisesList.append(item);
    }
    card.append(exercisesList);
  }

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

export function appendCnPatchProposal(root, { patch }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const card = root.createElement('li');
  card.className = 'record-proposal cn-patch-proposal';

  const summary = root.createElement('p');
  summary.className = 'cn-patch-proposal__summary';
  summary.textContent = typeof patch?.payload?.summary === 'string' && patch.payload.summary.trim()
    ? patch.payload.summary.trim()
    : 'Proposed Central Node change';
  card.append(summary);

  const meta = root.createElement('p');
  meta.className = 'cn-patch-proposal__meta';
  const section = typeof patch?.section === 'string' ? patch.section : 'unknown';
  const op = typeof patch?.op === 'string' ? patch.op : 'unknown';
  meta.textContent = `${section} · ${op}`;
  card.append(meta);

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
  return { card, confirm, discard };
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
  showEphemeralMessage(banner, message);
}
