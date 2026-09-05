/**
 * Flush completed chat blocks so streamed replies read as turns, not one wall.
 * Blank lines still split. A markdown heading on its own line also starts a
 * fresh bubble. Workouts stay in one remainder when they use single newlines.
 */

export const CHAT_BLOCK_BREAK = /\n{2,}|\n(?=#{1,3}\s)/;

export function takeCompletedChatBlocks(buffer) {
  let rest = String(buffer ?? '');
  const blocks = [];
  while (rest) {
    const match = CHAT_BLOCK_BREAK.exec(rest);
    if (!match || match[0].length === 0) break;
    const block = rest.slice(0, match.index).trim();
    rest = rest.slice(match.index + match[0].length);
    if (block) blocks.push(block);
  }
  return { blocks, rest };
}
