import { renderPeerFeedback } from '@/blocks/peer-feedback';
import { mountCulturalWarningTracks } from '@/blocks/cultural-warning-tracks';
import { renderClassroomToolsContent, renderCountdownContent, renderDividerContent } from '@/blocks/classroom-tools/render';
import { renderQuestionDrop } from '@/blocks/question-drop';
import { renderBrainstorm } from '@/blocks/brainstorm';
import { renderCurriculumLines } from '@/blocks/curriculum-lines';
import { renderQuizQuestion } from '@/blocks/quiz-question';
import { attachedSteppedLenses } from '@/blocks/lenses/registry';
import { renderAnchorBridge, renderHumanExperienceTable } from '@/blocks/formats/question-set-formats';
import { renderSteppedLenses } from '@/blocks/lenses/stepped-view';
import { canHaveDiscern } from '@/blocks/discern';
import { renderDiscern } from '@/blocks/discern-view';
import { renderDiscernConfirm } from '@/blocks/discern-confirm';
import { resolvedCalloutStyle, calloutIdentity, decorateCalloutReferences } from '@/blocks/callout-reference';
import { FAILURE } from '@/app/failure';
import katex from 'katex';
import { getApiBaseUrl } from '@/api/config';
import { buildChartSvg, buildChartTableRows } from '@/blocks/chart-svg';
import { renderGraphView } from '../../../../packages/graph-blocks';
import { mountHubWhiteboard } from '@/blocks/whiteboard-runtime';
import type { AnthologyData } from '@/blocks/anthology-collect';
import { buildAnthologyView } from '@/blocks/anthology-view';
import type { CollectionLink } from '@/blocks/collection-resolve';
import { buildHtmlAppSrcdoc } from '@/blocks/html-app-srcdoc';
import { buildAnnotationView } from '@/blocks/annotation-view';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { applyWordHelp, readWordHelp } from '@/blocks/word-help';
import { createStudentWordHelpBar } from '@/blocks/word-help-bar';
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { isHttpUrl } from '@/blocks/url-safety';
import { embedFrameSrc, embedUsesIframe } from '@/blocks/embed-url';
import { resolveVideoContent, videoEmbedSrc } from '@/blocks/video-url';
import {
  loadActivityState,
  parseClozeText,
  saveActivityState,
  shuffleArray,
  storageKey
} from '@/blocks/learning-activity';
import {
  createCardStackArticle,
  mountCardStackControls
} from '@/blocks/card-stack';
import { DIAGRAM_IMAGE_PUBLISH_URL_ISSUE, type Block, type EmbedProvider } from '@/schemas/block';
import { renderOutcomeList } from '@/outcomes/display';
import type { PublicOutcome } from '@/curriculum/outcome-catalog';
import { openHubMediaViewer } from '../../design-kit/js/hub-media-viewer.js';
import { createHubAudioPlayer } from '../../design-kit/js/hub-audio-player.js';
import { renderVoiceTask } from '@/blocks/voice-block';
import { mountHubImageAnnotator } from '../../design-kit/js/hub-image-annotate.js';
import { renderToolkitContent } from '@/toolkit/render';
import 'photoswipe/dist/photoswipe.css';
import type { NetworkLine } from '@/schemas/block';
import type { NetLesson } from '@/network/model';
// Last: the shared block anatomy roles win ties with block stylesheets above.
import '@/styles/block-anatomy.css';

export type RenderMode = 'teacher' | 'student' | 'print';
/** Lessons are in unit order and limited to what the viewer may see; `href` only on ones they may open. */
export type UnitNetworkContext = {
  lines: NetworkLine[];
  lessons: NetLesson[];
  bands?: ReadonlyMap<string, string>;
};

export type RenderContext = {
  lessonId?: string;
  attachedOutcomes?: PublicOutcome[];
  anthology?: AnthologyData;
  openNoteId?: string;
  /** Every block on the page, for blocks that read the whole lesson (Thinking reflection). */
  pageBlocks?: Block[];
  /** Lessons a unit plan block may link to, resolved for this viewer (Curriculum lines). */
  unitLessons?: Array<{ id: string; title: string; href: string }>;
  /** Curriculum network for a unit map: the subject's lines, the unit's lessons and their week bands. */
  network?: UnitNetworkContext;
  onMakeAnthologyCards?: (request: {
    items: AnthologyData['items'];
    view: 'text' | 'theme' | 'technique' | 'connections';
  }) => void;
};

const HEADING_TAG = {
  page: 'h1',
  section: 'h2',
  subsection: 'h3'
} as const;

/** Semantic callout styles mapped to design-token accent classes. */
export const CALLOUT_STYLE_CLASS = {
  cultural_warning: 'callout--cultural-warning',
  information: 'callout--wave',
  important: 'callout--high-sea',
  warning: 'callout--high-sea',
  extension: 'callout--sand',
  scaffold: 'callout--sand',
  example: 'callout--shore',
  remember: 'callout--shore',
  teacher: 'callout--teacher'
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
  if (provider === 'file') return externalId;
  return `https://vimeo.com/${encodeURIComponent(externalId)}`;
}

export function renderRichTextBlock(
  block: Extract<Block, { block_type: 'rich_text' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-rich-text block-body';
  body.innerHTML = sanitizeRichTextHtml(block.content.html);
  if (mode === 'print') return wrapBlock(body, block, mode);

  const preScanned = readWordHelp(block);
  if (preScanned.length) applyWordHelp(body, preScanned);
  const wrapper = wrapBlock(body, block, mode);
  if (mode === 'student' && ctx.lessonId && body.textContent?.trim()) {
    wrapper.append(
      createStudentWordHelpBar({ body, lessonId: ctx.lessonId, blockId: block.id, preScanned })
    );
  }
  return wrapper;
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
  const style = resolvedCalloutStyle(block.content) as keyof typeof CALLOUT_STYLE_CLASS;
  const styleClass = CALLOUT_STYLE_CLASS[style];
  callout.className = `callout ${styleClass}`;
  callout.setAttribute('role', 'note');
  const head = document.createElement('div');
  head.className = 'callout__head';
  head.append(calloutIdentity(style));
  callout.append(head);

  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'callout__title block-subtitle';
    title.textContent = block.content.title;
    callout.append(title);
  }

  const body = document.createElement('p');
  body.className = 'callout__body block-body';
  body.textContent = block.content.body;
  callout.append(body);
  if (style === 'cultural_warning') mountCulturalWarningTracks(callout, mode !== 'print');

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
      unavailable.className = 'block-image__unavailable block-empty';
      unavailable.textContent = block.content.alt_text.trim() || FAILURE.imageUnavailable;
      img.replaceWith(unavailable);
    });
    figure.append(img);
    const annotations = Array.isArray((block.content as { annotations?: unknown }).annotations)
      ? (block.content as { annotations?: unknown }).annotations
      : [];
    if (mode !== 'print' && (annotations?.length || mode === 'edit')) {
      img.addEventListener(
        'load',
        () => {
          void mountHubImageAnnotator(img, {
            annotations: annotations as never,
            readOnly: mode !== 'edit',
          });
        },
        { once: true }
      );
      if (img.complete) img.dispatchEvent(new Event('load'));
    }
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-image__unavailable block-empty';
    unavailable.textContent = block.content.alt_text.trim() || FAILURE.imageUnavailable;
    figure.append(unavailable);
  }
  if (block.content.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-image__caption block-secondary';
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

  const video = resolveVideoContent(block.content);

  if (mode === 'print') {
    const watchUrl = video ? videoWatchUrl(video.provider, video.external_id) : undefined;
    wrap.append(
      renderPrintFallback({
        label: 'Video',
        title: block.content.title,
        url: watchUrl
      })
    );
    if (block.content.caption) {
      const cap = document.createElement('p');
      cap.className = 'block-video__caption block-secondary';
      cap.textContent = block.content.caption;
      wrap.append(cap);
    }
    return wrapBlock(wrap, block, mode);
  }

  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'block-video__title block-subtitle';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  if (!video) {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-video__unavailable block-empty';
    unavailable.textContent = FAILURE.videoUnavailable;
    wrap.append(unavailable);
  } else if (video.provider === 'file') {
    const player = document.createElement('video');
    player.className = 'block-video__frame block-video__file';
    player.src = video.external_id;
    player.controls = true;
    player.preload = 'metadata';
    player.playsInline = true;
    player.setAttribute('aria-label', block.content.title || 'Video');
    wrap.append(player);
  } else {
    const iframe = document.createElement('iframe');
    iframe.className = 'block-video__frame';
    iframe.src = videoEmbedSrc(video.provider, video.external_id, video.start_seconds);
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
    cap.className = 'block-video__caption block-secondary';
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
    unavailable.className = 'block-embed__unavailable block-empty';
    unavailable.textContent = FAILURE.embedUnavailable;
    wrap.append(unavailable);
    return wrapBlock(wrap, block, mode);
  }

  const provider = block.content.provider ?? 'generic';
  // Uploaded PDFs use our file endpoint (which has no .pdf extension). Older
  // blocks saved them as generic embeds. Only this trusted media route may use
  // the native PDF viewer; external HTML embeds retain their sandbox.
  const sourceUrl = new URL(safeUrl);
  const apiOrigin = new URL(getApiBaseUrl() || location.origin, location.origin).origin;
  const uploadedPdf =
    (provider === 'pdf' || /\.pdf$/i.test(block.content.title?.trim() || '')) &&
    (sourceUrl.origin === apiOrigin || sourceUrl.origin === location.origin ||
      sourceUrl.origin === 'https://api.adam-russell.com') &&
    /^\/api\/media\/[^/]+\/file$/.test(sourceUrl.pathname);
  const frameSrc = uploadedPdf ? safeUrl : embedFrameSrc(block.content);

  if (embedUsesIframe(provider) && frameSrc) {
    const iframe = document.createElement('iframe');
    iframe.className = 'block-embed__frame';
    iframe.src = frameSrc;
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    // Sandboxed frames cannot instantiate the browser's native PDF viewer.
    if (!uploadedPdf) {
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    }
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
  quote.className = 'block-quote__text block-body';
  quote.textContent = block.content.quote;
  figure.append(quote);

  const attribution = block.content.attribution?.trim();
  const source = block.content.source?.trim();
  const reference = block.content.reference?.trim();
  if (attribution || source || reference) {
    const caption = document.createElement('figcaption');
    caption.className = 'block-quote__attribution block-secondary';
    const parts = [attribution, source, reference].filter(Boolean);
    caption.textContent = parts.join(' — ');
    figure.append(caption);
  }

  return wrapBlock(figure, block, mode);
}

export function renderDividerBlock(
  block: Extract<Block, { block_type: 'divider' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  return wrapBlock(renderDividerContent(block, mode, ctx), block, mode);
}

export function renderDefinitionBlock(
  block: Extract<Block, { block_type: 'definition' }>,
  mode: RenderMode
): HTMLElement {
  const dl = document.createElement('dl');
  dl.className = 'block-definition';

  const dt = document.createElement('dt');
  dt.className = 'block-definition__term block-subtitle';
  dt.textContent = block.content.term;

  const dd = document.createElement('dd');
  dd.className = 'block-definition__definition block-body';
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
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  if ((block.content.mode ?? 'listen') !== 'listen') {
    return wrapBlock(renderVoiceTask(block, mode, ctx), block, mode);
  }
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
    title.className = 'block-audio__title block-subtitle';
    title.textContent = block.content.title;
    wrap.append(title);
  }

  if (isHttpUrl(block.content.url)) {
    const host = document.createElement('div');
    host.className = 'block-audio__player';
    wrap.append(host);
    void createHubAudioPlayer(block.content.url.trim(), { className: 'block-audio__chrome' }).then(player => {
      if (player) host.replaceChildren(player);
    });
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'block-audio__unavailable block-empty';
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
    unavailable.className = 'block-attachment__unavailable block-empty';
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
    details.className = 'block-accordion__item block-disclosure';

    const summary = document.createElement('summary');
    summary.className = 'block-accordion__title block-disclosure__toggle block-disclosure__toggle--title block-subtitle';
    summary.textContent = item.title;

    const body = document.createElement('div');
    body.className = 'block-accordion__body block-disclosure__panel block-body';
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
  table.className = 'block-table block-body';

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
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  if (block.content.format === 'human_experience_table') return wrapBlock(renderHumanExperienceTable(block, mode, ctx), block, mode);
  if (block.content.format === 'anchor_bridge') return wrapBlock(renderAnchorBridge(block, mode, ctx), block, mode);
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
    li.dataset.questionId = question.id;

    const prompt = document.createElement('p');
    prompt.className = 'block-question-set__prompt block-body';
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
    } else if (question.kind === 'short_answer' && question.response_space !== 'none') {
      const label = document.createElement('p');
      label.className = 'block-question-set__answer-label block-eyebrow';
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
  title.className = 'block-section__title block-title';
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

const TIMELINE_ISO_DATE = /^\d{4}-\d{2}(-\d{2})?$/;
const TIMELINE_RANGE = /^(.+?)\s*(?:[-\u2013\u2014]|\bto\b)\s*(.+)$/i;

/** Split "9:23AM-9:40AM" or "1914 to 1918" into start/end; plain values stay whole. */
export function splitTimelineWhen(when: string): { start: string; end?: string } {
  const text = when.trim();
  if (!text || TIMELINE_ISO_DATE.test(text)) return { start: text };
  const match = TIMELINE_RANGE.exec(text);
  if (!match || !/\d/.test(match[1]) || !/\d/.test(match[2])) return { start: text };
  return { start: match[1].trim(), end: match[2].trim() };
}

export function renderTimelineBlock(
  block: Extract<Block, { block_type: 'timeline' }>,
  mode: RenderMode
): HTMLElement {
  const layout = block.content.layout ?? 'rail';
  const list = document.createElement('ol');
  list.className = `block-timeline block-timeline--${layout}`;
  if (layout === 'horizontal') {
    // The strip scrolls on its own; make it reachable by keyboard.
    list.tabIndex = 0;
    list.setAttribute('aria-label', 'Timeline, scrolls sideways');
  }

  block.content.events.forEach((event, index) => {
    const item = document.createElement('li');
    item.className = 'block-timeline__event';
    // Either side: each card spans two rows, offset by one, so neighbours overlap by half.
    if (layout === 'alternate') item.style.gridRow = `${index + 1} / span 2`;

    const when = document.createElement('p');
    when.className = 'block-timeline__when block-eyebrow';
    const { start, end } = splitTimelineWhen(event.when);
    if (end) {
      const startEl = document.createElement('span');
      startEl.className = 'block-timeline__start';
      startEl.textContent = start;
      const endEl = document.createElement('span');
      endEl.className = 'block-timeline__end';
      endEl.textContent = `\u2013 ${end}`;
      when.append(startEl, endEl);
    } else {
      when.textContent = event.when.trim();
      if (!when.textContent) when.classList.add('block-timeline__when--empty');
    }

    const node = document.createElement('span');
    node.className = 'block-timeline__node';
    node.setAttribute('aria-hidden', 'true');

    const card = document.createElement('div');
    card.className = 'block-timeline__card';

    const label = document.createElement('h3');
    label.className = 'block-timeline__label block-subtitle';
    label.textContent = event.label;
    card.append(label);

    if (event.description.trim()) {
      const description = document.createElement('p');
      description.className = 'block-timeline__description block-body';
      description.textContent = event.description;
      card.append(description);
    }

    if (event.image_url?.trim()) {
      const img = document.createElement('img');
      img.className = 'block-timeline__image';
      img.src = event.image_url.trim();
      img.alt = event.image_alt ?? '';
      img.loading = 'lazy';
      card.append(img);
    }

    if (event.link_url?.trim()) {
      const link = document.createElement('a');
      link.className = 'block-timeline__link';
      link.href = event.link_url.trim();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = event.link_label?.trim() || 'Open link';
      card.append(link);
    }

    item.append(when, node, card);
    list.append(item);
  });

  return wrapBlock(list, block, mode);
}

export function renderCardStackBlock(
  block: Extract<Block, { block_type: 'card_stack' }>,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = mode === 'print' ? 'block-card-stack block-card-stack--print' : 'block-card-stack';

  if (block.content.title?.trim()) {
    const heading = document.createElement('h2');
    heading.className = 'block-card-stack__heading block-title';
    heading.textContent = block.content.title.trim();
    root.append(heading);
  }

  if (mode === 'print') {
    const list = document.createElement('div');
    list.className = 'block-card-stack__print-list';
    block.content.cards.forEach((card, index) => {
      list.append(createCardStackArticle(card, index));
    });
    root.append(list);
    return wrapBlock(root, block, mode);
  }

  const stage = document.createElement('div');
  stage.className = 'block-card-stack__stage';
  const viewport = document.createElement('div');
  viewport.className = 'block-card-stack__viewport';
  viewport.setAttribute('aria-live', 'polite');

  const cardEls = block.content.cards.map((card, index) => createCardStackArticle(card, index));
  for (const card of [...cardEls].reverse()) {
    viewport.append(card);
  }
  stage.append(viewport);

  const controls = document.createElement('div');
  controls.className = 'block-card-stack__controls block-pager';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'btn btn--secondary block-card-stack__prev';
  prev.textContent = 'Previous';

  const status = document.createElement('p');
  status.className = 'block-card-stack__status block-pager__status';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn--secondary block-card-stack__next';
  next.textContent = 'Next';

  controls.append(prev, status, next);
  root.append(stage, controls);
  root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', block.content.title?.trim() || 'Card stack');
  mountCardStackControls(root, cardEls);
  return wrapBlock(root, block, mode);
}

export function renderOutcomesBlock(
  block: Extract<Block, { block_type: 'outcomes' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-outcomes';
  const heading = document.createElement('h2');
  heading.className = 'block-outcomes__title block-eyebrow';
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
    title.className = 'block-collection__title block-title';
    title.textContent = titleText;
    root.append(title);
  }

  if (resolved.links.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-collection__empty block-empty';
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
  tablist.className = 'hub-pills block-tabs__tablist';
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
    btn.className = 'hub-pills__btn block-tabs__tab';
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

let activeLightboxClose: (() => void) | null = null;

type GalleryEntry = { url: string; alt_text: string; caption?: string };

function galleryMediaItems(entries: GalleryEntry[]) {
  return entries
    .filter((entry) => isHttpUrl(entry.url))
    .map((entry) => ({
      src: entry.url,
      alt: entry.alt_text,
      caption: entry.caption
    }));
}

function openGalleryLightbox(entries: GalleryEntry[], index: number): void {
  activeLightboxClose?.();
  activeLightboxClose = null;

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const items = galleryMediaItems(entries);
  if (!items.length) return;

  const startIndex = Math.min(Math.max(index, 0), items.length - 1);
  void openHubMediaViewer(items, {
    index: startIndex,
    onClose: () => {
      activeLightboxClose = null;
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    }
  }).then((handle) => {
    activeLightboxClose = handle ? () => handle.close() : null;
  });
}

function galleryFigure(
  entry: GalleryEntry,
  interactive: boolean,
  entries: GalleryEntry[] = [entry],
  index = 0
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
      button.addEventListener('click', () => openGalleryLightbox(entries, index));
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
    unavailable.className = 'block-gallery__unavailable block-empty';
    unavailable.textContent = entry.alt_text.trim() || 'Image unavailable.';
    figure.append(unavailable);
  }

  if (entry.caption) {
    const cap = document.createElement('figcaption');
    cap.className = 'block-gallery__caption block-secondary';
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
      viewport.replaceChildren(galleryFigure(block.content.items[index]!, true, block.content.items, index));
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
    block.content.items.forEach((entry, index) => {
      list.append(galleryFigure(entry, true, block.content.items, index));
    });
    root.append(list);
  }

  return wrapBlock(root, block, mode);
}

function activityButton(label: string, className: string, variant: 'primary' | 'secondary' = 'secondary'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn--${variant} ${className}`;
  button.textContent = label;
  return button;
}

/** The shared show / hide toggle: kit chevron, left-aligned, above any actions. */
export function disclosureToggle(label: string, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `block-disclosure__toggle ${className}`.trim();
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
  copy.className = 'block-flashcards__copy block-subtitle';
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
  status.className = 'block-flashcards__status block-pager__status';
  status.setAttribute('aria-live', 'polite');
  const prev = activityButton('Prev', 'block-flashcards__btn');
  const flip = activityButton('Flip', 'block-flashcards__btn', 'primary');
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

  // Pager centred under the deck, then the deck's actions.
  const controls = document.createElement('div');
  controls.className = 'block-flashcards__controls block-pager';
  controls.append(prev, status, next);
  const actions = document.createElement('div');
  actions.className = 'block-flashcards__actions block-actions';
  actions.append(flip, reset);
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
  root.append(card, controls, actions, printSummary);
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
  sentence.className = 'block-cloze__sentence block-body';

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
  score.className = 'block-cloze__score block-secondary';
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
  const check = activityButton('Check', 'block-cloze__btn', 'primary');
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
  controls.className = 'block-cloze__controls block-actions';
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
  root.append(sentence, bank, score, controls, printSummary);
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
    title.className = 'block-self-check__title block-subtitle';
    title.textContent = block.content.title;
    root.append(title);
  }

  if (mode === 'teacher') {
    const prompt = document.createElement('p');
    prompt.className = 'block-self-check__prompt block-body';
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
  prompt.className = 'block-self-check__prompt block-body';
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
      label.className = 'block-self-check__checklist-item block-body';
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
  answer.className = 'block-self-check__answer block-disclosure__panel block-body';
  answer.textContent = block.content.answer ?? '';

  function paintAnswer(): void {
    answer.hidden = !revealed;
  }

  if (block.content.mode === 'reveal') {
    const toggle = disclosureToggle(revealed ? 'Hide answer' : 'Show answer', 'block-self-check__btn');
    toggle.setAttribute('aria-expanded', revealed ? 'true' : 'false');
    toggle.addEventListener('click', () => {
      revealed = !revealed;
      toggle.textContent = revealed ? 'Hide answer' : 'Show answer';
      toggle.setAttribute('aria-expanded', revealed ? 'true' : 'false');
      paintAnswer();
      saveActivityState(key, { revealed } satisfies AnswerState);
    });
    const disclosure = document.createElement('div');
    disclosure.className = 'block-self-check__disclosure block-disclosure';
    disclosure.append(toggle, answer);
    root.append(disclosure);
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
    cap.className = 'block-chart__title block-title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-chart__svg';
  wrap.innerHTML = buildChartSvg(block.content);
  root.append(wrap);

  const details = document.createElement('details');
  details.className = 'block-chart__data block-disclosure';
  const summary = document.createElement('summary');
  summary.className = 'block-disclosure__toggle';
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
      unavailable.className = 'block-diagram__unavailable block-empty';
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

export function renderWhiteboardBlock(
  block: Extract<Block, { block_type: 'whiteboard' }>,
  mode: RenderMode
): HTMLElement {
  if (mode === 'print') {
    return wrapBlock(
      renderPrintFallback({
        label: 'Interactive whiteboard',
        title: block.content.title
      }),
      block,
      mode
    );
  }

  const root = document.createElement('figure');
  root.className = 'block-whiteboard';

  if (block.content.title?.trim()) {
    const title = document.createElement('figcaption');
    title.className = 'block-whiteboard__title block-title';
    title.textContent = block.content.title;
    root.append(title);
  }

  const surface = document.createElement('div');
  surface.className = 'block-whiteboard__surface';
  root.append(surface);

  void mountHubWhiteboard(surface, block, {
    readOnly: true,
    published: mode === 'student'
  });

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
    cap.className = 'block-mind-map__title block-title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-mind-map__map';
  renderGraphView(wrap, 'mind', block.content);
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
    cap.className = 'block-concept-map__title block-title';
    cap.textContent = block.content.title;
    root.append(cap);
  }

  const wrap = document.createElement('div');
  wrap.className = 'block-concept-map__map';
  renderGraphView(wrap, 'concept', block.content);
  root.append(wrap);

  return wrapBlock(root, block, mode);
}


export function renderAnnotationBlock(
  block: Extract<Block, { block_type: 'annotation' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  // Defence in depth: student/print never draw teacher layers even if a leaky
  // snapshot somehow still contains them (strip happens at publish).
  const viewBlock =
    mode === 'teacher'
      ? block
      : {
          ...block,
          content: {
            ...block.content,
            layers: block.content.layers.filter((layer) => layer.kind !== 'teacher'),
            annotations: block.content.annotations.filter((ann) => {
              const layer = block.content.layers.find((row) => row.id === ann.layer_id);
              return layer?.kind !== 'teacher';
            })
          }
        };
  return wrapBlock(
    buildAnnotationView(viewBlock, mode, { openNoteId: ctx.openNoteId }),
    block,
    mode
  );
}

export function renderAnthologyBlock(
  block: Extract<Block, { block_type: 'anthology' }>,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  const data = ctx.anthology ?? { items: [], texts: [] };
  return wrapBlock(
    buildAnthologyView(block, {
      data,
      mode,
      defaultView: block.content.default_view,
      title: block.content.title,
      onMakeCards: mode === 'teacher' ? ctx.onMakeAnthologyCards : undefined
    }),
    block,
    mode
  );
}

function renderBlockContent(
  block: Block,
  mode: RenderMode,
  ctx: RenderContext = {}
): HTMLElement {
  try {
    switch (block.block_type) {
    case 'rich_text':
      return renderRichTextBlock(block, mode, ctx);
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
      return renderDividerBlock(block, mode, ctx);
    case 'classroom_tools':
      return wrapBlock(renderClassroomToolsContent(block, mode, ctx), block, mode);
    case 'countdown':
      return wrapBlock(renderCountdownContent(block, mode), block, mode);
    case 'definition':
      return renderDefinitionBlock(block, mode);
    case 'code':
      return renderCodeBlock(block, mode);
    case 'audio':
      return renderAudioBlock(block, mode, ctx);
    case 'attachment':
      return renderAttachmentBlock(block, mode);
    case 'accordion':
      return renderAccordionBlock(block, mode);
    case 'table':
      return renderTableBlock(block, mode);
    case 'peer_feedback':
      return wrapBlock(renderPeerFeedback(block, mode, ctx), block, mode);
    case 'question_drop':
      return wrapBlock(renderQuestionDrop(block, mode, ctx), block, mode);
    case 'brainstorm':
      return wrapBlock(renderBrainstorm(block, mode, ctx), block, mode);
    case 'curriculum_lines':
      return wrapBlock(renderCurriculumLines(block, mode, ctx), block, mode);
    case 'discern_confirm':
      return wrapBlock(renderDiscernConfirm(block, mode, ctx), block, mode);
    case 'quiz_question':
      return wrapBlock(renderQuizQuestion(block, mode, ctx), block, mode);
    case 'question_set':
      return renderQuestionSetBlock(block, mode, ctx);
    case 'flashcards':
      return renderFlashcardsBlock(block, mode);
    case 'cloze':
      return renderClozeBlock(block, mode);
    case 'self_check':
      return renderSelfCheckBlock(block, mode);
    case 'timeline':
      return renderTimelineBlock(block, mode);
    case 'card_stack':
      return renderCardStackBlock(block, mode);
    case 'collection':
      return renderCollectionBlock(block, mode);
    case 'anthology':
      return renderAnthologyBlock(block, mode, ctx);
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
    case 'whiteboard':
      return renderWhiteboardBlock(block, mode);
    case 'annotation':
      return renderAnnotationBlock(block, mode, ctx);
    case 'toolkit_skill':
    case 'toolkit_tool':
    case 'toolkit_value':
    case 'thinking_move':
    case 'question_quadrant':
    case 'concept_features':
    case 'thinking_intentions':
    case 'thinking_reflection':
    case 'fluid_analogy':
    case 'analogy_types':
    case 'analogy_close_reading':
    case 'analogy_pattern':
    case 'analogy_reverse':
    case 'analogy_problem':
    case 'analogy_metaphor':
    case 'analogy_transfer':
    case 'analogy_chains':
    case 'teacher_note':
      return wrapBlock(renderToolkitContent(block, mode, ctx)!, block, mode);
    }
  } catch {
    const fallback = document.createElement('p');
    fallback.className = 'block-unavailable block-empty';
    fallback.textContent = FAILURE.unsupportedBlock;
    return wrapBlock(fallback, block, mode);
  }
}

export function renderBlock(block: Block, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const wrapper = renderBlockContent(block, mode, ctx);
  decorateCalloutReferences(wrapper, block, mode, ctx.pageBlocks ?? []);
  const attachments: HTMLElement[] = [];
  const lenses = attachedSteppedLenses(block);
  if (lenses.length) {
    attachments.push(renderSteppedLenses(lenses, block, { mode, blockId: block.id, lessonId: ctx.lessonId }));
  }
  if (block.discern && canHaveDiscern(block)) {
    attachments.push(renderDiscern(block.discern, { mode, blockId: block.id, lessonId: ctx.lessonId }));
  }
  if (attachments.length) {
    // A question keeps its process next to its prompt, before the response space.
    // Other blocks carry the same optional attachment beneath their content.
    const question = block.block_type === 'question_set' && block.content.questions.length === 1
      ? wrapper.querySelector('.block-question-set__question') : null;
    const response = question?.querySelector('.block-question-set__answer-label, .block-question-set__response-lines');
    for (const attachment of attachments) {
      if (response) question!.insertBefore(attachment, response);
      else if (question) question.append(attachment);
      else wrapper.append(attachment);
    }
  }
  return wrapper;
}
