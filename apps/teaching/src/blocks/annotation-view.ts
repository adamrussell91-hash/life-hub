import { resolveAnnotation, type ResolvedAnchor } from '@/blocks/annotation-anchor';
import {
  activeLayerIds,
  createLayerState,
  isAnnotationActive,
  markersFor,
  revealedLayers,
  stepStop,
  stopsForMode,
  toggleSuppressed,
  type AnnotationLayerState,
  type AnnotationMarker
} from '@/blocks/annotation-layers';
import {
  FAMILY_PALETTE,
  familyOfTechnique,
  loadLiteraryElements,
  lookupTechnique,
  type LiteraryElementsTable,
  type LiteraryTechnique
} from '@/blocks/literary-elements';
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

function layerById(layers: AnnotationLayer[], id: string): AnnotationLayer | undefined {
  return layers.find((layer) => layer.id === id);
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

function renderElementTile(
  technique: LiteraryTechnique,
  familyColourToken: string
): HTMLElement {
  const details = document.createElement('details');
  details.className = `block-annotation__element block-annotation__element--${familyColourToken}`;

  const summary = document.createElement('summary');
  summary.className = 'block-annotation__element-summary';
  const sym = document.createElement('span');
  sym.className = 'block-annotation__element-symbol';
  sym.textContent = technique.symbol;
  const name = document.createElement('span');
  name.className = 'block-annotation__element-name';
  name.textContent = technique.name;
  summary.append(sym, name);

  const body = document.createElement('div');
  body.className = 'block-annotation__element-body';
  const def = document.createElement('p');
  def.textContent = technique.definition;
  const effect = document.createElement('p');
  effect.textContent = technique.effect;
  const example = document.createElement('p');
  example.className = 'block-annotation__element-example';
  example.textContent = technique.example;
  body.append(def, effect, example);

  details.append(summary, body);
  return details;
}

function fillBody(
  host: HTMLElement,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  table: LiteraryElementsTable | null
): void {
  host.replaceChildren();
  if (layer) {
    const chip = document.createElement('p');
    chip.className = `block-annotation__layer-chip block-annotation__layer-chip--${layer.colour}`;
    chip.textContent = layer.name;
    host.append(chip);
  }
  if (annotation.technique?.id && table) {
    const technique = lookupTechnique(table, annotation.technique.id);
    if (technique) {
      const family = familyOfTechnique(table, technique);
      const colour = family ? FAMILY_PALETTE[family.key] : layer?.colour ?? 'wave';
      host.append(renderElementTile(technique, colour));
    }
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
  anchorEl: HTMLElement,
  table: LiteraryElementsTable | null
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
    fillBody(body, annotation, layer, table);
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
  fillBody(body, annotation, layer, table);
  panel.append(header, body);
  close.focus();
}

function wrapSpan(
  text: string,
  className: string,
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  root: HTMLElement,
  table: LiteraryElementsTable | null
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
  btn.addEventListener('click', () =>
    openAnnotation(root, annotation, layer, btn, table)
  );
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
  root: HTMLElement,
  table: LiteraryElementsTable | null
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
    const grainClass = gran === 'word' ? 'word' : 'phrase';
    const className = `block-annotation__anchor block-annotation__anchor--${grainClass}`;
    frag.append(
      wrapSpan(
        slice,
        className,
        mark.placed.annotation,
        mark.placed.layer,
        root,
        table
      )
    );
    cursor = mark.end;
  }
  if (cursor < lineText.length) {
    frag.append(document.createTextNode(lineText.slice(cursor)));
  }
  return frag;
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
  onOpen: (btn: HTMLButtonElement) => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `block-annotation__anchor block-annotation__anchor--${kind}`;
  btn.dataset.annotationId = item.annotation.id;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', barAnchorLabel(kind, item.layer));
  btn.addEventListener('click', () => onOpen(btn));
  return btn;
}

function buildInteractiveView(
  content: AnnotationContent,
  mode: RenderMode
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-annotation';
  root.dataset.mode = mode;
  root.tabIndex = 0;

  const stops = stopsForMode(content.layers, mode);
  let state = createLayerState(content.layers, content.settings, mode);
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

  const sliderRow = document.createElement('div');
  sliderRow.className = 'block-annotation__slider-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'block-annotation__slider';
  slider.min = '0';
  slider.step = '1';
  slider.setAttribute('aria-label', 'Reveal annotation layers');

  const stopLabels = document.createElement('div');
  stopLabels.className = 'block-annotation__stop-labels';

  sliderRow.append(slider, stopLabels);
  controls.append(chips, sliderRow);

  layout.append(textCol, panel);
  root.append(layout, controls);

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

  function paint(): void {
    const scrollTop = textCol.scrollTop;
    textCol.replaceChildren();
    chips.replaceChildren();
    stopLabels.replaceChildren();

    slider.max = String(stops.length);
    slider.value = String(state.stop);

    const zero = document.createElement('span');
    zero.className = 'block-annotation__stop-label';
    zero.textContent = 'Text only';
    zero.dataset.active = state.stop === 0 ? 'true' : 'false';
    stopLabels.append(zero);
    stops.forEach((layer, index) => {
      const label = document.createElement('span');
      label.className = 'block-annotation__stop-label';
      if (layer.kind === 'teacher') label.classList.add('block-annotation__stop-label--teacher');
      label.textContent = layer.name;
      label.dataset.active = state.stop === index + 1 ? 'true' : 'false';
      stopLabels.append(label);
    });

    for (const layer of revealedLayers(stops, state.stop)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `block-annotation__chip block-annotation__chip--${layer.colour}`;
      if (layer.kind === 'teacher') chip.classList.add('block-annotation__chip--teacher');
      const pressed = !state.suppressed.has(layer.id);
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      chip.title = layer.name;
      chip.textContent = layer.name;
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
      state = { ...state, openAnnotationId: item.annotation.id };
      openAnnotation(root, item.annotation, item.layer, btn, table);
    }

    function revealMarkerLayer(marker: AnnotationMarker): void {
      const idx = stops.findIndex((layer) => layer.id === marker.layerId);
      if (idx < 0) return;
      const suppressed = new Set(state.suppressed);
      suppressed.delete(marker.layerId);
      state = {
        ...state,
        stop: Math.max(state.stop, idx + 1),
        suppressed
      };
      paint();
    }

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
        const row = document.createElement('div');
        row.className = 'block-annotation__line';
        row.dataset.lineId = line.id;

        const margin = document.createElement('div');
        margin.className = 'block-annotation__line-margin';
        for (const item of lineBars.get(line.id) ?? []) {
          margin.append(makeBarAnchor(item, 'line', (btn) => openPlaced(item, btn)));
        }
        row.append(margin);

        const textEl = document.createElement('p');
        textEl.className = 'block-annotation__line-text';
        const marks = byLine.get(`${stanza.id}:${line.id}`) ?? [];
        if (marks.length === 0) {
          textEl.textContent = line.text || '\u00a0';
        } else {
          textEl.append(renderLineText(line.text, marks, root, table));
        }

        const lineMarkers = markersByLine.get(`${stanza.id}:${line.id}`) ?? [];
        if (lineMarkers.length > 0) {
          const markerRow = document.createElement('span');
          markerRow.className = 'block-annotation__markers';
          for (const marker of lineMarkers) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = `block-annotation__marker block-annotation__marker--${marker.colour}`;
            dot.title = marker.layerName;
            dot.setAttribute('aria-label', `Hidden layer: ${marker.layerName}`);
            dot.textContent = marker.symbol;
            dot.addEventListener('click', () => revealMarkerLayer(marker));
            markerRow.append(dot);
          }
          textEl.append(markerRow);
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

    textCol.scrollTop = scrollTop;

    if (state.openAnnotationId) {
      const openBtn = root.querySelector<HTMLElement>(
        `[data-annotation-id="${state.openAnnotationId}"]`
      );
      if (openBtn) {
        const ann = content.annotations.find((a) => a.id === state.openAnnotationId);
        if (ann) {
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
  }

  slider.addEventListener('input', () => {
    state = { ...state, stop: Number(slider.value) };
    paint();
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const open = root.querySelector<HTMLElement>('.block-annotation__anchor.is-open');
      if (!open) return;
      event.stopPropagation();
      closeAnnotationPanel(root);
      state = { ...state, openAnnotationId: null };
      open.focus();
      return;
    }

    if (isTextControl(event.target)) return;
    const onSlider = event.target === slider;
    const blockFocused = event.target === root || root.contains(event.target as Node);
    if (!onSlider && !blockFocused) return;

    let next: AnnotationLayerState | null = null;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = stepStop(state, stops, -1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = stepStop(state, stops, 1);
        break;
      case 'Home':
        next = { ...state, stop: 0 };
        break;
      case 'End':
        next = { ...state, stop: stops.length };
        break;
      default:
        return;
    }
    event.preventDefault();
    state = next;
    paint();
    slider.focus();
  });

  paint();

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
