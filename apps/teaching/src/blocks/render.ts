import { FAILURE } from '@/app/failure';
import katex from 'katex';
import { getApiBaseUrl } from '@/api/config';
import { buildChartSvg, buildChartTableRows } from '@/blocks/chart-svg';
import { mountGraphMaker } from '@/blocks/graph-maker/mount';
import type { CollectionLink } from '@/blocks/collection-resolve';
import { buildHtmlAppSrcdoc } from '@/blocks/html-app-srcdoc';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { isHttpUrl } from '@/blocks/url-safety';
import { embedFrameSrc, embedUsesIframe } from '@/blocks/embed-url';
import { videoEmbedSrc } from '@/blocks/video-url';
import {
  loadActivityState,
  parseClozeText,
  saveActivityState,
  shuffleArray,
  storageKey
} from '@/blocks/learning-activity';
import { DIAGRAM_IMAGE_PUBLISH_URL_ISSUE, type Block, type EmbedProvider } from '@/schemas/block';
import { renderOutcomeList } from '@/outcomes/display';
import type { PublicOutcome } from '@/curriculum/outcome-catalog';

export type RenderMode = 'teacher' | 'student' | 'print';
export type RenderContext = {
  lessonId?: string;
  attachedOutcomes?: PublicOutcome[];
};

const HEADING_TAG = {
  page: 'h1',
  section: 'h2',
  subsection: 'h3'
} as const;

/** Semantic callout styles mapped to design-token accent classes. */
export const CALLOUT_STYLE_CLASS = {
  information: 'callout--wave',
  important: 'callout--high-sea',
  warning: 'callout--high-sea',
  extension: 'callout--sand',
  scaffold: 'callout--sand',
  example: 'callout--shore',
  remember: 'callout--shore',
  teacher: 'callout--wave'
} as const;

function wrapBlock(content: HTMLElement, block: Block, mode: RenderMode): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'block';
  wrapper.dataset.blockId = block.id;
  wrapper.dataset.blockType = block.block_type;

  if (mode === 'teacher' && block.visibility === 'teacher_only') {
    wrapper.classList.add('block--teacher-only');
  }

  wrapper.append(content);
  return wrapper;
}

function renderPrintFallback(opts: {
  label: string;
  title?: string;
  url?: string;
}): HTMLElement {
  const el = document.createElement('div');
  el.className = 'block-print-fallback';
  const heading = document.createElement('p');
  heading.className = 'block-print-fallback__label';
  heading.textContent = opts.title?.trim() || opts.label;
  el.append(heading);
  if (opts.url) {
    const link = document.createElement('p');
    link.className = 'block-print-fallback__url';
    link.textContent = opts.url;
    el.append(link);
  }
  return el;
}

function responseSpaceLineCount(
  space: 'none' | 'short' | 'medium' | 'long' | 'extended'
): number {
  if (space === 'none') return 0;
  if (space === 'short') return 2;
  if (space === 'medium') return 4;
  if (space === 'long') return 6;
  return 10;
}

function videoWatchUrl(
  provider: Extract<Block, { block_type: 'video' }>['content']['provider'],
  externalId: string
): string {
  if (provider === 'youtube') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(externalId)}`;
  }
  return `https://vimeo.com/${encodeURIComponent(externalId)}`;
}

export function renderRichTextBlock(
  block: Extract<Block, { block_type: 'rich_text' }>,
  mode: RenderMode
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-rich-text';
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  return wrapBlock(body, block, mode);
}

export function renderHeadingBlock(
  block: Extract<Block, { block_type: 'heading' }>,
  mode: RenderMode
): HTMLElement {
  const tag = HEADING_TAG[block.variant] ?? 'h2';
  const heading = document.createElement(tag);
  heading.className = `block-heading block-heading--${block.variant}`;
  heading.textContent = block.content.text;
  return wrapBlock(heading, block, mode);
}

export function renderCalloutBlock(
  block: Extract<Block, { block_type: 'callout' }>,
  mode: RenderMode
): HTMLElement {
  const callout = document.createElement('aside');
  const styleClass = CALLOUT_STYLE_CLASS[block.content.style];
  callout.className = `callout ${styleClass}`;
  callout.setAttribute('role', 'note');

  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'callout__title';
    title.textContent = block.content.title;
    callout.append(title);
  }

  const body = document.createElement('p');
  body.className = 'callout__body';
  body.textContent = block.content.body;
  callout.append(body);

  return wrapBlock(callout, block, mode);
}

export function renderImageBlock(
  block: Extract<Block, { block_type: 'image' }>,
  mode: RenderMode
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = `block-image block-image--${block.variant}`;
  if (isHttpUrl(block.content.url)) {
    const img = document.createElement('img');
    img.src = block.content.url;
    img.alt = block.content.alt_text;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      const unavailable = document.createElement('p');
      unavailable.className = 'block-image__unavailable';
      unavailable.textContent = block.content.alt_text.trim() || FAILURE.imageUnavailable;
      img.replaceWith(unavailable);
    });
    figure.append(img);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-image__unavailable';
    unavailable.textContent = block.content.alt_text.trim() || FAILURE.imageUnavailable;
    figure.append(unavailable);
  }
  if (block.content.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-image__caption';
    cap.textContent = block.content.caption;
    figure.append(cap);
  }
  return wrapBlock(figure, block, mode);
}

export function renderVideoBlock(
  block: Extract<Block, { block_type: 'video' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `block-video block-video--${block.variant}`;

  if (mode === 'print') {
    const watchUrl = block.content.external_id.trim()
      ? videoWatchUrl(block.content.provider, block.content.external_id)
      : undefined;
    wrap.append(
      renderPrintFallback({
        label: 'Video',
        title: block.content.title,
        url: watchUrl
      })
    );
    if (block.content.caption) {
      const cap = document.createElement('p');
      cap.className = 'block-video__caption';
      cap.textContent = block.content.caption;
      wrap.append(cap);
    }
    return wrapBlock(wrap, block, mode);
  }

  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'block-video__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  if (!block.content.external_id.trim()) {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-video__unavailable';
    unavailable.textContent = FAILURE.videoUnavailable;
    wrap.append(unavailable);
  } else {
    const iframe = document.createElement('iframe');
    iframe.className = 'block-video__frame';
    iframe.src = videoEmbedSrc(block.content.provider, block.content.external_id);
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    );
    iframe.title = block.content.title || 'Video';
    wrap.append(iframe);
  }
  if (block.content.caption) {
    const cap = document.createElement('p');
    cap.className = 'block-video__caption';
    cap.textContent = block.content.caption;
    wrap.append(cap);
  }
  return wrapBlock(wrap, block, mode);
}

function embedProviderLabel(provider: EmbedProvider): string {
  switch (provider) {
    case 'google_maps':
      return 'Google Maps';
    case 'google_slides':
      return 'Google Slides';
    case 'google_docs':
      return 'Google Doc';
    case 'pdf':
      return 'PDF';
    default:
      return 'Embedded resource';
  }
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sourceInitials(source: string): string {
  const parts = source.replace(/\.[a-z]+$/i, '').split(/[.\-]/).filter(Boolean);
  const letters = (parts[0]?.slice(0, 1) ?? '') + (parts[1]?.slice(0, 1) ?? '');
  return letters.toUpperCase() || 'EX';
}

function embedDefaultTitle(provider: EmbedProvider): string {
  switch (provider) {
    case 'google_maps':
      return 'Map';
    case 'google_slides':
      return 'Slides';
    case 'google_docs':
      return 'Google Doc';
    case 'pdf':
      return 'PDF';
    default:
      return 'Embedded content';
  }
}

export function renderEmbedBlock(
  block: Extract<Block, { block_type: 'embed' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-embed';
  const safeUrl = isHttpUrl(block.content.url) ? block.content.url.trim() : undefined;

  if (mode === 'print') {
    const provider = block.content.provider ?? 'generic';
    wrap.append(
      renderPrintFallback({
        label: embedProviderLabel(provider),
        title: block.content.title,
        url: safeUrl
      })
    );
    return wrapBlock(wrap, block, mode);
  }

  if (!safeUrl) {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-embed__unavailable';
    unavailable.textContent = FAILURE.embedUnavailable;
    wrap.append(unavailable);
    return wrapBlock(wrap, block, mode);
  }

  const provider = block.content.provider ?? 'generic';
  const frameSrc = embedFrameSrc(block.content);

  if (embedUsesIframe(provider) && frameSrc) {
    const iframe = document.createElement('iframe');
    iframe.className = 'block-embed__frame';
    iframe.src = frameSrc;
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    iframe.title = block.content.title || embedDefaultTitle(provider);
    wrap.append(iframe);

    const link = document.createElement('a');
    link.className = 'block-embed__open';
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = block.content.title?.trim() || 'Open in new tab';
    wrap.append(link);
  } else {
    const host = hostnameFromUrl(safeUrl);
    const source = host || embedProviderLabel(provider);
    const card = document.createElement('div');
    card.className = 'block-embed__card';

    const bar = document.createElement('div');
    bar.className = 'block-embed__card-bar';
    const icon = document.createElement('span');
    icon.className = 'block-embed__card-icon';
    icon.textContent = sourceInitials(source);
    const src = document.createElement('span');
    src.className = 'block-embed__card-src';
    src.textContent = source;
    bar.append(icon, src);

    const body = document.createElement('div');
    body.className = 'block-embed__card-body';

    const title = document.createElement('p');
    title.className = 'block-embed__card-title';
    title.textContent = block.content.title?.trim() || embedDefaultTitle(provider);

    const meta = document.createElement('p');
    meta.className = 'block-embed__card-meta';
    meta.textContent =
      host && provider !== 'generic'
        ? embedProviderLabel(provider)
        : 'This provider blocks in-page embedding, so it opens in a new tab.';

    const link = document.createElement('a');
    link.className = 'btn btn--secondary block-embed__open';
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in new tab';

    body.append(title, meta, link);
    card.append(bar, body);
    wrap.append(card);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderHtmlBlock(
  block: Extract<Block, { block_type: 'html' }>,
  mode: RenderMode
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-html';
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  return wrapBlock(body, block, mode);
}

export function renderHtmlAppBlock(
  block: Extract<Block, { block_type: 'html_app' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-html-app';

  if (mode === 'print') {
    root.append(
      renderPrintFallback({
        label: 'Interactive app',
        title: block.content.title
      })
    );
    return wrapBlock(root, block, mode);
  }

  const height = block.content.height_px ?? 480;
  const iframe = document.createElement('iframe');
  iframe.className = 'block-html-app__frame';
  iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.title = block.content.title?.trim() || 'HTML app';
  iframe.style.height = `${height}px`;
  iframe.style.width = '100%';
  iframe.style.border = '0';

  const ai = block.content.ai;
  const injectAi = Boolean(ai && ctx.lessonId);
  iframe.srcdoc = buildHtmlAppSrcdoc(
    block.content.html,
    injectAi
      ? {
          injectAi: true,
          lessonId: ctx.lessonId!,
          blockId: block.id,
          apiBaseUrl: getApiBaseUrl()
        }
      : { injectAi: false }
  );
  root.append(iframe);

  if (ai) {
    const note = document.createElement('p');
    note.className = 'block-html-app__ai-note';
    note.textContent = 'Uses class AI lane';
    root.append(note);
  }

  return wrapBlock(root, block, mode);
}

export function renderQuoteBlock(
  block: Extract<Block, { block_type: 'quote' }>,
  mode: RenderMode
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-quote';

  const quote = document.createElement('blockquote');
  quote.className = 'block-quote__text';
  quote.textContent = block.content.quote;
  figure.append(quote);

  const attribution = block.content.attribution?.trim();
  const source = block.content.source?.trim();
  const reference = block.content.reference?.trim();
  if (attribution || source || reference) {
    const caption = document.createElement('figcaption');
    caption.className = 'block-quote__attribution';
    const parts = [attribution, source, reference].filter(Boolean);
    caption.textContent = parts.join(' — ');
    figure.append(caption);
  }

  return wrapBlock(figure, block, mode);
}

export function renderDividerBlock(
  block: Extract<Block, { block_type: 'divider' }>,
  mode: RenderMode
): HTMLElement {
  const hr = document.createElement('hr');
  hr.className = 'block-divider';
  return wrapBlock(hr, block, mode);
}

export function renderDefinitionBlock(
  block: Extract<Block, { block_type: 'definition' }>,
  mode: RenderMode
): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'block-definition';

  const dt = document.createElement('dt');
  dt.className = 'block-definition__term';
  dt.textContent = block.content.term;

  const dd = document.createElement('dd');
  dd.className = 'block-definition__definition';
  dd.textContent = block.content.definition;

  dl.append(dt, dd);
  return wrapBlock(dl, block, mode);
}

export function renderCodeBlock(
  block: Extract<Block, { block_type: 'code' }>,
  mode: RenderMode
): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'block-code';
  if (block.content.language) {
    pre.dataset.language = block.content.language;
  }

  const code = document.createElement('code');
  code.textContent = block.content.code;
  pre.append(code);

  return wrapBlock(pre, block, mode);
}

export function renderAudioBlock(
  block: Extract<Block, { block_type: 'audio' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-audio';

  if (mode === 'print') {
    wrap.append(
      renderPrintFallback({
        label: 'Audio',
        title: block.content.title,
        url: isHttpUrl(block.content.url) ? block.content.url.trim() : undefined
      })
    );
    return wrapBlock(wrap, block, mode);
  }

  if (block.content.title?.trim()) {
    const title = document.createElement('p');
    title.className = 'block-audio__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  if (isHttpUrl(block.content.url)) {
    const audio = document.createElement('audio');
    audio.className = 'block-audio__player';
    audio.controls = true;
    audio.src = block.content.url.trim();
    wrap.append(audio);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-audio__unavailable';
    unavailable.textContent = 'Audio unavailable.';
    wrap.append(unavailable);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderAttachmentBlock(
  block: Extract<Block, { block_type: 'attachment' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-attachment';

  if (mode === 'print') {
    const safeUrl = isHttpUrl(block.content.url) ? block.content.url.trim() : undefined;
    wrap.append(
      renderPrintFallback({
        label: 'Attachment',
        title: block.content.title?.trim() || block.content.filename?.trim(),
        url: safeUrl
      })
    );
    return wrapBlock(wrap, block, mode);
  }

  if (isHttpUrl(block.content.url)) {
    const link = document.createElement('a');
    link.className = 'block-attachment__link';
    link.href = block.content.url.trim();
    link.download = block.content.filename?.trim() || '';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = block.content.title.trim() || block.content.filename?.trim() || 'Download';
    wrap.append(link);
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-attachment__unavailable';
    unavailable.textContent = block.content.title.trim() || 'Attachment unavailable.';
    wrap.append(unavailable);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderAccordionBlock(
  block: Extract<Block, { block_type: 'accordion' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-accordion';

  for (const item of block.content.items) {
    const details = document.createElement('details');
    details.className = 'block-accordion__item';

    const summary = document.createElement('summary');
    summary.className = 'block-accordion__title';
    summary.textContent = item.title;

    const body = document.createElement('div');
    body.className = 'block-accordion__body';
    body.textContent = item.body;

    if (mode === 'print') details.open = true;

    details.append(summary, body);
    wrap.append(details);
  }

  return wrapBlock(wrap, block, mode);
}

export function renderTableBlock(
  block: Extract<Block, { block_type: 'table' }>,
  mode: RenderMode
): HTMLElement {
  const table = document.createElement('table');
  table.className = 'block-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const header of block.content.headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = header;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const row of block.content.rows) {
    const tr = document.createElement('tr');
    const cellCount = Math.max(block.content.headers.length, row.length);
    for (let i = 0; i < cellCount; i += 1) {
      const td = document.createElement('td');
      td.textContent = row[i] ?? '';
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);

  return wrapBlock(table, block, mode);
}

export function renderQuestionSetBlock(
  block: Extract<Block, { block_type: 'question_set' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-question-set';

  if (block.content.title?.trim()) {
    const title = document.createElement('p');
    title.className = 'block-question-set__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  const list = document.createElement('ol');
  list.className = 'block-question-set__list';

  for (const question of block.content.questions) {
    const li = document.createElement('li');
    li.className = 'block-question-set__question';

    const prompt = document.createElement('p');
    prompt.className = 'block-question-set__prompt';
    prompt.textContent = question.prompt;
    li.append(prompt);

    if (question.kind === 'multiple_choice' && question.options?.length) {
      const options = document.createElement('ul');
      options.className = 'block-question-set__options';
      for (const option of question.options) {
        const optionItem = document.createElement('li');
        optionItem.textContent = option;
        options.append(optionItem);
      }
      li.append(options);
    }

    if (mode === 'print' && question.kind === 'short_answer') {
      const space = question.response_space ?? 'medium';
      const lineCount = responseSpaceLineCount(space);
      if (lineCount > 0) {
        const lines = document.createElement('div');
        lines.className = 'block-question-set__response-lines';
        lines.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < lineCount; i += 1) {
          const line = document.createElement('div');
          line.className = 'block-question-set__line';
          lines.append(line);
        }
        li.append(lines);
      }
    } else if (question.kind === 'short_answer') {
      const label = document.createElement('p');
      label.className = 'block-question-set__answer-label';
      label.textContent = 'Your response';
      const box = document.createElement('div');
      box.className = 'block-question-set__answer';
      box.textContent = 'Type your response here…';
      li.append(label, box);
    }

    list.append(li);
  }

  wrap.append(list);
  return wrapBlock(wrap, block, mode);
}

export function renderSpacerBlock(
  block: Extract<Block, { block_type: 'spacer' }>,
  mode: RenderMode
): HTMLElement {
  const el = document.createElement('div');
  el.className = `block-spacer block-spacer--${block.content.size}`;
  el.setAttribute('aria-hidden', 'true');
  return wrapBlock(el, block, mode);
}

export function renderSectionBlock(
  block: Extract<Block, { block_type: 'section' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'block-section';

  const title = document.createElement('h2');
  title.className = 'block-section__title';
  title.textContent = block.content.title;

  const body = document.createElement('div');
  body.className = 'block-section__body';
  for (const child of block.content.blocks) {
    body.append(renderBlock(child, mode, ctx));
  }

  section.append(title, body);
  return wrapBlock(section, block, mode);
}

export function renderColumnsBlock(
  block: Extract<Block, { block_type: 'columns' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'block-columns';
  grid.dataset.preset = block.content.preset;
  if (mode === 'print') grid.classList.add('block-columns--print-stack');
  grid.style.gridTemplateColumns = block.content.columns
    .map((col) => `${col.width}fr`)
    .join(' ');

  for (const col of block.content.columns) {
    const cell = document.createElement('div');
    cell.className = 'block-columns__col';
    cell.dataset.width = String(col.width);
    for (const child of col.blocks) {
      cell.append(renderBlock(child, mode, ctx));
    }
    grid.append(cell);
  }

  return wrapBlock(grid, block, mode);
}

export function renderTimelineBlock(
  block: Extract<Block, { block_type: 'timeline' }>,
  mode: RenderMode
): HTMLElement {
  const list = document.createElement('ol');
  list.className = 'block-timeline';

  for (const event of block.content.events) {
    const item = document.createElement('li');
    item.className = 'block-timeline__event';

    const when = document.createElement('p');
    when.className = 'block-timeline__when';
    when.textContent = event.when;

    const label = document.createElement('h3');
    label.className = 'block-timeline__label';
    label.textContent = event.label;

    item.append(when, label);

    if (event.description.trim()) {
      const description = document.createElement('p');
      description.className = 'block-timeline__description';
      description.textContent = event.description;
      item.append(description);
    }

    if (event.image_url?.trim()) {
      const img = document.createElement('img');
      img.className = 'block-timeline__image';
      img.src = event.image_url.trim();
      img.alt = event.image_alt ?? '';
      item.append(img);
    }

    if (event.link_url?.trim()) {
      const link = document.createElement('a');
      link.className = 'block-timeline__link';
      link.href = event.link_url.trim();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = event.link_label?.trim() || 'Open link';
      item.append(link);
    }

    list.append(item);
  }

  return wrapBlock(list, block, mode);
}

export function renderOutcomesBlock(
  block: Extract<Block, { block_type: 'outcomes' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-outcomes';
  const heading = document.createElement('h2');
  heading.className = 'block-outcomes__title';
  heading.textContent = 'Outcomes';
  root.append(heading);
  root.append(
    renderOutcomeList(
      ctx.attachedOutcomes ?? [],
      'No outcomes tagged on this page yet.'
    )
  );
  return wrapBlock(root, block, mode);
}

export function renderCollectionBlock(
  block: Extract<Block, { block_type: 'collection' }>,
  _mode: RenderMode,
  resolved: { links: CollectionLink[]; emptyMessage?: string } = { links: [] }
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block block-collection';
  root.dataset.blockId = block.id;
  root.dataset.collectionSource = block.content.source;

  const titleText = block.content.title?.trim();
  if (titleText) {
    const title = document.createElement('h3');
    title.className = 'block-collection__title';
    title.textContent = titleText;
    root.append(title);
  }

  if (resolved.links.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-collection__empty';
    empty.textContent = resolved.emptyMessage ?? 'No items.';
    root.append(empty);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'block-collection__list';
  for (const link of resolved.links) {
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.className = 'block-collection__link student-class__link';
    anchor.href = link.href;
    anchor.textContent = link.title;
    item.append(anchor);
    list.append(item);
  }
  root.append(list);
  return root;
}

export function renderTabsBlock(
  block: Extract<Block, { block_type: 'tabs' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-tabs';

  if (mode === 'print') {
    for (const panelData of block.content.tabs) {
      const section = document.createElement('section');
      section.className = 'block-tabs__print-panel';

      const heading = document.createElement('h3');
      heading.className = 'block-tabs__print-panel-label';
      heading.textContent = panelData.label || 'Tab';
      section.append(heading);

      for (const child of panelData.blocks) {
        section.append(renderBlock(child, mode, ctx));
      }

      root.append(section);
    }

    return wrapBlock(root, block, mode);
  }

  const tablist = document.createElement('div');
  tablist.className = 'block-tabs__tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Content tabs');

  const panels: HTMLElement[] = [];
  const buttons: HTMLButtonElement[] = [];
  let selected = 0;

  function selectTab(index: number): void {
    selected = index;
    buttons.forEach((btn, i) => {
      const active = i === selected;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
      btn.classList.toggle('block-tabs__tab--active', active);
    });
    panels.forEach((panel, i) => {
      const active = i === selected;
      panel.hidden = !active;
      panel.replaceChildren();
      if (active) {
        for (const child of block.content.tabs[i]!.blocks) {
          panel.append(renderBlock(child, mode, ctx));
        }
      }
    });
  }

  block.content.tabs.forEach((panelData, index) => {
    const tabId = `${block.id}-tab-${panelData.id}`;
    const panelId = `${block.id}-panel-${panelData.id}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'block-tabs__tab';
    btn.setAttribute('role', 'tab');
    btn.id = tabId;
    btn.setAttribute('aria-controls', panelId);
    btn.textContent = panelData.label || `Tab ${index + 1}`;
    btn.addEventListener('click', () => selectTab(index));
    buttons.push(btn);
    tablist.append(btn);

    const panel = document.createElement('div');
    panel.className = 'block-tabs__panel';
    panel.setAttribute('role', 'tabpanel');
    panel.id = panelId;
    panel.setAttribute('aria-labelledby', tabId);
    panels.push(panel);
  });

  tablist.addEventListener('keydown', (event) => {
    if (buttons.length === 0) return;
    let next = selected;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (selected + 1) % buttons.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (selected - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = buttons.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectTab(next);
    buttons[next]!.focus();
  });

  root.append(tablist, ...panels);
  selectTab(0);
  return wrapBlock(root, block, mode);
}

let activeLightboxCleanup: (() => void) | null = null;

function openGalleryLightbox(src: string, alt: string): void {
  activeLightboxCleanup?.();

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'block-gallery-lightbox';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', alt || 'Enlarged image');

  const img = document.createElement('img');
  img.className = 'block-gallery-lightbox__image';
  img.src = src;
  img.alt = alt;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn block-gallery-lightbox__close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close enlarged image');

  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    activeLightboxCleanup = null;
    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  }

  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) dismiss();
  });
  document.addEventListener('keydown', onKey);
  activeLightboxCleanup = dismiss;

  backdrop.append(img, close);
  document.body.append(backdrop);
  close.focus();
}

function galleryFigure(
  entry: { url: string; alt_text: string; caption?: string },
  interactive: boolean
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-gallery__item';

  if (isHttpUrl(entry.url)) {
    if (interactive) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'block-gallery__open';
      button.setAttribute('aria-label', `Enlarge: ${entry.alt_text || 'image'}`);
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      button.append(img);
      button.addEventListener('click', () => openGalleryLightbox(entry.url, entry.alt_text));
      figure.append(button);
    } else {
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = entry.alt_text;
      img.loading = 'lazy';
      figure.append(img);
    }
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-gallery__unavailable';
    unavailable.textContent = entry.alt_text.trim() || 'Image unavailable.';
    figure.append(unavailable);
  }

  if (entry.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-gallery__caption';
    cap.textContent = entry.caption;
    figure.append(cap);
  }
  return figure;
}

export function renderGalleryBlock(
  block: Extract<Block, { block_type: 'gallery' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');

  if (mode === 'print') {
    root.className = `block-gallery block-gallery--print block-gallery--${block.variant}`;
    const list = document.createElement('div');
    list.className = 'block-gallery__list';
    for (const entry of block.content.items) {
      list.append(galleryFigure(entry, false));
    }
    root.append(list);
    return wrapBlock(root, block, mode);
  }

  root.className = `block-gallery block-gallery--${block.content.layout} block-gallery--${block.variant}`;

  if (block.content.layout === 'carousel') {
    let index = 0;
    const viewport = document.createElement('div');
    viewport.className = 'block-gallery__viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-roledescription', 'carousel');

    const status = document.createElement('p');
    status.className = 'block-gallery__status';
    status.setAttribute('aria-live', 'polite');

    const dots = document.createElement('div');
    dots.className = 'block-gallery__dots';
    dots.setAttribute('role', 'tablist');
    dots.setAttribute('aria-label', 'Gallery slides');

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn--ghost block-gallery__prev';
    prev.textContent = 'Previous';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--ghost block-gallery__next';
    next.textContent = 'Next';

    function show(i: number): void {
      const len = block.content.items.length;
      index = ((i % len) + len) % len;
      viewport.replaceChildren(galleryFigure(block.content.items[index]!, true));
      status.textContent = `${index + 1} / ${len}`;
      [...dots.children].forEach((dot, di) => {
        (dot as HTMLButtonElement).setAttribute('aria-selected', di === index ? 'true' : 'false');
      });
    }

    block.content.items.forEach((_, di) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'block-gallery__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Slide ${di + 1}`);
      dot.addEventListener('click', () => show(di));
      dots.append(dot);
    });

    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    viewport.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
      }
    });

    const controls = document.createElement('div');
    controls.className = 'block-gallery__controls';
    controls.append(prev, status, next);

    root.append(viewport, controls, dots);
    show(0);
  } else {
    const list = document.createElement('div');
    list.className = 'block-gallery__list';
    for (const entry of block.content.items) {
      list.append(galleryFigure(entry, true));
    }
    root.append(list);
  }

  return wrapBlock(root, block, mode);
}

function activityButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${className}`;
  button.textContent = label;
  return button;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function shuffledOutOfSourceOrder<T>(items: T[]): T[] {
  const shuffled = shuffleArray(items);
  if (items.length > 1 && shuffled.every((item, index) => item === items[index])) {
    return [...shuffled.slice(1), shuffled[0]!];
  }
  return shuffled;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPermutation(value: unknown, expected: string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item): item is string => typeof item === 'string' && expected.includes(item)) &&
    new Set(value).size === expected.length
  );
}

type FlashcardItem = Extract<Block, { block_type: 'flashcards' }>['content']['cards'][number];

function flashcardImage(card: FlashcardItem): HTMLImageElement | null {
  if (!card.image_url || !isHttpUrl(card.image_url)) return null;
  const image = document.createElement('img');
  image.className = 'block-flashcards__image';
  image.src = card.image_url.trim();
  image.alt = card.image_alt ?? '';
  image.loading = 'lazy';
  return image;
}

function paintFlashcardFace(face: HTMLElement, text: string, card?: FlashcardItem): void {
  face.replaceChildren();
  const copy = document.createElement('span');
  copy.className = 'block-flashcards__copy';
  copy.textContent = text;
  const image = card ? flashcardImage(card) : null;
  face.append(...(image ? [image, copy] : [copy]));
}

export function renderFlashcardsBlock(
  block: Extract<Block, { block_type: 'flashcards' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-flashcards';

  if (mode === 'teacher') {
    const list = document.createElement('ol');
    list.className = 'block-flashcards__teacher-list';
    for (const card of block.content.cards) {
      const item = document.createElement('li');
      item.className = 'block-flashcards__teacher-card';
      const front = document.createElement('p');
      front.className = 'block-flashcards__teacher-front';
      front.textContent = card.front.trim() || 'Front (required to publish)';
      const back = document.createElement('p');
      back.className = 'block-flashcards__teacher-back';
      back.textContent = card.back.trim() || 'Back (required to publish)';
      const image = flashcardImage(card);
      item.append(...(image ? [image, front, back] : [front, back]));
      list.append(item);
    }
    const hint = document.createElement('p');
    hint.className = 'block-flashcards__teacher-hint';
    hint.textContent = 'Select this block to edit cards.';
    root.append(list, hint);
    return wrapBlock(root, block, mode);
  }

  if (mode === 'print') {
    const printSummary = document.createElement('ol');
    printSummary.className = 'block-flashcards__print';
    for (const item of block.content.cards) {
      const entry = document.createElement('li');
      const frontCopy = document.createElement('p');
      const backCopy = document.createElement('p');
      frontCopy.textContent = `Front: ${item.front}`;
      backCopy.textContent = `Back: ${item.back}`;
      entry.append(frontCopy, backCopy);
      printSummary.append(entry);
    }
    root.append(printSummary);
    return wrapBlock(root, block, mode);
  }

  type FlashcardsState = { order: string[]; index: number; flipped: boolean };
  const key = storageKey('local', block.id);
  const cardIds = block.content.cards.map((card) => card.id);
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  const saved: FlashcardsState | null =
    rawSaved &&
    isPermutation(rawSaved.order, cardIds) &&
    typeof rawSaved.index === 'number' &&
    Number.isInteger(rawSaved.index) &&
    rawSaved.index >= 0 &&
    rawSaved.index < cardIds.length &&
    typeof rawSaved.flipped === 'boolean'
      ? {
          order: rawSaved.order,
          index: rawSaved.index,
          flipped: rawSaved.flipped
        }
      : null;
  let order = block.content.shuffle
    ? saved
      ? [...saved.order]
      : shuffleArray(cardIds)
    : [...cardIds];
  let index = saved?.index ?? 0;
  let flipped = saved?.flipped ?? false;

  const card = document.createElement('div');
  card.className = 'block-flashcards__card';
  const inner = document.createElement('div');
  inner.className = 'block-flashcards__inner';
  const front = document.createElement('div');
  front.className = 'block-flashcards__face block-flashcards__face--front';
  const back = document.createElement('div');
  back.className = 'block-flashcards__face block-flashcards__face--back';
  inner.append(front, back);
  card.append(inner);

  const status = document.createElement('p');
  status.className = 'block-flashcards__status';
  status.setAttribute('aria-live', 'polite');
  const prev = activityButton('Prev', 'block-flashcards__btn');
  const flip = activityButton('Flip', 'block-flashcards__btn');
  const next = activityButton('Next', 'block-flashcards__btn');
  const reset = activityButton('Reset', 'block-flashcards__btn');

  function persist(): void {
    saveActivityState(key, { order, index, flipped } satisfies FlashcardsState);
  }

  function paint(): void {
    const currentId = order[index]!;
    const current = block.content.cards.find((item) => item.id === currentId)!;
    paintFlashcardFace(front, current.front, current);
    paintFlashcardFace(back, current.back);
    card.classList.toggle('block-flashcards__card--flipped', flipped);
    front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
    flip.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    status.textContent = `${index + 1} / ${order.length}`;
    prev.disabled = index === 0;
    next.disabled = index === order.length - 1;
  }

  function show(nextIndex: number): void {
    index = nextIndex;
    flipped = false;
    paint();
    persist();
  }

  prev.addEventListener('click', () => show(Math.max(0, index - 1)));
  next.addEventListener('click', () => show(Math.min(order.length - 1, index + 1)));
  flip.addEventListener('click', () => {
    flipped = !flipped;
    paint();
    persist();
  });
  reset.addEventListener('click', () => {
    order = block.content.shuffle ? shuffleArray(cardIds) : [...cardIds];
    index = 0;
    flipped = false;
    if (block.content.shuffle && !prefersReducedMotion()) {
      root.classList.add('block-flashcards--shuffling');
      window.setTimeout(() => root.classList.remove('block-flashcards--shuffling'), 280);
    }
    paint();
    persist();
  });

  const controls = document.createElement('div');
  controls.className = 'block-flashcards__controls';
  controls.append(prev, flip, next, reset);
  const printSummary = document.createElement('ol');
  printSummary.className = 'block-flashcards__print';
  printSummary.setAttribute('aria-hidden', 'true');
  for (const item of block.content.cards) {
    const entry = document.createElement('li');
    const frontCopy = document.createElement('p');
    const backCopy = document.createElement('p');
    frontCopy.textContent = `Front: ${item.front}`;
    backCopy.textContent = `Back: ${item.back}`;
    entry.append(frontCopy, backCopy);
    printSummary.append(entry);
  }
  root.append(card, status, controls, printSummary);
  paint();
  persist();
  if (block.content.shuffle && !saved && !prefersReducedMotion()) {
    root.classList.add('block-flashcards--shuffling');
    window.setTimeout(() => root.classList.remove('block-flashcards--shuffling'), 280);
  }
  return wrapBlock(root, block, mode);
}

export function renderClozeBlock(
  block: Extract<Block, { block_type: 'cloze' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-cloze';
  const { segments, blanks } = parseClozeText(block.content.text);

  if (block.content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-cloze__title';
    title.textContent = block.content.title;
    root.append(title);
  }

  const sentence = document.createElement('p');
  sentence.className = 'block-cloze__sentence';

  if (mode === 'teacher') {
    for (const segment of segments) {
      if (segment.type === 'text') {
        sentence.append(document.createTextNode(segment.value));
      } else {
        const blank = document.createElement('span');
        blank.className = 'block-cloze__preview-blank';
        blank.textContent = segment.blank.answer;
        sentence.append(blank);
      }
    }
    root.append(sentence);
    return wrapBlock(root, block, mode);
  }

  if (mode === 'print') {
    const printSummary = document.createElement('p');
    printSummary.className = 'block-cloze__print';
    for (const segment of segments) {
      if (segment.type === 'text') {
        printSummary.append(document.createTextNode(segment.value));
      } else {
        const blank = document.createElement('span');
        blank.className = 'block-cloze__print-blank';
        blank.textContent = segment.blank.answer;
        printSummary.append(blank);
      }
    }
    root.append(printSummary);
    return wrapBlock(root, block, mode);
  }

  type ClozeState = {
    text: string;
    caseSensitive: boolean;
    answers: string[];
    revealed: boolean;
    score: number | null;
  };
  const key = storageKey('local', block.id);
  const caseSensitive = block.content.case_sensitive ?? false;
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  const rawScore = rawSaved?.score;
  const saved: ClozeState | null =
    rawSaved &&
    rawSaved.text === block.content.text &&
    rawSaved.caseSensitive === caseSensitive &&
    Array.isArray(rawSaved.answers) &&
    rawSaved.answers.length === blanks.length &&
    rawSaved.answers.every((answer): answer is string => typeof answer === 'string') &&
    typeof rawSaved.revealed === 'boolean' &&
    (rawScore === null ||
      (typeof rawScore === 'number' &&
        Number.isInteger(rawScore) &&
        rawScore >= 0 &&
        rawScore <= blanks.length))
      ? {
          text: rawSaved.text,
          caseSensitive: rawSaved.caseSensitive,
          answers: rawSaved.answers,
          revealed: rawSaved.revealed,
          score: rawScore
        }
      : null;
  const inputs: HTMLInputElement[] = [];
  let revealed = saved?.revealed ?? false;
  let scoreValue = saved?.score ?? null;
  let bankWords = shuffledOutOfSourceOrder(blanks.map((blank) => blank.answer));

  for (const segment of segments) {
    if (segment.type === 'text') {
      sentence.append(document.createTextNode(segment.value));
      continue;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'block-cloze__blank';
    input.style.width = `${Math.max(segment.blank.answer.length, 3)}ch`;
    input.setAttribute('aria-label', segment.blank.hint || `Blank ${segment.index + 1}`);
    input.placeholder = segment.blank.hint ?? '';
    input.value = saved?.answers[segment.index] ?? '';
    inputs.push(input);
    sentence.append(input);
  }

  const bank = document.createElement('div');
  bank.className = 'block-cloze__word-bank';
  bank.setAttribute('aria-label', 'Word bank');
  const score = document.createElement('p');
  score.className = 'block-cloze__score';
  score.setAttribute('aria-live', 'polite');

  function answers(): string[] {
    return inputs.map((input) => input.value);
  }

  function persist(): void {
    saveActivityState(key, {
      text: block.content.text,
      caseSensitive,
      answers: answers(),
      revealed,
      score: scoreValue
    } satisfies ClozeState);
  }

  function paintBank(): void {
    bank.replaceChildren();
    for (const word of bankWords) {
      const chip = document.createElement('span');
      chip.className = 'block-cloze__word';
      chip.textContent = word;
      bank.append(chip);
    }
  }

  function paintScore(): void {
    score.textContent = scoreValue === null ? '' : `${scoreValue} / ${blanks.length}`;
  }

  inputs.forEach((input) =>
    input.addEventListener('input', () => {
      scoreValue = null;
      revealed = false;
      inputs.forEach((item) =>
        item.classList.remove('block-cloze__blank--correct', 'block-cloze__blank--incorrect')
      );
      paintScore();
      persist();
    })
  );
  const check = activityButton('Check', 'block-cloze__btn');
  const reveal = activityButton('Reveal', 'block-cloze__btn');
  const reset = activityButton('Reset', 'block-cloze__btn');
  check.addEventListener('click', () => {
    scoreValue = inputs.reduce((total, input, i) => {
      const expected = blanks[i]!.answer.trim();
      const actual = input.value.trim();
      const matches = caseSensitive
        ? actual === expected
        : actual.toLocaleLowerCase() === expected.toLocaleLowerCase();
      input.classList.toggle('block-cloze__blank--correct', matches);
      input.classList.toggle('block-cloze__blank--incorrect', !matches);
      return total + Number(matches);
    }, 0);
    paintScore();
    persist();
  });
  reveal.addEventListener('click', () => {
    inputs.forEach((input, i) => {
      input.value = blanks[i]!.answer;
      input.classList.remove('block-cloze__blank--incorrect');
      input.classList.add('block-cloze__blank--correct');
    });
    revealed = true;
    scoreValue = blanks.length;
    paintScore();
    persist();
  });
  reset.addEventListener('click', () => {
    inputs.forEach((input) => {
      input.value = '';
      input.classList.remove('block-cloze__blank--correct', 'block-cloze__blank--incorrect');
    });
    revealed = false;
    scoreValue = null;
    bankWords = shuffledOutOfSourceOrder(blanks.map((blank) => blank.answer));
    paintBank();
    paintScore();
    persist();
  });

  const controls = document.createElement('div');
  controls.className = 'block-cloze__controls';
  controls.append(check, reveal, reset);
  const printSummary = document.createElement('p');
  printSummary.className = 'block-cloze__print';
  printSummary.setAttribute('aria-hidden', 'true');
  for (const segment of segments) {
    if (segment.type === 'text') {
      printSummary.append(document.createTextNode(segment.value));
    } else {
      const blank = document.createElement('span');
      blank.className = 'block-cloze__print-blank';
      blank.textContent = segment.blank.answer;
      printSummary.append(blank);
    }
  }
  root.append(sentence, bank, controls, score, printSummary);
  paintBank();
  paintScore();
  return wrapBlock(root, block, mode);
}

function buildSelfCheckPrintSummary(
  block: Extract<Block, { block_type: 'self_check' }>
): HTMLElement {
  const printSummary = document.createElement('div');
  printSummary.className = 'block-self-check__print';
  printSummary.setAttribute('aria-hidden', 'true');
  const printPrompt = document.createElement('p');
  printPrompt.textContent = block.content.prompt;
  printSummary.append(printPrompt);
  if (block.content.mode === 'checklist') {
    const printList = document.createElement('ul');
    for (const item of block.content.items ?? []) {
      const entry = document.createElement('li');
      entry.textContent = item.label;
      printList.append(entry);
    }
    printSummary.append(printList);
  } else {
    const printAnswer = document.createElement('p');
    printAnswer.textContent = block.content.answer ?? '';
    printSummary.append(printAnswer);
  }
  return printSummary;
}

export function renderSelfCheckBlock(
  block: Extract<Block, { block_type: 'self_check' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = `block-self-check block-self-check--${block.content.mode}`;

  if (block.content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-self-check__title';
    title.textContent = block.content.title;
    root.append(title);
  }

  if (mode === 'teacher') {
    const prompt = document.createElement('p');
    prompt.className = 'block-self-check__prompt';
    prompt.textContent = block.content.prompt;
    root.append(prompt);
    if (block.content.mode === 'checklist') {
      const list = document.createElement('ul');
      list.className = 'block-self-check__preview-list';
      for (const item of block.content.items ?? []) {
        const li = document.createElement('li');
        li.textContent = item.label;
        list.append(li);
      }
      root.append(list);
    } else if (block.content.answer) {
      const hidden = document.createElement('p');
      hidden.className = 'block-self-check__answer-hidden';
      hidden.textContent = 'Answer hidden';
      root.append(hidden);
    }
    return wrapBlock(root, block, mode);
  }

  if (mode === 'print') {
    root.append(buildSelfCheckPrintSummary(block));
    return wrapBlock(root, block, mode);
  }

  const prompt = document.createElement('p');
  prompt.className = 'block-self-check__prompt';
  prompt.textContent = block.content.prompt;
  root.append(prompt);

  const key = storageKey('local', block.id);

  if (block.content.mode === 'checklist') {
    type ChecklistState = { checkedIds: string[] };
    const validIds = new Set((block.content.items ?? []).map((item) => item.id));
    const rawSaved = objectValue(loadActivityState<unknown>(key));
    const checkedIds =
      rawSaved &&
      Array.isArray(rawSaved.checkedIds) &&
      rawSaved.checkedIds.every((id): id is string => typeof id === 'string')
        ? rawSaved.checkedIds.filter((id) => validIds.has(id))
        : [];
    const checked = new Set(checkedIds);
    const list = document.createElement('div');
    list.className = 'block-self-check__checklist';
    for (const item of block.content.items ?? []) {
      const label = document.createElement('label');
      label.className = 'block-self-check__checklist-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'block-self-check__checkbox';
      checkbox.checked = checked.has(item.id);
      checkbox.addEventListener('click', () => {
        if (checkbox.checked) checked.add(item.id);
        else checked.delete(item.id);
        saveActivityState(key, { checkedIds: [...checked] } satisfies ChecklistState);
      });
      label.append(checkbox, document.createTextNode(item.label));
      list.append(label);
    }
    root.append(list, buildSelfCheckPrintSummary(block));
    return wrapBlock(root, block, mode);
  }

  type AnswerState = { revealed: boolean; rating?: number };
  const rawSaved = objectValue(loadActivityState<unknown>(key));
  let rating =
    typeof rawSaved?.rating === 'number' &&
    Number.isInteger(rawSaved.rating) &&
    rawSaved.rating >= 1 &&
    rawSaved.rating <= 5
      ? rawSaved.rating
      : undefined;
  let revealed =
    rawSaved?.revealed === true && (block.content.mode === 'reveal' || rating !== undefined);
  const answer = document.createElement('div');
  answer.className = 'block-self-check__answer';
  answer.textContent = block.content.answer ?? '';

  function paintAnswer(): void {
    answer.hidden = !revealed;
  }

  if (block.content.mode === 'reveal') {
    const toggle = activityButton(revealed ? 'Hide answer' : 'Show answer', 'block-self-check__btn');
    toggle.addEventListener('click', () => {
      revealed = !revealed;
      toggle.textContent = revealed ? 'Hide answer' : 'Show answer';
      paintAnswer();
      saveActivityState(key, { revealed } satisfies AnswerState);
    });
    root.append(toggle, answer);
  } else {
    const scale = document.createElement('div');
    scale.className = 'block-self-check__confidence';
    scale.setAttribute('aria-label', 'Confidence from 1 to 5');
    for (let value = 1; value <= 5; value += 1) {
      const button = activityButton(String(value), 'block-self-check__confidence-btn');
      button.dataset.rating = String(value);
      button.setAttribute('aria-pressed', rating === value ? 'true' : 'false');
      button.addEventListener('click', () => {
        rating = value;
        revealed = true;
        [...scale.children].forEach((child) =>
          child.setAttribute(
            'aria-pressed',
            (child as HTMLButtonElement).dataset.rating === String(value) ? 'true' : 'false'
          )
        );
        paintAnswer();
        saveActivityState(key, { rating, revealed } satisfies AnswerState);
      });
      scale.append(button);
    }
    root.append(scale, answer);
  }
  root.append(buildSelfCheckPrintSummary(block));
  paintAnswer();
  return wrapBlock(root, block, mode);
}

export function renderChartBlock(
  block: Extract<Block, { block_type: 'chart' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-chart';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-chart__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-chart__svg';
  wrap.innerHTML = buildChartSvg(block.content);
  root.append(wrap);

  const details = document.createElement('details');
  details.className = 'block-chart__data';
  const summary = document.createElement('summary');
  summary.textContent = 'Chart data';
  const table = document.createElement('table');
  table.className = 'block-chart__table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Series', 'X', 'Y']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  for (const row of buildChartTableRows(block.content)) {
    const tr = document.createElement('tr');
    for (const value of [row.series, row.x, row.y]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  details.append(summary, table);
  root.append(details);

  return wrapBlock(root, block, mode);
}

export function renderEquationBlock(
  block: Extract<Block, { block_type: 'equation' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-equation';

  const math = document.createElement('div');
  math.className = 'block-equation__math';
  const latex = block.content.latex ?? '';
  if (!latex.trim()) {
    math.textContent = '';
  } else {
    try {
      katex.render(latex, math, { throwOnError: false, displayMode: true });
    } catch {
      math.textContent = latex;
      math.classList.add('block-equation__math--error');
    }
  }
  root.append(math);

  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-equation__caption';
    cap.textContent = block.content.caption;
    root.append(cap);
  }

  return wrapBlock(root, block, mode);
}

export function renderDiagramBlock(
  block: Extract<Block, { block_type: 'diagram' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-diagram';

  if (block.content.source === 'image') {
    const url = block.content.image_url ?? '';
    if (isHttpUrl(url)) {
      const img = document.createElement('img');
      img.className = 'block-diagram__image';
      img.src = url;
      img.alt = block.content.image_alt ?? '';
      img.loading = 'lazy';
      root.append(img);
    } else {
      const unavailable = document.createElement('p');
      unavailable.className = 'block-diagram__unavailable';
      unavailable.textContent =
        mode === 'teacher'
          ? DIAGRAM_IMAGE_PUBLISH_URL_ISSUE
          : (block.content.image_alt ?? '').trim() || FAILURE.imageUnavailable;
      root.append(unavailable);
    }
  } else {
    const wrap = document.createElement('div');
    wrap.className = 'block-diagram__svg';
    wrap.innerHTML = sanitizeSvgMarkup(block.content.svg_markup ?? '');
    root.append(wrap);
  }

  if (block.content.caption?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-diagram__caption';
    cap.textContent = block.content.caption;
    root.append(cap);
  }

  return wrapBlock(root, block, mode);
}

export function renderMindMapBlock(
  block: Extract<Block, { block_type: 'mind_map' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-mind-map';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-mind-map__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-mind-map__canvas';
  mountGraphMaker(wrap, {
    mode: 'mindmap',
    content: block.content,
    readOnly: true
  });
  root.append(wrap);

  return wrapBlock(root, block, mode);
}

export function renderConceptMapBlock(
  block: Extract<Block, { block_type: 'concept_map' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('figure');
  root.className = 'block-concept-map';

  if (block.content.title?.trim()) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-concept-map__title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-concept-map__canvas';
  mountGraphMaker(wrap, {
    mode: 'conceptmap',
    content: block.content,
    readOnly: true
  });
  root.append(wrap);

  return wrapBlock(root, block, mode);
}

export function renderBlock(
  block: Block,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  try {
    switch (block.block_type) {
    case 'rich_text':
      return renderRichTextBlock(block, mode);
    case 'heading':
      return renderHeadingBlock(block, mode);
    case 'callout':
      return renderCalloutBlock(block, mode);
    case 'image':
      return renderImageBlock(block, mode);
    case 'gallery':
      return renderGalleryBlock(block, mode);
    case 'video':
      return renderVideoBlock(block, mode);
    case 'embed':
      return renderEmbedBlock(block, mode);
    case 'html':
      return renderHtmlBlock(block, mode);
    case 'html_app':
      return renderHtmlAppBlock(block, mode, ctx);
    case 'quote':
      return renderQuoteBlock(block, mode);
    case 'divider':
      return renderDividerBlock(block, mode);
    case 'definition':
      return renderDefinitionBlock(block, mode);
    case 'code':
      return renderCodeBlock(block, mode);
    case 'audio':
      return renderAudioBlock(block, mode);
    case 'attachment':
      return renderAttachmentBlock(block, mode);
    case 'accordion':
      return renderAccordionBlock(block, mode);
    case 'table':
      return renderTableBlock(block, mode);
    case 'question_set':
      return renderQuestionSetBlock(block, mode);
    case 'flashcards':
      return renderFlashcardsBlock(block, mode);
    case 'cloze':
      return renderClozeBlock(block, mode);
    case 'self_check':
      return renderSelfCheckBlock(block, mode);
    case 'timeline':
      return renderTimelineBlock(block, mode);
    case 'collection':
      return renderCollectionBlock(block, mode);
    case 'outcomes':
      return renderOutcomesBlock(block, mode, ctx);
    case 'spacer':
      return renderSpacerBlock(block, mode);
    case 'section':
      return renderSectionBlock(block, mode, ctx);
    case 'columns':
      return renderColumnsBlock(block, mode, ctx);
    case 'tabs':
      return renderTabsBlock(block, mode, ctx);
    case 'chart':
      return renderChartBlock(block, mode);
    case 'equation':
      return renderEquationBlock(block, mode);
    case 'diagram':
      return renderDiagramBlock(block, mode);
    case 'mind_map':
      return renderMindMapBlock(block, mode);
    case 'concept_map':
      return renderConceptMapBlock(block, mode);
    }
  } catch {
    const fallback = document.createElement('p');
    fallback.className = 'block-unavailable';
    fallback.textContent = FAILURE.unsupportedBlock;
    return wrapBlock(fallback, block, mode);
  }
}
