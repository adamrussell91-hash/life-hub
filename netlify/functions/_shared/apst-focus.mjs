/**
 * Twin of sanitizeApstFocus in apps/tasks/src/domain/apst.ts.
 * Codes only — titles stay in apst.ts. A unit test locks this list to that file.
 * Do not accept codes with a pattern.
 */
const CODES = [
  '1.1', '1.2', '1.3', '1.4', '1.5', '1.6',
  '2.1', '2.2', '2.3', '2.4', '2.5', '2.6',
  '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7',
  '4.1', '4.2', '4.3', '4.4', '4.5',
  '5.1', '5.2', '5.3', '5.4', '5.5',
  '6.1', '6.2', '6.3', '6.4',
  '7.1', '7.2', '7.3', '7.4'
];

export function sanitizeApstFocus(raw) {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set(raw.map((value) => String(value).trim()));
  return CODES.filter((code) => wanted.has(code));
}
