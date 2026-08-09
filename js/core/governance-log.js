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
  'Principle Update'
];

const TITLE_LINE = '# Governance Log\n';
const ENTRY_HEADING_RE = /^## /m;

export function emptyGovernanceLog() {
  return TITLE_LINE;
}

export function formatGovernanceEntry({ dateKey, entryType, body, status, title } = {}) {
  if (typeof dateKey !== 'string' || !dateKey.trim()) return null;
  if (!GOVERNANCE_ENTRY_TYPES.includes(entryType)) return null;
  if (typeof body !== 'string' || !body.trim()) return null;

  const lines = [`## ${dateKey.trim()} — ${entryType}`];
  if (typeof title === 'string' && title.trim()) {
    lines.push(`**Title:** ${title.trim()}`);
  }
  if (typeof status === 'string' && status.trim()) {
    lines.push(`**Status:** ${status.trim()}`);
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
