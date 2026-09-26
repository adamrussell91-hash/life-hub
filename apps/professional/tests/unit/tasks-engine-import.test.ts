import { describe, expect, it } from 'vitest';
import { mountBlockInsert } from '@tasks/views/block-insert';

describe('Tasks block engine inside Professional', () => {
  it('mounts the round + and opens the block palette', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const inserted: string[] = [];
    const handle = mountBlockInsert(host, { onInsert: (type) => inserted.push(type) });

    const plus = host.querySelector<HTMLButtonElement>('.page-editor__add-btn');
    expect(plus?.getAttribute('aria-label')).toBe('Add a block');
    plus!.click();

    const menu = host.querySelector('.page-editor__insert');
    expect(menu).not.toBeNull();
    const text = menu!.querySelector<HTMLButtonElement>('[data-block-type="rich_text"]');
    expect(text).not.toBeNull();
    text!.click();
    expect(inserted).toEqual(['rich_text']);
    expect(host.querySelector('.page-editor__insert')).toBeNull();
    handle.dispose();
  });
});
