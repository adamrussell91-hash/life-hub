import { decisionTraces, parseGovernanceEntries, recentGovernanceTail } from '../core/governance-log.js';
import { daysBetween, formatDisplayDate, getSydneyDateKey, isCalendarDate } from '../core/time.js';

function displayDate(value) {
  return isCalendarDate(value) ? formatDisplayDate(value) : value;
}

function appendField(root, block, className, label, value) {
  if (!value) return;
  const line = root.createElement('p');
  line.className = `governance-entry-decision ${className}`;
  line.textContent = `${label}: ${label === 'Revisit' ? displayDate(value) : value}`;
  block.append(line);
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
    const resolved = typeof entry.status === 'string' && entry.status.trim().toLowerCase() === 'resolved';
    if (!resolved && isCalendarDate(entry.dateKey) && isCalendarDate(today)) {
      bits.push(`${daysBetween(entry.dateKey, today)}d open`);
    }
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
    appendField(root, block, 'governance-entry-reasoning', 'Reasoning', entry.reasoning);
    appendField(root, block, 'governance-entry-revisit', 'Revisit', entry.revisit);

    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }

    container.append(block);
  }
}
