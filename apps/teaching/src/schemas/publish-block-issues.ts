import { visitBlocks } from '@/blocks/walk-blocks';
import { parseClozeText } from '@/blocks/learning-activity';
import { sanitizeSvgMarkup, svgHasMeaningfulContent } from '@/blocks/sanitize-svg';
import { isHttpUrl } from '@/blocks/url-safety';
import { validateConceptMap, validateMindMap } from '@/blocks/graph-layout';
import { DIAGRAM_IMAGE_PUBLISH_URL_ISSUE, type Block } from '@/schemas/block';

export type PublishBlockIssue = {
  blockId: string;
  blockType: Block['block_type'];
  /** Teacher-facing location, e.g. `Diagram 2 “Spacing vs massed practice”`. */
  label: string;
  message: string;
};

const KIND_LABEL: Partial<Record<Block['block_type'], string>> = {
  rich_text: 'Text',
  html: 'HTML',
  html_app: 'HTML app',
  question_set: 'Question set',
  self_check: 'Self check',
  mind_map: 'Mind map',
  concept_map: 'Concept map'
};

const CAPTION_MAX = 48;

export function formatPublishBlockIssue(issue: PublishBlockIssue): string {
  return `${issue.label}: ${issue.message}`;
}

export function publishBlockIssues(blocks: Block[]): string | null {
  const first = listPublishBlockIssues(blocks)[0];
  return first ? formatPublishBlockIssue(first) : null;
}

export function listPublishBlockIssues(blocks: Block[]): PublishBlockIssue[] {
  const typeOrder = collectTypeOrder(blocks);
  const issues: PublishBlockIssue[] = [];
  walk(blocks, [], typeOrder, issues);
  return issues;
}

function collectTypeOrder(blocks: Block[]): Map<string, string[]> {
  const order = new Map<string, string[]>();
  visitBlocks(blocks, (block) => {
    const ids = order.get(block.block_type) ?? [];
    ids.push(block.id);
    order.set(block.block_type, ids);
  });
  return order;
}

function walk(
  blocks: Block[],
  ancestors: string[],
  typeOrder: Map<string, string[]>,
  issues: PublishBlockIssue[]
): void {
  for (const block of blocks) {
    const label = locateBlock(block, ancestors, typeOrder);
    const message = ownIssue(block);
    if (message) {
      issues.push({
        blockId: block.id,
        blockType: block.block_type,
        label,
        message
      });
    }

    if (block.block_type === 'section') {
      walk(block.content.blocks as Block[], [...ancestors, shortLabel(block)], typeOrder, issues);
    } else if (block.block_type === 'columns') {
      block.content.columns.forEach((column, index) => {
        walk(
          column.blocks as Block[],
          [...ancestors, `Column ${index + 1}`],
          typeOrder,
          issues
        );
      });
    } else if (block.block_type === 'tabs') {
      block.content.tabs.forEach((tab, index) => {
        const tabLabel = tab.label.trim() ? `Tab “${truncate(tab.label.trim())}”` : `Tab ${index + 1}`;
        walk(tab.blocks as Block[], [...ancestors, tabLabel], typeOrder, issues);
      });
    }
  }
}

function locateBlock(
  block: Block,
  ancestors: string[],
  typeOrder: Map<string, string[]>
): string {
  const ids = typeOrder.get(block.block_type) ?? [block.id];
  const index = ids.indexOf(block.id);
  const ordinal = { index: index >= 0 ? index + 1 : 1, total: ids.length };
  const self = shortLabel(block, ordinal);
  return ancestors.length > 0 ? `${ancestors.join(' → ')} → ${self}` : self;
}

function kindLabel(type: Block['block_type']): string {
  const mapped = KIND_LABEL[type];
  if (mapped) return mapped;
  return type.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function shortLabel(block: Block, ordinal?: { index: number; total: number }): string {
  const kind = kindLabel(block.block_type);
  const numbered = ordinal && ordinal.total > 1 ? `${kind} ${ordinal.index}` : kind;
  const caption = blockCaption(block);
  return caption ? `${numbered} “${caption}”` : numbered;
}

function truncate(text: string): string {
  if (text.length <= CAPTION_MAX) return text;
  return `${text.slice(0, CAPTION_MAX - 1).trimEnd()}…`;
}

function blockCaption(block: Block): string | null {
  const content = block.content as Record<string, unknown>;

  const read = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = content[key];
      if (typeof value === 'string' && value.trim()) return truncate(value.trim());
    }
    return null;
  };

  switch (block.block_type) {
    case 'heading':
      return read('text');
    case 'callout':
      return read('title', 'body');
    case 'image':
      return read('alt_text', 'caption');
    case 'gallery':
      return read('title');
    case 'video':
    case 'embed':
      return read('title', 'caption', 'url');
    case 'html_app':
      return read('title');
    case 'quote':
      return read('quote');
    case 'definition':
      return read('term');
    case 'attachment':
      return read('title');
    case 'section':
      return read('title');
    case 'chart':
    case 'mind_map':
    case 'concept_map':
    case 'equation':
    case 'diagram':
      return read('title', 'caption', 'image_alt');
    case 'self_check':
      return read('prompt');
    case 'cloze':
      return read('text');
    default:
      return read('title', 'caption');
  }
}

function ownIssue(block: Block): string | null {
  if (block.block_type === 'collection') {
    return 'Collection blocks can only be used on class homepages';
  }
  if (block.block_type === 'image') {
    if (!isHttpUrl(block.content.url)) {
      return 'Image blocks need a valid http(s) URL to publish';
    }
    if (block.content.alt_text.trim().length === 0) {
      return 'Image blocks need alt text to publish';
    }
  }
  if (block.block_type === 'gallery') {
    for (const entry of block.content.items) {
      if (!isHttpUrl(entry.url)) {
        return 'Gallery images need a valid http(s) URL to publish';
      }
      if (entry.alt_text.trim().length === 0) {
        return 'Gallery images need alt text to publish';
      }
    }
  }
  if (block.block_type === 'video') {
    if (!block.content.external_id.trim()) {
      return 'Video blocks need a recognised YouTube or Vimeo id to publish';
    }
  }
  if (block.block_type === 'embed') {
    if (!isHttpUrl(block.content.url)) {
      return 'Embed blocks need a valid http(s) URL to publish';
    }
  }
  if (block.block_type === 'html') {
    if (block.content.html.trim().length === 0) {
      return 'HTML blocks need content to publish';
    }
  }
  if (block.block_type === 'html_app') {
    if (block.content.html.trim().length === 0) {
      return 'HTML app blocks need content to publish';
    }
    if (block.content.ai) {
      if (block.content.ai.system.trim().length === 0) {
        return 'HTML app AI lanes need a system / focus prompt to publish';
      }
      if (block.content.ai.model.trim().length === 0) {
        return 'HTML app AI lanes need a model to publish';
      }
    }
  }
  if (block.block_type === 'audio') {
    if (!isHttpUrl(block.content.url)) {
      return 'Audio blocks need a valid http(s) URL to publish';
    }
  }
  if (block.block_type === 'attachment') {
    if (!isHttpUrl(block.content.url)) {
      return 'Attachment blocks need a valid http(s) URL to publish';
    }
    if (block.content.title.trim().length === 0) {
      return 'Attachment blocks need a title to publish';
    }
  }
  if (block.block_type === 'question_set') {
    if (block.content.questions.length === 0) {
      return 'Question set blocks need at least one question to publish';
    }
    for (const question of block.content.questions) {
      if (question.prompt.trim().length === 0) {
        return 'Question set blocks need a non-empty prompt on every question to publish';
      }
      if (question.kind === 'multiple_choice') {
        const options = (question.options ?? []).map((option) => option.trim()).filter(Boolean);
        if (options.length < 2) {
          return 'Multiple choice questions need at least two options to publish';
        }
      }
    }
  }
  if (block.block_type === 'quote') {
    if (block.content.quote.trim().length === 0) {
      return 'Quote blocks need quote text to publish';
    }
  }
  if (block.block_type === 'definition') {
    if (block.content.term.trim().length === 0 || block.content.definition.trim().length === 0) {
      return 'Definition blocks need a term and definition to publish';
    }
  }
  if (block.block_type === 'table') {
    if (block.content.headers.length === 0) {
      return 'Table blocks need at least one header to publish';
    }
  }
  if (block.block_type === 'section') {
    if (block.content.title.trim().length === 0) {
      return 'Section blocks need a title to publish';
    }
  }
  if (block.block_type === 'timeline') {
    for (const event of block.content.events) {
      if (event.label.trim().length === 0 || event.when.trim().length === 0) {
        return 'Timeline events need a label and when value to publish';
      }
      if (event.image_url !== undefined && event.image_url.trim().length > 0) {
        if (!isHttpUrl(event.image_url)) {
          return 'Timeline event images need a valid http(s) URL to publish';
        }
        if ((event.image_alt ?? '').trim().length === 0) {
          return 'Timeline event images need alt text to publish';
        }
      }
      if (event.link_url !== undefined && event.link_url.trim().length > 0) {
        if (!isHttpUrl(event.link_url)) {
          return 'Timeline event links need a valid http(s) URL to publish';
        }
      }
    }
  }
  if (block.block_type === 'tabs') {
    for (const panel of block.content.tabs) {
      if (panel.label.trim().length === 0) {
        return 'Tabs blocks need a label on every tab to publish';
      }
    }
  }
  if (block.block_type === 'flashcards') {
    for (const card of block.content.cards) {
      if (card.front.trim().length === 0 || card.back.trim().length === 0) {
        return 'Flashcards need front and back text on every card to publish';
      }
    }
  }
  if (block.block_type === 'cloze') {
    const validBlanks = parseClozeText(block.content.text).blanks.filter(
      (blank) => blank.answer.trim().length > 0
    );
    if (validBlanks.length < 1) {
      return 'Cloze blocks need at least one blank to publish';
    }
  }
  if (block.block_type === 'self_check') {
    if (block.content.prompt.trim().length === 0) {
      return 'Self check blocks need a prompt to publish';
    }
    if (block.content.mode === 'reveal' || block.content.mode === 'confidence') {
      if ((block.content.answer ?? '').trim().length === 0) {
        return 'Self check blocks need an answer to publish';
      }
    }
    if (block.content.mode === 'checklist') {
      const items = (block.content.items ?? []).filter((item) => item.label.trim().length > 0);
      if (items.length === 0) {
        return 'Self check checklists need at least one item to publish';
      }
    }
  }
  if (block.block_type === 'chart') {
    for (const series of block.content.series) {
      if (series.points.length === 0) {
        return 'Chart series need at least one point to publish';
      }
      for (const point of series.points) {
        if (!Number.isFinite(point.y)) {
          return 'Chart points need finite y values to publish';
        }
      }
    }
  }
  if (block.block_type === 'equation') {
    if (block.content.latex.trim().length === 0) {
      return 'Equation blocks need LaTeX to publish';
    }
  }
  if (block.block_type === 'diagram') {
    if (block.content.source === 'image') {
      if (!isHttpUrl(block.content.image_url ?? '')) {
        return DIAGRAM_IMAGE_PUBLISH_URL_ISSUE;
      }
      if ((block.content.image_alt ?? '').trim().length === 0) {
        return 'Diagram image needs alt text to publish';
      }
    } else {
      const cleaned = sanitizeSvgMarkup(block.content.svg_markup ?? '');
      if (!svgHasMeaningfulContent(cleaned)) {
        return 'Diagram SVG needs safe SVG markup to publish';
      }
    }
  }
  if (block.block_type === 'mind_map') {
    return validateMindMap(block.content);
  }
  if (block.block_type === 'concept_map') {
    return validateConceptMap(block.content);
  }
  return null;
}
