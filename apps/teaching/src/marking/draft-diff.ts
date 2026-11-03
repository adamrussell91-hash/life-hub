/** What changed between two drafts of a student's words, word by word. Pure, apart from drawing it. */
import { el } from '@/quiz/dom';

export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

const tokens = (text: string): string[] => text.match(/[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}'’\s]/gu) ?? [];

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const lcs: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string): void => {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push('same', a[i]!); i += 1; j += 1; }
    else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { push('removed', a[i]!); i += 1; }
    else { push('added', b[j]!); j += 1; }
  }
  return parts;
}

export function changesSheet(before: string, after: string): HTMLElement {
  const sheet = el('p', 'mk-changes');
  if (before === after) {
    sheet.textContent = 'No changes';
    return sheet;
  }
  for (const part of wordDiff(before, after)) {
    if (part.kind === 'same') sheet.append(part.text);
    else sheet.append(el(part.kind === 'removed' ? 'del' : 'ins', undefined, part.text));
  }
  return sheet;
}
