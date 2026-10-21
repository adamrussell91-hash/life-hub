import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlockEditor } from '@/blocks/editors';
import { createBlock } from '@/blocks/create-block';
import { AUDIO_ACCEPT, resetSessionUploads } from '@/blocks/upload-button';
import type { Block } from '@/schemas/block';
import type { Media } from '@/schemas/media';
import { uploadMediaFile } from '@/teacher/media-api';

vi.mock('@/teacher/media-api', () => ({ uploadMediaFile: vi.fn() }));
vi.mock('@/teacher/drive-picker', () => ({ openDrivePicker: vi.fn() }));
vi.mock('@/app/curriculum-state', () => ({ applyCreatedMedia: vi.fn() }));

const uploadMock = vi.mocked(uploadMediaFile);
const ISO = '2026-01-01T00:00:00.000Z';

function mediaFor(file: File): Media {
  const url = `https://api.example/api/media/media_${file.name}/file`;
  return {
    id: `media_${file.name}`,
    type: 'media',
    title: file.name,
    slug: file.name,
    status: 'active',
    provider: 'direct',
    media_type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other',
    mime_type: file.type,
    file_name: file.name,
    preview_url: url,
    download_url: url,
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  };
}

const urlOf = (name: string) => `https://api.example/api/media/media_${name}/file`;
const png = (name = 'map.png') => new File(['png'], name, { type: 'image/png' });
const pdf = (name = 'worksheet.pdf') => new File(['pdf'], name, { type: 'application/pdf' });
const mp3 = (name = 'reading.mp3') => new File(['mp3'], name, { type: 'audio/mpeg' });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function pick(input: HTMLInputElement, files: File[]): Promise<void> {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
  for (let i = 0; i < files.length + 2; i += 1) await flush();
}

function mount(block: Block) {
  let latest = block;
  const onChange = vi.fn((next: Block) => {
    latest = next;
  });
  const editor = createBlockEditor(block, onChange, () => latest);
  document.body.replaceChildren(editor);
  return { editor, onChange, latest: () => latest };
}

function uploadInputs(root: ParentNode): HTMLInputElement[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>('.block-editor__upload-input'));
}

beforeEach(() => {
  uploadMock.mockReset();
  uploadMock.mockImplementation(async (file) => mediaFor(file));
  resetSessionUploads();
});

describe('Upload from computer in media block editors', () => {
  it('image: upload sits first and sets content.url', async () => {
    const { editor, latest } = mount(createBlock('image', 'b_img'));
    const fields = editor.querySelector('.block-editor__fields')!;
    const row = fields.firstElementChild!;
    expect(row.classList.contains('block-editor__media-actions')).toBe(true);
    const buttons = Array.from(row.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Upload from computer', 'Choose from library', 'Add from Drive']);

    const [input] = uploadInputs(editor);
    expect(input!.accept).toBe('image/*');
    await pick(input!, [png()]);

    const block = latest() as Extract<Block, { block_type: 'image' }>;
    expect(block.content.url).toBe(urlOf('map.png'));
    expect(editor.querySelector<HTMLInputElement>('.block-editor__image-url')!.value).toBe(urlOf('map.png'));
  });

  it('image: what was just uploaded shows in Choose from library', async () => {
    const { editor } = mount(createBlock('image', 'b_img2'));
    await pick(uploadInputs(editor)[0]!, [png('fresh.png')]);
    const library = Array.from(editor.querySelectorAll('button')).find((b) => b.textContent === 'Choose from library')!;
    library.click();
    expect(editor.querySelector('.block-editor__library')!.textContent).toContain('fresh.png');
  });

  it('attachment: upload any file fills url, title and filename', async () => {
    const { editor, latest } = mount(createBlock('attachment', 'b_att'));
    const [input] = uploadInputs(editor);
    expect(input!.accept).toBe('');
    await pick(input!, [pdf()]);

    const block = latest() as Extract<Block, { block_type: 'attachment' }>;
    expect(block.content).toEqual({
      url: urlOf('worksheet.pdf'),
      title: 'worksheet.pdf',
      filename: 'worksheet.pdf'
    });
  });

  it('attachment inside a Tabs block uploads too', async () => {
    const tabs = createBlock('tabs', 'b_tabs') as Extract<Block, { block_type: 'tabs' }>;
    const attachment = createBlock('attachment', 'b_tab_att');
    const withChild = {
      ...tabs,
      content: {
        tabs: tabs.content.tabs.map((tab, index) =>
          index === 0 ? { ...tab, blocks: [attachment] } : tab
        )
      }
    } as Block;
    const { editor, latest } = mount(withChild);

    const nested = editor.querySelector<HTMLElement>('.block-editor[data-block-type="attachment"]');
    expect(nested).not.toBeNull();
    await pick(uploadInputs(nested!)[0]!, [pdf('handout.pdf')]);

    const saved = latest() as Extract<Block, { block_type: 'tabs' }>;
    const child = saved.content.tabs[0]!.blocks[0] as Extract<Block, { block_type: 'attachment' }>;
    expect(child.content.url).toBe(urlOf('handout.pdf'));
    expect(child.content.title).toBe('handout.pdf');
  });

  it('audio: upload sets the audio url and title', async () => {
    const { editor, latest } = mount(createBlock('audio', 'b_audio'));
    const [input] = uploadInputs(editor);
    expect(input!.accept).toBe(AUDIO_ACCEPT);
    await pick(input!, [mp3()]);
    const block = latest() as Extract<Block, { block_type: 'audio' }>;
    expect(block.content).toEqual({ url: urlOf('reading.mp3'), title: 'reading.mp3', mode: 'listen' });
  });

  it('embed: uploading a PDF sets the url and the PDF provider', async () => {
    const { editor, latest } = mount(createBlock('embed', 'b_embed'));
    await pick(uploadInputs(editor)[0]!, [pdf()]);
    const block = latest() as Extract<Block, { block_type: 'embed' }>;
    expect(block.content.url).toBe(urlOf('worksheet.pdf'));
    expect(block.content.provider).toBe('pdf');
  });

  it('gallery: several images fill empty slots then add new ones', async () => {
    const { editor, latest } = mount(createBlock('gallery', 'b_gallery'));
    const before = (latest() as Extract<Block, { block_type: 'gallery' }>).content.items.length;
    const galleryInput = uploadInputs(editor).find((input) => input.multiple)!;
    expect(galleryInput).toBeDefined();
    const files = Array.from({ length: before + 1 }, (_, i) => png(`g${i}.png`));
    await pick(galleryInput, files);
    const items = (latest() as Extract<Block, { block_type: 'gallery' }>).content.items;
    expect(items.map((item) => item.url)).toEqual(files.map((file) => urlOf(file.name)));
  });

  it('gallery: each image has its own upload', async () => {
    const { editor, latest } = mount(createBlock('gallery', 'b_gallery2'));
    const perItem = uploadInputs(editor).filter((input) => !input.multiple);
    expect(perItem.length).toBeGreaterThanOrEqual(2);
    await pick(perItem[1]!, [png('second.png')]);
    const items = (latest() as Extract<Block, { block_type: 'gallery' }>).content.items;
    expect(items[1]!.url).toBe(urlOf('second.png'));
  });

  it.each([
    ['timeline', (b: Block) => (b as Extract<Block, { block_type: 'timeline' }>).content.events[0]?.image_url],
    ['card_stack', (b: Block) => (b as Extract<Block, { block_type: 'card_stack' }>).content.cards[0]?.image_url],
    ['flashcards', (b: Block) => (b as Extract<Block, { block_type: 'flashcards' }>).content.cards[0]?.image_url]
  ] as const)('%s: an item image uploads into image_url', async (type, imageUrl) => {
    const { editor, latest } = mount(createBlock(type, `b_${type}`));
    await pick(uploadInputs(editor)[0]!, [png('item.png')]);
    expect(imageUrl(latest())).toBe(urlOf('item.png'));
  });

  it('diagram: upload sets the image url', async () => {
    const { editor, latest } = mount(createBlock('diagram', 'b_diagram'));
    await pick(uploadInputs(editor)[0]!, [png('cycle.png')]);
    const block = latest() as Extract<Block, { block_type: 'diagram' }>;
    expect(block.content.source).toBe('image');
    expect(block.content.image_url).toBe(urlOf('cycle.png'));
  });

  it('a failed upload shows an inline error and leaves the block alone', async () => {
    uploadMock.mockRejectedValue(new Error('Network request failed'));
    const { editor, onChange } = mount(createBlock('attachment', 'b_fail'));
    await pick(uploadInputs(editor)[0]!, [pdf()]);
    const error = editor.querySelector<HTMLElement>('.block-editor__upload-error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain("Couldn't upload worksheet.pdf");
    expect(onChange).not.toHaveBeenCalled();
  });
});
