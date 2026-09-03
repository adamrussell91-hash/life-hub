export function firstLeadFromBlocks(
  blocks: Array<{ block_type: string; content: Record<string, unknown> }>
): string | null {
  for (const block of blocks) {
    if (block.block_type === 'rich_text' && typeof block.content.html === 'string') {
      const text = block.content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    if (block.block_type === 'heading' && typeof block.content.text === 'string') {
      const lead = block.content.text.trim();
      if (lead) return lead;
    }
  }
  return null;
}
