/**
 * Assemble ledger for one person: derived task items + stored Clare/Adam items.
 * One query feeds directory counts and the pane columns (V4).
 */

const OPEN_TASK_STATUSES = new Set(['open', 'in_progress']);

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatchesWaitingOn(waitingOn, person) {
  const hay = normalizeName(waitingOn);
  if (!hay) return false;
  const names = [person.display_name, ...(person.aliases ?? [])]
    .map(normalizeName)
    .filter((n) => n.length >= 2);
  return names.some((n) => hay === n || hay.includes(n) || n.includes(hay));
}

/**
 * @param {object} input
 * @param {{ ref: string, display_name: string, aliases?: string[] }} input.person
 * @param {Array<{ ref, label, href?, status?, relationship_type? }>} [input.linkedTasks]
 *   Tasks linked via contact/collaborator (from brief open_loops or overview).
 * @param {Array<{ id, ref, title, waiting_on?, status? }>} [input.waitingOnTasks]
 *   Tasks whose waiting_on may match this person.
 * @param {Array} [input.storedItems] — projected stored ledger items
 */
export function assemblePersonLedger(input) {
  const person = input.person;
  const youOwe = [];
  const theyOwe = [];
  const seenDerived = new Set();

  for (const task of input.linkedTasks ?? []) {
    const status = task.status ?? task.lifecycle_status ?? 'open';
    if (!OPEN_TASK_STATUSES.has(status)) continue;
    const id = `derived:${task.ref}`;
    if (seenDerived.has(id)) continue;
    seenDerived.add(id);
    youOwe.push({
      id,
      person_ref: person.ref,
      direction: 'you_owe',
      text: task.label ?? task.title ?? 'Open task',
      sources: [{ ref: task.ref, excerpt: task.label ?? task.title ?? '' }],
      source_label: 'task',
      task_ref: task.ref,
      comm_ref: null,
      author: 'adam',
      status: 'open',
      derived: true,
      href: task.href ?? null
    });
  }

  for (const task of input.waitingOnTasks ?? []) {
    const status = task.status ?? 'open';
    if (!OPEN_TASK_STATUSES.has(status)) continue;
    if (!nameMatchesWaitingOn(task.waiting_on, person)) continue;
    const ref = task.ref ?? (task.id ? `tasks:task:${task.id}` : null);
    const id = `derived-waiting:${ref}`;
    if (seenDerived.has(id)) continue;
    seenDerived.add(id);
    theyOwe.push({
      id,
      person_ref: person.ref,
      direction: 'they_owe',
      text: task.title ?? 'Waiting on them',
      sources: [{ ref, excerpt: `waiting on ${task.waiting_on}` }],
      source_label: 'waiting on',
      task_ref: ref,
      comm_ref: null,
      author: 'adam',
      status: 'open',
      derived: true,
      href: null
    });
  }

  for (const item of input.storedItems ?? []) {
    if (item.status === 'dismissed' || item.status === 'done') continue;
    const row = { ...item, derived: false, href: item.href ?? null };
    if (item.direction === 'they_owe') theyOwe.push(row);
    else youOwe.push(row);
  }

  return {
    you_owe: youOwe,
    they_owe: theyOwe,
    you_owe_count: youOwe.length,
    they_owe_count: theyOwe.length,
    open_item_count: youOwe.length + theyOwe.length
  };
}

/**
 * Deterministic Clare scan: pull promise-like phrases from observations and
 * task bodies into ledger create inputs. Full LLM Clare job can replace or
 * augment this later; the UI path is the same (1.4 patch).
 */
export function extractLedgerCandidatesFromText({ person_ref, texts = [] }) {
  const candidates = [];
  const promiseRe =
    /\b(i(?:'|’)ll|i will|need to|must|should|promised?|send|set up|book|follow up)\b/i;

  for (const entry of texts) {
    const text = String(entry.text || '').trim();
    if (!text || text.length < 8) continue;
    if (!promiseRe.test(text)) continue;
    // Prefer a short first sentence / clause.
    const short = text.split(/[.!\n]/)[0].trim().slice(0, 120);
    const direction = /\b(they|he|she|henry|waiting)\b/i.test(text) ? 'they_owe' : 'you_owe';
    candidates.push({
      person_ref,
      direction,
      text: short,
      sources: [{ ref: entry.ref ?? null, excerpt: short }],
      task_ref: entry.kind === 'task' ? entry.ref : null,
      comm_ref: null,
      author: 'clare'
    });
  }
  return candidates;
}
