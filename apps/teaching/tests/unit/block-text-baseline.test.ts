/**
 * Presentation-only guard for the block anatomy work: every block in the seed
 * lessons, and one of every block type with all author fields filled, must
 * render the same text as the baseline taken from main before the restyle.
 * Compared as the sorted list of text pieces, so moving a field (a pager under
 * the deck, actions to the bottom) passes but losing or adding any text fails.
 * Regenerate only for an intentional text change: UPDATE_BLOCK_TEXT=1.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import { everyBlockFixtures } from '../../fixtures/every-block';
import seed from '../../fixtures/seed.json';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(here, '__baselines__', 'block-text.json');
const update = process.env.UPDATE_BLOCK_TEXT === '1';
const modes = ['student', 'teacher'] as const;

function normalise(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Every non-empty text node, whitespace collapsed, sorted. */
function textPieces(root: Node): string[] {
  const pieces: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const text = normalise(node.textContent);
      if (text) pieces.push(text);
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return pieces.sort();
}

function renderedText(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const sources: Array<[string, Block[]]> = [
    ...(seed.lessons as Array<{ id: string; blocks: Block[] }>).map((l) => [l.id, l.blocks] as [string, Block[]]),
    ['every-block', everyBlockFixtures()]
  ];
  for (const [owner, blocks] of sources) {
    for (const block of blocks) {
      for (const mode of modes) {
        let text: string[];
        try {
          text = textPieces(renderBlock(block, mode, { lessonId: owner, pageBlocks: blocks }));
        } catch (error) {
          text = [`THROWS ${(error as Error).message}`];
        }
        out[`${owner}/${block.id}/${mode}`] = text;
      }
    }
  }
  return out;
}

describe('block text baseline', () => {
  beforeAll(() => {
    vi.useFakeTimers({ now: new Date('2026-10-20T09:00:00+11:00'), toFake: ['Date'] });
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the same text for every block as before the restyle', () => {
    const actual = renderedText();
    if (update || !existsSync(baselinePath)) {
      writeFileSync(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as Record<string, string[]>;
    expect(Object.keys(actual).sort()).toEqual(Object.keys(baseline).sort());
    for (const key of Object.keys(baseline)) expect(actual[key], key).toEqual(baseline[key]);
  });
});
