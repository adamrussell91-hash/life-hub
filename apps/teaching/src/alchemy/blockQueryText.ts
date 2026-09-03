import type { Block } from '@/schemas/block';

const QUERY_CAP = 8000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function joinParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');
}

function contentStrings(block: Block): string[] {
  const content = block.content as Record<string, unknown>;
  switch (block.block_type) {
    case 'rich_text':
      return typeof content.html === 'string' ? [stripHtml(content.html)] : [];
    case 'heading':
    case 'cloze':
      return typeof content.text === 'string' ? [content.text] : [];
    case 'quote':
      return [typeof content.quote === 'string' ? content.quote : ''];
    case 'callout':
      return [
        typeof content.title === 'string' ? content.title : '',
        typeof content.body === 'string' ? content.body : ''
      ];
    case 'definition':
      return [
        typeof content.term === 'string' ? content.term : '',
        typeof content.definition === 'string' ? content.definition : ''
      ];
    case 'code':
      return typeof content.code === 'string' ? [content.code] : [];
    case 'section':
      return [
        typeof content.title === 'string' ? content.title : '',
        ...((content.blocks as Block[] | undefined) ?? []).flatMap(contentStrings)
      ];
    case 'columns':
      return ((content.columns as Array<{ blocks?: Block[] }> | undefined) ?? []).flatMap((col) =>
        (col.blocks ?? []).flatMap(contentStrings)
      );
    case 'tabs':
      return ((content.tabs as Array<{ blocks?: Block[] }> | undefined) ?? []).flatMap((tab) =>
        (tab.blocks ?? []).flatMap(contentStrings)
      );
    case 'collection':
      return ((content.blocks as Block[] | undefined) ?? []).flatMap(contentStrings);
    case 'accordion':
      return ((content.items as Array<{ title?: string; body?: string }> | undefined) ?? []).flatMap(
        (item) => [item.title ?? '', item.body ?? '']
      );
    case 'question_set':
      return [
        typeof content.title === 'string' ? content.title : '',
        ...((content.questions as Array<{ prompt?: string }> | undefined) ?? []).map(
          (item) => item.prompt ?? ''
        )
      ];
    case 'flashcards':
      return ((content.cards as Array<{ front?: string; back?: string }> | undefined) ?? []).flatMap(
        (card) => [card.front ?? '', card.back ?? '']
      );
    case 'image':
    case 'video':
    case 'audio':
    case 'attachment':
    case 'embed':
      return [
        typeof content.title === 'string' ? content.title : '',
        typeof content.caption === 'string' ? content.caption : '',
        typeof content.alt_text === 'string' ? content.alt_text : ''
      ];
    default:
      return [];
  }
}

export function blockQueryText(block: Block | null): string {
  if (!block) return '';
  const text = joinParts(contentStrings(block));
  return text.length > QUERY_CAP ? text.slice(0, QUERY_CAP) : text;
}
