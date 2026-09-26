import { blockPlainText } from '@/lib/inline-promises';

type NewBlock = { id: string; block_type: string; variant: string; content: Record<string, unknown> };

/** A pasted agenda becomes the notes' skeleton: a heading per item with an empty text block under it. */
export function agendaToBlocks(agenda: string, nextId: () => string): NewBlock[] {
  const out: NewBlock[] = [];
  for (const raw of agenda.split('\n')) {
    const text = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim();
    if (!text) continue;
    out.push({ id: nextId(), block_type: 'heading', variant: 'section', content: { text } });
    out.push({ id: nextId(), block_type: 'rich_text', variant: 'medium', content: { html: '' } });
  }
  return out;
}

const DECISION = /^(?:✓\s*|decision:\s*)(.+)$/i;

/** `✓ …` or `Decision: …` lines, filed under the heading above them. */
export function extractDecisions(blocks: Array<{ block_type: string; content?: unknown }>): Array<{ text: string; agenda_heading: string | null }> {
  const out: Array<{ text: string; agenda_heading: string | null }> = [];
  let heading: string | null = null;
  for (const block of blocks) {
    if (block.block_type === 'heading') {
      const text = (block.content as { text?: string } | undefined)?.text;
      heading = typeof text === 'string' && text.trim() ? text.trim() : heading;
      continue;
    }
    for (const line of blockPlainText([block]).split('\n')) {
      const match = DECISION.exec(line.trim());
      if (match) out.push({ text: match[1]!.trim(), agenda_heading: heading });
    }
  }
  return out;
}

const MENTION = /^@([A-Z][\p{L}'’-]*(?:\s[A-Z][\p{L}'’.-]*)?)\s+(.+)$/u;

/** `@Name …` lines grouped by name, in first-seen order. */
export function extractMentions(text: string): Array<{ name: string; lines: string[] }> {
  const byName = new Map<string, string[]>();
  for (const raw of text.split('\n')) {
    const match = MENTION.exec(raw.trim());
    if (!match) continue;
    const name = match[1]!.trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(match[2]!.trim());
  }
  return [...byName.entries()].map(([name, lines]) => ({ name, lines }));
}
