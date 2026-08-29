import {
  CONSTRAINTS_HEADING,
  TODAYS_STATUS_HEADING,
  THIS_WEEK_HEADING,
  THIS_MONTH_HEADING,
  LONG_TERM_TRENDS_HEADING,
  CROSS_AGENT_HEADING,
  RECENT_ACTIONS_HEADING,
  PURPOSE_HEADING,
  WRITING_RULES_HEADING,
  AGENT_DIRECTORY_HEADING
} from './constraints.js';
import {
  upsertStatusField,
  extractTodaysStatusBlock,
  replaceTodaysStatus,
  appendRecentAction,
  appendCrossAgentLine,
  dedupeCrossAgentSection
} from './central-node-write.js';

export const CENTRAL_NODE_SECTIONS = [
  'purpose', 'writing_rules', 'agent_directory', 'constraints',
  'todays_status', 'this_week', 'this_month', 'long_term_trends',
  'cross_agent', 'recent_actions'
];

const SECTION_HEADING = {
  purpose: PURPOSE_HEADING,
  writing_rules: WRITING_RULES_HEADING,
  agent_directory: AGENT_DIRECTORY_HEADING,
  constraints: CONSTRAINTS_HEADING,
  todays_status: TODAYS_STATUS_HEADING,
  this_week: THIS_WEEK_HEADING,
  this_month: THIS_MONTH_HEADING,
  long_term_trends: LONG_TERM_TRENDS_HEADING,
  cross_agent: CROSS_AGENT_HEADING,
  recent_actions: RECENT_ACTIONS_HEADING
};

export function classifyCentralNodePatchRisk(patch) {
  if (!patch || !CENTRAL_NODE_SECTIONS.includes(patch.section)) return 'confirm';
  const { section, op } = patch;
  if (section === 'purpose' || section === 'writing_rules' || section === 'agent_directory') return 'confirm';
  if (op === 'replace_section' || op === 'delete_lines' || op === 'condense') return 'confirm';
  if (section === 'this_month' || section === 'long_term_trends') return 'confirm';
  if (section === 'constraints' && op !== 'append_line') return 'confirm';
  if (section === 'todays_status' && (op === 'upsert_field' || op === 'append_line')) return 'auto';
  if (section === 'cross_agent' && op === 'append_line') return 'auto';
  if (section === 'recent_actions' && op === 'append_line') return 'auto';
  if (section === 'constraints' && op === 'append_line') return 'auto';
  if (section === 'this_week' && op === 'append_line') return 'auto';
  return 'confirm';
}

/** Trailing section HR (`---` before next ##), as used in live central-node.md. */
const TRAILING_SECTION_HR_RE = /(?:\n|^)---\s*$/;

function findSectionSpan(content, headingPrefix) {
  const escaped = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}.*$`, 'm').exec(content);
  if (!match) return null;
  const headingStart = match.index;
  const headingEnd = match.index + match[0].length;
  const after = content.slice(headingEnd);
  const endRel = after.search(/\n## /);
  const bodyEnd = endRel === -1 ? content.length : headingEnd + endRel;
  const rawBody = content.slice(headingEnd, bodyEnd);
  const hrMatch = TRAILING_SECTION_HR_RE.exec(rawBody);
  const contentEnd = hrMatch ? headingEnd + hrMatch.index : bodyEnd;
  return { heading: match[0], headingStart, headingEnd, contentEnd, bodyEnd };
}

function replaceSectionBody(content, headingPrefix, newBody) {
  const span = findSectionSpan(content, headingPrefix);
  if (!span) return null;
  const body = String(newBody ?? '').replace(/^\n+/, '').replace(/\n+$/, '');
  const separator = content.slice(span.contentEnd, span.bodyEnd);
  const after = content.slice(span.bodyEnd);
  return `${content.slice(0, span.headingEnd)}\n${body}${separator}${after.startsWith('\n') ? '' : '\n'}${after}`;
}

function appendLineToSection(content, headingPrefix, text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const span = findSectionSpan(content, headingPrefix);
  if (!span) return null;
  const line = text.startsWith('\n') ? text.slice(1) : text;
  const before = content.slice(0, span.contentEnd).replace(/\s*$/, '');
  const separator = content.slice(span.contentEnd, span.bodyEnd);
  const after = content.slice(span.bodyEnd);
  return `${before}\n${line}${separator}${after.startsWith('\n') ? '' : '\n'}${after}`;
}

function deleteLinesInSection(content, headingPrefix, matchText) {
  if (typeof matchText !== 'string' || matchText === '') return null;
  const span = findSectionSpan(content, headingPrefix);
  if (!span) return null;
  const rawBody = content.slice(span.headingEnd, span.contentEnd);
  const lines = rawBody.split('\n');
  const filtered = lines.filter((line) => !line.includes(matchText));
  const separator = content.slice(span.contentEnd, span.bodyEnd);
  return `${content.slice(0, span.headingEnd)}${filtered.join('\n')}${separator}${content.slice(span.bodyEnd)}`;
}

export function applyCentralNodePatch(content, patch) {
  if (typeof content !== 'string' || !patch || !CENTRAL_NODE_SECTIONS.includes(patch.section)) return null;
  const op = patch.op;
  const payload = patch.payload && typeof patch.payload === 'object' ? patch.payload : {};
  const heading = SECTION_HEADING[patch.section];
  if (!heading) return null;

  if (op === 'upsert_field') {
    if (patch.section !== 'todays_status') return null;
    const field = payload.field;
    const text = payload.text;
    if (typeof field !== 'string' || field.trim() === '' || typeof text !== 'string') return null;
    const block = extractTodaysStatusBlock(content);
    if (!block.heading) return null;
    const nextBody = upsertStatusField(block.body, field, text);
    if (block.dateKey) {
      return replaceTodaysStatus(content, { dateKey: block.dateKey, body: nextBody });
    }
    return replaceSectionBody(content, TODAYS_STATUS_HEADING, nextBody);
  }

  if (op === 'append_line') {
    const text = payload.text;
    if (typeof text !== 'string' || text.trim() === '') return null;
    if (patch.section === 'recent_actions') {
      const next = appendRecentAction(content, text);
      return next === content && !content.includes(RECENT_ACTIONS_HEADING) ? null : next;
    }
    if (patch.section === 'cross_agent') {
      // Prepend (not the generic bottom-append below) to match appendCrossAgentLine's
      // newest-at-top convention used by every specialist auto-write -- trimCrossAgentSection
      // drops from the tail assuming newest-first, so Hammond's own directives must land
      // there too or they'd be the first ones silently trimmed despite being the newest.
      const next = appendCrossAgentLine(content, text);
      return next === content && !content.includes(CROSS_AGENT_HEADING) ? null : dedupeCrossAgentSection(next);
    }
    return appendLineToSection(content, heading, text);
  }

  if (op === 'delete_lines') {
    return deleteLinesInSection(content, heading, payload.match);
  }

  if (op === 'replace_section' || op === 'condense') {
    if (typeof payload.text !== 'string') return null;
    return replaceSectionBody(content, heading, payload.text);
  }

  return null;
}
