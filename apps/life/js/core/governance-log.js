import { daysBetween, isCalendarDate } from './time.js';

export const GOVERNANCE_LOG_PATH = 'data/governance/governance-log.md';

export const GOVERNANCE_ENTRY_TYPES = [
  "Coach's Notes",
  'Session Triage',
  'Cross-Domain Tension',
  'Major Decision',
  'Drift Detection',
  'Escalation',
  'Closed Loop Review',
  'Weekly Review',
  'Goal Audit',
  'Direction Session',
  'Principle Update',
  'Mind Insight',
  'Capability Action'
];

const TITLE_LINE = '# Governance Log\n';
const ENTRY_HEADING_RE = /^## /m;

export function emptyGovernanceLog() {
  return TITLE_LINE;
}

function optionalLine(label, value) {
  return typeof value === 'string' && value.trim() ? `**${label}:** ${value.trim()}` : null;
}

export function formatGovernanceEntry({
  dateKey,
  entryType,
  body,
  status,
  title,
  chosen,
  reasoning,
  revisit
} = {}) {
  if (typeof dateKey !== 'string' || !dateKey.trim()) return null;
  if (!GOVERNANCE_ENTRY_TYPES.includes(entryType)) return null;
  if (typeof body !== 'string' || !body.trim()) return null;

  const lines = [`## ${dateKey.trim()} — ${entryType}`];
  for (const line of [
    optionalLine('Title', title),
    optionalLine('Status', status),
    optionalLine('Chosen', chosen),
    optionalLine('Reasoning', reasoning),
    optionalLine('Revisit', revisit)
  ]) {
    if (line) lines.push(line);
  }
  lines.push('');
  lines.push(body.trim());
  lines.push('');
  return lines.join('\n');
}

export function appendGovernanceEntry(content, entry) {
  const formatted = formatGovernanceEntry(entry);
  if (formatted == null) return content;

  const source = typeof content === 'string' && content.length > 0 ? content : emptyGovernanceLog();
  if (source.startsWith(TITLE_LINE)) {
    const rest = source.slice(TITLE_LINE.length).replace(/^\n+/, '');
    return rest ? `${TITLE_LINE}\n${formatted}${rest}` : `${TITLE_LINE}\n${formatted}`;
  }

  const titleMatch = /^# Governance Log\s*\n?/.exec(source);
  if (titleMatch) {
    const after = source.slice(titleMatch[0].length).replace(/^\n+/, '');
    return after
      ? `# Governance Log\n\n${formatted}${after}`
      : `# Governance Log\n\n${formatted}`;
  }

  return `${TITLE_LINE}\n${formatted}${source.replace(/^\n+/, '')}`;
}

export function recentGovernanceTail(content, { maxEntries = 10, maxChars = 12000 } = {}) {
  if (typeof content !== 'string' || !content.trim()) return '';

  const entries = splitGovernanceEntries(content);
  if (entries.length === 0) return '';

  const selected = [];
  let totalChars = 0;
  for (const entry of entries) {
    if (selected.length >= maxEntries) break;
    const nextLen = totalChars === 0 ? entry.length : totalChars + 1 + entry.length;
    if (nextLen > maxChars && selected.length > 0) break;
    if (entry.length > maxChars && selected.length === 0) {
      selected.push(entry.slice(0, maxChars));
      break;
    }
    selected.push(entry);
    totalChars = nextLen;
  }

  return selected.join('\n');
}

function splitGovernanceEntries(content) {
  const matches = [...content.matchAll(new RegExp(ENTRY_HEADING_RE.source, 'gm'))];
  if (matches.length === 0) return [];

  const entries = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const entry = content.slice(start, end).replace(/\s+$/, '') + '\n';
    entries.push(entry);
  }
  return entries;
}

/**
 * Parse governance-log markdown into structured entries.
 * Splits on the same `## ` headings recentGovernanceTail uses.
 */
export function parseGovernanceEntries(content) {
  if (typeof content !== 'string' || !content.trim()) return [];
  return splitGovernanceEntries(content).map(parseGovernanceEntryBlock).filter(Boolean);
}

function parseGovernanceEntryBlock(block) {
  const heading = /^##\s+(.+?)\s*$/m.exec(block);
  if (!heading) return null;
  const headingText = heading[1].trim();
  const parts = headingText.split(/\s+—\s+/);
  const dateKey = parts[0]?.trim() || null;
  const entryType = parts.slice(1).join(' — ').trim() || null;

  const titleMatch = /^\*\*Title:\*\*\s*(.+)$/m.exec(block);
  const statusMatch = /^\*\*Status:\*\*\s*(.+)$/m.exec(block);
  const chosenMatch = /^\*\*Chosen:\*\*\s*(.+)$/m.exec(block);
  const reasoningMatch = /^\*\*Reasoning:\*\*\s*(.+)$/m.exec(block);
  const revisitMatch = /^\*\*Revisit:\*\*\s*(.+)$/m.exec(block);

  const withoutHeading = block.slice(heading.index + heading[0].length);
  const body = withoutHeading
    .replace(/^\*\*Title:\*\*.*$/m, '')
    .replace(/^\*\*Status:\*\*.*$/m, '')
    .replace(/^\*\*Chosen:\*\*.*$/m, '')
    .replace(/^\*\*Reasoning:\*\*.*$/m, '')
    .replace(/^\*\*Revisit:\*\*.*$/m, '')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');

  return {
    dateKey: dateKey || null,
    entryType: entryType || null,
    title: titleMatch ? titleMatch[1].trim() : null,
    status: statusMatch ? statusMatch[1].trim() : null,
    chosen: chosenMatch ? chosenMatch[1].trim() : null,
    reasoning: reasoningMatch ? reasoningMatch[1].trim() : null,
    revisit: revisitMatch ? revisitMatch[1].trim() : null,
    body
  };
}

function normalizeTraceTitle(title) {
  return typeof title === 'string' ? title.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

/**
 * Same-title decision / idea threads, oldest step first.
 * One-off untitled entries are not traces.
 */
export function decisionTraces(entries) {
  const groups = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = normalizeTraceTitle(entry?.title);
    if (!key) continue;
    const group = groups.get(key) ?? { title: entry.title.trim(), steps: [] };
    group.steps.push(entry);
    groups.set(key, group);
  }
  const traces = [...groups.values()].filter(group => group.steps.length >= 2);
  for (const trace of traces) {
    trace.steps.sort((a, b) => {
      const aOk = isCalendarDate(a.dateKey);
      const bOk = isCalendarDate(b.dateKey);
      if (aOk && bOk) return a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0;
      if (aOk) return -1;
      if (bOk) return 1;
      return 0;
    });
  }
  traces.sort((a, b) => {
    const aLatest = a.steps[a.steps.length - 1]?.dateKey ?? '';
    const bLatest = b.steps[b.steps.length - 1]?.dateKey ?? '';
    return aLatest < bLatest ? 1 : aLatest > bLatest ? -1 : 0;
  });
  return traces;
}

function isResolvedStatus(status) {
  return typeof status === 'string' && status.trim().toLowerCase() === 'resolved';
}

/**
 * Unresolved governance entries annotated with ageDays when dateKey is valid.
 * Malformed/missing dateKey → included without ageDays (never dropped).
 */
export function openGovernanceEntries(markdown, today) {
  if (!isCalendarDate(today)) return [];
  return parseGovernanceEntries(markdown)
    .filter(entry => !isResolvedStatus(entry.status))
    .map(entry => {
      if (isCalendarDate(entry.dateKey)) {
        return { ...entry, ageDays: daysBetween(entry.dateKey, today) };
      }
      return { ...entry };
    });
}

/** Oldest unresolved entry (by dateKey), or null. Entries without a valid dateKey sort last. */
export function oldestOpenGovernanceEntry(markdown, today) {
  const open = openGovernanceEntries(markdown, today);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const aOk = isCalendarDate(a.dateKey);
    const bOk = isCalendarDate(b.dateKey);
    if (aOk && bOk) return a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  })[0];
}

