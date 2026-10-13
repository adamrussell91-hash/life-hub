import {
  buildAnchor,
  orphans,
  type BuildAnchorSelection
} from '@/blocks/annotation-anchor';
import { studentStops } from '@/blocks/annotation-layers';
import {
  parseAnnotationSource,
  serializeAnnotationSource
} from '@/blocks/annotation-text';
import {
  applyTechniqueTag,
  createFamilyLayerFromTable
} from '@/blocks/annotation-technique';
import { askTechniquePicker } from '@/blocks/annotation-technique-picker';
import { blockTypeLabel } from '@/blocks/block-meta';
import {
  loadLiteraryElements,
  lookupTechnique
} from '@/blocks/literary-elements';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import { htmlToPlainText } from '@/blocks/search-text';
import { isHttpUrl } from '@/blocks/url-safety';
import { parseStartTime, parseVideoInput } from '@/blocks/video-url';
import { visitBlocks } from '@/blocks/walk-blocks';
import { askSelectCard, askTextCard } from '@/teacher/confirm-dialog';
import {
  HUB_LIST_ICONS,
  createHubList
} from '../../design-kit/js/hub-list.js';
import type {
  AnnotationAttachment,
  AnnotationColour,
  AnnotationFamilyKey,
  AnnotationItem,
  AnnotationLayer,
  AnnotationLayerKind,
  Block
} from '@/schemas/block';

type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;
type OnChange = (block: AnnotationBlock) => void;

export type AnnotationEditorContext = {
  getLessonBlocks?: () => Block[];
};

const COLOURS: AnnotationColour[] = [
  'wave',
  'high-sea',
  'sand',
  'shore',
  'marine',
  'navy',
  'coral',
  'mist'
];

const COLOUR_LABEL: Record<AnnotationColour, string> = {
  wave: 'Wave',
  'high-sea': 'High sea',
  sand: 'Sand',
  shore: 'Shore',
  marine: 'Marine',
  navy: 'Navy',
  coral: 'Coral',
  mist: 'Mist'
};

const LOCKED_LAYER_KIND_LABEL: Record<'family' | 'teacher' | 'voice', string> = {
  family: 'Periodic Table family',
  teacher: 'Teacher notes',
  voice: 'Voice'
};

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLSelectElement) return true;
  return target.isContentEditable;
}

/**
 * Teacher editor: poem paste, select-to-annotate, layers / annotations /
 * attachments hub-lists, note panel with rich text, marker / default-layer settings.
 * Technique picker is hidden until 2b.
 */
export function createAnnotationEditorFields(
  block: AnnotationBlock,
  onChange: OnChange,
  getLatest: () => AnnotationBlock = () => block,
  context: AnnotationEditorContext = {}
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__annotation';

  let layers: AnnotationLayer[] = block.content.layers.map((layer) => ({
    ...layer,
    sublayers: layer.sublayers?.map((s) => ({ ...s }))
  }));
  let annotations: AnnotationItem[] = block.content.annotations.map((ann) => ({
    ...ann,
    body: { html: ann.body.html, attachments: [...ann.body.attachments] }
  }));
  let selectedAnnotationId: string | null = annotations[0]?.id ?? null;
  let reanchorId: string | null = null;
  let placeHint = '';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__annotation-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Annotation title');

  const attribution = document.createElement('input');
  attribution.type = 'text';
  attribution.className = 'block-editor__annotation-attribution';
  attribution.value = block.content.attribution ?? '';
  attribution.placeholder = 'Poet or source (optional)';
  attribution.setAttribute('aria-label', 'Attribution');

  const proseToggle = document.createElement('input');
  proseToggle.type = 'checkbox';
  proseToggle.className = 'block-editor__annotation-prose';
  proseToggle.checked = block.content.text.kind === 'prose';
  proseToggle.setAttribute('aria-label', 'Prose');

  const proseLabel = document.createElement('label');
  proseLabel.className = 'block-editor__annotation-prose-label';
  proseLabel.append(proseToggle, document.createTextNode(' Prose'));

  const showMarkers = document.createElement('input');
  showMarkers.type = 'checkbox';
  showMarkers.className = 'block-editor__annotation-show-markers';
  showMarkers.checked = block.content.settings.show_markers !== false;
  showMarkers.setAttribute('aria-label', 'Show markers for hidden layers');

  const showMarkersLabel = document.createElement('label');
  showMarkersLabel.className = 'block-editor__annotation-show-markers-label';
  showMarkersLabel.append(
    showMarkers,
    document.createTextNode(' Show markers for hidden layers')
  );

  const defaultLayer = document.createElement('select');
  defaultLayer.className = 'block-editor__annotation-default-layer';
  defaultLayer.setAttribute('aria-label', 'Student starting layer');

  function paintDefaultLayerOptions(): void {
    const current = defaultLayer.value || block.content.settings.default_layer_id || '';
    const choices = studentStops(layers);
    defaultLayer.replaceChildren();
    const textOnly = document.createElement('option');
    textOnly.value = '';
    textOnly.textContent = 'Text only';
    defaultLayer.append(textOnly);
    for (const layer of choices) {
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = layer.name;
      defaultLayer.append(opt);
    }
    const stillValid = current === '' || choices.some((layer) => layer.id === current);
    defaultLayer.value = stillValid ? current : '';
  }

  paintDefaultLayerOptions();

  const source = document.createElement('textarea');
  source.className = 'block-editor__annotation-source';
  source.rows = 8;
  source.value = serializeAnnotationSource(block.content.text);
  source.setAttribute('aria-label', 'Poem or passage text');
  source.placeholder = 'Paste the poem. Blank line = new stanza; newline = new line.';

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent =
    'Select text in the poem to add a note, or click a line or stanza gutter. Editing the text keeps notes and lists orphans.';

  const placeStatus = document.createElement('p');
  placeStatus.className = 'block-editor__hint block-editor__annotation-place';
  placeStatus.setAttribute('aria-live', 'polite');

  const workspace = document.createElement('div');
  workspace.className = 'block-editor__annotation-workspace';

  const selectSurface = document.createElement('div');
  selectSurface.className = 'block-editor__annotation-select';
  selectSurface.setAttribute('aria-label', 'Poem for selecting annotations');

  const notePanel = document.createElement('aside');
  notePanel.className = 'block-editor__annotation-note';
  notePanel.hidden = true;
  notePanel.setAttribute('aria-label', 'Annotation editor');

  const orphansHost = document.createElement('div');
  orphansHost.className = 'block-editor__annotation-orphans';
  orphansHost.setAttribute('aria-live', 'polite');

  const layersHost = document.createElement('div');
  layersHost.className = 'block-editor__annotation-layers';

  const annotationsHost = document.createElement('div');
  annotationsHost.className = 'block-editor__annotation-annotations';

  const techniquePicker = document.createElement('div');
  techniquePicker.className = 'block-editor__annotation-technique';

  const missingTechniqueHost = document.createElement('div');
  missingTechniqueHost.className = 'block-editor__annotation-missing-techniques';
  missingTechniqueHost.setAttribute('aria-live', 'polite');

  let tipTap: ReturnType<typeof mountRichTextTiptap> | null = null;

  function currentText() {
    return parseAnnotationSource(source.value, proseToggle.checked ? 'prose' : 'verse');
  }

  function ensureLayer(): AnnotationLayer {
    if (layers.length > 0) return layers[0]!;
    const layer: AnnotationLayer = {
      id: nextId(`${getLatest().id}_layer`),
      name: 'Notes',
      kind: 'free',
      colour: 'wave',
      symbol: 'N'
    };
    layers = [layer];
    return layer;
  }

  function emitChange(): void {
    const latest = getLatest();
    const text = currentText();
    const titleValue = title.value.trim();
    const attributionValue = attribution.value.trim();
    const defaultLayerId = defaultLayer.value.trim();
    const next: AnnotationBlock = {
      ...latest,
      content: {
        ...latest.content,
        title: titleValue.length > 0 ? titleValue : undefined,
        attribution: attributionValue.length > 0 ? attributionValue : undefined,
        text,
        layers,
        annotations,
        settings: {
          show_markers: showMarkers.checked,
          ...(defaultLayerId ? { default_layer_id: defaultLayerId } : {})
        }
      }
    };
    onChange(next);
    placeStatus.textContent = placeHint;
    paintSelectSurface();
    paintOrphans();
    paintNotePanel();
    remountLists();
  }

  async function paintMissingTechniques(): Promise<void> {
    missingTechniqueHost.replaceChildren();
    const tagged = annotations.filter((ann) => ann.technique?.id);
    if (tagged.length === 0) return;
    const table = await loadLiteraryElements();
    const missing = tagged.filter((ann) => !lookupTechnique(table, ann.technique!.id));
    if (missing.length === 0) return;
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-orphans-title';
    heading.textContent = 'Needs attention';
    const list = document.createElement('ul');
    list.className = 'block-editor__annotation-orphans-list';
    for (const item of missing) {
      const li = document.createElement('li');
      li.textContent = `Unknown technique id: ${item.technique!.id}`;
      list.append(li);
    }
    missingTechniqueHost.append(heading, list);
  }

  function paintOrphans(): void {
    const current = {
      ...getLatest(),
      content: { ...getLatest().content, text: currentText(), layers, annotations }
    };
    const orphanList = orphans(current);
    orphansHost.replaceChildren();
    void paintMissingTechniques();
    if (orphanList.length === 0) return;
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-orphans-title';
    heading.textContent = 'Needs re-anchoring';
    const list = document.createElement('ul');
    list.className = 'block-editor__annotation-orphans-list';
    for (const item of orphanList) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-editor__annotation-orphan';
      const preview = htmlToPlainText(item.body.html).slice(0, 80);
      btn.textContent = preview
        ? `"${item.anchor.quote.exact}" — ${preview}`
        : `"${item.anchor.quote.exact}"`;
      btn.addEventListener('click', () => {
        reanchorId = item.id;
        selectedAnnotationId = item.id;
        placeHint = 'Select the text this note should attach to.';
        placeStatus.textContent = placeHint;
        paintNotePanel();
      });
      li.append(btn);
      list.append(li);
    }
    orphansHost.append(heading, list);
  }

  function applySelection(selection: BuildAnchorSelection): void {
    const text = currentText();
    const anchor = buildAnchor(text, selection);
    if (!anchor) {
      placeHint = 'Could not place a note on that selection.';
      placeStatus.textContent = placeHint;
      return;
    }
    const stamp = nowIso();
    if (reanchorId) {
      annotations = annotations.map((ann) =>
        ann.id === reanchorId
          ? { ...ann, anchor, updated_at: stamp }
          : ann
      );
      selectedAnnotationId = reanchorId;
      reanchorId = null;
      placeHint = '';
      emitChange();
      return;
    }
    const layer = ensureLayer();
    const id = nextId(`${getLatest().id}_ann`);
    const item: AnnotationItem = {
      id,
      layer_id: layer.id,
      anchor,
      body: { html: '<p></p>', attachments: [] },
      created_at: stamp,
      updated_at: stamp
    };
    annotations = [...annotations, item];
    selectedAnnotationId = id;
    placeHint = '';
    emitChange();
  }

  function paintSelectSurface(): void {
    const text = currentText();
    const scrollTop = selectSurface.scrollTop;
    selectSurface.replaceChildren();
    for (const stanza of text.stanzas) {
      const stanzaEl = document.createElement('div');
      stanzaEl.className = 'block-editor__annotation-stanza';
      stanzaEl.dataset.stanzaId = stanza.id;

      const gutter = document.createElement('button');
      gutter.type = 'button';
      gutter.className = 'block-editor__annotation-stanza-gutter';
      gutter.setAttribute('aria-label', 'Annotate stanza');
      gutter.title = 'Annotate stanza';
      gutter.addEventListener('click', () => {
        applySelection({ stanzaId: stanza.id, wholeStanza: true });
      });
      stanzaEl.append(gutter);

      const lines = document.createElement('div');
      lines.className = 'block-editor__annotation-lines';
      for (const line of stanza.lines) {
        const row = document.createElement('div');
        row.className = 'block-editor__annotation-line';
        row.dataset.lineId = line.id;
        row.dataset.stanzaId = stanza.id;

        const margin = document.createElement('button');
        margin.type = 'button';
        margin.className = 'block-editor__annotation-line-gutter';
        margin.setAttribute('aria-label', 'Annotate line');
        margin.title = 'Annotate line';
        margin.addEventListener('click', () => {
          applySelection({
            stanzaId: stanza.id,
            lineId: line.id,
            wholeLine: true
          });
        });

        const textEl = document.createElement('p');
        textEl.className = 'block-editor__annotation-line-text';
        textEl.textContent = line.text || '\u00a0';
        textEl.dataset.stanzaId = stanza.id;
        textEl.dataset.lineId = line.id;

        row.append(margin, textEl);
        lines.append(row);
      }
      stanzaEl.append(lines);
      selectSurface.append(stanzaEl);
    }
    selectSurface.scrollTop = scrollTop;
  }

  selectSurface.addEventListener('mouseup', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const startEl =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as HTMLElement);
    const endEl =
      range.endContainer.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentElement
        : (range.endContainer as HTMLElement);
    const startLine = startEl?.closest<HTMLElement>('.block-editor__annotation-line-text');
    const endLine = endEl?.closest<HTMLElement>('.block-editor__annotation-line-text');
    if (!startLine || !endLine || startLine !== endLine) {
      placeHint = 'Select text within a single line, or use a gutter for a whole line or stanza.';
      placeStatus.textContent = placeHint;
      return;
    }
    if (!selectSurface.contains(startLine)) return;
    const stanzaId = startLine.dataset.stanzaId;
    const lineId = startLine.dataset.lineId;
    if (!stanzaId || !lineId) return;
    applySelection({
      stanzaId,
      lineId,
      start: range.startOffset,
      end: range.endOffset
    });
    sel.removeAllRanges();
  });

  async function pickLayerId(current?: string): Promise<string | null> {
    ensureLayer();
    if (layers.length === 1) return layers[0]!.id;
    return askSelectCard({
      title: 'Layer',
      choices: layers.map((layer) => ({ value: layer.id, label: layer.name })),
      value: current
    });
  }

  async function addAttachment(kind: AnnotationAttachment['kind']): Promise<AnnotationAttachment | null> {
    if (kind === 'block') {
      const lessonBlocks = context.getLessonBlocks?.() ?? [];
      const choices: Array<{ value: string; label: string }> = [];
      visitBlocks(lessonBlocks, (b) => {
        if (b.id === getLatest().id) return;
        choices.push({
          value: b.id,
          label: `${blockTypeLabel(b)} — ${b.id}`
        });
      });
      if (choices.length === 0) {
        placeHint = 'No other blocks in this lesson to link.';
        placeStatus.textContent = placeHint;
        return null;
      }
      const blockId = await askSelectCard({
        title: 'Link to a block',
        choices
      });
      if (!blockId) return null;
      return { kind: 'block', block_id: blockId };
    }

    const url = await askTextCard({
      title:
        kind === 'link'
          ? 'Link URL'
          : kind === 'video'
            ? 'Video URL'
            : kind === 'audio'
              ? 'Audio URL'
              : 'Image URL',
      placeholder: 'https://'
    });
    if (!url || !isHttpUrl(url)) {
      if (url) {
        placeHint = 'Use an http(s) URL.';
        placeStatus.textContent = placeHint;
      }
      return null;
    }

    if (kind === 'link') {
      const label = await askTextCard({
        title: 'Link label (optional)',
        optional: true,
        placeholder: 'Label'
      });
      return { kind: 'link', url, ...(label ? { label } : {}) };
    }
    if (kind === 'video') {
      const parsed = parseVideoInput(url);
      const fromUrl = parsed?.start_seconds;
      const startRaw = await askTextCard({
        title: 'Start time (optional)',
        supporting: 'Seconds, or leave blank to use ?t= from the URL.',
        optional: true,
        value: fromUrl != null ? String(fromUrl) : '',
        placeholder: '90 or 1m30s'
      });
      const start_seconds =
        parseStartTime(startRaw) ?? fromUrl ?? undefined;
      return {
        kind: 'video',
        url,
        ...(start_seconds != null ? { start_seconds } : {})
      };
    }
    if (kind === 'audio') {
      const audioTitle = await askTextCard({
        title: 'Audio title (optional)',
        optional: true
      });
      return {
        kind: 'audio',
        url,
        ...(audioTitle ? { title: audioTitle } : {})
      };
    }
    const alt = await askTextCard({
      title: 'Image alt text',
      placeholder: 'Describe the image'
    });
    if (!alt) return null;
    return { kind: 'image', url, alt_text: alt };
  }

  function paintNotePanel(): void {
    const panelScroll = notePanel.scrollTop;
    tipTap?.destroy();
    tipTap = null;
    notePanel.replaceChildren();

    const selected = annotations.find((a) => a.id === selectedAnnotationId);
    if (!selected) {
      notePanel.hidden = true;
      return;
    }
    notePanel.hidden = false;

    const header = document.createElement('div');
    header.className = 'block-editor__annotation-note-header';
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-note-title';
    heading.textContent = selected.anchor.quote.exact.slice(0, 48) || 'Annotation';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-editor__annotation-note-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      selectedAnnotationId = null;
      paintNotePanel();
    });
    header.append(heading, close);

    const layerLabel = document.createElement('label');
    layerLabel.className = 'block-editor__annotation-layer-pick';
    layerLabel.textContent = 'Layer';
    const layerSelect = document.createElement('select');
    layerSelect.setAttribute('aria-label', 'Annotation layer');
    ensureLayer();
    for (const layer of layers) {
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = layer.name;
      opt.selected = layer.id === selected.layer_id;
      layerSelect.append(opt);
    }
    layerSelect.addEventListener('change', () => {
      void (async () => {
        const previousLayer = layers.find((layer) => layer.id === selected.layer_id);
        const nextLayerId = layerSelect.value;
        if (previousLayer?.kind === 'teacher' && nextLayerId !== previousLayer.id) {
          const confirmed = await askSelectCard({
            title: 'Move off teacher notes?',
            supporting: 'This note will no longer stay on the teacher-only layer.',
            choices: [
              { value: 'move', label: 'Move it' },
              { value: 'keep', label: 'Keep on teacher notes' }
            ]
          });
          if (confirmed !== 'move') {
            layerSelect.value = selected.layer_id;
            return;
          }
        }
        annotations = annotations.map((ann) =>
          ann.id === selected.id
            ? { ...ann, layer_id: nextLayerId, updated_at: nowIso() }
            : ann
        );
        emitChange();
      })();
    });
    layerLabel.append(layerSelect);

    const bodyLabel = document.createElement('p');
    bodyLabel.className = 'block-editor__hint';
    bodyLabel.textContent = 'Note';

    tipTap = mountRichTextTiptap({
      html: selected.body.html,
      onHtml: (html) => {
        annotations = annotations.map((ann) =>
          ann.id === selected.id
            ? {
                ...ann,
                body: { ...ann.body, html },
                updated_at: nowIso()
              }
            : ann
        );
        // Autosave without remounting the panel (I9, V7, I12).
        const latest = getLatest();
        const defaultLayerId = defaultLayer.value.trim();
        onChange({
          ...latest,
          content: {
            ...latest.content,
            title: title.value.trim() || undefined,
            attribution: attribution.value.trim() || undefined,
            text: currentText(),
            layers,
            annotations,
            settings: {
              show_markers: showMarkers.checked,
              ...(defaultLayerId ? { default_layer_id: defaultLayerId } : {})
            }
          }
        });
      }
    });
    tipTap.host.classList.add('block-editor__annotation-body');

    techniquePicker.replaceChildren();
    const techBtn = document.createElement('button');
    techBtn.type = 'button';
    techBtn.className = 'block-editor__annotation-technique-btn';
    techBtn.textContent = selected.technique?.id
      ? `Technique: ${selected.technique.id}`
      : 'Tag technique';
    techBtn.addEventListener('click', async () => {
      const techniqueId = await askTechniquePicker({
        initialQuery: selected.technique?.id ?? ''
      });
      if (!techniqueId) return;
      const table = await loadLiteraryElements();
      const currentLayer = layers.find((layer) => layer.id === selected.layer_id);
      const keepLayer =
        currentLayer?.kind === 'free' ||
        currentLayer?.kind === 'lens' ||
        currentLayer?.kind === 'teacher';
      const result = applyTechniqueTag({
        table,
        techniqueId,
        annotation: selected,
        layers,
        blockId: getLatest().id,
        keepLayer,
        now: nowIso()
      });
      if (!result) return;
      layers = result.layers;
      annotations = annotations.map((ann) =>
        ann.id === selected.id ? result.annotation : ann
      );
      paintDefaultLayerOptions();
      emitChange();
    });
    if (selected.technique?.id) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'block-editor__annotation-technique-clear';
      clear.textContent = 'Clear technique';
      clear.addEventListener('click', () => {
        annotations = annotations.map((ann) =>
          ann.id === selected.id
            ? { ...ann, technique: undefined, updated_at: nowIso() }
            : ann
        );
        emitChange();
      });
      techniquePicker.append(techBtn, clear);
    } else {
      techniquePicker.append(techBtn);
    }

    const attachmentsHost = document.createElement('div');
    attachmentsHost.className = 'block-editor__annotation-attachments';
    type AttRow = AnnotationAttachment & { id: string };
    const attItems: AttRow[] = selected.body.attachments.map((att, index) => ({
      ...att,
      id: `${selected.id}_att_${index}`
    }));
    const attList = createHubList<AttRow>({
      items: attItems,
      noun: 'attachment',
      label: 'Attachments',
      getKey: (item) => item.id,
      itemLabel: (_item, index) => `Attachment ${index + 1}`,
      describe: (item) => {
        if (item.kind === 'block') return `Block ${item.block_id}`;
        if (item.kind === 'link') return item.label?.trim() || item.url;
        if (item.kind === 'video') {
          return item.start_seconds != null
            ? `Video · ${item.start_seconds}s`
            : 'Video';
        }
        if (item.kind === 'audio') return item.title?.trim() || 'Audio';
        return item.alt_text || 'Image';
      },
      min: 0,
      create: () => ({
        id: nextId(`${selected.id}_att`),
        kind: 'link',
        url: 'https://example.com'
      }),
      onChange: (next) => {
        const attachments = next.map(({ id: _id, ...att }) => att as AnnotationAttachment);
        annotations = annotations.map((ann) =>
          ann.id === selected.id
            ? {
                ...ann,
                body: { ...ann.body, attachments },
                updated_at: nowIso()
              }
            : ann
        );
        emitChange();
      },
      renderItem: (item) => {
        const p = document.createElement('p');
        p.className = 'block-editor__hint';
        if (item.kind === 'block') p.textContent = `Block ${item.block_id}`;
        else if (item.kind === 'video') {
          p.textContent =
            item.start_seconds != null
              ? `${item.url} (from ${item.start_seconds}s)`
              : item.url;
        } else if (item.kind === 'image') p.textContent = `${item.alt_text} — ${item.url}`;
        else if (item.kind === 'audio') {
          p.textContent = item.title ? `${item.title} — ${item.url}` : item.url;
        } else {
          p.textContent = item.label ? `${item.label} — ${item.url}` : item.url;
        }
        return p;
      }
    });
    attachmentsHost.append(attList.el);

    const addAttBtn = attList.el.querySelector<HTMLButtonElement>('.hub-list__add');
    if (addAttBtn) {
      addAttBtn.addEventListener(
        'click',
        async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const kind = await askSelectCard({
            title: 'Attachment type',
            choices: [
              { value: 'link', label: 'Link' },
              { value: 'video', label: 'Video' },
              { value: 'audio', label: 'Audio' },
              { value: 'image', label: 'Image' },
              { value: 'block', label: 'Link to a block' }
            ]
          });
          if (!kind) return;
          const att = await addAttachment(kind as AnnotationAttachment['kind']);
          if (!att) return;
          annotations = annotations.map((ann) =>
            ann.id === selected.id
              ? {
                  ...ann,
                  body: { ...ann.body, attachments: [...ann.body.attachments, att] },
                  updated_at: nowIso()
                }
              : ann
          );
          emitChange();
        },
        true
      );
    }

    notePanel.append(header, layerLabel, bodyLabel, tipTap.host, techniquePicker, attachmentsHost);
    notePanel.scrollTop = panelScroll;
  }

  // Escape in fields must not close the note panel (I8).
  notePanel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isTextField(event.target)) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    selectedAnnotationId = null;
    paintNotePanel();
  });

  function remountLists(): void {
    const layerScroll = layersHost.scrollTop;
    const annScroll = annotationsHost.scrollTop;
    layersHost.replaceChildren();
    annotationsHost.replaceChildren();

    const layerList = createHubList<AnnotationLayer>({
      items: layers,
      noun: 'layer',
      label: 'Layers',
      getKey: (layer) => layer.id,
      itemLabel: (layer) => layer.name,
      describe: (layer) => `${layer.name} · ${layer.kind}`,
      min: 0,
      create: () => ({
        id: nextId(`${getLatest().id}_layer`),
        name: 'Layer',
        kind: 'free' as AnnotationLayerKind,
        colour: 'wave' as AnnotationColour,
        symbol: 'L'
      }),
      duplicate: (layer) => ({
        ...layer,
        id: nextId(`${getLatest().id}_layer`),
        name: `${layer.name} copy`
      }),
      onChange: (next) => {
        layers = next;
        paintDefaultLayerOptions();
        emitChange();
      },
      renderItem: (layer, ctx) => {
        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'block-editor__annotation-layer-name';
        name.value = layer.name;
        name.setAttribute('aria-label', 'Layer name');
        name.addEventListener('input', () => {
          ctx.update({ ...ctx.current, name: name.value });
        });

        const colour = document.createElement('select');
        colour.className = 'block-editor__annotation-layer-colour';
        colour.setAttribute('aria-label', 'Layer colour');
        for (const value of COLOURS) {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = COLOUR_LABEL[value];
          opt.selected = layer.colour === value;
          colour.append(opt);
        }
        colour.addEventListener('change', () => {
          ctx.update({ ...ctx.current, colour: colour.value as AnnotationColour });
        });

        const kind = document.createElement('select');
        kind.className = 'block-editor__annotation-layer-kind';
        kind.setAttribute('aria-label', 'Layer kind');
        if (
          layer.kind === 'family' ||
          layer.kind === 'teacher' ||
          layer.kind === 'voice'
        ) {
          const opt = document.createElement('option');
          opt.value = layer.kind;
          opt.textContent = LOCKED_LAYER_KIND_LABEL[layer.kind];
          opt.selected = true;
          kind.append(opt);
          kind.disabled = true;
        } else {
          for (const value of ['free', 'lens', 'teacher'] as const) {
            if (
              value === 'teacher' &&
              layers.some((l) => l.kind === 'teacher' && l.id !== layer.id)
            ) {
              continue;
            }
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent =
              value === 'free' ? 'Free' : value === 'lens' ? 'Lens' : 'Teacher notes';
            opt.selected = layer.kind === value;
            kind.append(opt);
          }
        }
        const symbol = document.createElement('input');
        symbol.type = 'text';
        symbol.className = 'block-editor__annotation-layer-symbol';
        symbol.value = layer.symbol ?? '';
        symbol.maxLength = 3;
        symbol.placeholder = 'Symbol';
        symbol.setAttribute('aria-label', 'Layer symbol');
        symbol.hidden = layer.kind !== 'free';
        symbol.addEventListener('input', () => {
          ctx.update({
            ...ctx.current,
            symbol: symbol.value.trim() || undefined
          });
        });
        kind.addEventListener('change', () => {
          const nextKind = kind.value as AnnotationLayerKind;
          symbol.hidden = nextKind !== 'free';
          ctx.update({ ...ctx.current, kind: nextKind });
        });

        const wrap = document.createElement('div');
        wrap.className = 'block-editor__annotation-layer-fields';
        wrap.append(name, colour, kind, symbol);
        return wrap;
      }
    });
    layerList.el.classList.add('block-editor__annotation-layer-list');

    // Prefer ask cards when adding a named layer.
    const addLayerBtn = layerList.el.querySelector<HTMLButtonElement>('.hub-list__add');
    if (addLayerBtn) {
      addLayerBtn.addEventListener(
        'click',
        async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const name = await askTextCard({
            title: 'Layer name',
            placeholder: 'Structure'
          });
          if (!name) return;
          const kindChoices: Array<{ value: string; label: string }> = [
            { value: 'free', label: 'Free' },
            { value: 'lens', label: 'Lens' }
          ];
          if (!layers.some((l) => l.kind === 'teacher')) {
            kindChoices.push({ value: 'teacher', label: 'Teacher notes' });
          }
          const kind =
            (await askSelectCard({ title: 'Layer kind', choices: kindChoices })) ??
            'free';
          const colour =
            ((await askSelectCard({
              title: 'Colour',
              choices: COLOURS.map((value) => ({
                value,
                label: COLOUR_LABEL[value]
              }))
            })) as AnnotationColour | null) ?? 'wave';
          layers = [
            ...layers,
            {
              id: nextId(`${getLatest().id}_layer`),
              name,
              kind: kind as AnnotationLayerKind,
              colour,
              symbol: name.slice(0, 2)
            }
          ];
          paintDefaultLayerOptions();
          emitChange();
        },
        true
      );
    }

    paintDefaultLayerOptions();
    layersHost.append(layerList.el);

    const addFamilyBtn = document.createElement('button');
    addFamilyBtn.type = 'button';
    addFamilyBtn.className = 'block-editor__annotation-add-family';
    addFamilyBtn.textContent = 'Add from the Periodic Table';
    addFamilyBtn.addEventListener('click', async () => {
      const table = await loadLiteraryElements();
      const available = table.families.filter(
        (fam) => !layers.some((layer) => layer.kind === 'family' && layer.family === fam.key)
      );
      if (available.length === 0) {
        placeHint = 'All Periodic Table families are already on this block.';
        placeStatus.textContent = placeHint;
        return;
      }
      const familyKey = (await askSelectCard({
        title: 'Periodic Table family',
        choices: available.map((fam) => ({ value: fam.key, label: fam.name }))
      })) as AnnotationFamilyKey | null;
      if (!familyKey) return;
      const layer = createFamilyLayerFromTable({
        table,
        familyKey,
        blockId: getLatest().id
      });
      const teacherIdx = layers.findIndex((row) => row.kind === 'teacher');
      layers =
        teacherIdx >= 0
          ? [...layers.slice(0, teacherIdx), layer, ...layers.slice(teacherIdx)]
          : [...layers, layer];
      paintDefaultLayerOptions();
      emitChange();
    });
    layersHost.append(addFamilyBtn);
    layersHost.scrollTop = layerScroll;

    const annList = createHubList<AnnotationItem>({
      items: annotations,
      noun: 'annotation',
      label: 'Annotations',
      getKey: (ann) => ann.id,
      itemLabel: (ann, index) => `Note ${index + 1}`,
      describe: (ann) =>
        ann.anchor.quote.exact.slice(0, 40) ||
        htmlToPlainText(ann.body.html).slice(0, 40) ||
        'Empty note',
      min: 0,
      create: () => {
        placeHint = 'Select text in the poem to place the new note.';
        placeStatus.textContent = placeHint;
        const layer = ensureLayer();
        const stamp = nowIso();
        const text = currentText();
        const first = text.stanzas[0]?.lines[0];
        const anchor = first
          ? buildAnchor(text, {
              stanzaId: text.stanzas[0]!.id,
              lineId: first.id,
              start: 0,
              end: Math.min(1, first.text.length) || 0
            })
          : null;
        // Placeholder that immediately needs a real selection if empty/orphan-prone.
        return {
          id: nextId(`${getLatest().id}_ann`),
          layer_id: layer.id,
          anchor: anchor ?? {
            granularity: 'stanza' as const,
            stanza: text.stanzas[0]?.id ?? 'stanza_1',
            quote: { exact: text.stanzas[0]?.lines[0]?.text || ' ' }
          },
          body: { html: '<p></p>', attachments: [] },
          created_at: stamp,
          updated_at: stamp
        };
      },
      duplicate: (ann) => ({
        ...ann,
        id: nextId(`${getLatest().id}_ann`),
        created_at: nowIso(),
        updated_at: nowIso()
      }),
      onChange: (next) => {
        annotations = next;
        if (selectedAnnotationId && !annotations.some((a) => a.id === selectedAnnotationId)) {
          selectedAnnotationId = annotations[0]?.id ?? null;
        }
        emitChange();
      },
      renderItem: (ann) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'block-editor__annotation-open';
        btn.textContent = 'Edit note';
        btn.addEventListener('click', () => {
          selectedAnnotationId = ann.id;
          paintNotePanel();
        });
        const quote = document.createElement('p');
        quote.className = 'block-editor__hint';
        quote.textContent = `"${ann.anchor.quote.exact}"`;
        const wrap = document.createElement('div');
        wrap.append(quote, btn);
        return wrap;
      }
    });
    annList.el.classList.add('block-editor__annotation-ann-list');
    annotationsHost.append(annList.el);
    annotationsHost.scrollTop = annScroll;

    void HUB_LIST_ICONS;
  }

  title.addEventListener('input', emitChange);
  attribution.addEventListener('input', emitChange);
  source.addEventListener('input', emitChange);
  proseToggle.addEventListener('change', emitChange);
  showMarkers.addEventListener('change', emitChange);
  defaultLayer.addEventListener('change', emitChange);

  paintSelectSurface();
  paintOrphans();
  remountLists();
  paintNotePanel();

  workspace.append(selectSurface, notePanel);
  fields.append(
    title,
    attribution,
    proseLabel,
    showMarkersLabel,
    defaultLayer,
    source,
    hint,
    placeStatus,
    workspace,
    layersHost,
    annotationsHost,
    orphansHost,
    missingTechniqueHost
  );

  fields.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      if (isTextField(event.target)) event.stopPropagation();
    },
    true
  );

  return fields;
}
