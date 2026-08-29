import { formatExerciseSets, formatExerciseTitle, humanizeFieldLabel } from './format-exercise.js';
import { applyAgentAvatarToBubble } from './render-agent-picker.js';
import { showEphemeralMessage } from './ephemeral-message.js';
import { appendWorkoutPlanCard } from './render-workout-plan.js';
import { parseWorkoutChat, setsAreIdentical } from '../core/parse-workout-chat.js';
import { formatDisplayDate } from '../core/time.js';

const HIDDEN_FIELDS = new Set(['schema_version', 'id', 'type', 'date', 'created_at', 'updated_at', 'source', 'exercises', 'focus', 'pain_flags', 'tags', 'highlights', 'challenges', 'products', 'system_note']);
const WORKOUT_HEADER_FIELDS = new Set(['title', 'session_kind', 'day_type', 'status', 'duration_min']);
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

export function appendRecordSaved(root, { summary, agentSlug }) {
  return appendMessage(root, {
    role: 'assistant',
    agentSlug,
    text: summary || 'Session logged.'
  });
}

// Renders a safe subset of markdown as real DOM nodes -- never innerHTML, so model
// output can never be interpreted as markup. Multi-line/list parsing
// ("- " bullets into <ul>, "1. " lines into <ol>, other non-blank lines as <p>)
// is opt-in via { multiline: true }. With no options, this stays identical to the
// original single-pass bold-segment behaviour (including embedded "\n").
// Chat streaming uses renderChatMarkdown (multiline + workout cards).
// Central Node's card renderer passes { multiline: true } explicitly.
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
  let currentListType = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') continue;
    const bullet = line.startsWith('- ') ? { type: 'ul', text: line.slice(2) } : null;
    const numbered = bullet ? null : /^(\d+)[\.)]\s+(.*)$/.exec(line);
    const listItem = bullet ?? (numbered ? { type: 'ol', text: numbered[2], start: Number(numbered[1]) } : null);
    if (listItem) {
      if (!currentList || currentListType !== listItem.type) {
        currentList = root.createElement(listItem.type);
        currentListType = listItem.type;
        if (listItem.type === 'ol' && listItem.start > 1) {
          currentList.setAttribute?.('start', String(listItem.start));
          currentList.start = listItem.start;
        }
        container.append(currentList);
      }
      const item = root.createElement('li');
      appendInlineSegments(root, item, listItem.text);
      currentList.append(item);
    } else {
      currentList = null;
      currentListType = null;
      const paragraph = root.createElement('p');
      appendInlineSegments(root, paragraph, line);
      container.append(paragraph);
    }
  }
}

function formatChatCable(cable) {
  if (!cable) return '';
  const lower = cable.toLowerCase();
  if (lower === 'none' || lower.startsWith('none ')) return 'none';
  return cable;
}

function formatChatLoad(set) {
  const reps = set.reps != null ? String(set.reps) : null;
  let weight = null;
  if (set.weightKg === 0) weight = 'bodyweight';
  else if (set.weightKg != null) weight = `${set.weightKg} kg`;
  if (reps && weight === 'bodyweight') return `${reps} bodyweight`;
  if (reps && weight) return `${reps} × ${weight}`;
  if (weight) return weight;
  if (reps) return `${reps} reps`;
  return set.raw || '';
}

function appendChatSetRow(root, list, set, { collapsedCount = 0 } = {}) {
  const row = root.createElement('li');
  row.className = collapsedCount > 1
    ? 'chat-workout__set chat-workout__set--repeat'
    : 'chat-workout__set';

  const label = root.createElement('span');
  label.className = 'chat-workout__set-n';
  label.textContent = collapsedCount > 1 ? `${collapsedCount} sets` : `Set ${set.index}`;

  const load = root.createElement('span');
  load.className = 'chat-workout__set-load';
  load.textContent = formatChatLoad(set);

  row.append(label, load);
  const cable = formatChatCable(set.cable);
  if (cable) {
    const cableNode = root.createElement('span');
    cableNode.className = 'chat-workout__set-cable';
    cableNode.textContent = cable;
    row.append(cableNode);
  }
  list.append(row);
}

function renderWorkoutChat(root, container, plan) {
  const card = root.createElement('div');
  card.className = 'chat-workout';
  if (plan.intro) {
    const intro = root.createElement('p');
    intro.className = 'chat-workout__intro';
    appendInlineSegments(root, intro, plan.intro);
    card.append(intro);
  }

  const list = root.createElement('ol');
  list.className = 'chat-workout__exercises';
  for (const [index, exercise] of plan.exercises.entries()) {
    const item = root.createElement('li');
    item.className = 'chat-workout__exercise';

    const head = root.createElement('div');
    head.className = 'chat-workout__head';
    const num = root.createElement('span');
    num.className = 'chat-workout__num';
    num.textContent = `${index + 1}`;
    const name = root.createElement('strong');
    name.className = 'chat-workout__name';
    name.textContent = exercise.name;
    head.append(num, name);
    item.append(head);

    if (exercise.cue) {
      const cue = root.createElement('p');
      cue.className = 'chat-workout__cue';
      cue.textContent = exercise.cue;
      item.append(cue);
    }

    if (exercise.sets.length) {
      const sets = root.createElement('ul');
      sets.className = 'chat-workout__sets';
      if (setsAreIdentical(exercise.sets)) {
        appendChatSetRow(root, sets, exercise.sets[0], { collapsedCount: exercise.sets.length });
      } else {
        for (const set of exercise.sets) appendChatSetRow(root, sets, set);
      }
      item.append(sets);
    }
    list.append(item);
  }
  card.append(list);

  if (plan.outro) {
    const outro = root.createElement('p');
    outro.className = 'chat-workout__outro';
    appendInlineSegments(root, outro, plan.outro);
    card.append(outro);
  }
  container.append(card);
}

// Chat bubbles always opt into multiline lists, and turn a dumped workout
// prescription into stacked exercise rows instead of one run-on paragraph.
export function renderChatMarkdown(root, container, text) {
  container.replaceChildren();
  const plan = parseWorkoutChat(text);
  if (plan) {
    renderWorkoutChat(root, container, plan);
    return;
  }
  renderInlineMarkdown(root, container, text, { multiline: true });
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

function appendNotesField(root, fields, inputs, notes) {
  const notesDt = root.createElement('dt');
  notesDt.textContent = humanizeFieldLabel('notes');
  const notesDd = root.createElement('dd');
  const notesInput = root.createElement('input');
  notesInput.value = notes ?? '';
  notesInput.dataset.field = 'notes';
  notesDd.append(notesInput);
  fields.append(notesDt, notesDd);
  inputs.notes = notesInput;
}

export function appendRecordProposal(root, { path, record, notes, warnings, libraryByName }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const card = root.createElement('li');
  card.className = 'record-proposal';
  card.dataset.path = path;

  const isWorkout = record.type === 'workout';
  const plannedWorkout = isWorkout && record.status === 'planned';

  const summary = root.createElement('p');
  summary.className = plannedWorkout ? 'record-proposal__eyebrow' : '';
  summary.textContent = plannedWorkout
    ? 'Proposed session'
    : `Proposed ${record.type} record for ${formatDisplayDate(record.date)}`;
  card.append(summary);

  if (isWorkout) {
    appendWorkoutPlanCard(root, card, { record, libraryByName });
  }

  const fields = root.createElement('dl');
  fields.className = 'record-proposal__fields';
  const inputs = {};
  const displayRecord = { ...record };
  // Always surface sodium on meal proposals so a missing estimate is obvious to edit.
  if (record.type === 'meal' && displayRecord.sodium_mg == null) displayRecord.sodium_mg = '';
  if (!plannedWorkout) {
    for (const [key, value] of Object.entries(displayRecord)) {
      if (HIDDEN_FIELDS.has(key) || (typeof value === 'object' && value !== null)) continue;
      if (isWorkout && WORKOUT_HEADER_FIELDS.has(key)) continue;
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
  }
  appendNotesField(root, fields, inputs, notes);
  card.append(fields);

  if (!isWorkout && Array.isArray(record.exercises) && record.exercises.length > 0) {
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

  // Phase 6a: deterministic protocol lint -- a non-blocking heads-up, never a reason to
  // disable Confirm. Adam can always override; this just makes a silent protocol drift
  // visible instead of relying on Chadwick to remember every rule every time.
  if (Array.isArray(warnings) && warnings.length > 0) {
    const warningsList = root.createElement('ul');
    warningsList.className = 'record-proposal__warnings';
    for (const warning of warnings) {
      const item = root.createElement('li');
      item.textContent = `⚠ ${warning}`;
      warningsList.append(item);
    }
    card.append(warningsList);
  }

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'record-proposal__confirm';
  confirm.textContent = plannedWorkout ? 'Start workout' : 'Confirm';
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

const CN_PATCH_DETAIL_MAX = 160;

function truncateCnPatchDetail(text, max = CN_PATCH_DETAIL_MAX) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1))}…`;
}

function cnPatchAffectedDetail(patch) {
  const payload = patch?.payload && typeof patch.payload === 'object' ? patch.payload : {};
  const parts = [];
  if (typeof payload.match === 'string' && payload.match.trim()) {
    parts.push(truncateCnPatchDetail(payload.match));
  }
  if (typeof payload.text === 'string' && payload.text.trim()) {
    parts.push(truncateCnPatchDetail(payload.text));
  }
  return parts.filter(Boolean).join(' · ');
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

  const detailText = cnPatchAffectedDetail(patch);
  if (detailText) {
    const detail = root.createElement('p');
    detail.className = 'cn-patch-proposal__detail';
    detail.textContent = detailText;
    card.append(detail);
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
