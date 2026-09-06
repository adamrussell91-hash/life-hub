/**
 * Flush completed chat blocks so streamed replies read as turns, not one wall.
 * Blank lines still split. A markdown heading on its own line also starts a
 * fresh bubble. Workouts stay in one remainder when they use single newlines.
 * A continuing numbered list stays in one bubble even with blank lines.
 */

export const CHAT_BLOCK_BREAK = /\n{2,}|\n(?=#{1,3}\s)/;

const NUMBERED_LINE = /^\d+[\.)]\s+\S/;

function lineAt(text, edge) {
  const lines = String(text).split('\n');
  const line = edge === 'last' ? lines[lines.length - 1] : lines[0];
  return (line || '').trim();
}

function continuesNumberedList(before, after) {
  return NUMBERED_LINE.test(lineAt(before, 'last')) && NUMBERED_LINE.test(lineAt(after.trimStart(), 'first'));
}

export function takeCompletedChatBlocks(buffer) {
  let rest = String(buffer ?? '');
  const blocks = [];
  while (rest) {
    const match = CHAT_BLOCK_BREAK.exec(rest);
    if (!match || match[0].length === 0) break;
    const block = rest.slice(0, match.index).trim();
    const after = rest.slice(match.index + match[0].length);
    if (block && continuesNumberedList(block, after)) {
      rest = `${rest.slice(0, match.index)}\n${after}`;
      continue;
    }
    rest = after;
    if (block) blocks.push(block);
  }
  return { blocks, rest };
}
