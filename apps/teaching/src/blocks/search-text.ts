import type { Block } from '@/schemas';
import { fadedContent } from '@/schemas/faded';

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ');
  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function push(parts: string[], value: unknown): void {
  if (typeof value === 'string' && value.trim()) parts.push(value);
}

function extractBlock(block: Block, parts: string[]): void {
  const c = block.content as Record<string, unknown>;
  switch (block.block_type) {
    case 'rich_text':
    case 'html':
      push(parts, htmlToPlainText(String(c.html ?? '')));
      break;
    case 'heading':
      push(parts, c.text);
      break;
    case 'callout':
      push(parts, c.title);
      push(parts, c.body);
      break;
    case 'quote':
      push(parts, c.quote);
      push(parts, c.attribution);
      push(parts, c.source);
      push(parts, c.reference);
      break;
    case 'definition':
      push(parts, c.term);
      push(parts, c.definition);
      break;
    case 'code':
      push(parts, c.code);
      break;
    case 'equation':
      push(parts, c.latex);
      push(parts, c.caption);
      break;
    case 'cloze':
      push(parts, c.title);
      push(parts, c.text);
      break;
    case 'annotation':
      push(parts, c.title);
      push(parts, c.attribution);
      walkStrings(c.text, parts);
      walkStrings(c.annotations, parts);
      walkStrings(c.layers, parts);
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'attachment':
    case 'embed':
    case 'diagram':
      push(parts, c.alt_text ?? c.image_alt);
      push(parts, c.title);
      push(parts, c.caption);
      push(parts, c.prompt);
      break;
    case 'html_app':
      push(parts, c.title);
      push(parts, htmlToPlainText(String(c.html ?? '')));
      break;
    case 'countdown':
      push(parts, c.title);
      push(parts, c.note);
      break;
    case 'peer_feedback':
      push(parts, c.prompt);
      push(parts, c.strength_prompt);
      push(parts, c.suggestion_prompt);
      break;
    case 'question_drop':
      push(parts, c.prompt);
      break;
    case 'done':
      push(parts, c.label);
      break;
    case 'brainstorm':
      push(parts, c.question);
      break;
    case 'comparative_judgement': {
      const cj = c as { title?: string; criterion?: string; chips?: string[] };
      push(parts, cj.title);
      push(parts, cj.criterion);
      for (const chip of cj.chips ?? []) push(parts, chip);
      break;
    }
    case 'explainer': {
      const ex = c as { title?: string; text?: unknown; recording?: { events?: Array<{ kind?: string; html?: string; prompt?: string }> } };
      push(parts, ex.title);
      walkStrings(ex.text, parts);
      for (const ev of ex.recording?.events ?? []) {
        if (ev.kind === 'note') push(parts, htmlToPlainText(String(ev.html ?? '')));
        if (ev.kind === 'pause') push(parts, ev.prompt);
      }
      break;
    }
    case 'hinge_question':
      push(parts, c.prompt);
      for (const o of (c.options as Array<{ text?: string }> | undefined) ?? []) push(parts, o.text);
      break;
    case 'continuum_line': {
      const line = c as { stimulus?: { text?: string }; scale?: { left?: string; right?: string }; statements?: Array<{ text?: string }> };
      push(parts, line.stimulus?.text);
      push(parts, line.scale?.left);
      push(parts, line.scale?.right);
      for (const s of line.statements ?? []) push(parts, s.text);
      break;
    }
    case 'curriculum_lines': {
      const lines = c as { title?: string; strands?: Array<{ name?: string }>; stations?: Array<{ label?: string }>; checkpoints?: Array<{ label?: string }>; terminus?: { label?: string; detail?: string } };
      push(parts, lines.title);
      for (const s of lines.strands ?? []) push(parts, s.name);
      for (const s of lines.stations ?? []) push(parts, s.label);
      for (const s of lines.checkpoints ?? []) push(parts, s.label);
      push(parts, lines.terminus?.label);
      push(parts, lines.terminus?.detail);
      break;
    }
    case 'quiz_question': {
      const q = (c.question ?? {}) as Record<string, unknown>;
      push(parts, q.prompt);
      push(parts, q.quote);
      push(parts, q.passage);
      break;
    }
    case 'note_cue':
      push(parts, c.prompt);
      break;
    case 'with_teacher':
      push(parts, (c.talking_points as string[] | undefined)?.join(' '));
      break;
    case 'faded_example':
      {
        const faded = fadedContent({ content: c });
        push(parts, faded.prompt);
        for (const step of faded.steps) {
          push(parts, step.prompt);
          push(parts, step.extract);
          for (const answer of step.answers) push(parts, answer);
          push(parts, step.question?.prompt);
          for (const choice of step.question?.choices ?? []) push(parts, choice);
        }
        for (const list of Object.values(faded.criteria)) for (const item of list) push(parts, item);
      }
      break;
    case 'question_set':
    case 'flashcards':
    case 'self_check':
    case 'timeline':
    case 'card_stack':
    case 'accordion':
    case 'table':
    case 'chart':
    case 'mind_map':
    case 'concept_map':
    case 'gallery':
    case 'collection':
    case 'anthology':
      walkStrings(c, parts);
      break;
    case 'outcomes':
      parts.push(String(c.what ?? ''), ...((c.how as Array<{ text?: string }> | undefined) ?? []).map((item) => item.text ?? ''));
      break;
    case 'columns': {
      const cols = (c.columns as Array<{ blocks?: Block[] }> | undefined) ?? [];
      for (const col of cols) extractBlocks(col.blocks ?? [], parts);
      break;
    }
    case 'tabs': {
      const panels = (c.tabs as Array<{ label?: string; blocks?: Block[] }> | undefined) ?? [];
      for (const panel of panels) {
        push(parts, panel.label);
        extractBlocks(panel.blocks ?? [], parts);
      }
      break;
    }
    case 'section': {
      push(parts, c.title);
      extractBlocks((c.blocks as Block[] | undefined) ?? [], parts);
      break;
    }
    case 'spacer':
    case 'divider':
    case 'classroom_tools':
    case 'teacher_note':
      break;
    case 'toolkit_skill':
    case 'toolkit_tool':
    case 'toolkit_value':
    case 'thinking_move':
    case 'question_quadrant':
    case 'concept_features':
    case 'thinking_intentions':
    case 'thinking_reflection':
    case 'fluid_analogy':
    case 'analogy_types':
    case 'analogy_close_reading':
    case 'analogy_pattern':
    case 'analogy_reverse':
    case 'analogy_problem':
    case 'analogy_metaphor':
    case 'analogy_transfer':
    case 'analogy_chains': {
      // Never index teacher notes or class notes; search can reach student pages.
      const { teacher_note: _note, teacher_jots: _jots, ...studentContent } = c;
      walkStrings(studentContent, parts);
      break;
    }
    default:
      walkStrings(c, parts);
  }
}

function walkStrings(value: unknown, parts: string[], depth = 0): void {
  if (depth > 8) return;
  if (typeof value === 'string') {
    push(parts, value.includes('<') ? htmlToPlainText(value) : value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, parts, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      walkStrings(v, parts, depth + 1);
    }
  }
}

function extractBlocks(blocks: Block[], parts: string[]): void {
  for (const block of blocks) extractBlock(block, parts);
}

export function blocksToSearchText(blocks: Block[]): string {
  const parts: string[] = [];
  extractBlocks(blocks, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function snippetAround(haystack: string, query: string, radius = 48): string {
  const lower = haystack.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return haystack.slice(0, radius * 2).trim();
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + q.length + radius);
  const slice = haystack.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${slice}${end < haystack.length ? '…' : ''}`;
}
