import { formatExerciseSets, formatExerciseTitle, humanizeFieldLabel } from './format-exercise.js';
import { applyAgentAvatarToBubble } from './render-agent-picker.js';
import { showEphemeralMessage } from './ephemeral-message.js';
import { appendWorkoutPlanCard } from './render-workout-plan.js';
import { parseWorkoutChat, setsAreIdentical } from '../core/parse-workout-chat.js';
import { formatDisplayDate } from '../core/time.js';
import { syncChatChrome } from './chat-chrome.js';

const HIDDEN_FIELDS = new Set(['schema_version', 'id', 'type', 'date', 'created_at', 'updated_at', 'source', 'exercises', 'focus', 'tags', 'highlights', 'challenges', 'products', 'system_note']);
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

const STICK_PX = 80;

export function isChatPinned(list) {
  if (!list) return true;
  const height = list.clientHeight || 0;
  return list.scrollHeight - (list.scrollTop || 0) - height < STICK_PX;
}

export function scrollChatIfPinned(list, pinned = true) {
  if (list && pinned) list.scrollTop = list.scrollHeight;
}

export function appendMessage(root, { role, agentSlug, text = '', actions = true } = {}) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const pinned = isChatPinned(list);
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
  if (actions !== false) appendMessageActions(root, item, role);
  list.append(item);
  scrollChatIfPinned(list, pinned);
  syncChatChrome(root);
  return item;
}

function appendMessageActions(root, item, role) {
  if (role !== 'user' && role !== 'assistant') return;
  const actions = root.createElement('div');
  actions.className = 'chat-message__actions';
  const copy = root.createElement('button');
  copy.type = 'button';
  copy.className = 'chat-message__action';
  copy.dataset.chatAction = 'copy';
  copy.textContent = 'Copy';
  actions.append(copy);
  if (role === 'user') {
    const retry = root.createElement('button');
    retry.type = 'button';
    retry.className = 'chat-message__action';
    retry.dataset.chatAction = 'retry';
    retry.textContent = 'Retry';
    actions.append(retry);
  }
  item.append(actions);
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
  let inFence = false;
  let fenceLang = '';
  let fenceLines = [];
  for (const rawLine of lines) {
    const fence = rawLine.trim().startsWith('```');
    if (fence) {
      currentList = null;
      currentListType = null;
      if (!inFence) {
        inFence = true;
        fenceLang = rawLine.trim().slice(3).trim();
        fenceLines = [];
      } else {
        appendCodeBlock(root, container, fenceLines.join('\n'), fenceLang);
        inFence = false;
        fenceLang = '';
        fenceLines = [];
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();
    if (line === '') continue;
    if (line === '---') {
      currentList = null;
      currentListType = null;
      container.append(root.createElement('hr'));
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      currentList = null;
      currentListType = null;
      const node = root.createElement(`h${heading[1].length + 2}`);
      node.className = `chat-md-h${heading[1].length}`;
      appendInlineSegments(root, node, heading[2]);
      container.append(node);
      continue;
    }
    if (line.startsWith('> ')) {
      currentList = null;
      currentListType = null;
      const quote = root.createElement('blockquote');
      appendInlineSegments(root, quote, line.slice(2));
      container.append(quote);
      continue;
    }
    if (line.includes('|') && line.split('|').length >= 3) {
      currentList = null;
      currentListType = null;
      appendTableRow(root, container, line);
      continue;
    }
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
  if (inFence) appendCodeBlock(root, container, fenceLines.join('\n'), fenceLang);
}

function formatChatCable(cable) {
  if (!cable) return '';
  const lower = cable.toLowerCase();
  if (lower === 'none' || lower.startsWith('none ')) return 'constant force';
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
      if (exercise.between?.name) {
        const between = root.createElement('p');
        between.className = 'chat-workout__between';
        const load = exercise.between.sets[0];
        const count = exercise.between.sets.length;
        const loadText = load
          ? `${count > 1 ? `${count} × ` : ''}${load.reps} × ${load.weightKg === 0 ? 'bodyweight' : `${load.weightKg} kg`}`
          : '';
        between.textContent = `Between sets: ${exercise.between.name}${loadText ? ` · ${loadText}` : ''}`;
        item.append(between);
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
  const segments = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).filter(Boolean);
  for (const segment of segments) {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      const node = root.createElement('strong');
      node.textContent = segment.slice(2, -2);
      container.append(node);
      continue;
    }
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
      const node = root.createElement('code');
      node.textContent = segment.slice(1, -1);
      container.append(node);
      continue;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(segment);
    if (link) {
      const node = root.createElement('a');
      node.href = link[2];
      node.textContent = link[1];
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      container.append(node);
      continue;
    }
    const node = root.createElement('span');
    node.textContent = segment;
    container.append(node);
  }
}

function appendCodeBlock(root, container, code, lang) {
  const pre = root.createElement('pre');
  pre.className = 'chat-code';
  if (lang) pre.dataset.lang = lang;
  const node = root.createElement('code');
  node.textContent = code;
  pre.append(node);
  container.append(pre);
}

function appendTableRow(root, container, line) {
  const cells = line.split('|').map(cell => cell.trim()).filter((cell, index, all) => {
    if (index === 0 && cell === '') return false;
    if (index === all.length - 1 && cell === '') return false;
    return true;
  });
  if (!cells.length || cells.every(cell => /^:?-+:?$/.test(cell))) return;
  let table = container.lastChild ?? container.children?.[container.children.length - 1] ?? null;
  if (!table || table.tagName !== 'table') {
    table = root.createElement('table');
    table.className = 'chat-table';
    container.append(table);
  }
  const isHeader = table.children.length === 0;
  const row = root.createElement('tr');
  for (const cell of cells) {
    const td = root.createElement(isHeader ? 'th' : 'td');
    appendInlineSegments(root, td, cell);
    row.append(td);
  }
  table.append(row);
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
  card.className = 'record-proposal confirm-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
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
  } else if (isWorkout) {
    // Planned cards used to hide day_type/duration/status — Adam could not fix a wrong window.
    for (const key of ['day_type', 'duration_min', 'status']) {
      if (displayRecord[key] == null || displayRecord[key] === '') continue;
      const dt = root.createElement('dt');
      dt.textContent = humanizeFieldLabel(key);
      const dd = root.createElement('dd');
      const input = root.createElement('input');
      input.value = String(displayRecord[key] ?? '');
      input.dataset.field = key;
      dd.append(input);
      fields.append(dt, dd);
      inputs[key] = input;
    }
  }
  if (isWorkout && Array.isArray(record.pain_flags) && record.pain_flags.length > 0) {
    const dt = root.createElement('dt');
    dt.textContent = 'Pain flags';
    const dd = root.createElement('dd');
    dd.className = 'record-proposal__pain-flags';
    for (const flag of record.pain_flags) {
      if (!flag || typeof flag !== 'object') continue;
      const site = typeof flag.site === 'string' ? flag.site.trim() : '';
      if (!site) continue;
      const note = typeof flag.note === 'string' && flag.note.trim() ? flag.note.trim() : '';
      const pill = root.createElement('span');
      pill.className = 'fitness-tag';
      pill.textContent = note ? `${site} — ${note}` : site;
      dd.append(pill);
    }
    fields.append(dt, dd);
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

  const actions = root.createElement('div');
  actions.className = 'confirm-card__actions';

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn btn--primary record-proposal__confirm';
  confirm.textContent = plannedWorkout ? 'Save to Fitness' : 'Confirm';

  const discard = root.createElement('button');
  discard.type = 'button';
  discard.className = 'btn btn--ghost record-proposal__discard';
  discard.textContent = 'Discard';

  actions.append(discard, confirm);
  card.append(actions);

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
  card.className = 'record-proposal cn-patch-proposal confirm-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');

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

  const actions = root.createElement('div');
  actions.className = 'confirm-card__actions';

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn btn--primary record-proposal__confirm';
  confirm.textContent = 'Confirm';

  const discard = root.createElement('button');
  discard.type = 'button';
  discard.className = 'btn btn--ghost record-proposal__discard';
  discard.textContent = 'Discard';

  actions.append(discard, confirm);
  card.append(actions);

  list.append(card);
  list.scrollTop = list.scrollHeight;
  return { card, confirm, discard };
}

export function appendActionProposal(root, { proposal }) {
  const list = root.querySelector('#chat-messages');
  if (!list) return null;
  const card = root.createElement('li');
  card.className = 'record-proposal action-proposal confirm-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');

  const eyebrow = root.createElement('p');
  eyebrow.className = 'record-proposal__eyebrow';
  eyebrow.textContent = 'Proposed action';
  card.append(eyebrow);

  const summary = root.createElement('p');
  summary.className = 'action-proposal__summary';
  summary.textContent = typeof proposal?.intent === 'string' && proposal.intent.trim()
    ? proposal.intent.trim()
    : 'Proposed durable write';
  card.append(summary);

  if (typeof proposal?.agent === 'string' && proposal.agent.trim()) {
    const meta = root.createElement('p');
    meta.className = 'action-proposal__meta';
    meta.textContent = `via ${proposal.agent}`;
    card.append(meta);
  }

  const writes = Array.isArray(proposal?.writes) ? proposal.writes : [];
  if (writes.length > 0) {
    const diffs = root.createElement('ul');
    diffs.className = 'action-proposal__diffs';
    for (const write of writes) {
      const item = root.createElement('li');
      const path = root.createElement('code');
      path.textContent = typeof write?.path === 'string' ? write.path : '(unknown path)';
      item.append(path);
      const detail = root.createElement('div');
      detail.className = 'action-proposal__diff';
      const mode = typeof write?.mode === 'string' ? write.mode : 'write';
      const diff = typeof write?.diff === 'string' && write.diff.trim()
        ? write.diff.trim()
        : mode;
      detail.textContent = `${mode}: ${diff}`;
      item.append(detail);
      diffs.append(item);
    }
    card.append(diffs);
  }

  const actions = root.createElement('div');
  actions.className = 'confirm-card__actions';

  const confirm = root.createElement('button');
  confirm.type = 'button';
  confirm.className = 'btn btn--primary record-proposal__confirm';
  confirm.textContent = 'Confirm';

  const discard = root.createElement('button');
  discard.type = 'button';
  discard.className = 'btn btn--ghost record-proposal__discard';
  discard.textContent = 'Discard';

  actions.append(discard, confirm);
  card.append(actions);

  list.append(card);
  list.scrollTop = list.scrollHeight;
  return { card, confirm, discard };
}

export function setChatBusy(root, busy) {
  const input = root.querySelector('#chat-input');
  const button = root.querySelector('#chat-send');
  const stop = root.querySelector('#chat-stop');
  if (input) input.disabled = busy;
  if (button) {
    button.disabled = busy;
    button.hidden = Boolean(busy && stop);
  }
  if (stop) {
    stop.hidden = !busy;
    stop.disabled = !busy;
  }
}

export function showChatError(root, message) {
  const banner = root.querySelector('#chat-error');
  if (!banner) return;
  showEphemeralMessage(banner, message);
}
