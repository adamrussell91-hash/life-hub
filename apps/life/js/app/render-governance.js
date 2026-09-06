import { parseGovernanceEntries, recentGovernanceTail } from '../core/governance-log.js';
import { daysBetween, formatDisplayDate, getSydneyDateKey, isCalendarDate } from '../core/time.js';

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

    for (const [label, value, className] of [
      ['Chosen', entry.chosen, 'governance-entry-chosen'],
      ['Reasoning', entry.reasoning, 'governance-entry-reasoning'],
      ['Revisit', entry.revisit ? formatDisplayDate(entry.revisit) : null, 'governance-entry-revisit']
    ]) {
      if (!value) continue;
      const line = root.createElement('p');
      line.className = `governance-entry-decision ${className}`;
      line.textContent = `${label}: ${value}`;
      block.append(line);
    }

    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }

    container.append(block);
  }
}
