import {
  resolveAnnotation,
  type AnnotationLineModel,
  type ResolvedAnchor
} from '@/blocks/annotation-anchor';
import {
  drawAnnotationInk,
  MARGIN_LABEL_MIN_WIDTH,
  type InkMark
} from '@/blocks/annotation-ink';
import {
  applyLineLayout,
  renderFormattedLine
} from '@/blocks/annotation-line-format';
import { htmlToPlainText } from '@/blocks/search-text';
import {
  activeLayerIds,
  createLayerState,
  isAnnotationActive,
  markersFor,
  stopsForMode,
  toggleSuppressed,
  type AnnotationLayerState,
  type AnnotationMarker
} from '@/blocks/annotation-layers';
import {
  resolveAnnotationKey,
  stepThreadIndex
} from '@/blocks/annotation-thread-keys';
import {
  buildArcSvg,
  buildFoldButton,
  buildStopPip,
  buildThreadChip,
  fillStepCaption,
  foldRowsForThread,
  isNarrowAnnotationViewport,
  printThreadFootnoteLabel,
  resolvedThreadStops,
  visibleThreads
} from '@/blocks/annotation-thread-view';
import { threadsOf } from '@/blocks/annotation-thread';
import {
  familyOfTechnique,
  loadLiteraryElements,
  lookupTechnique,
  type LiteraryElementsTable,
  type LiteraryTechnique
} from '@/blocks/literary-elements';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { isHttpUrl } from '@/blocks/url-safety';
import { parseVideoInput, parseStartTime, videoEmbedSrc } from '@/blocks/video-url';
import { activeClipAt } from '@/blocks/voice-playback';
import type {
  AnnotationAttachment,
  AnnotationBlock,
  AnnotationItem,
  AnnotationLayer,
  AnnotationVoiceTrack
} from '@/schemas/block';

type RenderMode = 'teacher' | 'student' | 'print';
type AnnotationContent = AnnotationBlock['content'];

type PlacedAnnotation = {
  annotation: AnnotationItem;
  resolved: ResolvedAnchor;
  layer?: AnnotationLayer;
};

type PublishedVoiceClip = AnnotationVoiceTrack['clips'][number] & {
  track: AnnotationVoiceTrack;
};

function publishedVoiceTracks(content: AnnotationContent): AnnotationVoiceTrack[] {
  return (content.voice_tracks ?? []).filter((track) => track.status === 'published');
}

function approvedClips(track: AnnotationVoiceTrack): PublishedVoiceClip[] {
  return track.clips
    .filter((clip) => clip.approved)
    .map((clip) => ({ ...clip, track }));
}

function layerById(layers: AnnotationLayer[], id: string): AnnotationLayer | undefined {
  return layers.find((layer) => layer.id === id);
}

/** Handwritten margin copy: the whole note, not a clipped preview of it. */
export function marginNoteText(html: string, techniqueName?: string): string | undefined {
  const name = techniqueName?.trim();
  if (name) return name;
  const text = htmlToPlainText(html).trim();
  return text || undefined;
}

function placedFor(
  content: AnnotationContent,
  mode: RenderMode,
  state?: AnnotationLayerState
): PlacedAnnotation[] {
  const stops = stopsForMode(content.layers, mode);
  const stopIds = new Set(stops.map((layer) => layer.id));
  const active = state
    ? activeLayerIds(stops, state)
    : new Set(stops.map((layer) => layer.id));
  const suppressed = state?.suppressed ?? new Set<string>();
  const placed: PlacedAnnotation[] = [];
  for (const annotation of content.annotations) {
    if (!stopIds.has(annotation.layer_id)) continue;
    if (!isAnnotationActive(annotation, active, suppressed)) continue;
    const resolved = resolveAnnotation(content.text, annotation);
    if (resolved.status !== 'ok') continue;
    placed.push({
      annotation,
      resolved,
      layer: layerById(content.layers, annotation.layer_id)
    });
  }
  return placed;
}

function attachmentsForPrint(attachments: AnnotationAttachment[]): HTMLElement | null {
  const usable = attachments.filter((att) => {
    if (att.kind === 'block') return true;
    return isHttpUrl(att.url);
  });
  if (usable.length === 0) return null;
  const list = document.createElement('ul');
  list.className = 'block-annotation__print-attachments';
  for (const att of usable) {
    const li = document.createElement('li');
    if (att.kind === 'block') {
      li.textContent = `Block link: ${att.block_id}`;
    } else if (att.kind === 'link') {
      li.textContent = att.label?.trim() || att.url;
    } else if (att.kind === 'video') {
      const start = att.start_seconds != null ? ` (from ${att.start_seconds}s)` : '';
      li.textContent = `Video: ${att.url}${start}`;
    } else if (att.kind === 'audio') {
      li.textContent = att.title?.trim() ? `Audio: ${att.title} — ${att.url}` : `Audio: ${att.url}`;
    } else {
      li.textContent = `Image: ${att.alt_text} — ${att.url}`;
    }
    list.append(li);
  }
  return list;
}

function renderAttachmentList(attachments: AnnotationAttachment[]): HTMLElement | null {
  const host = document.createElement('div');
  host.className = 'block-annotation__attachments';
  let any = false;
  for (const att of attachments) {
    if (att.kind === 'block') {
      const p = document.createElement('p');
      p.className = 'block-annotation__attachment-block';
      p.textContent = `Linked block ${att.block_id}`;
      host.append(p);
      any = true;
      continue;
    }
    if (!isHttpUrl(att.url)) continue;
    if (att.kind === 'link') {
      const a = document.createElement('a');
      a.className = 'block-annotation__attachment-link';
      a.href = att.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = att.label?.trim() || att.url;
      host.append(a);
      any = true;
    } else if (att.kind === 'video') {
      const parsed = parseVideoInput(att.url);
      const start = att.start_seconds ?? parsed?.start_seconds ?? parseStartTime(
        (() => {
          try {
            return new URL(att.url).searchParams.get('t');
          } catch {
            return null;
          }
        })()
      );
      if (parsed && parsed.provider !== 'file') {
        const iframe = document.createElement('iframe');
        iframe.className = 'block-annotation__attachment-video';
        iframe.src = videoEmbedSrc(parsed.provider, parsed.external_id, start);
        iframe.title = 'Annotation video';
        iframe.allow =
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        host.append(iframe);
        any = true;
      } else {
        const a = document.createElement('a');
        a.href = att.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Watch video';
        host.append(a);
        any = true;
      }
    } else if (att.kind === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = att.url;
      if (att.title) audio.title = att.title;
      host.append(audio);
      any = true;
    } else if (att.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'block-annotation__attachment-image';
      img.src = att.url;
      img.alt = att.alt_text;
      host.append(img);
      any = true;
    }
  }
  return any ? host : null;
}

function closeAnnotationPanel(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>('.block-annotation__panel');
  if (panel) {
    panel.hidden = true;
    panel.replaceChildren();
  }
  const sheet = root.querySelector<HTMLElement>('.block-annotation__sheet');
  if (sheet) {
    sheet.hidden = true;
    sheet.replaceChildren();
    sheet.classList.remove('is-open');
  }
  root.querySelectorAll<HTMLElement>('.block-annotation__anchor.is-open').forEach((el) => {
    el.classList.remove('is-open');
    el.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Technique card styled after the Periodic Table of Literary Elements detail
 * pane: element badge, name, family + subgroup chips, then Definition /
 * Effect / Example sections in the family colour.
 */
export function renderElementCard(
  technique: LiteraryTechnique,
  table: LiteraryElementsTable
): HTMLElement {
  const family = familyOfTechnique(table, technique);
  const subgroup = table.subgroups.find((row) => row.id === technique.subgroup);
  const card = document.createElement('section');
  card.className = 'block-annotation__element';
  card.dataset.techniqueId = technique.id;
  if (family) {
    card.dataset.family = family.key;
    card.style.setProperty('--c', family.colour);
  }
  card.setAttribute('aria-label', `Technique: ${technique.name}`);

  const head = document.createElement('div');
  head.className = 'block-annotation__element-head';
  const badge = document.createElement('span');
  badge.className = 'block-annotation__element-badge';
  badge.setAttribute('aria-hidden', 'true');
  const sym = document.createElement('span');
  sym.className = 'block-annotation__element-symbol';
  sym.textContent = technique.symbol;
  badge.append(sym);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'block-annotation__element-titles';
  const name = document.createElement('p');
  name.className = 'block-annotation__element-name';
  name.textContent = technique.name;
  const crumbs = document.createElement('div');
  crumbs.className = 'block-annotation__element-crumbs';
  if (family) {
    const fam = document.createElement('span');
    fam.className = 'block-annotation__element-chip block-annotation__element-chip--family';
    fam.textContent = family.name;
    crumbs.append(fam);
  }
  if (subgroup) {
    const sub = document.createElement('span');
    sub.className = 'block-annotation__element-chip';
    sub.textContent = subgroup.name;
    crumbs.append(sub);
  }
  titleWrap.append(name, crumbs);
  head.append(badge, titleWrap);
  card.append(head);

  const sections: Array<[string, string, boolean]> = [
    ['Definition', technique.definition, false],
    ['Effect', technique.effect, false],
    ['Example', technique.example, true]
  ];
  for (const [label, value, isExample] of sections) {
    if (!value?.trim()) continue;
    const sec = document.createElement('div');
    sec.className = 'block-annotation__element-sec';
    const h = document.createElement('h4');
    h.textContent = label;
    const p = document.createElement('p');
    if (isExample) p.className = 'block-annotation__element-example';
    p.textContent = value;
    sec.append(h, p);
    card.append(sec);
  }
  return card;
}

function fillBody(
  host: HTMLElement,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  table: LiteraryElementsTable | null,
  showLayer: boolean
): void {
  host.replaceChildren();
  if (layer && showLayer) {
    const chip = document.createElement('p');
    chip.className = `block-annotation__layer-chip block-annotation__layer-chip--${layer.colour}`;
    chip.textContent = layer.name;
    host.append(chip);
  }
  // The teacher's own words first, then the Periodic Table card.
  const body = document.createElement('div');
  body.className = 'block-annotation__body';
  body.innerHTML = sanitizeRichTextHtml(annotation.body.html);
  host.append(body);
  if (annotation.technique?.id && table) {
    const technique = lookupTechnique(table, annotation.technique.id);
    if (technique) host.append(renderElementCard(technique, table));
  }
  const attachments = renderAttachmentList(annotation.body.attachments);
  if (attachments) host.append(attachments);
}

function openAnnotation(
  root: HTMLElement,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  anchorEl: HTMLElement,
  table: LiteraryElementsTable | null
): void {
  closeAnnotationPanel(root);
  const showLayer = root.dataset.layerCount !== '1';
  anchorEl.classList.add('is-open');
  anchorEl.setAttribute('aria-expanded', 'true');

  if (isNarrowAnnotationViewport()) {
    const sheet = root.querySelector<HTMLElement>('.block-annotation__sheet');
    if (!sheet) return;
    sheet.hidden = false;
    sheet.classList.add('is-open');
    const dialog = document.createElement('div');
    dialog.className = 'block-annotation__sheet-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Note');
    const header = document.createElement('div');
    header.className = 'block-annotation__sheet-header';
    const title = document.createElement('h3');
    title.className = 'block-annotation__sheet-title';
    title.textContent = 'Note';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-annotation__close';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      closeAnnotationPanel(root);
      anchorEl.focus();
    });
    header.append(title, close);
    const body = document.createElement('div');
    body.className = 'block-annotation__sheet-body';
    fillBody(body, annotation, layer, table, showLayer);
    dialog.append(header, body);
    sheet.append(dialog);
    close.focus();
    return;
  }

  const panel = root.querySelector<HTMLElement>('.block-annotation__panel');
  if (!panel) return;
  panel.hidden = false;
  const header = document.createElement('div');
  header.className = 'block-annotation__panel-header';
  const title = document.createElement('h3');
  title.className = 'block-annotation__panel-title';
  title.textContent = 'Note';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'block-annotation__close';
  close.textContent = 'Close';
  close.addEventListener('click', () => {
    closeAnnotationPanel(root);
    anchorEl.focus();
  });
  header.append(title, close);
  const body = document.createElement('div');
  body.className = 'block-annotation__panel-body';
  fillBody(body, annotation, layer, table, showLayer);
  panel.append(header, body);
  close.focus();
}

function wrapAnchor(
  className: string,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  onOpen: ((btn: HTMLButtonElement) => void) | null
): HTMLElement {
  if (!onOpen) {
    const span = document.createElement('span');
    span.className = className;
    span.dataset.annotationId = annotation.id;
    return span;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.dataset.annotationId = annotation.id;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute(
    'aria-label',
    layer ? `Annotation: ${layer.name}` : 'Annotation'
  );
  btn.addEventListener('click', () => onOpen(btn));
  return btn;
}

type LineMark = {
  start: number;
  end: number;
  placed: PlacedAnnotation;
};

function renderLineText(
  line: AnnotationLineModel,
  marks: LineMark[],
  opens: (item: PlacedAnnotation) => boolean,
  onOpen: (item: PlacedAnnotation, btn: HTMLButtonElement) => void
): DocumentFragment {
  return renderFormattedLine(
    line,
    marks.map((mark) => {
      const grainClass = mark.placed.resolved.granularity === 'word' ? 'word' : 'phrase';
      const colour = mark.placed.layer?.colour ?? 'wave';
      return {
        start: mark.start,
        end: mark.end,
        wrap: () =>
          wrapAnchor(
            `block-annotation__anchor block-annotation__anchor--${grainClass} block-annotation__anchor--${colour}`,
            mark.placed.annotation,
            mark.placed.layer,
            opens(mark.placed) ? (btn) => onOpen(mark.placed, btn) : null
          )
      };
    })
  );
}

function isTextControl(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function pushGrouped<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key) ?? [];
  list.push(item);
  map.set(key, list);
}

function barAnchorLabel(kind: 'line' | 'stanza', layer?: AnnotationLayer): string {
  const prefix = kind === 'stanza' ? 'Stanza annotation' : 'Line annotation';
  return layer ? `${prefix}: ${layer.name}` : prefix;
}

function makeBarAnchor(
  item: PlacedAnnotation,
  kind: 'line' | 'stanza',
  onOpen: ((btn: HTMLButtonElement) => void) | null
): HTMLElement {
  const className = `block-annotation__anchor block-annotation__anchor--${kind}`;
  if (!onOpen) {
    const span = document.createElement('span');
    span.className = className;
    span.dataset.annotationId = item.annotation.id;
    return span;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.dataset.annotationId = item.annotation.id;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', barAnchorLabel(kind, item.layer));
  btn.addEventListener('click', () => onOpen(btn));
  return btn;
}

function buildInteractiveView(
  content: AnnotationContent,
  mode: RenderMode,
  openNoteId?: string
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-annotation';
  root.dataset.mode = mode;
  root.tabIndex = 0;

  const stops = stopsForMode(content.layers, mode);
  root.dataset.layerCount = String(stops.length);
  let state = createLayerState(content.layers, content.settings, mode);
  if (openNoteId) {
    const target = content.annotations.find((ann) => ann.id === openNoteId);
    if (target) {
      const suppressed = new Set(state.suppressed);
      suppressed.delete(target.layer_id);
      state = { ...state, openAnnotationId: openNoteId, suppressed };
    }
  }
  let table: LiteraryElementsTable | null = null;
  const needsTable = content.annotations.some((ann) => ann.technique?.id);

  if (content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-annotation__title';
    title.textContent = content.title.trim();
    root.append(title);
  }
  if (content.attribution?.trim()) {
    const attr = document.createElement('p');
    attr.className = 'block-annotation__attribution';
    attr.textContent = content.attribution.trim();
    root.append(attr);
  }

  const layout = document.createElement('div');
  layout.className = 'block-annotation__layout';

  const textCol = document.createElement('div');
  textCol.className = 'block-annotation__text';

  const panel = document.createElement('aside');
  panel.className = 'block-annotation__panel';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');

  const controls = document.createElement('div');
  controls.className = 'block-annotation__controls';

  const chips = document.createElement('div');
  chips.className = 'block-annotation__chips';
  chips.setAttribute('role', 'toolbar');
  chips.setAttribute('aria-label', 'Annotation layers');

  const threadStrip = document.createElement('div');
  threadStrip.className = 'block-annotation__threads';
  threadStrip.setAttribute('role', 'toolbar');
  threadStrip.setAttribute('aria-label', 'Annotation threads');

  const focusBar = document.createElement('div');
  focusBar.className = 'block-annotation__focus-bar';
  focusBar.hidden = true;

  const stepBar = document.createElement('div');
  stepBar.className = 'block-annotation__step-bar';
  stepBar.hidden = true;

  controls.append(chips, threadStrip, focusBar, stepBar);

  layout.append(textCol, panel);
  // Reveal controls sit above the text so a long poem never hides them.
  root.append(controls, layout);

  const sheet = document.createElement('div');
  sheet.className = 'block-annotation__sheet';
  sheet.hidden = true;
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) {
      const open = root.querySelector<HTMLElement>('.block-annotation__anchor.is-open');
      closeAnnotationPanel(root);
      state = { ...state, openAnnotationId: null };
      open?.focus();
    }
  });
  root.append(sheet);

  const voiceAudio = document.createElement('audio');
  voiceAudio.preload = 'metadata';
  voiceAudio.hidden = true;
  root.append(voiceAudio);

  let voiceRaf = 0;
  let voiceHighlightId: string | null = null;
  let voicePlayAll = false;
  let voicePlayAllClips: Array<{ id: string; start_s: number; end_s: number }> = [];

  function stopVoiceRaf(): void {
    if (voiceRaf) {
      cancelAnimationFrame(voiceRaf);
      voiceRaf = 0;
    }
  }

  function clearVoiceHighlight(): void {
    root.querySelectorAll('.block-annotation__line.is-voice-active').forEach((node) => {
      node.classList.remove('is-voice-active');
    });
    voiceHighlightId = null;
  }

  function highlightVoiceClip(clipId: string | null): void {
    if (clipId === voiceHighlightId) return;
    clearVoiceHighlight();
    voiceHighlightId = clipId;
    if (!clipId) return;
    root
      .querySelectorAll(`[data-voice-clip-id="${clipId}"]`)
      .forEach((node) => node.closest('.block-annotation__line')?.classList.add('is-voice-active'));
  }

  function tickVoicePlayback(): void {
    if (voiceAudio.paused || voiceAudio.ended) {
      stopVoiceRaf();
      if (voiceAudio.ended) {
        voicePlayAll = false;
        clearVoiceHighlight();
      }
      return;
    }
    if (voicePlayAll && voicePlayAllClips.length > 0) {
      const active = activeClipAt(voicePlayAllClips, voiceAudio.currentTime);
      highlightVoiceClip(active?.id ?? null);
    }
    voiceRaf = requestAnimationFrame(tickVoicePlayback);
  }

  function startVoiceRaf(): void {
    stopVoiceRaf();
    voiceRaf = requestAnimationFrame(tickVoicePlayback);
  }

  function playVoiceClip(clip: PublishedVoiceClip): void {
    voicePlayAll = false;
    voicePlayAllClips = [];
    if (voiceAudio.src !== clip.track.audio.url) {
      voiceAudio.src = clip.track.audio.url;
    }
    const onMeta = () => {
      voiceAudio.currentTime = Math.max(0, clip.start_s);
      void voiceAudio.play().then(() => startVoiceRaf()).catch(() => stopVoiceRaf());
      highlightVoiceClip(clip.id);
      const endAt = clip.end_s;
      const onTime = () => {
        if (voiceAudio.currentTime >= endAt - 0.02) {
          voiceAudio.pause();
          voiceAudio.removeEventListener('timeupdate', onTime);
          stopVoiceRaf();
          clearVoiceHighlight();
        }
      };
      voiceAudio.addEventListener('timeupdate', onTime);
    };
    if (voiceAudio.readyState >= 1) onMeta();
    else voiceAudio.addEventListener('loadedmetadata', onMeta, { once: true });
  }

  function playAllVoice(track: AnnotationVoiceTrack): void {
    const clips = approvedClips(track);
    if (clips.length === 0) return;
    voicePlayAll = true;
    voicePlayAllClips = clips.map((clip) => ({
      id: clip.id,
      start_s: clip.start_s,
      end_s: clip.end_s
    }));
    if (voiceAudio.src !== track.audio.url) voiceAudio.src = track.audio.url;
    const start = () => {
      voiceAudio.currentTime = 0;
      void voiceAudio.play().then(() => startVoiceRaf()).catch(() => stopVoiceRaf());
    };
    if (voiceAudio.readyState >= 1) start();
    else voiceAudio.addEventListener('loadedmetadata', start, { once: true });
  }

  function exitFocus(): void {
    state = {
      ...state,
      focusThreadId: null,
      expandedFolds: new Set(),
      stepIndex: null
    };
  }

  function enterFocus(threadId: string, stepIndex: number | null = null): void {
    state = {
      ...state,
      focusThreadId: threadId,
      expandedFolds: new Set(),
      stepIndex,
      openAnnotationId: null
    };
    closeAnnotationPanel(root);
  }

  function closeThreadSheet(sheetEl: HTMLElement): void {
    sheetEl.hidden = true;
    sheetEl.replaceChildren();
    sheetEl.classList.remove('is-open');
  }

  function openThreadPicker(threads: AnnotationItem[]): void {
    const sheetEl = root.querySelector<HTMLElement>('.block-annotation__sheet');
    if (!sheetEl) return;
    sheetEl.hidden = false;
    sheetEl.classList.add('is-open');
    sheetEl.replaceChildren();
    const dialog = document.createElement('div');
    dialog.className = 'block-annotation__sheet-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Threads');
    const header = document.createElement('div');
    header.className = 'block-annotation__sheet-header';
    const title = document.createElement('h3');
    title.className = 'block-annotation__sheet-title';
    title.textContent = 'Threads';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-annotation__close';
    close.textContent = 'Close';
    close.addEventListener('click', () => closeThreadSheet(sheetEl));
    header.append(title, close);
    const body = document.createElement('div');
    body.className = 'block-annotation__sheet-body';
    for (const ann of threads) {
      body.append(
        buildThreadChip(
          ann,
          layerById(content.layers, ann.layer_id),
          resolvedThreadStops(content, ann).length,
          state.focusThreadId === ann.id,
          () => {
            enterFocus(ann.id);
            closeThreadSheet(sheetEl);
            paint();
          }
        )
      );
    }
    dialog.append(header, body);
    sheetEl.append(dialog);
    close.focus();
  }

  function makeMenuItem(
    label: string,
    pressed: boolean,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'block-annotation__thread-menu-item';
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function makeStepBtn(
    label: string,
    disabled: boolean,
    delta: -1 | 1,
    stopCount: number
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'block-annotation__step-btn';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener('click', () => {
      state = {
        ...state,
        stepIndex: stepThreadIndex(state.stepIndex, stopCount, delta)
      };
      paint();
    });
    return btn;
  }

  const inkStyle = content.settings.ink_style ?? 'fineliner';
  root.classList.add('block-annotation--ink', `block-annotation--ink-${inkStyle}`);
  let inkedIds = new Set<string>();
  let inkFrame = 0;
  let inkHost: HTMLElement | null = null;
  let inkMarks: InkMark[] = [];
  /** The margin note the reader picked: shown in full, its ink in front. */
  let activeNoteId: string | null = null;
  const inkResize =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => scheduleInk(false))
      : null;

  function scheduleInk(animate: boolean): void {
    if (inkFrame) cancelAnimationFrame(inkFrame);
    inkFrame = requestAnimationFrame(() => {
      inkFrame = 0;
      if (!inkHost || !inkHost.isConnected) return;
      const wantsMargin =
        inkStyle === 'fineliner' &&
        inkMarks.some((mark) => mark.label) &&
        inkHost.getBoundingClientRect().width >= MARGIN_LABEL_MIN_WIDTH;
      inkHost.classList.toggle('block-annotation__poem--margin', wantsMargin);
      const fresh = new Set(
        inkMarks.map((mark) => mark.annotationId).filter((id) => animate && !inkedIds.has(id))
      );
      inkedIds = drawAnnotationInk(inkHost, inkMarks, {
        style: inkStyle,
        animateIds: fresh,
        activeId: activeNoteId
      });
      syncActiveAnchors();
    });
  }

  function syncActiveAnchors(): void {
    root
      .querySelectorAll<HTMLElement>('.block-annotation__anchor[data-annotation-id]')
      .forEach((el) => {
        const on = el.dataset.annotationId === activeNoteId;
        el.classList.toggle('is-active', on);
        if (el.tagName === 'BUTTON' && !el.classList.contains('is-open')) {
          el.setAttribute('aria-expanded', on ? 'true' : 'false');
        }
      });
  }

  function selectNote(id: string | null): void {
    activeNoteId = id;
    scheduleInk(false);
  }

  function marginLabel(ann: AnnotationItem): string | undefined {
    if (ann.technique?.id && table) {
      const technique = lookupTechnique(table, ann.technique.id);
      if (technique) return marginNoteText(ann.body.html, technique.name);
    }
    return marginNoteText(ann.body.html);
  }

  /** The side window only earns its place when the handwriting cannot carry the note. */
  function readerNeeded(ann: AnnotationItem): boolean {
    if ((ann.also_anchors?.length ?? 0) > 0) return false;
    if (ann.technique?.id) return true;
    if ((ann.body.attachments?.length ?? 0) > 0) return true;
    if (inkStyle !== 'fineliner') return true;
    if (isNarrowAnnotationViewport()) return true;
    const width = inkHost?.getBoundingClientRect().width ?? 0;
    if (width > 0 && width < MARGIN_LABEL_MIN_WIDTH) return true;
    const resolved = resolveAnnotation(content.text, ann);
    if (resolved.status !== 'ok' || resolved.granularity === 'stanza') return true;
    return !marginNoteText(ann.body.html);
  }

  function paint(): void {
    const scrollTop = textCol.scrollTop;
    textCol.replaceChildren();
    chips.replaceChildren();
    threadStrip.replaceChildren();
    focusBar.replaceChildren();
    stepBar.replaceChildren();

    chips.hidden = stops.length === 0;

    for (const layer of stops) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `block-annotation__chip block-annotation__chip--${layer.colour}`;
      if (layer.kind === 'teacher') chip.classList.add('block-annotation__chip--teacher');
      const pressed = !state.suppressed.has(layer.id);
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      chip.title = pressed ? `Hide ${layer.name}` : `Show ${layer.name}`;
      chip.textContent = pressed ? `✓ ${layer.name}` : layer.name;
      chip.addEventListener('click', () => {
        state = toggleSuppressed(state, layer.id);
        paint();
      });
      chips.append(chip);

      if (layer.kind === 'family' && layer.sublayers?.length) {
        for (const sub of layer.sublayers) {
          const subChip = document.createElement('button');
          subChip.type = 'button';
          subChip.className = `block-annotation__chip block-annotation__chip--sub block-annotation__chip--${layer.colour}`;
          const subPressed = pressed && !state.suppressed.has(sub.id);
          subChip.setAttribute('aria-pressed', subPressed ? 'true' : 'false');
          subChip.title = `${layer.name}: ${sub.name}`;
          subChip.textContent = sub.name;
          subChip.addEventListener('click', () => {
            state = toggleSuppressed(state, sub.id);
            paint();
          });
          chips.append(subChip);
        }
      }
    }

    const threads = visibleThreads(content, mode, state);
    root.classList.toggle('block-annotation--has-threads', threads.length > 0);
    root.classList.toggle('block-annotation--focus', Boolean(state.focusThreadId));
    const narrow = isNarrowAnnotationViewport();

    threadStrip.hidden = threads.length === 0;
    if (threads.length > 0) {
      if (narrow) {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'block-annotation__thread-pick';
        pick.textContent = state.focusThreadId
          ? 'Change thread'
          : `Threads (${threads.length})`;
        pick.addEventListener('click', () => openThreadPicker(threads));
        threadStrip.append(pick);
      } else {
        for (const ann of threads) {
          threadStrip.append(
            buildThreadChip(
              ann,
              layerById(content.layers, ann.layer_id),
              resolvedThreadStops(content, ann).length,
              state.focusThreadId === ann.id,
              () => {
                if (state.focusThreadId === ann.id) exitFocus();
                else enterFocus(ann.id);
                paint();
              }
            )
          );
        }
      }
    }

    const focusAnn = state.focusThreadId
      ? content.annotations.find((a) => a.id === state.focusThreadId)
      : undefined;
    const focusStops = focusAnn ? resolvedThreadStops(content, focusAnn) : [];
    const stepIndex = state.stepIndex;
    const stepping = Boolean(focusAnn && stepIndex != null && focusStops.length > 0);

    focusBar.hidden = !focusAnn;
    stepBar.hidden = !stepping;
    if (focusAnn) {
      const showAll = document.createElement('button');
      showAll.type = 'button';
      showAll.className = 'block-annotation__show-all';
      showAll.textContent = 'Show whole text';
      showAll.addEventListener('click', () => {
        exitFocus();
        paint();
      });

      const menu = document.createElement('details');
      menu.className = 'block-annotation__thread-menu';
      const summary = document.createElement('summary');
      summary.textContent = 'Thread';
      menu.append(
        summary,
        makeMenuItem('±1 line of context', state.context === 1, () => {
          state = { ...state, context: state.context === 1 ? 0 : 1 };
          paint();
        }),
        makeMenuItem('Step through', stepIndex != null, () => {
          state = { ...state, stepIndex: state.stepIndex == null ? 0 : null };
          paint();
        })
      );
      focusBar.append(showAll, menu);

      if (stepping && stepIndex != null) {
        const caption = document.createElement('div');
        caption.className = 'block-annotation__step-caption';
        fillStepCaption(caption, focusAnn, focusStops, stepIndex);
        stepBar.append(
          makeStepBtn('Previous', stepIndex <= 0, -1, focusStops.length),
          caption,
          makeStepBtn('Next', stepIndex >= focusStops.length - 1, 1, focusStops.length)
        );
      }
    }

    const placed = placedFor(content, mode, state);
    const byLine = new Map<string, LineMark[]>();
    const lineBars = new Map<string, PlacedAnnotation[]>();
    const stanzaBars = new Map<string, PlacedAnnotation[]>();

    for (const item of placed) {
      const { resolved } = item;
      if (resolved.granularity === 'stanza') {
        pushGrouped(stanzaBars, resolved.stanzaId, item);
        continue;
      }
      if (!resolved.lineId) continue;
      if (resolved.granularity === 'line') {
        pushGrouped(lineBars, resolved.lineId, item);
        continue;
      }
      if (resolved.start == null || resolved.end == null) continue;
      pushGrouped(byLine, `${resolved.stanzaId}:${resolved.lineId}`, {
        start: resolved.start,
        end: resolved.end,
        placed: item
      });
    }

    // Bar columns widen to the busiest line / stanza so every row stays aligned.
    const most = (map: Map<string, PlacedAnnotation[]>) =>
      Math.max(1, ...Array.from(map.values(), (list) => list.length));
    root.style.setProperty('--line-bars', String(most(lineBars)));
    root.style.setProperty('--stanza-bars', String(most(stanzaBars)));

    const markers = markersFor(
      content.annotations,
      content.layers,
      stops,
      state,
      content.settings.show_markers !== false,
      (annotation) => resolveAnnotation(content.text, annotation),
      (annotation) => {
        if (!table || !annotation.technique?.id) return undefined;
        return lookupTechnique(table, annotation.technique.id)?.symbol;
      }
    );
    const markersByLine = new Map<string, AnnotationMarker[]>();
    for (const marker of markers) {
      if (!marker.lineId) continue;
      pushGrouped(markersByLine, `${marker.stanzaId}:${marker.lineId}`, marker);
    }

    function openPlaced(item: PlacedAnnotation, btn: HTMLButtonElement): void {
      if (
        (item.annotation.also_anchors?.length ?? 0) > 0 &&
        state.focusThreadId !== item.annotation.id
      ) {
        enterFocus(item.annotation.id);
        paint();
        return;
      }
      if (!readerNeeded(item.annotation)) {
        // The margin carries the note: toggle it open, fold the rest away.
        selectNote(activeNoteId === item.annotation.id ? null : item.annotation.id);
        return;
      }
      selectNote(item.annotation.id);
      state = { ...state, openAnnotationId: item.annotation.id };
      openAnnotation(root, item.annotation, item.layer, btn, table);
    }

    function revealMarkerLayer(marker: AnnotationMarker): void {
      if (!stops.some((layer) => layer.id === marker.layerId)) return;
      const suppressed = new Set(state.suppressed);
      suppressed.delete(marker.layerId);
      state = { ...state, suppressed };
      paint();
    }

    const poemHost = document.createElement('div');
    poemHost.className = 'block-annotation__poem';
    inkResize?.disconnect();
    inkHost = poemHost;
    inkResize?.observe(poemHost);

    if (!narrow && threads.length > 0) {
      const arcs = buildArcSvg(
        content,
        threads,
        (id) => layerById(content.layers, id),
        state.focusThreadId
      );
      if (arcs) {
        const arcsCol = document.createElement('div');
        arcsCol.className = 'block-annotation__arcs-col';
        arcsCol.append(arcs);
        poemHost.append(arcsCol);
      }
    }

    const stanzasHost = document.createElement('div');
    stanzasHost.className = 'block-annotation__stanzas';

    const lineById = new Map<string, { stanzaId: string; line: AnnotationLineModel }>();
    for (const stanza of content.text.stanzas) {
      for (const line of stanza.lines) {
        lineById.set(line.id, { stanzaId: stanza.id, line });
      }
    }

    const pipsByLine = new Map<string, HTMLElement[]>();
    if (narrow) {
      for (const ann of threads) {
        const layer = layerById(content.layers, ann.layer_id);
        resolvedThreadStops(content, ann).forEach((stop, index) => {
          if (!stop.resolved.lineId) return;
          const pip = buildStopPip(index, layer?.colour, () => {
            enterFocus(ann.id, index);
            paint();
          });
          pushGrouped(pipsByLine, stop.resolved.lineId, pip);
        });
      }
    }

    const voiceClips = publishedVoiceTracks(content).flatMap(approvedClips);
    const voiceByLine = new Map<string, PublishedVoiceClip[]>();
    const generalVoice = voiceClips.filter((clip) => !clip.anchor);
    for (const clip of voiceClips) {
      if (!clip.anchor?.line) continue;
      pushGrouped(voiceByLine, clip.anchor.line, clip);
    }

    function paintLineRow(line: AnnotationLineModel, stanzaId: string): HTMLElement {
      const lineId = line.id;
      const row = document.createElement('div');
      row.className = 'block-annotation__line';
      row.dataset.lineId = lineId;
      if (
        focusAnn &&
        state.stepIndex != null &&
        focusStops[state.stepIndex]?.resolved.lineId === lineId
      ) {
        row.classList.add('is-step');
      }

      const margin = document.createElement('div');
      margin.className = 'block-annotation__line-margin';
      const barsHere = lineBars.get(lineId) ?? [];
      if (barsHere.length > 0) {
        // Several whole-line notes (grammar, sound, …) sit side by side.
        const bars = document.createElement('div');
        bars.className = 'block-annotation__line-bars';
        for (const item of barsHere) {
          bars.append(makeBarAnchor(item, 'line', (btn) => openPlaced(item, btn)));
        }
        margin.append(bars);
      }
      for (const pip of pipsByLine.get(lineId) ?? []) {
        margin.append(pip);
      }
      for (const clip of voiceByLine.get(lineId) ?? []) {
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'block-annotation__voice-play';
        play.dataset.voiceClipId = clip.id;
        play.setAttribute('aria-label', `Play voice clip: ${clip.transcript_text.slice(0, 40) || clip.id}`);
        play.textContent = '▶';
        play.addEventListener('click', () => playVoiceClip(clip));
        margin.append(play);

        if (clip.transcript_text.trim()) {
          const details = document.createElement('details');
          details.className = 'block-annotation__voice-transcript';
          const summary = document.createElement('summary');
          summary.textContent = 'Transcript';
          const body = document.createElement('p');
          body.textContent = clip.transcript_text;
          details.append(summary, body);
          // Attach beside text after textEl is created below.
          row.dataset.hasVoiceTranscript = '1';
          (row as HTMLElement & { __voiceDetails?: HTMLElement }).__voiceDetails = details;
        }
      }
      row.append(margin);

      const textEl = document.createElement('p');
      textEl.className = 'block-annotation__line-text';
      const marks = byLine.get(`${stanzaId}:${lineId}`) ?? [];
      textEl.append(
        renderLineText(line, marks, () => true, openPlaced)
      );
      applyLineLayout(textEl, line);

      const lineMarkers = markersByLine.get(`${stanzaId}:${lineId}`) ?? [];
      if (lineMarkers.length > 0) {
        const markerRow = document.createElement('span');
        markerRow.className = 'block-annotation__markers';
        for (const marker of lineMarkers) {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = `block-annotation__marker block-annotation__marker--${marker.colour}`;
          if (!marker.symbol) dot.classList.add('block-annotation__marker--dot');
          dot.title = `Hidden note (${marker.layerName}). Click to show.`;
          dot.setAttribute('aria-label', `Show hidden note: ${marker.layerName}`);
          dot.textContent = marker.symbol;
          dot.addEventListener('click', () => revealMarkerLayer(marker));
          markerRow.append(dot);
        }
        textEl.append(markerRow);
      }

      row.append(textEl);
      const voiceDetails = (row as HTMLElement & { __voiceDetails?: HTMLElement }).__voiceDetails;
      if (voiceDetails) {
        delete (row as HTMLElement & { __voiceDetails?: HTMLElement }).__voiceDetails;
        textEl.append(voiceDetails);
      }
      return row;
    }

    if (focusAnn) {
      const rows = foldRowsForThread(content, focusAnn, state);
      let currentStanzaId = '';
      let stanzaEl: HTMLElement | null = null;
      let linesCol: HTMLElement | null = null;
      let gutter: HTMLElement | null = null;

      const ensureStanza = (stanzaId: string) => {
        if (stanzaEl && currentStanzaId === stanzaId) return;
        stanzaEl = document.createElement('div');
        stanzaEl.className = 'block-annotation__stanza';
        stanzaEl.dataset.stanzaId = stanzaId;
        gutter = document.createElement('div');
        gutter.className = 'block-annotation__stanza-gutter';
        for (const item of stanzaBars.get(stanzaId) ?? []) {
          gutter.append(makeBarAnchor(item, 'stanza', (btn) => openPlaced(item, btn)));
        }
        stanzaEl.append(gutter);
        linesCol = document.createElement('div');
        linesCol.className = 'block-annotation__lines';
        stanzaEl.append(linesCol);
        stanzasHost.append(stanzaEl);
        currentStanzaId = stanzaId;
      };

      for (const row of rows) {
        if (row.kind === 'fold') {
          ensureStanza(row.stanzaId);
          const expanded = state.expandedFolds.has(row.id);
          const foldRow = document.createElement('div');
          foldRow.className = 'block-annotation__line block-annotation__line--fold';
          foldRow.append(
            buildFoldButton(row, expanded, () => {
              const expandedFolds = new Set(state.expandedFolds);
              if (expandedFolds.has(row.id)) expandedFolds.delete(row.id);
              else expandedFolds.add(row.id);
              state = { ...state, expandedFolds };
              paint();
            })
          );
          linesCol!.append(foldRow);
          continue;
        }
        const meta = lineById.get(row.lineId);
        if (!meta) continue;
        ensureStanza(meta.stanzaId);
        linesCol!.append(paintLineRow(meta.line, meta.stanzaId));
      }
    } else {
      for (const stanza of content.text.stanzas) {
        const stanzaEl = document.createElement('div');
        stanzaEl.className = 'block-annotation__stanza';
        stanzaEl.dataset.stanzaId = stanza.id;

        const gutter = document.createElement('div');
        gutter.className = 'block-annotation__stanza-gutter';
        for (const item of stanzaBars.get(stanza.id) ?? []) {
          gutter.append(makeBarAnchor(item, 'stanza', (btn) => openPlaced(item, btn)));
        }
        stanzaEl.append(gutter);

        const linesCol = document.createElement('div');
        linesCol.className = 'block-annotation__lines';

        for (const line of stanza.lines) {
          linesCol.append(paintLineRow(line, stanza.id));
        }

        stanzaEl.append(linesCol);
        stanzasHost.append(stanzaEl);
      }
    }

    poemHost.append(stanzasHost);
    textCol.append(poemHost);

    const publishedTracks = publishedVoiceTracks(content);
    if (publishedTracks.length > 0) {
      const voiceBar = document.createElement('div');
      voiceBar.className = 'block-annotation__voice-bar';
      for (const track of publishedTracks) {
        const playAll = document.createElement('button');
        playAll.type = 'button';
        playAll.className = 'btn btn--secondary block-annotation__voice-play-all';
        playAll.textContent = `Play all · ${track.title}`;
        playAll.addEventListener('click', () => playAllVoice(track));
        voiceBar.append(playAll);
      }
      textCol.append(voiceBar);
    }

    if (generalVoice.length > 0) {
      const general = document.createElement('section');
      general.className = 'block-annotation__voice-general';
      const generalTitle = document.createElement('h4');
      generalTitle.textContent = 'General comments';
      general.append(generalTitle);
      const generalList = document.createElement('ul');
      for (const clip of generalVoice) {
        const li = document.createElement('li');
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'btn btn--secondary block-annotation__voice-play';
        play.dataset.voiceClipId = clip.id;
        play.textContent = 'Play';
        play.addEventListener('click', () => playVoiceClip(clip));
        const text = document.createElement('p');
        text.textContent = clip.transcript_text || clip.track.title;
        li.append(play, text);
        generalList.append(li);
      }
      general.append(generalList);
      textCol.append(general);
    }

    if (content.annotations.length === 0 && publishedTracks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-annotation__empty';
      empty.textContent =
        mode === 'teacher'
          ? 'Select text to add a note'
          : 'No annotations on this text yet.';
      textCol.append(empty);
    }

    textCol.scrollTop = scrollTop;

    // Ink over every visible anchor; labels only for word / phrase / line notes.
    const placedById = new Map(placed.map((item) => [item.annotation.id, item]));
    inkMarks = [];
    poemHost
      .querySelectorAll<HTMLButtonElement>('.block-annotation__anchor[data-annotation-id]')
      .forEach((btn) => {
        const item = placedById.get(btn.dataset.annotationId ?? '');
        if (!item) return;
        const kind = btn.classList.contains('block-annotation__anchor--stanza')
          ? 'stanza'
          : btn.classList.contains('block-annotation__anchor--line')
            ? 'line'
            : item.resolved.granularity === 'word'
              ? 'word'
              : 'phrase';
        const isThread = (item.annotation.also_anchors?.length ?? 0) > 0;
        const first = inkMarks.every((mark) => mark.annotationId !== item.annotation.id);
        inkMarks.push({
          annotationId: item.annotation.id,
          kind,
          colour: item.layer?.colour ?? 'wave',
          el: btn,
          label: first && !isThread && kind !== 'stanza' ? marginLabel(item.annotation) : undefined,
          onOpen: () => btn.click()
        });
      });
    scheduleInk(true);

    if (state.openAnnotationId) {
      const openBtn = root.querySelector<HTMLElement>(
        `[data-annotation-id="${state.openAnnotationId}"]`
      );
      const ann = content.annotations.find((a) => a.id === state.openAnnotationId);
      if (openBtn && ann && readerNeeded(ann)) {
        openAnnotation(
          root,
          ann,
          layerById(content.layers, ann.layer_id),
          openBtn,
          table
        );
      }
    }
  }

  root.addEventListener('keydown', (event) => {
    if (!root.contains(event.target as Node)) return;

    if (
      event.key === 'Escape' &&
      activeNoteId &&
      !state.focusThreadId &&
      !root.querySelector('.block-annotation__anchor.is-open') &&
      !isTextControl(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      selectNote(null);
      return;
    }

    const action = resolveAnnotationKey({
      key: event.key,
      focusThreadId: state.focusThreadId,
      panelOpen: Boolean(root.querySelector('.block-annotation__anchor.is-open')),
      isTextControl: isTextControl(event.target)
    });
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    switch (action.type) {
      case 'close_panel': {
        const open = root.querySelector<HTMLElement>('.block-annotation__anchor.is-open');
        closeAnnotationPanel(root);
        state = { ...state, openAnnotationId: null };
        open?.focus();
        break;
      }
      case 'exit_focus':
        exitFocus();
        paint();
        break;
      case 'step_thread': {
        const focusAnn = content.annotations.find((a) => a.id === state.focusThreadId);
        if (!focusAnn) break;
        const focusStops = resolvedThreadStops(content, focusAnn);
        state = {
          ...state,
          stepIndex: stepThreadIndex(state.stepIndex, focusStops.length, action.delta)
        };
        root.dataset.stepIndex = String(state.stepIndex ?? '');
        paint();
        break;
      }
    }
  });

  paint();

  if (openNoteId && state.openAnnotationId === openNoteId) {
    const openBtn = root.querySelector<HTMLElement>(
      `[data-annotation-id="${openNoteId}"]`
    );
    openBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  if (needsTable) {
    void loadLiteraryElements().then((loaded) => {
      table = loaded;
      paint();
    });
  }

  return root;
}

function buildPrintView(content: AnnotationContent): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-annotation block-annotation--print';

  if (content.title?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-annotation__title';
    title.textContent = content.title.trim();
    root.append(title);
  }
  if (content.attribution?.trim()) {
    const attr = document.createElement('p');
    attr.className = 'block-annotation__attribution';
    attr.textContent = content.attribution.trim();
    root.append(attr);
  }

  const placed = placedFor(content, 'print');
  const threadAnns = threadsOf({ content } as AnnotationBlock).filter((ann) =>
    placed.some((item) => item.annotation.id === ann.id)
  );
  const nonThreadPlaced = placed.filter(
    (item) => (item.annotation.also_anchors?.length ?? 0) === 0
  );
  const voiceClips = publishedVoiceTracks(content).flatMap(approvedClips);
  const footnoteById = new Map<string, number>();
  let fn = 1;
  for (const item of nonThreadPlaced) {
    footnoteById.set(item.annotation.id, fn++);
  }
  for (const ann of threadAnns) {
    footnoteById.set(ann.id, fn++);
  }
  for (const clip of voiceClips) {
    footnoteById.set(`voice:${clip.track.id}:${clip.id}`, fn++);
  }

  for (const stanza of content.text.stanzas) {
    const stanzaEl = document.createElement('div');
    stanzaEl.className = 'block-annotation__stanza';
    for (const line of stanza.lines) {
      const p = document.createElement('p');
      p.className = 'block-annotation__line-text';
      p.append(renderFormattedLine(line));
      applyLineLayout(p, line);
      const marksOnLine = nonThreadPlaced.filter(
        (item) =>
          item.resolved.lineId === line.id ||
          (item.resolved.granularity === 'stanza' && item.resolved.stanzaId === stanza.id)
      );
      for (const item of marksOnLine) {
        const n = footnoteById.get(item.annotation.id);
        if (n == null) continue;
        const sup = document.createElement('sup');
        sup.className = 'block-annotation__fn-ref';
        sup.textContent = String(n);
        p.append(sup);
      }
      for (const ann of threadAnns) {
        const onLine = resolvedThreadStops(content, ann).some(
          (stop) => stop.resolved.lineId === line.id
        );
        if (!onLine) continue;
        const n = footnoteById.get(ann.id);
        if (n == null) continue;
        const sup = document.createElement('sup');
        sup.className = 'block-annotation__fn-ref';
        sup.textContent = String(n);
        p.append(sup);
      }
      for (const clip of voiceClips) {
        if (clip.anchor?.line !== line.id) continue;
        const n = footnoteById.get(`voice:${clip.track.id}:${clip.id}`);
        if (n == null) continue;
        const sup = document.createElement('sup');
        sup.className = 'block-annotation__fn-ref';
        sup.textContent = String(n);
        p.append(sup);
      }
      stanzaEl.append(p);
    }
    root.append(stanzaEl);
  }

  if (nonThreadPlaced.length > 0 || threadAnns.length > 0 || voiceClips.length > 0) {
    const notes = document.createElement('ol');
    notes.className = 'block-annotation__footnotes';
    for (const item of nonThreadPlaced) {
      const li = document.createElement('li');
      li.id = `annotation-fn-${item.annotation.id}`;
      const body = document.createElement('div');
      body.className = 'block-annotation__body';
      body.innerHTML = sanitizeRichTextHtml(item.annotation.body.html);
      li.append(body);
      const attachments = attachmentsForPrint(item.annotation.body.attachments);
      if (attachments) li.append(attachments);
      notes.append(li);
    }
    for (const ann of threadAnns) {
      const li = document.createElement('li');
      li.id = `annotation-fn-${ann.id}`;
      const label = document.createElement('p');
      label.className = 'block-annotation__thread-fn-label';
      label.textContent = printThreadFootnoteLabel(content, ann);
      li.append(label);
      const body = document.createElement('div');
      body.className = 'block-annotation__body';
      body.innerHTML = sanitizeRichTextHtml(ann.body.html);
      li.append(body);
      notes.append(li);
    }
    for (const clip of voiceClips) {
      const li = document.createElement('li');
      li.id = `annotation-fn-voice-${clip.id}`;
      const label = document.createElement('p');
      label.className = 'block-annotation__thread-fn-label';
      label.textContent = clip.anchor
        ? `Voice · ${clip.track.title}`
        : `Voice · ${clip.track.title} (general)`;
      const body = document.createElement('p');
      body.textContent = clip.transcript_text || '(no transcript)';
      li.append(label, body);
      notes.append(li);
    }
    root.append(notes);
  }

  return root;
}

export type BuildAnnotationViewOptions = {
  openNoteId?: string;
};

/** Shared layout for teacher / student / print — differs only by mode flags (V8). */
export function buildAnnotationView(
  block: AnnotationBlock,
  mode: RenderMode,
  options: BuildAnnotationViewOptions = {}
): HTMLElement {
  if (mode === 'print') return buildPrintView(block.content);
  return buildInteractiveView(block.content, mode, options.openNoteId);
}
