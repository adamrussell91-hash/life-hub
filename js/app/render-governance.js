import { parseGovernanceEntries, recentGovernanceTail } from '../core/governance-log.js';

export function renderGovernance(root, governanceLogMarkdown) {
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

    if (entry.body) {
      const body = root.createElement('p');
      body.className = 'governance-entry-body';
      body.textContent = entry.body;
      block.append(body);
    }

    container.append(block);
  }
}
