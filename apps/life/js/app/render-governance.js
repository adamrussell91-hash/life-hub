import { decisionTraces, isOpenLoopEntry, parseGovernanceEntries, recentGovernanceTail } from '../core/governance-log.js';
import { daysBetween, formatDisplayDate, getSydneyDateKey, isCalendarDate } from '../core/time.js';

function displayDate(value) {
  return isCalendarDate(value) ? formatDisplayDate(value) : value;
}

// Three Weekly Review / Goal Audit cycles is long enough that an open loop
// surviving that long is not "still being worked" -- it is rotting. Flag it
// instead of letting it sit at the same visual weight as a fresh one.
const STALE_OPEN_LOOP_DAYS = 21;

function appendField(root, block, className, label, value) {
  if (!value) return;
  const line = root.createElement('p');
  line.className = `governance-entry-decision ${className}`;
  line.textContent = `${label}: ${label === 'Revisit' ? displayDate(value) : value}`;
  block.append(line);
}

const LONG_FIELD_PREVIEW_CHARS = 320;
const INLINE_MARKDOWN_RE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

function appendText(root, parent, text) {
  if (!text) return;
  if (typeof root.createTextNode === 'function') {
    parent.append(root.createTextNode(text));
    return;
  }
  const span = root.createElement('span');
  span.textContent = text;
  parent.append(span);
}

/** `**bold**` and `` `code` `` only -- Governance Log bodies never carry richer markdown. */
function appendInlineMarkdown(root, parent, text) {
  const source = String(text ?? '');
  INLINE_MARKDOWN_RE.lastIndex = 0;
  let last = 0;
  let match;
  while ((match = INLINE_MARKDOWN_RE.exec(source)) !== null) {
    if (match.index > last) appendText(root, parent, source.slice(last, match.index));
    const el = root.createElement(match[1] != null ? 'strong' : 'code');
    el.textContent = match[1] != null ? match[1] : match[2];
    parent.append(el);
    last = INLINE_MARKDOWN_RE.lastIndex;
  }
  if (last < source.length) appendText(root, parent, source.slice(last));
}

/**
 * Governance bodies mix `- ` bullet runs (Capability Action diffs) with plain
 * lines (Weekly Review prose). Preserve that shape instead of flattening
 * newlines into one run-on paragraph (the actual bug behind "**Agent:**
 * clare **Intent:**..." rendering as one illegible line).
 */
function appendMultilineBlock(root, container, className, text) {
  const lines = String(text ?? '').split('\n');
  let list = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = root.createElement('ul');
        list.className = `${className}-list`;
        container.append(list);
      }
      const item = root.createElement('li');
      appendInlineMarkdown(root, item, bullet[1]);
      list.append(item);
      continue;
    }
    list = null;
    const p = root.createElement('p');
    p.className = className;
    appendInlineMarkdown(root, p, line);
    container.append(p);
  }
}

function clipToWord(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function isLongField(text) {
  if (text.length > LONG_FIELD_PREVIEW_CHARS) return true;
  return text.split('\n').filter(line => line.trim()).length > 3;
}

/**
 * Reasoning/body carry unbounded LLM prose or multi-line capability diffs.
 * Render them with real line/list structure and inline `**bold**`, and
 * collapse anything long behind a toggle instead of one flat wall of text.
 */
function appendLongField(root, block, className, label, value) {
  if (!value) return;
  const text = String(value);
  const wrap = root.createElement('div');
  wrap.className = `governance-entry-longfield ${className}`;

  if (label) {
    const labelEl = root.createElement('p');
    labelEl.className = `${className}-label governance-entry-field-label`;
    labelEl.textContent = `${label}:`;
    wrap.append(labelEl);
  }

  const content = root.createElement('div');
  content.className = `${className}-content`;
  wrap.append(content);

  if (!isLongField(text)) {
    appendMultilineBlock(root, content, className, text);
    block.append(wrap);
    return;
  }

  const preview = clipToWord(text, LONG_FIELD_PREVIEW_CHARS);
  let expanded = false;
  appendMultilineBlock(root, content, className, preview);

  const toggle = root.createElement('button');
  toggle.type = 'button';
  toggle.className = 'governance-entry-toggle';
  toggle.textContent = 'Show more';
  toggle.addEventListener?.('click', () => {
    expanded = !expanded;
    content.replaceChildren();
    appendMultilineBlock(root, content, className, expanded ? text : preview);
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });
  wrap.append(toggle);
  block.append(wrap);
}

function renderTraces(root, container, entries) {
  const traces = decisionTraces(entries);
  if (traces.length === 0) return;
  const wrap = root.createElement('section');
  wrap.className = 'governance-traces';
  wrap.dataset.governanceTraces = '';
  const heading = root.createElement('h3');
  heading.className = 'governance-traces__title';
  heading.textContent = 'How this changed';
  wrap.append(heading);
  for (const trace of traces) {
    const article = root.createElement('article');
    article.className = 'governance-trace';
    const title = root.createElement('p');
    title.className = 'governance-trace__title';
    title.textContent = trace.title;
    const list = root.createElement('ol');
    list.className = 'governance-trace__steps';
    for (const step of trace.steps) {
      const item = root.createElement('li');
      item.textContent = [
        displayDate(step.dateKey),
        step.chosen || step.status || step.body
      ].filter(Boolean).join(' — ');
      list.append(item);
    }
    article.append(title, list);
    wrap.append(article);
  }
  container.append(wrap);
}

export function renderGovernance(root, governanceLogMarkdown, { today = getSydneyDateKey() } = {}) {
  const container = root.querySelector?.('[data-central-node="governance-log"]');
  if (!container) return;

  container.replaceChildren();
  const tail = recentGovernanceTail(typeof governanceLogMarkdown === 'string' ? governanceLogMarkdown : '');
  const entries = parseGovernanceEntries(tail);

  if (entries.length === 0) {
    const empty = root.createElement('p');
    empty.className = 'governance-empty';
    empty.textContent = 'No governance entries yet.';
    container.append(empty);
    return;
  }

  renderTraces(root, container, entries);

  for (const entry of entries) {
    const block = root.createElement('article');
    block.className = 'governance-entry';

    const heading = root.createElement('p');
    heading.className = 'governance-entry-heading';
    const bits = [entry.dateKey, entry.entryType].filter(Boolean);
    let stale = false;
    if (isOpenLoopEntry(entry) && isCalendarDate(entry.dateKey) && isCalendarDate(today)) {
      const ageDays = daysBetween(entry.dateKey, today);
      stale = ageDays >= STALE_OPEN_LOOP_DAYS;
      bits.push(stale ? `${ageDays}d open — STALE` : `${ageDays}d open`);
    }
    if (stale) heading.className += ' governance-entry-heading--stale';
    heading.textContent = bits.join(' — ');
    block.append(heading);

    if (entry.title) {
      const title = root.createElement('p');
      title.className = 'governance-entry-title';
      title.textContent = entry.title;
      block.append(title);
    }

    if (entry.status) {
      const status = root.createElement('p');
      status.className = 'governance-entry-status';
      status.dataset.status = entry.status.toLowerCase().replace(/\s+/g, '-');
      status.textContent = entry.status;
      block.append(status);
    }

    appendField(root, block, 'governance-entry-chosen', 'Chosen', entry.chosen);
    appendLongField(root, block, 'governance-entry-reasoning', 'Reasoning', entry.reasoning);
    appendField(root, block, 'governance-entry-revisit', 'Revisit', entry.revisit);

    appendLongField(root, block, 'governance-entry-body', null, entry.body);

    container.append(block);
  }
}
