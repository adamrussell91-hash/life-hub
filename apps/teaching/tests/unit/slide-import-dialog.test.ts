import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSlideImport } from '@/lecture/slide-import/dialog';
import type { PdfDeck } from '@/lecture/slide-import/pdf';
import type { Media } from '@/schemas/media';

vi.mock('@/blocks/upload-button', () => ({ rememberUploadedMedia: () => {} }));

const deckBytes = readFileSync(resolve(__dirname, '../../fixtures/slide-import/deck.pptx'));
const deckFile = () => new File([deckBytes], 'Context.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
const pdfFile = () => new File(['%PDF'], 'Context.pdf', { type: 'application/pdf' });

/** The fixture deck shows 3 slides (one more is hidden), so its PDF has 3 pages. */
const fakePdf = (pageCount = 3) => async (): Promise<PdfDeck> => ({
  pageCount,
  render: async () => document.createElement('canvas'),
  destroy: () => {}
});

const media = (n: number) => ({ id: `m${n}`, preview_url: `https://media.test/${n}.jpg` }) as unknown as Media;

function drop(files: File[]): void {
  const zone = document.querySelector('.slide-import__drop')!;
  zone.dispatchEvent(Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { files } }));
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const addButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.slide-import__actions button')).at(-1)!;

describe('Import slides', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(['jpg'], { type: 'image/jpeg' }));
    };
  });
  afterEach(() => document.body.replaceChildren());

  it('turns each shown slide into a heading with its script and the slide picture', async () => {
    let n = 0;
    const upload = vi.fn(async () => media(++n));
    const onAdd = vi.fn();
    let id = 0;
    openSlideImport({ newId: () => `id${++id}`, onAdd, uploadFile: upload, openPdf: fakePdf() });
    drop([deckFile(), pdfFile()]);
    await settle();
    await settle();
    expect(document.querySelectorAll('.slide-import__slide')).toHaveLength(3);
    expect(document.querySelector('.slide-import__status')?.textContent).toContain('1 hidden slide left out');
    expect(addButton().textContent).toBe('Add 3 scenes');

    // Leave out the last slide.
    const boxes = document.querySelectorAll<HTMLInputElement>('.slide-import__slide input');
    boxes[2]!.checked = false;
    boxes[2]!.dispatchEvent(new Event('change'));
    expect(addButton().textContent).toBe('Add 2 scenes');
    addButton().click();
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());

    const blocks = onAdd.mock.calls[0]![0];
    expect(blocks.map((b: { block_type: string }) => b.block_type)).toEqual(['heading', 'image', 'heading', 'image']);
    expect(blocks[0].content).toEqual({ text: 'Reading for context', script: 'Welcome back. Today we look at how a reader brings context to a text.' });
    expect(blocks[3].content.url).toBe('https://media.test/2.jpg');
    expect(upload.mock.calls[0]![0].type).toBe('image/jpeg');
    expect(document.querySelector('.slide-import')).toBeNull();
  });

  it('stops when the PDF does not match the deck', async () => {
    const onAdd = vi.fn();
    openSlideImport({ newId: () => 'x', onAdd, uploadFile: vi.fn(), openPdf: fakePdf(7) });
    drop([deckFile(), pdfFile()]);
    await settle();
    await settle();
    expect(document.querySelector('.slide-import__error')?.textContent).toContain('The PDF has 7 pages');
    expect(addButton().disabled).toBe(true);
  });

  it('adds nothing when an upload fails, and Try again carries on from that slide', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce(media(1))
      .mockRejectedValueOnce(new Error('Network down.'))
      .mockResolvedValueOnce(media(2))
      .mockResolvedValueOnce(media(3));
    const onAdd = vi.fn();
    let id = 0;
    openSlideImport({ newId: () => `id${++id}`, onAdd, uploadFile: upload, openPdf: fakePdf() });
    drop([deckFile(), pdfFile()]);
    await settle();
    await settle();
    addButton().click();
    await vi.waitFor(() => expect(document.querySelector('.slide-import__error')?.textContent).toContain('Slide 2 didn’t upload. Network down.'));
    expect(onAdd).not.toHaveBeenCalled();
    expect(addButton().textContent).toBe('Try again: add 3 scenes');
    addButton().click();
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledTimes(4);
    expect(onAdd.mock.calls[0]![0]).toHaveLength(6);
  });
});
