import { el } from '@/blocks/peer-feedback-ui';
import type { Block } from '@/schemas/block';
import type { RenderContext, RenderMode } from '@/blocks/render';
import { ruleApplies, ruleText } from './model';
import { boardSettings, tileGrid, tileLabel, tileMeta, tileTier, type ChoiceBoardBlock, type DeckMode } from './shared';
import { mountStudent } from './student';
import { mountTeacher, teacherPreview } from './teacher';
import '@/blocks/peer-feedback.css';
import './choice-board.css';

/**
 * Choice board: a Panels block shown as a grid of tiles. Students pick N
 * tiles (within the teacher's rule), give a reason before each opens, work
 * inside it, then rate it and note one thing learned. Nested blocks render
 * through the page's own renderer, so questions in tiles hand in as normal.
 */

export type { ChoiceBoardBlock } from './shared';

/** Same rule as the page's Panels: teachers get quiz decks everywhere, students only where questions answer in place. */
function deckMode(mode: RenderMode, ctx: RenderContext): DeckMode {
  if (mode === 'teacher') return 'teacher';
  return mode === 'student' && ctx.quizSlot ? 'student' : null;
}

function renderPrint(block: ChoiceBoardBlock, renderChild: (child: Block) => HTMLElement): HTMLElement {
  const settings = boardSettings(block);
  const showColumn = settings.rule === 'each_column' && ruleApplies(settings, block.content.tabs.length);
  const wrap = el('div', 'cb-print');
  const grid = tileGrid(settings, 'Tasks to pick from');
  grid.classList.add('cb-grid--print');
  block.content.tabs.forEach((tile, index) => {
    const item = el('li', 'cb-tile cb-tile--static');
    item.dataset.tier = String(tileTier(tile));
    const face = el('div', 'cb-tile__face');
    face.append(el('span', 'cb-print__tick', '☐'), el('span', 'cb-tile__label', tileLabel(tile, index)), tileMeta(tile, index, settings, showColumn));
    item.append(face);
    grid.append(item);
  });
  wrap.append(grid, el('p', 'pf-print__label cb-print__why', 'Why I picked it'), el('div', 'pf-print__lines'));
  block.content.tabs.forEach((tile, index) => {
    const section = el('section', 'block-tabs__print-panel cb-print__task');
    section.append(el('h3', 'block-tabs__print-panel-label', tileLabel(tile, index)));
    for (const child of tile.blocks) section.append(renderChild(child as Block));
    wrap.append(section);
  });
  return wrap;
}

export function renderChoiceBoard(block: ChoiceBoardBlock, mode: RenderMode, ctx: RenderContext, renderChild: (child: Block) => HTMLElement): HTMLElement {
  const settings = boardSettings(block);
  const root = el('section', 'peer-feedback cb');
  root.dataset.blockId = block.id;
  if (ctx.display) root.classList.add('cb--display');
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow block-eyebrow', 'Choice board'), el('h3', 'pf-prompt block-title cb-instruction', ruleText(settings, block.content.tabs.length)));
  root.append(head);
  const decks = deckMode(mode, ctx);

  if (mode === 'print') {
    root.append(renderPrint(block, renderChild));
    return root;
  }
  if (mode === 'teacher') {
    if (ctx.lessonId) root.append(mountTeacher(block, { lessonId: ctx.lessonId, display: Boolean(ctx.display), renderChild, decks }));
    else {
      root.append(teacherPreview(block, renderChild, decks));
      root.append(el('p', 'pf-note block-secondary', 'Students pick from the published lesson.'));
    }
    return root;
  }
  root.append(mountStudent(block, { lessonId: ctx.lessonId, saveScope: ctx.saveScope, renderChild, decks }));
  return root;
}
