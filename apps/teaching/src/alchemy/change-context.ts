/**
 * A suggestion shown in context: the sentence around an edit, with the
 * words Ann removes and adds. Works on the field's raw text (which may be
 * HTML) and returns readable text, markup removed.
 */
export type ChangeInContext = { before: string; removed: string; added: string; after: string; trimmedStart: boolean; trimmedEnd: boolean };

const REACH = 110;

function readable(raw: string): string {
  return raw
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

/** Null when oldStr is no longer in the field (the suggestion is stale). */
export function changeInContext(field: string, oldStr: string, newStr: string): ChangeInContext | null {
  const at = field.indexOf(oldStr);
  if (!oldStr || at === -1 || field.indexOf(oldStr, at + 1) !== -1) return null;
  // A fragment that starts or ends inside a tag loses the broken half.
  let before = field.slice(0, at).replace(/<[^>]*$/, '');
  let after = field.slice(at + oldStr.length).replace(/^[^<>]*>/, '');
  before = readable(before);
  after = readable(after);
  const removed = readable(oldStr).trim() ? readable(oldStr) : oldStr;
  const added = readable(newStr).trim() ? readable(newStr) : newStr;

  // Back to the start of the sentence, or REACH characters, whichever is nearer.
  let trimmedStart = false;
  const sentenceStart = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
  if (sentenceStart !== -1 && before.length - sentenceStart <= REACH) before = before.slice(sentenceStart + 2);
  else if (before.length > REACH) { before = before.slice(-REACH).replace(/^\S*\s/, ''); trimmedStart = true; }

  let trimmedEnd = false;
  const end = after.search(/[.!?](\s|$)/);
  if (end !== -1 && end < REACH) after = after.slice(0, end + 1);
  else if (after.length > REACH) { after = after.slice(0, REACH).replace(/\s\S*$/, ''); trimmedEnd = true; }

  return { before: before.replace(/^\s+/, ''), removed, added, after: after.replace(/\s+$/, ''), trimmedStart, trimmedEnd };
}
