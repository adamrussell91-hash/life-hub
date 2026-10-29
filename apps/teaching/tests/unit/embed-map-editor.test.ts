import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('@/api/client', async (orig) => ({ ...(await orig<typeof import('@/api/client')>()), apiGet: (...args: unknown[]) => apiGet(...args) }));

import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';

type Embed = Extract<Block, { block_type: 'embed' }>;
const mapBlock = (): Embed => {
  const block = createBlock('embed', 'map1') as Embed;
  block.content = { ...block.content, url: '', provider: 'google_maps' };
  return block;
};
const mount = (block: Embed) => {
  let latest = block;
  const editor = createBlockEditor(block, (next) => { latest = next as Embed; }, () => latest);
  document.body.append(editor);
  return { editor, latest: () => latest };
};
const paste = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
beforeEach(() => { document.body.replaceChildren(); apiGet.mockReset(); });

describe('Map embed editor', () => {
  it('asks only for a Google Maps link', () => {
    const { editor } = mount(mapBlock());
    expect(editor.querySelector<HTMLElement>('.block-editor__media-actions')?.hidden).toBe(true);
    expect(editor.querySelector<HTMLInputElement>('.block-editor__embed-url')?.placeholder).toBe('Paste a Google Maps link');
    expect(editor.textContent).toContain('copy the link from the address bar or use Share');
  });

  it('keeps the PDF and Drive buttons for other embeds', () => {
    const block = mapBlock();
    block.content.provider = 'pdf';
    const { editor } = mount(block);
    expect(editor.querySelector<HTMLElement>('.block-editor__media-actions')?.hidden).toBe(false);
  });

  it('opens a Share link on the server and saves the real map', async () => {
    apiGet.mockResolvedValue({ url: 'https://www.google.com/maps/place/Sydney/@-33.8688,151.2093,12z' });
    const { editor, latest } = mount(mapBlock());
    const url = editor.querySelector<HTMLInputElement>('.block-editor__embed-url')!;
    paste(url, 'https://maps.app.goo.gl/AbC123');
    expect(apiGet).toHaveBeenCalledWith('/api/embed/resolve?url=https%3A%2F%2Fmaps.app.goo.gl%2FAbC123');
    await vi.waitFor(() => expect(latest().content.embed_url).toContain('-33.8688'));
    expect(url.value).toBe('https://www.google.com/maps/place/Sydney/@-33.8688,151.2093,12z');
    expect(latest().content.provider).toBe('google_maps');
  });

  it('says so when a Share link will not open', async () => {
    apiGet.mockRejectedValue(new Error('That Share link could not be opened. Paste the link from the address bar instead.'));
    const { editor } = mount(mapBlock());
    paste(editor.querySelector<HTMLInputElement>('.block-editor__embed-url')!, 'https://maps.app.goo.gl/Dead');
    await vi.waitFor(() => expect(editor.querySelector('.block-editor__hint')?.textContent).toContain('could not be opened'));
  });
});
