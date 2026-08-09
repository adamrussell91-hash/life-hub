const PURPOSE_HEADING = '# Purpose';
const WRITING_RULES_HEADING = '## 📏 Writing Rules';
const AGENT_DIRECTORY_HEADING = '## 🤖 Agent Directory';
const CONSTRAINTS_HEADING = '## 🔴 Current Constraints & Priorities';
const TODAYS_STATUS_HEADING = "## ⚡ Today's Status";
const THIS_WEEK_HEADING = '## 📅 This Week';
const THIS_MONTH_HEADING = '## 📊 This Month';
const LONG_TERM_TRENDS_HEADING = '## 📈 Long-Term Trends & Patterns';
const CROSS_AGENT_HEADING = '## 🤝 Cross-Agent Coordination';
const RECENT_ACTIONS_HEADING = '## 📝 Recent Agent Actions';

export function extractSection(markdown, headingPrefix) {
  if (typeof markdown !== 'string') throw new TypeError('markdown must be a string');
  if (typeof headingPrefix !== 'string' || headingPrefix.trim() === '') {
    throw new TypeError('headingPrefix must be a non-empty string');
  }
  const escaped = headingPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}.*$`, 'm').exec(markdown);
  if (!match) return '';
  const rest = markdown.slice(match.index + match[0].length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

export function extractConstraints(markdown) {
  return extractSection(markdown, CONSTRAINTS_HEADING);
}

export function extractTodaysStatus(markdown) {
  return extractSection(markdown, TODAYS_STATUS_HEADING);
}

export function extractThisWeek(markdown) {
  return extractSection(markdown, THIS_WEEK_HEADING);
}

export function extractThisMonth(markdown) {
  return extractSection(markdown, THIS_MONTH_HEADING);
}

export function extractLongTermTrends(markdown) {
  return extractSection(markdown, LONG_TERM_TRENDS_HEADING);
}

export function extractCrossAgentCoordination(markdown) {
  return extractSection(markdown, CROSS_AGENT_HEADING);
}

export function extractRecentAgentActions(markdown) {
  return extractSection(markdown, RECENT_ACTIONS_HEADING);
}

export {
  PURPOSE_HEADING,
  WRITING_RULES_HEADING,
  AGENT_DIRECTORY_HEADING,
  CONSTRAINTS_HEADING,
  TODAYS_STATUS_HEADING,
  THIS_WEEK_HEADING,
  THIS_MONTH_HEADING,
  LONG_TERM_TRENDS_HEADING,
  CROSS_AGENT_HEADING,
  RECENT_ACTIONS_HEADING
};
