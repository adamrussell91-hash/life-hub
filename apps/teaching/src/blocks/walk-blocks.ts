import type { Block } from '@/schemas/block';

/**
 * Visit every block in a tree, depth first, recursing only through the three
 * layout containers the schema allows: sections, columns, and tabs.
 */
export function visitBlocks(
  blocks: Block[],
  visitor: (block: Block, path: string) => void,
  path = 'blocks'
): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    visitor(block, blockPath);

    if (block.block_type === 'section') {
      visitBlocks(block.content.blocks as Block[], visitor, `${blockPath}.content.blocks`);
      return;
    }

    if (block.block_type === 'columns') {
      block.content.columns.forEach((column, columnIndex) => {
        visitBlocks(
          column.blocks as Block[],
          visitor,
          `${blockPath}.content.columns[${columnIndex}].blocks`
        );
      });
      return;
    }

    if (block.block_type === 'tabs') {
      block.content.tabs.forEach((tab, tabIndex) => {
        visitBlocks(tab.blocks as Block[], visitor, `${blockPath}.content.tabs[${tabIndex}].blocks`);
      });
    }
  });
}
