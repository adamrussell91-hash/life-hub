import { sanitizeRichTextHtml } from './sanitize';
import { sanitizeSvgMarkup } from './sanitize-svg';
import { sanitizeAnnotationLineHtml } from './annotation-line-format';
import type { AnnotationAnchor, Block } from '../schemas/block';

type ColumnsBlock = Extract<Block, { block_type: 'columns' }>;
type SectionBlock = Extract<Block, { block_type: 'section' }>;
type TabsBlock = Extract<Block, { block_type: 'tabs' }>;

function sanitizeAnchorNoteHtml(anchor: AnnotationAnchor): AnnotationAnchor {
  if (anchor.note_html == null) {
    return { ...anchor, note_html: undefined };
  }
  return { ...anchor, note_html: sanitizeRichTextHtml(anchor.note_html) };
}

export function sanitizeBlocksDeep(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.block_type === 'rich_text' || block.block_type === 'html') {
      return {
        ...block,
        content: { html: sanitizeRichTextHtml(block.content.html) }
      };
    }
    if (block.block_type === 'annotation') {
      return {
        ...block,
        content: {
          ...block.content,
          text: {
            ...block.content.text,
            stanzas: block.content.text.stanzas.map((stanza) => ({
              ...stanza,
              lines: stanza.lines.map((line) => {
                if (line.html == null) return line;
                const html = sanitizeAnnotationLineHtml(line.html);
                const { html: _drop, ...rest } = line;
                return html ? { ...rest, html } : rest;
              })
            }))
          },
          annotations: block.content.annotations.map((ann) => ({
            ...ann,
            anchor: sanitizeAnchorNoteHtml(ann.anchor),
            also_anchors: ann.also_anchors?.map(sanitizeAnchorNoteHtml),
            body: {
              ...ann.body,
              html: sanitizeRichTextHtml(ann.body.html)
            }
          })),
          voice_tracks: block.content.voice_tracks?.map((track) => ({
            ...track,
            extras: track.extras?.map((extra) => ({
              ...extra,
              html: sanitizeRichTextHtml(extra.html)
            }))
          }))
        }
      };
    }
    if (block.block_type === 'diagram' && block.content.svg_markup != null) {
      return {
        ...block,
        content: {
          ...block.content,
          svg_markup: sanitizeSvgMarkup(block.content.svg_markup)
        }
      };
    }
    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: sanitizeBlocksDeep(block.content.blocks) as SectionBlock['content']['blocks']
        }
      };
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: block.content.columns.map((col) => ({
            ...col,
            blocks: sanitizeBlocksDeep(col.blocks) as ColumnsBlock['content']['columns'][number]['blocks']
          }))
        }
      };
    }
    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          ...block.content,
          tabs: block.content.tabs.map((panel) => ({
            ...panel,
            blocks: sanitizeBlocksDeep(panel.blocks) as TabsBlock['content']['tabs'][number]['blocks']
          }))
        }
      };
    }
    return block;
  });
}
