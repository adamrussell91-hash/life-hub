import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import type { Block } from '@/schemas/block';
import type { Media } from '@/schemas';

const upload = {
  id: 'media_upload',
  type: 'media',
  title: 'CDX10-upload.jpg',
  provider: 'netlify_blobs',
  media_type: 'image',
  status: 'active',
  preview_url: 'https://api.adam-russell.com/api/media/media_upload/file'
} as unknown as Media;

describe('nested image editors', () => {
  it('offer the same library images as a top-level image block', () => {
    const section = createBlock('section', 'sec_1') as Extract<Block, { block_type: 'section' }>;
    section.content.blocks = [createBlock('image', 'img_1')];

    const editor = createBlockEditor(section, () => undefined, undefined, { media: [upload] });
    document.body.append(editor);
    const libraryBtn = editor.querySelector<HTMLButtonElement>('.block-editor__library-btn');
    expect(libraryBtn).not.toBeNull();
    libraryBtn!.click();

    const host = editor.querySelector('.block-editor__library');
    expect(host?.textContent).not.toContain('No images in library');
    expect(host?.querySelector('[aria-label="Use CDX10-upload.jpg"]')).not.toBeNull();
    editor.remove();
  });
});
