import { describe, expect, it, vi } from 'vitest';
import { clickMenuAction, holdDelete } from './helpers/hub-list';
import { createAnnotationEditor } from '@/blocks/editors';
import { buildAnchor } from '@/blocks/annotation-anchor';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';
import type { Block } from '@/schemas/block';

describe('annotation editor 1b', () => {
  it('creates a word annotation whose offsets slice equals quote.exact', () => {
    const text = dulceAnnotationFixture.content.text;
    const line = text.stanzas[0]!.lines[3]!;
    const start = line.text.indexOf('trudge');
    const end = start + 'trudge'.length;
    const anchor = buildAnchor(text, {
      stanzaId: 'stanza_1',
      lineId: 'line_4',
      start,
      end
    });
    expect(anchor).not.toBeNull();
    expect(line.text.slice(anchor!.start!, anchor!.end!)).toBe(anchor!.quote.exact);
    expect(anchor!.granularity).toBe('word');
  });

  it('reorders attachments and persists order', () => {
    const block = structuredClone(dulceAnnotationFixture);
    block.content.annotations[0]!.body.attachments = [
      { kind: 'link', url: 'https://example.com/a', label: 'A' },
      { kind: 'link', url: 'https://example.com/b', label: 'B' }
    ];
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    const rebuild = () => {
      mount.replaceChildren(
        createAnnotationEditor(
          latest as Extract<Block, { block_type: 'annotation' }>,
          (next) => {
            latest = next;
            rebuild();
          },
          () => latest as Extract<Block, { block_type: 'annotation' }>
        )
      );
    };
    rebuild();

    const open = mount.querySelector<HTMLButtonElement>(
      '.block-editor__annotation-open'
    );
    open?.click();
    const more = mount.querySelector(
      '.block-editor__annotation-attachments .hub-list__row .hub-list__more'
    );
    expect(more).toBeTruthy();
    clickMenuAction(more!, 'down');
    expect(latest.block_type).toBe('annotation');
    if (latest.block_type !== 'annotation') return;
    const labels = latest.content.annotations[0]!.body.attachments.map((a) =>
      a.kind === 'link' ? a.label : ''
    );
    expect(labels).toEqual(['B', 'A']);
    mount.remove();
  });

  it('deleting an annotation then Undo restores it', () => {
    vi.useFakeTimers();
    const block = structuredClone(dulceAnnotationFixture);
    let latest: Block = block;
    const mount = document.createElement('div');
    document.body.append(mount);
    const rebuild = () => {
      mount.replaceChildren(
        createAnnotationEditor(
          latest as Extract<Block, { block_type: 'annotation' }>,
          (next) => {
            latest = next;
            rebuild();
          },
          () => latest as Extract<Block, { block_type: 'annotation' }>
        )
      );
    };
    rebuild();
    const before =
      latest.block_type === 'annotation' ? latest.content.annotations.length : 0;
    holdDelete(
      mount.querySelector('.block-editor__annotation-ann-list .hub-list__more')!
    );
    expect(
      latest.block_type === 'annotation' && latest.content.annotations.length
    ).toBe(before - 1);
    const undo = [...document.querySelectorAll('.hub-toast button')].find(
      (btn) => btn.textContent === 'Undo'
    ) as HTMLButtonElement | undefined;
    expect(undo).toBeTruthy();
    undo!.click();
    expect(
      latest.block_type === 'annotation' && latest.content.annotations.length
    ).toBe(before);
    mount.remove();
    vi.useRealTimers();
  });

  it('Escape inside the note body does not close the panel (I8)', () => {
    const block = structuredClone(dulceAnnotationFixture);
    const mount = document.createElement('div');
    document.body.append(mount);
    mount.append(
      createAnnotationEditor(block, () => {
        /* no remount */
      })
    );
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')?.click();
    const panel = mount.querySelector<HTMLElement>('.block-editor__annotation-note');
    expect(panel?.hidden).toBe(false);
    const rich = mount.querySelector<HTMLElement>('.block-editor__rich');
    expect(rich).toBeTruthy();
    rich!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(panel?.hidden).toBe(false);
    mount.remove();
  });

  it('does not use window.prompt/confirm/alert', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'src/blocks/annotation-editor.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/window\.prompt|window\.confirm|\balert\s*\(/);
    expect(source).not.toMatch(/textContent = '↑'|textContent = 'Remove'/);
  });

  it('shows a technique tag control in the note panel', () => {
    const mount = document.createElement('div');
    mount.append(createAnnotationEditor(dulceAnnotationFixture, () => undefined));
    mount.querySelector<HTMLButtonElement>('.block-editor__annotation-open')?.click();
    const picker = mount.querySelector<HTMLElement>(
      '.block-editor__annotation-technique'
    );
    expect(picker?.hidden).toBe(false);
    expect(
      picker?.querySelector('.block-editor__annotation-technique-btn')
    ).toBeTruthy();
    expect(picker?.querySelector('button[disabled]')).toBeNull();
  });
});
