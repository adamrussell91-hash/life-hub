import { el } from '@/blocks/peer-feedback-ui';
import { appendWithQuizDecks } from '@/blocks/quiz-deck';
import type { Block } from '@/schemas/block';
import { choiceSettings, tierName, tileColumn, type ChoiceSettings } from './model';

export type ChoiceBoardBlock = Extract<Block, { block_type: 'tabs' }>;
export type ChoiceTile = ChoiceBoardBlock['content']['tabs'][number];
export type DeckMode = 'teacher' | 'student' | null;

/** Renders a tile's nested block with the page's own renderer, so questions keep their ids and hand in. */
export type RenderChild = (child: Block) => HTMLElement;

export function boardSettings(block: ChoiceBoardBlock): ChoiceSettings {
  return choiceSettings(block.content.choice, block.content.tabs.length);
}

export function tileLabel(tile: ChoiceTile, index: number): string {
  return tile.label.trim() || `Task ${index + 1}`;
}

export function tileTier(tile: ChoiceTile): number {
  return tile.tier ?? 1;
}

/** Label, level badge, type and (for the each-column rule) the column tag. */
export function tileMeta(tile: ChoiceTile, index: number, settings: ChoiceSettings, showColumn: boolean): HTMLElement {
  const meta = el('span', 'cb-tile__meta');
  const tier = el('span', 'cb-level', tierName(tile.tier));
  tier.dataset.tier = String(tileTier(tile));
  meta.append(tier);
  if (tile.kind?.trim()) meta.append(el('span', 'cb-kind', tile.kind.trim()));
  if (showColumn) meta.append(el('span', 'cb-column', `Column ${tileColumn(index, settings.columns) + 1}`));
  return meta;
}

/** The grid of tiles, `columns` to a row on wide screens. */
export function tileGrid(settings: ChoiceSettings, label: string): HTMLOListElement {
  const grid = el('ol', 'cb-grid');
  grid.style.setProperty('--cb-columns', String(settings.columns));
  grid.dataset.columns = String(settings.columns);
  grid.setAttribute('aria-label', label);
  return grid;
}

/** Builds a tile's nested blocks once; later calls keep what is there so typing is never wiped. */
export function buildTileBody(host: HTMLElement, tile: ChoiceTile, renderChild: RenderChild, decks: DeckMode): void {
  if (host.dataset.built) return;
  host.dataset.built = '1';
  if (!tile.blocks.length) {
    host.append(el('p', 'block-secondary', 'This task is empty.'));
    return;
  }
  appendWithQuizDecks(host, tile.blocks as Block[], renderChild, decks);
}

/** A closed fold that shows a tile's nested blocks when opened (teacher views). */
export function tileFold(tile: ChoiceTile, renderChild: RenderChild, decks: DeckMode, summary = 'See the task'): HTMLDetailsElement {
  const fold = el('details', 'cb-fold');
  const head = el('summary', 'cb-fold__summary', summary);
  const body = el('div', 'cb-fold__body');
  fold.append(head, body);
  fold.addEventListener('toggle', () => {
    if (fold.open) buildTileBody(body, tile, renderChild, decks);
  });
  return fold;
}
