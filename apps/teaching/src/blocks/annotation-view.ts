import { resolveAnnotation, type ResolvedAnchor } from '@/blocks/annotation-anchor';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { isHttpUrl } from '@/blocks/url-safety';
import { parseVideoInput, parseStartTime, videoEmbedSrc } from '@/blocks/video-url';
import type {
  AnnotationAttachment,
  AnnotationBlock,
  AnnotationItem,
  AnnotationLayer
} from '@/schemas/block';

type RenderMode = 'teacher' | 'student' | 'print';
type AnnotationContent = AnnotationBlock['content'];

type PlacedAnnotation = {
  annotation: AnnotationItem;
  resolved: ResolvedAnchor;
  layer?: AnnotationLayer;
};

function studentLayers(layers: AnnotationLayer[]): AnnotationLayer[] {
  return layers.filter((layer) => layer.kind !== 'teacher');
}

function layerById(layers: AnnotationLayer[], id: string): AnnotationLayer | undefined {
  return layers.find((layer) => layer.id === id);
}

function visibleAnnotations(
  content: AnnotationContent,
  mode: RenderMode
): PlacedAnnotation[] {
  const layers = mode === 'teacher' ? content.layers : studentLayers(content.layers);
  const allowed = new Set(layers.map((l) => l.id));
  const placed: PlacedAnnotation[] = [];
  for (const annotation of content.annotations) {
    if (!allowed.has(annotation.layer_id)) continue;
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

function fillBody(host: HTMLElement, annotation: AnnotationItem, layer?: AnnotationLayer): void {
  host.replaceChildren();
  if (layer) {
    const chip = document.createElement('p');
    chip.className = `block-annotation__layer-chip block-annotation__layer-chip--${layer.colour}`;
    chip.textContent = layer.name;
    host.append(chip);
  }
  const body = document.createElement('div');
  body.className = 'block-annotation__body';
  body.innerHTML = sanitizeRichTextHtml(annotation.body.html);
  host.append(body);
  const attachments = renderAttachmentList(annotation.body.attachments);
  if (attachments) host.append(attachments);
}

function openAnnotation(
  root: HTMLElement,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  anchorEl: HTMLElement
): void {
  closeAnnotationPanel(root);
  anchorEl.classList.add('is-open');
  anchorEl.setAttribute('aria-expanded', 'true');

  const isNarrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
  if (isNarrow) {
    const sheet = root.querySelector<HTMLElement>('.block-annotation__sheet');
    if (!sheet) return;
    sheet.hidden = false;
    sheet.classList.add('is-open');
    const dialog = document.createElement('div');
    dialog.className = 'block-annotation__sheet-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Annotation');
    const header = document.createElement('div');
    header.className = 'block-annotation__sheet-header';
    const title = document.createElement('h3');
    title.className = 'block-annotation__sheet-title';
    title.textContent = 'Annotation';
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
    fillBody(body, annotation, layer);
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
  title.textContent = 'Annotation';
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
  fillBody(body, annotation, layer);
  panel.append(header, body);
  close.focus();
}

function wrapSpan(
  text: string,
  className: string,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  root: HTMLElement
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.dataset.annotationId = annotation.id;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute(
    'aria-label',
    layer ? `Annotation: ${layer.name}` : 'Annotation'
  );
  btn.textContent = text;
  btn.addEventListener('click', () => openAnnotation(root, annotation, layer, btn));
  return btn;
}

type LineMark = {
  start: number;
  end: number;
  placed: PlacedAnnotation;
};

function renderLineText(
  lineText: string,
  marks: LineMark[],
  root: HTMLElement
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const sorted = [...marks].sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  for (const mark of sorted) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) {
      frag.append(document.createTextNode(lineText.slice(cursor, mark.start)));
    }
    const slice = lineText.slice(mark.start, mark.end);
    const gran = mark.placed.resolved.granularity;
    const className =
      gran === 'word' || gran === 'phrase'
        ? `block-annotation__anchor block-annotation__anchor--${gran}`
        : 'block-annotation__anchor block-annotation__anchor--phrase';
    frag.append(
      wrapSpan(slice, className, mark.placed.annotation, mark.placed.layer, root)
    );
    cursor = mark.end;
  }
  if (cursor < lineText.length) {
    frag.append(document.createTextNode(lineText.slice(cursor)));
  }
  return frag;
}

function buildInteractiveView(
  content: AnnotationContent,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-annotation';
  root.dataset.mode = mode;

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

  const placed = visibleAnnotations(content, mode);
  const byLine = new Map<string, LineMark[]>();
  const lineBars = new Map<string, PlacedAnnotation[]>();
  const stanzaBars = new Map<string, PlacedAnnotation[]>();

  for (const item of placed) {
    const { resolved } = item;
    if (resolved.granularity === 'stanza') {
      const list = stanzaBars.get(resolved.stanzaId) ?? [];
      list.push(item);
      stanzaBars.set(resolved.stanzaId, list);
      continue;
    }
    if (!resolved.lineId) continue;
    if (resolved.granularity === 'line') {
      const list = lineBars.get(resolved.lineId) ?? [];
      list.push(item);
      lineBars.set(resolved.lineId, list);
      continue;
    }
    if (resolved.start == null || resolved.end == null) continue;
    const key = `${resolved.stanzaId}:${resolved.lineId}`;
    const list = byLine.get(key) ?? [];
    list.push({ start: resolved.start, end: resolved.end, placed: item });
    byLine.set(key, list);
  }

  for (const stanza of content.text.stanzas) {
    const stanzaEl = document.createElement('div');
    stanzaEl.className = 'block-annotation__stanza';
    stanzaEl.dataset.stanzaId = stanza.id;

    const gutter = document.createElement('div');
    gutter.className = 'block-annotation__stanza-gutter';
    const stanzaMarks = stanzaBars.get(stanza.id) ?? [];
    for (const item of stanzaMarks) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-annotation__anchor block-annotation__anchor--stanza';
      btn.dataset.annotationId = item.annotation.id;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute(
        'aria-label',
        item.layer ? `Stanza annotation: ${item.layer.name}` : 'Stanza annotation'
      );
      btn.addEventListener('click', () =>
        openAnnotation(root, item.annotation, item.layer, btn)
      );
      gutter.append(btn);
    }
    stanzaEl.append(gutter);

    const linesCol = document.createElement('div');
    linesCol.className = 'block-annotation__lines';

    for (const line of stanza.lines) {
      const row = document.createElement('div');
      row.className = 'block-annotation__line';
      row.dataset.lineId = line.id;

      const margin = document.createElement('div');
      margin.className = 'block-annotation__line-margin';
      for (const item of lineBars.get(line.id) ?? []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'block-annotation__anchor block-annotation__anchor--line';
        btn.dataset.annotationId = item.annotation.id;
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute(
          'aria-label',
          item.layer ? `Line annotation: ${item.layer.name}` : 'Line annotation'
        );
        btn.addEventListener('click', () =>
          openAnnotation(root, item.annotation, item.layer, btn)
        );
        margin.append(btn);
      }
      row.append(margin);

      const textEl = document.createElement('p');
      textEl.className = 'block-annotation__line-text';
      const marks = byLine.get(`${stanza.id}:${line.id}`) ?? [];
      if (marks.length === 0) {
        textEl.textContent = line.text || '\u00a0';
      } else {
        textEl.append(renderLineText(line.text, marks, root));
      }
      row.append(textEl);
      linesCol.append(row);
    }

    stanzaEl.append(linesCol);
    textCol.append(stanzaEl);
  }

  if (content.annotations.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-annotation__empty';
    empty.textContent =
      mode === 'teacher'
        ? 'Select text to add a note'
        : 'No annotations on this text yet.';
    textCol.append(empty);
  }

  layout.append(textCol);

  const panel = document.createElement('aside');
  panel.className = 'block-annotation__panel';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  layout.append(panel);

  root.append(layout);

  const sheet = document.createElement('div');
  sheet.className = 'block-annotation__sheet';
  sheet.hidden = true;
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) {
      const open = root.querySelector<HTMLElement>('.block-annotation__anchor.is-open');
      closeAnnotationPanel(root);
      open?.focus();
    }
  });
  root.append(sheet);

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = root.querySelector<HTMLElement>('.block-annotation__anchor.is-open');
    if (!open) return;
    event.stopPropagation();
    closeAnnotationPanel(root);
    open.focus();
  });

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

  const placed = visibleAnnotations(content, 'print');
  const footnoteById = new Map<string, number>();
  placed.forEach((item, index) => {
    footnoteById.set(item.annotation.id, index + 1);
  });

  for (const stanza of content.text.stanzas) {
    const stanzaEl = document.createElement('div');
    stanzaEl.className = 'block-annotation__stanza';
    for (const line of stanza.lines) {
      const p = document.createElement('p');
      p.className = 'block-annotation__line-text';
      p.textContent = line.text || '\u00a0';
      const marksOnLine = placed.filter(
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
      stanzaEl.append(p);
    }
    root.append(stanzaEl);
  }

  if (placed.length > 0) {
    const notes = document.createElement('ol');
    notes.className = 'block-annotation__footnotes';
    for (const item of placed) {
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
    root.append(notes);
  }

  return root;
}

/** Shared layout for teacher / student / print — differs only by mode flags (V8). */
export function buildAnnotationView(
  block: AnnotationBlock,
  mode: RenderMode
): HTMLElement {
  if (mode === 'print') return buildPrintView(block.content);
  return buildInteractiveView(block.content, mode);
}
