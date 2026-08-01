const HEADING = '## 🔴 Current Constraints & Priorities';

export function extractConstraints(centralNodeMarkdown) {
  if (typeof centralNodeMarkdown !== 'string') throw new TypeError('centralNodeMarkdown must be a string');
  const start = centralNodeMarkdown.indexOf(HEADING);
  if (start === -1) return '';
  const rest = centralNodeMarkdown.slice(start + HEADING.length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}
