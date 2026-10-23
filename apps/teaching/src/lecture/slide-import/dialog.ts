// apps/teaching/src/lecture/slide-import/dialog.ts
import type { Block } from '@/schemas/block';
import type { Media } from '@/schemas/media';
import { uploadMediaFile } from '@/teacher/media-api';
import { resolveMediaLibraryUrl } from '@/teacher/media-library-picker';
import { rememberUploadedMedia } from '@/blocks/upload-button';
import { readPptx, type PptxSlide } from './pptx';
import { openPdf, canvasToJpeg, SLIDE_WIDTH, type PdfDeck } from './pdf';
import { pairSlides, sceneTitle, slideSceneBlocks, type SlidePair } from './scenes';
import './slide-import.css';

export type SlideImportOptions = {
  newId: () => string;
  /** Gets the new scenes once every slide picture is uploaded. */
  onAdd: (blocks: Block[]) => void;
  uploadFile?: (file: File, opts?: { title?: string }) => Promise<Media>;
  openPdf?: (bytes: Uint8Array) => Promise<PdfDeck>;
};

const THUMB_WIDTH = 176;

const isPptx = (file: File) => /\.pptx$/i.test(file.name);
const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Import slides: the teacher gives the .pptx (titles, notes, hidden slides)
 * and its PDF export (the pictures). Each slide becomes a heading with the
 * notes as its script, then the slide as one image. Nothing joins the lesson
 * until every picture is up; a failed upload can be retried from where it stopped.
 */
export function openSlideImport(options: SlideImportOptions): { close(): void } {
  const upload = options.uploadFile ?? uploadMediaFile;
  const open = options.openPdf ?? openPdf;

  const overlay = el('div', 'confirm-card-overlay slide-import-overlay');
  const card = el('section', 'confirm-card slide-import');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'slide-import-title');
  const title = el('h2', 'slide-import__title', 'Import slides');
  title.id = 'slide-import-title';
  const help = el(
    'p',
    'slide-import__help',
    'Choose the .pptx and a PDF of the same deck (in PowerPoint: File › Export › PDF). Each slide becomes a scene: its title as the heading, the slide as the picture, its notes as your recording script.'
  );
  const drop = el('label', 'slide-import__drop');
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation';
  input.className = 'slide-import__input';
  const dropText = el('span', 'slide-import__drop-text', 'Drop both files here, or click to choose');
  drop.append(input, dropText);
  const picked = el('ul', 'slide-import__picked');
  const status = el('p', 'slide-import__status');
  status.setAttribute('role', 'status');
  const error = el('p', 'slide-import__error');
  error.setAttribute('role', 'alert');
  const list = el('ol', 'slide-import__list');
  const actions = el('div', 'confirm-card__actions slide-import__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const add = el('button', 'btn btn--primary', 'Add scenes');
  add.type = 'button';
  add.disabled = true;
  actions.append(cancel, add);
  card.append(title, help, drop, picked, status, error, list, actions);
  overlay.append(card);

  let deckFile: File | null = null;
  let pdfFile: File | null = null;
  let pdf: PdfDeck | null = null;
  let pairs: SlidePair[] = [];
  const chosen = new Set<number>();
  /** Page -> uploaded URL, so Try again carries on from the slide that failed. */
  const uploaded = new Map<number, string>();
  let busy = false;
  let closed = false;
  let ticket = 0;

  const say = (message: string) => (status.textContent = message);
  const fail = (message: string) => (error.textContent = message);

  const syncAdd = () => {
    const count = pairs.filter((pair) => chosen.has(pair.page)).length;
    add.disabled = busy || count === 0;
    const scenes = count === 1 ? '1 scene' : `${count} scenes`;
    add.textContent = count === 0 ? 'Add scenes' : uploaded.size ? `Try again: add ${scenes}` : `Add ${scenes}`;
  };

  const paintPicked = () => {
    picked.replaceChildren(
      el('li', deckFile ? 'slide-import__file slide-import__file--ok' : 'slide-import__file', deckFile ? `Deck · ${deckFile.name}` : 'Deck (.pptx) · not chosen yet'),
      el('li', pdfFile ? 'slide-import__file slide-import__file--ok' : 'slide-import__file', pdfFile ? `PDF · ${pdfFile.name}` : 'PDF export · not chosen yet')
    );
  };

  async function load(): Promise<void> {
    if (!deckFile || !pdfFile) return;
    const mine = ++ticket;
    pdf?.destroy();
    pdf = null;
    pairs = [];
    chosen.clear();
    uploaded.clear();
    list.replaceChildren();
    fail('');
    say('Reading the slides…');
    syncAdd();
    let slides: PptxSlide[];
    let deck: PdfDeck;
    try {
      slides = readPptx(new Uint8Array(await deckFile.arrayBuffer()));
      deck = await open(new Uint8Array(await pdfFile.arrayBuffer()));
    } catch (cause) {
      if (mine !== ticket) return;
      say('');
      fail(cause instanceof Error ? cause.message : 'Those files couldn’t be read.');
      return;
    }
    if (mine !== ticket || closed) return deck.destroy();
    pdf = deck;
    if (slides.length === 0) {
      say('');
      fail('That deck has no slides.');
      return;
    }
    const pairing = pairSlides(slides, deck.pageCount);
    if (!pairing.ok) {
      say('');
      fail(pairing.message);
      return;
    }
    pairs = pairing.pairs;
    pairs.forEach((pair) => chosen.add(pair.page));
    const hidden = slides.filter((slide) => slide.hidden).length;
    say(`${pairs.length} slide${pairs.length === 1 ? '' : 's'}${hidden ? `, ${hidden} hidden slide${hidden === 1 ? '' : 's'} left out` : ''}. Untick any you don’t want.`);
    list.replaceChildren(...pairs.map(row));
    syncAdd();
    // Thumbnails draw one after another, so the list is usable straight away.
    for (const pair of pairs) {
      if (mine !== ticket || closed) return;
      const slot = list.querySelector<HTMLElement>(`[data-page="${pair.page}"] .slide-import__thumb`);
      try {
        const canvas = await deck.render(pair.page, THUMB_WIDTH * 2);
        canvas.setAttribute('aria-hidden', 'true');
        slot?.replaceChildren(canvas);
      } catch {
        slot?.replaceChildren(el('span', 'slide-import__thumb-missing', 'No preview'));
      }
    }
  }

  function row(pair: SlidePair): HTMLElement {
    const item = el('li', 'slide-import__slide');
    item.dataset.page = String(pair.page);
    const label = el('label', 'slide-import__slide-label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => {
      if (box.checked) chosen.add(pair.page);
      else chosen.delete(pair.page);
      item.classList.toggle('slide-import__slide--off', !box.checked);
      syncAdd();
    });
    const thumb = el('span', 'slide-import__thumb');
    const words = el('span', 'slide-import__words');
    words.append(el('strong', 'slide-import__slide-title', `${pair.slide.number}. ${sceneTitle(pair.slide)}`));
    const note = pair.slide.notes.split('\n')[0] ?? '';
    words.append(el('span', note ? 'slide-import__notes' : 'slide-import__notes slide-import__notes--none', note || 'No speaker notes'));
    label.append(box, thumb, words);
    item.append(label);
    return item;
  }

  async function addScenes(): Promise<void> {
    if (!pdf || busy) return;
    const deck = pdf;
    const picks = pairs.filter((pair) => chosen.has(pair.page));
    busy = true;
    syncAdd();
    fail('');
    list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => (box.disabled = true));
    try {
      for (const [index, pair] of picks.entries()) {
        if (closed) return;
        if (uploaded.has(pair.page)) continue;
        say(`Uploading slide ${index + 1} of ${picks.length}…`);
        const name = `Slide ${pair.slide.number} - ${sceneTitle(pair.slide)}`.slice(0, 80).replace(/[\\/:*?"<>|]/g, '');
        try {
          const file = await canvasToJpeg(await deck.render(pair.page, SLIDE_WIDTH), `${name}.jpg`);
          const media = await upload(file, { title: name });
          const url = resolveMediaLibraryUrl(media);
          if (!url) throw new Error('It uploaded but has no usable link.');
          rememberUploadedMedia(media);
          uploaded.set(pair.page, url);
        } catch (cause) {
          say('');
          const why = cause instanceof Error && cause.message ? ` ${cause.message}` : '';
          fail(`Slide ${pair.slide.number} didn’t upload.${why} Nothing has been added yet; Try again carries on from this slide.`);
          return;
        }
      }
      if (closed) return;
      const blocks = picks.flatMap((pair) => slideSceneBlocks(pair.slide, uploaded.get(pair.page)!, options.newId));
      options.onAdd(blocks);
      close();
    } finally {
      busy = false;
      if (!closed) {
        list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => (box.disabled = false));
        syncAdd();
      }
    }
  }

  function take(files: File[]): void {
    if (busy) return;
    const deck = files.find(isPptx);
    const export_ = files.find(isPdf);
    const other = files.find((file) => !isPptx(file) && !isPdf(file));
    if (deck) deckFile = deck;
    if (export_) pdfFile = export_;
    paintPicked();
    if (other && !deck && !export_) {
      fail(`${other.name} isn’t a .pptx or a PDF. An old .ppt deck needs saving as .pptx first.`);
      return;
    }
    fail('');
    if (deckFile && pdfFile) void load();
  }

  input.addEventListener('change', () => {
    take(Array.from(input.files ?? []));
    input.value = '';
  });
  drop.addEventListener('dragover', (event) => {
    event.preventDefault();
    drop.classList.add('slide-import__drop--over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('slide-import__drop--over'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('slide-import__drop--over');
    take(Array.from(event.dataTransfer?.files ?? []));
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      close();
    }
  };
  function close(): void {
    if (closed) return;
    closed = true;
    ticket += 1;
    pdf?.destroy();
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  }
  cancel.addEventListener('click', close);
  add.addEventListener('click', () => void addScenes());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && !busy) close();
  });
  window.addEventListener('keydown', onKey);

  paintPicked();
  document.body.append(overlay);
  input.focus();
  return { close };
}
