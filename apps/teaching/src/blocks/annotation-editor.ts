import {
  buildAnchor,
  orphans,
  type BuildAnchorSelection
} from '@/blocks/annotation-anchor';
import { studentStops } from '@/blocks/annotation-layers';
import {
  applyLineLayout,
  renderFormattedLine,
  textOffsetWithin,
  type LineSpan
} from '@/blocks/annotation-line-format';
import {
  mountAnnotationPoemEditor,
  type AnnotationPoemEditorHandle
} from '@/blocks/annotation-poem-editor';
import { resolveAnnotation } from '@/blocks/annotation-anchor';
import { renderElementCard } from '@/blocks/annotation-view';
import { threadStops } from '@/blocks/annotation-thread';
import {
  applyTechniqueTag,
  createFamilyLayerFromTable
} from '@/blocks/annotation-technique';
import { askTechniquePicker } from '@/blocks/annotation-technique-picker';
import { blockTypeLabel } from '@/blocks/block-meta';
import { createBlock } from '@/blocks/create-block';
import {
  cardKindsForAnnotation,
  composeCardFromAnnotation,
  FLASHCARDS_CAP,
  listFlashcardTargets,
  type FlashcardKind
} from '@/blocks/flashcard-from-annotation';
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
  mountVoiceRecorder,
  type VoiceRecorderHandle
} from '@/blocks/voice-recorder';
import {
  mountVoiceReview,
  type VoiceReviewHandle
} from '@/blocks/voice-review';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import {
  HUB_LIST_ICONS,
  bindHoldToConfirm,
  createHubList
} from '../../design-kit/js/hub-list.js';
import { applyHubPillsThumb } from '../../design-kit/js/hub-motion.js';
import type {
  AnnotationAnchor,
  AnnotationAttachment,
  AnnotationColour,
  AnnotationFamilyKey,
  AnnotationItem,
  AnnotationLayer,
  AnnotationLayerKind,
  AnnotationThread,
  AnnotationVoiceTrack,
  Block
} from '@/schemas/block';

type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;
type OnChange = (block: AnnotationBlock) => void;

export type AnnotationEditorContext = {
  getLessonBlocks?: () => Block[];
  setLessonBlocks?: (blocks: Block[]) => void;
  lessonId?: string;
};

function parseTagInput(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

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

const LAYER_KIND_LABEL: Record<AnnotationLayerKind, string> = {
  family: 'Periodic Table family',
  free: 'Free',
  lens: 'Lens',
  teacher: 'Teacher notes',
  voice: 'Voice'
};

type ThreadKind = NonNullable<AnnotationThread['kind']>;

const THREAD_KINDS: Array<{ value: ThreadKind; label: string }> = [
  { value: 'motif', label: 'Motif' },
  { value: 'opposition', label: 'Opposition' },
  { value: 'volta', label: 'Volta' },
  { value: 'echo', label: 'Echo' },
  { value: 'argument', label: 'Argument' }
];

type StopRow = {
  id: string;
  isPrimary: boolean;
  anchor: AnnotationAnchor;
};

type ReanchorStop = {
  annotationId: string;
  stopId: string;
  isPrimary: boolean;
};

/**
 * The open note and active layer survive the editor being rebuilt after a save,
 * so writing or linking a place never drops the teacher back to the list.
 */
const editorMemory = new Map<string, { selected: string | null; layer: string | null }>();

type NoteSpan = { start: number; end: number; ann: AnnotationItem };

/** Join spans that overlap into one clickable run carrying every note on it. */
export function mergeOverlapping(
  spans: NoteSpan[]
): Array<{ start: number; end: number; anns: AnnotationItem[] }> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const groups: Array<{ start: number; end: number; anns: AnnotationItem[] }> = [];
  for (const span of sorted) {
    const last = groups[groups.length - 1];
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
      if (!last.anns.some((ann) => ann.id === span.ann.id)) last.anns.push(span.ann);
    } else {
      groups.push({ start: span.start, end: span.end, anns: [span.ann] });
    }
  }
  return groups;
}

/** Put an edited subset (reordered, removed, added) back into the full list. */
export function mergeSubset<T>(all: T[], inSubset: (item: T) => boolean, next: T[]): T[] {
  const queue = [...next];
  const out: T[] = [];
  for (const item of all) {
    if (!inSubset(item)) out.push(item);
    else if (queue.length > 0) out.push(queue.shift()!);
  }
  return [...out, ...queue];
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneAnnotation(ann: AnnotationItem): AnnotationItem {
  return {
    ...ann,
    anchor: { ...ann.anchor, quote: { ...ann.anchor.quote } },
    also_anchors: ann.also_anchors?.map((anchor) => ({
      ...anchor,
      quote: { ...anchor.quote }
    })),
    thread: ann.thread
      ? {
          ...ann.thread,
          anchor_order: ann.thread.anchor_order
            ? [...ann.thread.anchor_order]
            : undefined
        }
      : undefined,
    body: { html: ann.body.html, attachments: [...ann.body.attachments] }
  };
}

function ensureAnchorId(anchor: AnnotationAnchor, fallbackId: string): AnnotationAnchor {
  if (anchor.id) return anchor;
  return { ...anchor, id: fallbackId };
}

function stopRowsOf(ann: AnnotationItem): StopRow[] {
  const primaryId = ann.anchor.id ?? `${ann.id}:primary`;
  const primary: StopRow = {
    id: primaryId,
    isPrimary: true,
    anchor: ensureAnchorId(ann.anchor, primaryId)
  };
  const extras = (ann.also_anchors ?? []).map((anchor, index) => {
    const id = anchor.id ?? `${ann.id}:also_${index}`;
    return {
      id,
      isPrimary: false,
      anchor: ensureAnchorId(anchor, id)
    };
  });
  const order = ann.thread?.order ?? 'text';
  if (order === 'custom' && ann.thread?.anchor_order?.length) {
    const byId = new Map([primary, ...extras].map((row) => [row.id, row]));
    const ordered: StopRow[] = [];
    const seen = new Set<string>();
    for (const id of ann.thread.anchor_order) {
      const row = byId.get(id);
      if (!row || seen.has(row.id)) continue;
      ordered.push(row);
      seen.add(row.id);
    }
    for (const row of [primary, ...extras]) {
      if (!seen.has(row.id)) ordered.push(row);
    }
    return ordered;
  }
  return [primary, ...extras];
}

function clearThreadFields(ann: AnnotationItem): AnnotationItem {
  const { also_anchors: _also, thread: _thread, ...rest } = ann;
  return { ...rest, updated_at: nowIso() };
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
 * Thread stops (3c) use the kit list builder beside the poem.
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
  let annotations: AnnotationItem[] = block.content.annotations.map(cloneAnnotation);
  let voiceTracks: AnnotationVoiceTrack[] = (block.content.voice_tracks ?? []).map((track) => ({
    ...track,
    audio: { ...track.audio },
    transcript: {
      timing: track.transcript.timing,
      words: track.transcript.words.map((w) => ({ ...w }))
    },
    taps: track.taps?.map((tap) => ({
      t: tap.t,
      anchor: { ...tap.anchor, quote: { ...tap.anchor.quote } }
    })),
    clips: track.clips.map((clip) => ({
      ...clip,
      word_range: [clip.word_range[0], clip.word_range[1]] as [number, number],
      anchor: clip.anchor
        ? { ...clip.anchor, quote: { ...clip.anchor.quote } }
        : undefined
    })),
    extras: track.extras?.map((extra) => ({ ...extra }))
  }));
  const remembered = editorMemory.get(block.id);
  let selectedAnnotationId: string | null =
    remembered?.selected && annotations.some((ann) => ann.id === remembered.selected)
      ? remembered.selected
      : null;
  /** The layer the teacher is annotating in: new notes go here, the list shows it. */
  let activeLayerId: string | null =
    (remembered?.layer && layers.some((layer) => layer.id === remembered.layer)
      ? remembered.layer
      : null) ??
    annotations[0]?.layer_id ??
    layers.find((layer) => layer.kind !== 'voice')?.id ??
    null;
  const rememberView = () =>
    editorMemory.set(block.id, { selected: selectedAnnotationId, layer: activeLayerId });
  let reanchorId: string | null = null;
  let reanchorStop: ReanchorStop | null = null;
  let addingStopForId: string | null = null;
  let placeHint = '';
  let voiceRecorder: VoiceRecorderHandle | null = null;
  let voiceReview: VoiceReviewHandle | null = null;
  let reviewingTrackId: string | null = null;

  let textModel = block.content.text;
  let textKind: 'verse' | 'prose' = block.content.text.kind;
  let pendingSelection: BuildAnchorSelection | null = null;
  let poemEditor: AnnotationPoemEditorHandle | null = null;
  const hasText = () =>
    textModel.stanzas.some((stanza) => stanza.lines.some((line) => line.text.trim().length > 0));
  let mode: 'text' | 'annotate' = hasText() ? 'annotate' : 'text';

  const intro = document.createElement('p');
  intro.className = 'block-editor__hint block-editor__annotation-intro';
  intro.textContent =
    'Write or paste the text, then switch to Annotate and highlight words to add a note. A note is your comment on the words you highlighted; students tap the underlined words to read it.';

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

  const headRow = document.createElement('div');
  headRow.className = 'block-editor__annotation-head';
  headRow.append(title, attribution);

  function makePills<T extends string>(
    label: string,
    className: string,
    options: Array<{ value: T; label: string }>,
    current: () => T,
    onPick: (value: T) => void
  ): { el: HTMLElement; sync: () => void } {
    const group = document.createElement('div');
    group.className = `hub-pills ${className}`;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const btns = options.map((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.dataset.value = option.value;
      btn.textContent = option.label;
      btn.addEventListener('click', () => {
        onPick(option.value);
        sync();
      });
      group.append(btn);
      return btn;
    });
    const sync = () => {
      for (const btn of btns) {
        const on = btn.dataset.value === current();
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-active', on);
      }
      requestAnimationFrame(() => applyHubPillsThumb(group));
    };
    sync();
    return { el: group, sync };
  }

  const modePills = makePills<'text' | 'annotate'>(
    'Editing mode',
    'block-editor__annotation-mode',
    [
      { value: 'text', label: 'Text' },
      { value: 'annotate', label: 'Annotate' }
    ],
    () => mode,
    (value) => setMode(value)
  );

  const kindPills = makePills<'verse' | 'prose'>(
    'Text kind',
    'block-editor__annotation-kind',
    [
      { value: 'verse', label: 'Poem' },
      { value: 'prose', label: 'Prose' }
    ],
    () => textKind,
    (value) => {
      if (value === textKind) return;
      textKind = value;
      poemEditor?.setKind(value);
    }
  );

  let inkStyle: 'fineliner' | 'highlighter' = block.content.settings.ink_style ?? 'fineliner';
  const inkPills = makePills<'fineliner' | 'highlighter'>(
    'How notes are drawn',
    'block-editor__annotation-ink-style',
    [
      { value: 'fineliner', label: 'Fineliner + margin notes' },
      { value: 'highlighter', label: 'Highlighter' }
    ],
    () => inkStyle,
    (value) => {
      if (value === inkStyle) return;
      inkStyle = value;
      emitChange();
    }
  );
  const inkLabel = document.createElement('div');
  inkLabel.className = 'block-editor__annotation-default-layer-label';
  const inkLabelText = document.createElement('span');
  inkLabelText.textContent = 'How notes are drawn';
  inkLabel.append(inkLabelText, inkPills.el);

  const showMarkers = document.createElement('input');
  showMarkers.type = 'checkbox';
  showMarkers.className = 'block-editor__annotation-show-markers';
  showMarkers.checked = block.content.settings.show_markers !== false;
  showMarkers.setAttribute('aria-label', 'Show a dot where hidden notes are');

  const showMarkersLabel = document.createElement('label');
  showMarkersLabel.className = 'block-editor__annotation-show-markers-label';
  showMarkersLabel.append(
    showMarkers,
    document.createTextNode(' Show a dot where notes are still hidden')
  );

  let blockAnthology = {
    include: block.content.anthology?.include === true,
    themes: [...(block.content.anthology?.themes ?? [])],
    concepts: [...(block.content.anthology?.concepts ?? [])]
  };

  const blockAnthologyToggle = document.createElement('input');
  blockAnthologyToggle.type = 'checkbox';
  blockAnthologyToggle.className = 'block-editor__annotation-anthology-block';
  blockAnthologyToggle.checked = blockAnthology.include;
  blockAnthologyToggle.setAttribute('aria-label', 'Add whole text to unit anthology');

  const blockAnthologyLabel = document.createElement('label');
  blockAnthologyLabel.className = 'block-editor__annotation-anthology-block-label';
  blockAnthologyLabel.append(
    blockAnthologyToggle,
    document.createTextNode(' Add whole text to unit anthology')
  );

  const blockThemes = document.createElement('input');
  blockThemes.type = 'text';
  blockThemes.className = 'block-editor__annotation-anthology-themes';
  blockThemes.value = blockAnthology.themes.join(', ');
  blockThemes.placeholder = 'Themes (comma-separated)';
  blockThemes.setAttribute('aria-label', 'Block anthology themes');

  const blockConcepts = document.createElement('input');
  blockConcepts.type = 'text';
  blockConcepts.className = 'block-editor__annotation-anthology-concepts';
  blockConcepts.value = blockAnthology.concepts.join(', ');
  blockConcepts.placeholder = 'Concepts (comma-separated)';
  blockConcepts.setAttribute('aria-label', 'Block anthology concepts');

  const defaultLayer = document.createElement('select');
  defaultLayer.className = 'block-editor__annotation-default-layer';
  defaultLayer.setAttribute('aria-label', 'Students start on');

  const defaultLayerLabel = document.createElement('label');
  defaultLayerLabel.className = 'block-editor__annotation-default-layer-label';
  defaultLayerLabel.textContent = 'Students start on';

  function paintDefaultLayerOptions(): void {
    const current = defaultLayer.value || block.content.settings.default_layer_id || '';
    const choices = studentStops(layers);
    defaultLayer.replaceChildren();
    const textOnly = document.createElement('option');
    textOnly.value = '';
    textOnly.textContent = 'Text only (notes hidden)';
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

  const textPane = document.createElement('div');
  textPane.className = 'block-editor__annotation-text-pane';

  const annotatePane = document.createElement('div');
  annotatePane.className = 'block-editor__annotation-annotate-pane';

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent =
    'Highlight words, then choose Add note. The bars on the left add a note to a whole line or stanza. Click underlined words to open their note.';

  const placeStatus = document.createElement('p');
  placeStatus.className = 'block-editor__hint block-editor__annotation-place';
  placeStatus.setAttribute('aria-live', 'polite');

  const workspace = document.createElement('div');
  workspace.className = 'block-editor__annotation-workspace';

  const selectSurface = document.createElement('div');
  selectSurface.className = 'block-editor__annotation-select';
  selectSurface.setAttribute('aria-label', 'Text to annotate');

  const selectWrap = document.createElement('div');
  selectWrap.className = 'block-editor__annotation-select-wrap';

  const addNoteFloat = document.createElement('button');
  addNoteFloat.type = 'button';
  addNoteFloat.className = 'btn btn--primary block-editor__annotation-add-note';
  addNoteFloat.textContent = '+ Add note';
  addNoteFloat.hidden = true;
  // Keep the text selection alive while pressing the button.
  addNoteFloat.addEventListener('mousedown', (event) => event.preventDefault());
  addNoteFloat.addEventListener('click', () => {
    const pending = pendingSelection;
    clearPending();
    window.getSelection()?.removeAllRanges();
    if (pending) applySelection(pending);
  });
  selectWrap.append(selectSurface, addNoteFloat);

  const notePanel = document.createElement('aside');
  notePanel.className = 'block-editor__annotation-note';
  notePanel.hidden = true;
  notePanel.setAttribute('aria-label', 'Annotation editor');

  // One place for notes: the list of the active layer's notes, or the open note.
  const listPanel = document.createElement('aside');
  listPanel.className = 'block-editor__annotation-note-list';
  listPanel.setAttribute('aria-label', 'Notes');
  const layerPickHost = document.createElement('div');
  layerPickHost.className = 'block-editor__annotation-active-layer';

  const voicePanel = document.createElement('aside');
  voicePanel.className = 'block-editor__annotation-voice-panel';
  voicePanel.hidden = true;
  voicePanel.setAttribute('aria-label', 'Voice tools');

  const orphansHost = document.createElement('div');
  orphansHost.className = 'block-editor__annotation-orphans';
  orphansHost.setAttribute('aria-live', 'polite');

  const layersHost = document.createElement('div');
  layersHost.className = 'block-editor__annotation-layers';

  const voiceTracksHost = document.createElement('div');
  voiceTracksHost.className = 'block-editor__annotation-voice-tracks';

  const annotationsHost = document.createElement('div');
  annotationsHost.className = 'block-editor__annotation-annotations';

  const techniquePicker = document.createElement('div');
  techniquePicker.className = 'block-editor__annotation-technique';

  const missingTechniqueHost = document.createElement('div');
  missingTechniqueHost.className = 'block-editor__annotation-missing-techniques';
  missingTechniqueHost.setAttribute('aria-live', 'polite');

  let tipTap: ReturnType<typeof mountRichTextTiptap> | null = null;

  function currentText() {
    return textModel;
  }

  function clearPending(): void {
    pendingSelection = null;
    addNoteFloat.hidden = true;
  }

  function ensureLayer(): AnnotationLayer {
    if (layers.length > 0) return layers[0]!;
    const layer: AnnotationLayer = {
      id: nextId(`${getLatest().id}_layer`),
      name: 'Notes',
      kind: 'free',
      colour: 'wave'
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
    const anthology = blockAnthologyPayload();
    blockAnthology = {
      include: anthology?.include === true,
      themes: [...(anthology?.themes ?? [])],
      concepts: [...(anthology?.concepts ?? [])]
    };
    blockThemes.value = blockAnthology.themes.join(', ');
    blockConcepts.value = blockAnthology.concepts.join(', ');
    const next: AnnotationBlock = {
      ...latest,
      content: {
        ...latest.content,
        title: titleValue.length > 0 ? titleValue : undefined,
        attribution: attributionValue.length > 0 ? attributionValue : undefined,
        text,
        layers,
        annotations,
        voice_tracks: voiceTracks.length > 0 ? voiceTracks : undefined,
        anthology,
        settings: {
          ...latest.content.settings,
          show_markers: showMarkers.checked,
          default_layer_id: defaultLayerId || undefined,
          ink_style: inkStyle
        }
      }
    };
    onChange(next);
    placeStatus.textContent = placeHint;
    paintSelectSurface();
    paintOrphans();
    paintNotePanel();
    remountLists();
    paintVoiceTracks();
  }

  /** Typing in the text editor: save quietly, never remount the editor. */
  function onTextChange(next: typeof textModel): void {
    textModel = next;
    persistQuiet();
    paintOrphans();
    selectDirty = true;
    if (mode === 'annotate') paintSelectSurface();
  }

  let selectDirty = true;

  function mountPoemEditor(): void {
    if (poemEditor) return;
    poemEditor = mountAnnotationPoemEditor({
      text: textModel,
      onText: onTextChange
    });
    poemEditor.el.addEventListener('keydown', (event) => {
      // Escape inside the text must not close the block editor (I8).
      if (event.key === 'Escape') event.stopPropagation();
    });
    textPane.append(poemEditor.el);
  }

  function setMode(next: 'text' | 'annotate'): void {
    mode = next;
    clearPending();
    textPane.hidden = mode !== 'text';
    annotatePane.hidden = mode !== 'annotate';
    if (mode === 'text') {
      mountPoemEditor();
    } else if (selectDirty) {
      paintSelectSurface();
    }
    modePills.sync();
  }

  function voiceLayer(): AnnotationLayer | undefined {
    return layers.find((layer) => layer.kind === 'voice');
  }

  function closeVoiceTools(): void {
    voiceRecorder?.dispose();
    voiceRecorder = null;
    voiceReview?.dispose();
    voiceReview = null;
    reviewingTrackId = null;
    voicePanel.replaceChildren();
    voicePanel.hidden = true;
    listPanel.hidden = !notePanel.hidden;
  }

  /** Voice tools take the column beside the poem; the Record button sits further down, so bring them into view. */
  function showVoicePanel(content: HTMLElement): void {
    if (mode !== 'annotate') setMode('annotate');
    voicePanel.replaceChildren(content);
    voicePanel.hidden = false;
    listPanel.hidden = true;
    voicePanel.scrollIntoView?.({ block: 'nearest' });
  }

  function openVoiceRecorder(): void {
    const layer = voiceLayer();
    if (!layer) {
      placeHint = 'Add a Voice layer before recording.';
      placeStatus.textContent = placeHint;
      return;
    }
    closeVoiceTools();
    selectedAnnotationId = null;
    notePanel.hidden = true;
    voiceRecorder = mountVoiceRecorder({
      layerId: layer.id,
      lessonId: context.lessonId,
      onTrackReady: (track) => {
        voiceTracks = [...voiceTracks.filter((row) => row.id !== track.id), track];
        emitChange();
        openVoiceReview(track.id);
      },
      onCancel: () => {
        closeVoiceTools();
        paintVoiceTracks();
      }
    });
    showVoicePanel(voiceRecorder.el);
    placeHint = 'Recording: tap the poem to pin while you speak.';
    placeStatus.textContent = placeHint;
  }

  function openVoiceReview(trackId: string): void {
    const track = voiceTracks.find((row) => row.id === trackId);
    if (!track) return;
    voiceRecorder?.dispose();
    voiceRecorder = null;
    voiceReview?.dispose();
    reviewingTrackId = trackId;
    selectedAnnotationId = null;
    notePanel.hidden = true;
    voiceReview = mountVoiceReview({
      track,
      text: currentText(),
      onChange: (next) => {
        voiceTracks = voiceTracks.map((row) => (row.id === next.id ? next : row));
        // Avoid full remount loops while typing review actions — patch quietly.
        const latest = getLatest();
        onChange({
          ...latest,
          content: {
            ...latest.content,
            voice_tracks: voiceTracks.length > 0 ? voiceTracks : undefined
          }
        });
        paintVoiceTracks();
      },
      onClose: () => {
        closeVoiceTools();
        paintVoiceTracks();
      }
    });
    showVoicePanel(voiceReview.el);
  }

  function paintVoiceTracks(): void {
    voiceTracksHost.replaceChildren();
    const layer = voiceLayer();
    if (!layer) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'block-editor__annotation-voice-toolbar';
    const label = document.createElement('h3');
    label.className = 'block-editor__annotation-section-title';
    label.textContent = 'Voice';
    const recordBtn = document.createElement('button');
    recordBtn.type = 'button';
    recordBtn.className = 'btn btn--primary';
    recordBtn.textContent = 'Record';
    recordBtn.addEventListener('click', () => openVoiceRecorder());
    toolbar.append(label, recordBtn);
    voiceTracksHost.append(toolbar);

    if (voiceTracks.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'block-editor__hint';
      empty.textContent = 'No recordings yet. Record opens beside the text.';
      voiceTracksHost.append(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'block-editor__annotation-voice-track-list';
    for (const track of voiceTracks) {
      const li = document.createElement('li');
      const meta = document.createElement('span');
      meta.textContent = `${track.title} · ${track.status} · ${track.kind.replace('_', ' ')}`;
      const reviewBtn = document.createElement('button');
      reviewBtn.type = 'button';
      reviewBtn.className = 'btn btn--secondary';
      reviewBtn.textContent = 'Review';
      reviewBtn.addEventListener('click', () => openVoiceReview(track.id));
      li.append(meta, reviewBtn);
      list.append(li);
    }
    voiceTracksHost.append(list);
  }

  async function makeCardFromAnnotation(ann: AnnotationItem): Promise<void> {
    const layer = layers.find((row) => row.id === ann.layer_id);
    if (layer?.kind === 'teacher') return;
    const kinds = cardKindsForAnnotation(ann);
    if (kinds.length === 0) return;

    const kindLabels: Record<FlashcardKind, string> = {
      quote_to_technique: 'Quote → technique',
      find_it: 'Find it',
      line_recall: 'Line recall'
    };
    const kind = (await askSelectCard({
      title: 'Make card',
      choices: kinds.map((value) => ({ value, label: kindLabels[value] }))
    })) as FlashcardKind | null;
    if (!kind) return;

    let fadeLevel: 1 | 2 | undefined;
    if (kind === 'line_recall') {
      const level = await askSelectCard({
        title: 'Fade level',
        choices: [
          { value: '1', label: 'First letters' },
          { value: '2', label: 'First and last words only' }
        ]
      });
      if (!level) return;
      fadeLevel = level === '2' ? 2 : 1;
    }

    const lessonBlocks = context.getLessonBlocks?.() ?? [];
    const targets = listFlashcardTargets(lessonBlocks);
    const choices = [
      ...targets.map((row) => ({ value: row.id, label: row.label })),
      { value: '__new__', label: 'New flashcards block' }
    ];
    const targetId = await askSelectCard({ title: 'Add card to', choices });
    if (!targetId) return;

    const table = await loadLiteraryElements();
    const cardId = nextId(`${getLatest().id}_card`);
    const card = composeCardFromAnnotation({
      annotation: ann,
      block: {
        ...getLatest(),
        content: { ...getLatest().content, layers, annotations }
      },
      lessonId: context.lessonId ?? '',
      kind,
      fadeLevel,
      table,
      cardId
    });
    if (!card) {
      placeHint = 'Could not make that card (technique may be missing).';
      placeStatus.textContent = placeHint;
      return;
    }

    let nextBlocks = [...lessonBlocks];
    if (targetId === '__new__') {
      const fresh = createBlock('flashcards', nextId('block_fc'));
      if (fresh.block_type !== 'flashcards') return;
      fresh.content.cards = [card];
      nextBlocks = [...nextBlocks, fresh];
    } else {
      const target = targets.find((row) => row.id === targetId);
      if (!target || target.full) {
        placeHint = 'That flashcards block is full (20). Choose a new one.';
        placeStatus.textContent = placeHint;
        return;
      }
      nextBlocks = nextBlocks.map((b) => {
        if (b.id !== targetId || b.block_type !== 'flashcards') return b;
        if (b.content.cards.length >= FLASHCARDS_CAP) return b;
        return {
          ...b,
          content: { ...b.content, cards: [...b.content.cards, card] }
        };
      });
    }

    if (context.setLessonBlocks) {
      context.setLessonBlocks(nextBlocks);
      placeHint = 'Card added.';
      placeStatus.textContent = placeHint;
    } else {
      placeHint = 'Open this lesson in the builder to save the card.';
      placeStatus.textContent = placeHint;
    }
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
    const current: AnnotationBlock = {
      ...getLatest(),
      content: { ...getLatest().content, text: currentText(), layers, annotations }
    };
    const orphanList = orphans(current);
    orphansHost.replaceChildren();
    void paintMissingTechniques();

    type OrphanRow = {
      key: string;
      label: string;
      onPick: () => void;
    };
    const rows: OrphanRow[] = orphanList.map((item) => {
      const preview = htmlToPlainText(item.body.html).slice(0, 80);
      return {
        key: item.id,
        label: preview
          ? `"${item.anchor.quote.exact}" — ${preview}`
          : `"${item.anchor.quote.exact}"`,
        onPick: () => {
          reanchorStop = null;
          addingStopForId = null;
          reanchorId = item.id;
          selectedAnnotationId = item.id;
          placeHint = 'Select the text this note should attach to.';
          placeStatus.textContent = placeHint;
          paintNotePanel();
        }
      };
    });

    for (const ann of annotations) {
      if (!(ann.also_anchors?.length ?? 0)) continue;
      const { orphans: stopOrphans } = threadStops(ann, current);
      for (const orphan of stopOrphans) {
        // Primary orphans already appear via orphans(); list extra stops only.
        if (orphan.isPrimary) continue;
        const stop = ann.also_anchors?.find((a) => a.id === orphan.anchorId);
        const quote = stop?.quote.exact ?? orphan.anchorId;
        rows.push({
          key: `${ann.id}:${orphan.anchorId}`,
          label: `"${quote}" — thread stop needs re-anchoring`,
          onPick: () => {
            reanchorId = null;
            addingStopForId = null;
            reanchorStop = {
              annotationId: ann.id,
              stopId: orphan.anchorId,
              isPrimary: false
            };
            selectedAnnotationId = ann.id;
            placeHint = 'Select the text this stop should attach to.';
            placeStatus.textContent = placeHint;
            paintNotePanel();
          }
        });
      }
    }

    if (rows.length === 0) return;
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-orphans-title';
    heading.textContent = 'Needs re-anchoring';
    const list = document.createElement('ul');
    list.className = 'block-editor__annotation-orphans-list';
    for (const row of rows) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-editor__annotation-orphan';
      btn.textContent = row.label;
      btn.addEventListener('click', row.onPick);
      li.append(btn);
      list.append(li);
    }
    orphansHost.append(heading, list);
  }

  function blockAnthologyPayload(): AnnotationBlock['content']['anthology'] {
    const themes = parseTagInput(blockThemes.value);
    const concepts = parseTagInput(blockConcepts.value);
    const include = blockAnthologyToggle.checked;
    if (!include && themes.length === 0 && concepts.length === 0) return undefined;
    return { include, themes, concepts };
  }

  function persistQuiet(): void {
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
        anthology: blockAnthologyPayload(),
        settings: {
          ...latest.content.settings,
          show_markers: showMarkers.checked,
          default_layer_id: defaultLayerId || undefined,
          ink_style: inkStyle
        }
      }
    });
  }

  /** Everything except the name. A rename can save without rebuilding the editor. */
  function sameLayerStructure(a: AnnotationLayer, b: AnnotationLayer): boolean {
    if (
      a.id !== b.id ||
      a.kind !== b.kind ||
      a.colour !== b.colour ||
      a.family !== b.family ||
      a.symbol !== b.symbol
    ) {
      return false;
    }
    const aSubs = a.sublayers ?? [];
    const bSubs = b.sublayers ?? [];
    if (aSubs.length !== bSubs.length) return false;
    return aSubs.every(
      (sub, index) =>
        sub.id === bSubs[index]!.id &&
        sub.name === bSubs[index]!.name &&
        sub.subgroup === bSubs[index]!.subgroup
    );
  }

  function layerEditNeedsRepaint(prev: AnnotationLayer[], next: AnnotationLayer[]): boolean {
    if (prev.length !== next.length) return true;
    return prev.some((layer, index) => !sameLayerStructure(layer, next[index]!));
  }

  /** Row titles and layer pickers show the name. Update them without rebuilding the editor. */
  function syncLayerNamesInPlace(): void {
    for (const row of layersHost.querySelectorAll<HTMLElement>(
      '.block-editor__annotation-layer-list .hub-list__row'
    )) {
      const layer = layers.find((item) => item.id === row.dataset.key);
      const label = row.querySelector('.hub-list__label');
      if (layer && label) label.textContent = layer.name;
    }
    const selects = [
      defaultLayer,
      notePanel.querySelector<HTMLSelectElement>('select[aria-label="Annotation layer"]')
    ];
    for (const select of selects) {
      if (!select) continue;
      for (const opt of select.options) {
        const layer = layers.find((item) => item.id === opt.value);
        if (layer) opt.textContent = layer.name;
      }
    }
  }

  function kindChoicesFor(layer: AnnotationLayer): AnnotationLayerKind[] {
    const choices: AnnotationLayerKind[] = [];
    if (layer.kind === 'family') choices.push('family');
    choices.push('free', 'lens');
    if (!layers.some((row) => row.kind === 'teacher' && row.id !== layer.id)) {
      choices.push('teacher');
    }
    if (!layers.some((row) => row.kind === 'voice' && row.id !== layer.id)) {
      choices.push('voice');
    }
    return choices;
  }

  /** Kind stays editable. Leaving teacher, voice, or a Periodic Table layer asks first when that would expose notes, drop recordings, or remove subgroups. */
  async function commitLayerKind(layerId: string, nextKind: AnnotationLayerKind): Promise<boolean> {
    const layer = layers.find((row) => row.id === layerId);
    if (!layer || layer.kind === nextKind) return false;

    if (layer.kind === 'teacher' && annotations.some((ann) => ann.layer_id === layer.id)) {
      const confirmed = await askSelectCard({
        title: 'Change teacher notes?',
        supporting: 'Notes on this layer will show to students.',
        choices: [
          { value: 'change', label: 'Change it' },
          { value: 'keep', label: 'Keep teacher notes' }
        ]
      });
      if (confirmed !== 'change') return false;
    }

    if (layer.kind === 'voice' && voiceTracks.some((track) => track.layer_id === layer.id)) {
      const confirmed = await askSelectCard({
        title: 'Change this voice layer?',
        supporting: 'Recordings on this layer will be removed.',
        choices: [
          { value: 'change', label: 'Change it' },
          { value: 'keep', label: 'Keep voice' }
        ]
      });
      if (confirmed !== 'change') return false;
      voiceTracks = voiceTracks.filter((track) => track.layer_id !== layer.id);
      if (reviewingTrackId && !voiceTracks.some((track) => track.id === reviewingTrackId)) {
        closeVoiceTools();
      }
    }

    if (layer.kind === 'family' && (layer.sublayers?.length ?? 0) > 0) {
      const confirmed = await askSelectCard({
        title: 'Change this Periodic Table layer?',
        supporting: 'Its subgroups will be removed.',
        choices: [
          { value: 'change', label: 'Change it' },
          { value: 'keep', label: 'Keep this layer' }
        ]
      });
      if (confirmed !== 'change') return false;
    }

    if (layer.kind === 'family') {
      annotations = annotations.map((ann) => {
        if (ann.layer_id !== layer.id || !ann.sublayer_id) return ann;
        const { sublayer_id: _drop, ...rest } = ann;
        return { ...rest, updated_at: nowIso() };
      });
    }

    layers = layers.map((row) => {
      if (row.id !== layer.id) return row;
      const next: AnnotationLayer = { ...row, kind: nextKind };
      if (layer.kind === 'family') {
        delete next.family;
        delete next.sublayers;
      }
      return next;
    });
    paintDefaultLayerOptions();
    emitChange();
    return true;
  }

  function beginAddStop(annotationId: string): void {
    addingStopForId = annotationId;
    reanchorId = null;
    reanchorStop = null;
    selectedAnnotationId = annotationId;
    placeHint = 'Select another place for this thread.';
    placeStatus.textContent = placeHint;
    paintNotePanel();
  }

  function applyStopRows(annotationId: string, rows: StopRow[], custom: boolean): void {
    annotations = annotations.map((ann) => {
      if (ann.id !== annotationId) return ann;
      if (rows.length === 0) return ann;
      // Exactly one primary: prefer the flagged row, else the first.
      const primaryIndex = Math.max(
        0,
        rows.findIndex((row) => row.isPrimary)
      );
      const primaryRow = rows[primaryIndex]!;
      const alsoRows = rows.filter((_, index) => index !== primaryIndex);
      if (alsoRows.length === 0) {
        return clearThreadFields({
          ...ann,
          anchor: primaryRow.anchor
        });
      }
      const ids = rows.map((row) => row.id);
      const thread: AnnotationThread = {
        ...(ann.thread ?? {}),
        order: custom ? 'custom' : 'text'
      };
      if (custom) thread.anchor_order = ids;
      else delete thread.anchor_order;
      return {
        ...ann,
        anchor: ensureAnchorId(primaryRow.anchor, primaryRow.id),
        also_anchors: alsoRows.map((row) => ensureAnchorId(row.anchor, row.id)),
        thread,
        updated_at: nowIso()
      };
    });
    emitChange();
  }

  function applySelection(selection: BuildAnchorSelection, layerId?: string): void {
    const text = currentText();
    const anchor = buildAnchor(text, selection);
    if (!anchor) {
      placeHint = 'Could not place a note on that selection.';
      placeStatus.textContent = placeHint;
      return;
    }

    if (voiceRecorder?.isCapturing()) {
      voiceRecorder.pushTap(anchor);
      return;
    }

    const stamp = nowIso();

    if (reanchorStop) {
      const target = reanchorStop;
      annotations = annotations.map((ann) => {
        if (ann.id !== target.annotationId) return ann;
        if (target.isPrimary) {
          return {
            ...ann,
            anchor: ensureAnchorId(
              { ...anchor, note_html: ann.anchor.note_html },
              ann.anchor.id ?? target.stopId
            ),
            updated_at: stamp
          };
        }
        return {
          ...ann,
          also_anchors: (ann.also_anchors ?? []).map((row) =>
            row.id === target.stopId
              ? ensureAnchorId(
                  { ...anchor, note_html: row.note_html, id: target.stopId },
                  target.stopId
                )
              : row
          ),
          updated_at: stamp
        };
      });
      selectedAnnotationId = target.annotationId;
      reanchorStop = null;
      placeHint = '';
      emitChange();
      return;
    }

    if (reanchorId) {
      annotations = annotations.map((ann) =>
        ann.id === reanchorId
          ? {
              ...ann,
              anchor: ensureAnchorId(
                { ...anchor, note_html: ann.anchor.note_html },
                ann.anchor.id ?? `${ann.id}:primary`
              ),
              updated_at: stamp
            }
          : ann
      );
      selectedAnnotationId = reanchorId;
      reanchorId = null;
      placeHint = '';
      emitChange();
      return;
    }

    if (addingStopForId) {
      const targetId = addingStopForId;
      annotations = annotations.map((ann) => {
        if (ann.id !== targetId) return ann;
        const primary = ensureAnchorId(ann.anchor, `${ann.id}:primary`);
        const stopId = nextId(`${ann.id}_stop`);
        const nextAlso = [...(ann.also_anchors ?? []), { ...anchor, id: stopId }];
        return {
          ...ann,
          anchor: primary,
          also_anchors: nextAlso,
          thread: {
            ...(ann.thread ?? {}),
            order: ann.thread?.order ?? 'text',
            ...(ann.thread?.order === 'custom'
              ? {
                  anchor_order: [
                    ...(ann.thread.anchor_order ?? [
                      primary.id!,
                      ...nextAlso.slice(0, -1).map((row) => row.id!)
                    ]),
                    stopId
                  ]
                }
              : {})
          },
          updated_at: stamp
        };
      });
      selectedAnnotationId = targetId;
      addingStopForId = null;
      placeHint = '';
      emitChange();
      return;
    }

    const layer =
      (layerId && layers.find((row) => row.id === layerId)) ||
      (activeLayerId && layers.find((row) => row.id === activeLayerId)) ||
      ensureLayer();
    activeLayerId = layer.id;
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
    placeHint = 'Note added. Write it in the panel.';
    emitChange();
    tipTap?.editor.commands.focus('end');
  }

  function paintSelectSurface(): void {
    selectDirty = false;
    const text = currentText();
    const scrollTop = selectSurface.scrollTop;
    selectSurface.replaceChildren();
    clearPending();
    closeBarMenu();

    if (!hasText()) {
      const empty = document.createElement('div');
      empty.className = 'block-editor__annotation-select-empty';
      const msg = document.createElement('p');
      msg.className = 'block-editor__hint';
      msg.textContent = 'There is no text to annotate yet.';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn btn--secondary';
      go.textContent = 'Add the text';
      go.addEventListener('click', () => {
        setMode('text');
        poemEditor?.focus();
      });
      empty.append(msg, go);
      selectSurface.append(empty);
      return;
    }

    // Where existing notes sit, so the teacher can see and reopen them.
    const spansByLine = new Map<string, Array<{ start: number; end: number; ann: AnnotationItem }>>();
    const notedLines = new Map<string, AnnotationItem[]>();
    const notedStanzas = new Map<string, AnnotationItem[]>();
    const push = <T,>(map: Map<string, T[]>, key: string, value: T) => {
      const list = map.get(key) ?? [];
      list.push(value);
      map.set(key, list);
    };
    const pushOnce = (map: Map<string, AnnotationItem[]>, key: string, ann: AnnotationItem) => {
      if (!(map.get(key) ?? []).some((row) => row.id === ann.id)) push(map, key, ann);
    };
    for (const ann of annotations) {
      // A thread's other places are clickable too, not only its first one.
      for (const anchor of [ann.anchor, ...(ann.also_anchors ?? [])]) {
        const resolved = resolveAnnotation(text, { ...ann, anchor, also_anchors: undefined });
        if (resolved.status !== 'ok') continue;
        if (resolved.granularity === 'stanza') pushOnce(notedStanzas, resolved.stanzaId, ann);
        else if (resolved.granularity === 'line' && resolved.lineId) {
          pushOnce(notedLines, resolved.lineId, ann);
        } else if (resolved.lineId && resolved.start != null && resolved.end != null) {
          push(spansByLine, resolved.lineId, { start: resolved.start, end: resolved.end, ann });
        }
      }
    }
    const layerColour = (ann: AnnotationItem) =>
      layers.find((layer) => layer.id === ann.layer_id)?.colour ?? 'wave';
    const picking = () => Boolean(reanchorId || reanchorStop || addingStopForId);

    for (const stanza of text.stanzas) {
      const stanzaEl = document.createElement('div');
      stanzaEl.className = 'block-editor__annotation-stanza';
      stanzaEl.dataset.stanzaId = stanza.id;

      const stanzaNotes = notedStanzas.get(stanza.id) ?? [];
      const gutter = document.createElement('button');
      gutter.type = 'button';
      gutter.className = 'block-editor__annotation-stanza-gutter';
      paintBarNotes(gutter, stanzaNotes, 'stanza');
      gutter.addEventListener('click', () => {
        const selection = { stanzaId: stanza.id, wholeStanza: true };
        if (stanzaNotes.length > 0 && !picking()) {
          openBarMenu(gutter, stanzaNotes, selection, 'stanza');
          return;
        }
        applySelection(selection);
      });
      stanzaEl.append(gutter);

      const lines = document.createElement('div');
      lines.className = 'block-editor__annotation-lines';
      for (const line of stanza.lines) {
        const row = document.createElement('div');
        row.className = 'block-editor__annotation-line';
        row.dataset.lineId = line.id;
        row.dataset.stanzaId = stanza.id;

        const lineNotes = notedLines.get(line.id) ?? [];
        const margin = document.createElement('button');
        margin.type = 'button';
        margin.className = 'block-editor__annotation-line-gutter';
        paintBarNotes(margin, lineNotes, 'line');
        margin.addEventListener('click', () => {
          const selection = { stanzaId: stanza.id, lineId: line.id, wholeLine: true };
          if (lineNotes.length > 0 && !picking()) {
            openBarMenu(margin, lineNotes, selection, 'line');
            return;
          }
          applySelection(selection);
        });

        const textEl = document.createElement('p');
        textEl.className = 'block-editor__annotation-line-text';
        textEl.dataset.stanzaId = stanza.id;
        textEl.dataset.lineId = line.id;
        const spans: LineSpan[] = mergeOverlapping(spansByLine.get(line.id) ?? []).map((group) => ({
          start: group.start,
          end: group.end,
          wrap: () => {
            const first = group.anns[0]!;
            const mark = document.createElement('mark');
            mark.className = `block-editor__annotation-hl block-editor__annotation-hl--${layerColour(first)}`;
            if (group.anns.some((ann) => ann.id === selectedAnnotationId)) {
              mark.classList.add('is-selected');
            }
            mark.dataset.annotationId = first.id;
            mark.dataset.annotationIds = group.anns.map((ann) => ann.id).join(' ');
            if (group.anns.length > 1) {
              mark.classList.add('has-several');
              mark.dataset.noteCount = String(group.anns.length);
              mark.title = `${group.anns.length} notes here: click to choose one`;
            } else {
              mark.title = 'Click to open this note';
            }
            return mark;
          }
        }));
        textEl.append(renderFormattedLine(line, spans));
        applyLineLayout(textEl, line);

        row.append(margin, textEl);
        lines.append(row);
      }
      stanzaEl.append(lines);
      selectSurface.append(stanzaEl);
    }
    selectSurface.scrollTop = scrollTop;
  }

  /** A noted bar shows one stripe per note, in that note's layer colour. */
  function paintBarNotes(
    bar: HTMLButtonElement,
    notes: AnnotationItem[],
    scope: 'line' | 'stanza'
  ): void {
    const where = scope === 'line' ? 'line' : 'stanza';
    const label =
      notes.length === 0
        ? `Add a note to this whole ${where}`
        : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'} on this ${where}: open one or add another`;
    bar.setAttribute('aria-label', label);
    bar.title = label;
    if (notes.length === 0) return;
    bar.classList.add('has-note');
    bar.setAttribute('aria-haspopup', 'menu');
    bar.dataset.noteCount = String(notes.length);
    const step = 100 / notes.length;
    const stops = notes.map((ann, i) => {
      const colour = layers.find((layer) => layer.id === ann.layer_id)?.colour ?? 'wave';
      return `var(--${colour}) ${i * step}% ${(i + 1) * step}%`;
    });
    bar.style.background = `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  function closeBarMenu(): void {
    document.querySelectorAll('.block-editor__annotation-bar-menu').forEach((menu) => menu.remove());
    document.removeEventListener('pointerdown', onBarMenuOutside, true);
    window.removeEventListener('scroll', closeBarMenu, { capture: true });
  }

  function onBarMenuOutside(event: Event): void {
    const target = event.target as Node;
    const menu = document.querySelector('.block-editor__annotation-bar-menu');
    if (menu && !menu.contains(target)) closeBarMenu();
  }

  /** A line or stanza can carry several notes (grammar, sound, …): open one or add another. */
  function openBarMenu(
    bar: HTMLElement,
    notes: AnnotationItem[],
    selection: BuildAnchorSelection | null,
    scope: 'line' | 'stanza' | 'words'
  ): void {
    closeBarMenu();
    const menu = document.createElement('div');
    menu.className = 'block-editor__annotation-bar-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Notes on this ${scope}`);

    const heading = document.createElement('p');
    heading.className = 'block-editor__annotation-bar-menu-heading';
    heading.textContent = scope === 'words' ? 'Notes on these words' : `Notes on this ${scope}`;
    menu.append(heading);

    for (const ann of notes) {
      const layer = layers.find((row) => row.id === ann.layer_id);
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.className = `block-editor__annotation-bar-menu-item block-editor__annotation-bar-menu-item--${layer?.colour ?? 'wave'}`;
      const name = document.createElement('span');
      name.className = 'block-editor__annotation-bar-menu-layer';
      const stops = ann.also_anchors?.length ?? 0;
      name.textContent = stops > 0
        ? `${layer?.name ?? 'Note'} · Thread, ${stops + 1} places`
        : layer?.name ?? 'Note';
      const preview = document.createElement('span');
      preview.className = 'block-editor__annotation-bar-menu-preview';
      preview.textContent = htmlToPlainText(ann.body.html).trim() || 'Empty note';
      item.append(name, preview);
      item.addEventListener('click', () => {
        closeBarMenu();
        openNote(ann.id);
      });
      menu.append(item);
    }

    if (selection) {
      const addRow = document.createElement('div');
      const addLabel = document.createElement('p');
      addLabel.className = 'block-editor__annotation-bar-menu-heading';
      addLabel.textContent = 'Add another note';
      menu.append(addLabel);
      addRow.className = 'block-editor__annotation-bar-menu-add';
      const addable = layers.filter((layer) => layer.kind !== 'voice');
      const targets: Array<AnnotationLayer | undefined> = addable.length > 0 ? addable : [undefined];
      for (const layer of targets) {
        const add = document.createElement('button');
        add.type = 'button';
        add.setAttribute('role', 'menuitem');
        add.className = `block-editor__annotation-bar-menu-new block-editor__annotation-bar-menu-new--${layer?.colour ?? 'wave'}`;
        add.textContent = layer ? `+ ${layer.name}` : '+ Note';
        add.setAttribute('aria-label', layer ? `Add a ${layer.name} note to this ${scope}` : `Add a note to this ${scope}`);
        add.addEventListener('click', () => {
          closeBarMenu();
          applySelection(selection, layer?.id);
        });
        addRow.append(add);
      }
      menu.append(addRow);
    }

    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeBarMenu();
        bar.focus();
      }
    });

    // Sit beside the bar; flip up when the bar is near the bottom of the window.
    document.body.append(menu);
    const rect = bar.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const below = rect.top + menuHeight + 8 <= window.innerHeight;
    menu.style.left = `${Math.round(rect.right + 8)}px`;
    menu.style.top = `${Math.round(below ? rect.top : Math.max(8, rect.bottom - menuHeight))}px`;
    document.addEventListener('pointerdown', onBarMenuOutside, true);
    window.addEventListener('scroll', closeBarMenu, { capture: true, once: true });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function openNote(id: string): void {
    selectedAnnotationId = id;
    const opened = annotations.find((ann) => ann.id === id);
    if (opened && opened.layer_id !== activeLayerId) {
      activeLayerId = opened.layer_id;
      remountLists();
    }
    clearPending();
    paintNotePanel();
    selectSurface
      .querySelectorAll('.block-editor__annotation-hl.is-selected')
      .forEach((el) => el.classList.remove('is-selected'));
    selectSurface
      .querySelectorAll(`.block-editor__annotation-hl[data-annotation-id="${id}"]`)
      .forEach((el) => el.classList.add('is-selected'));
  }

  function readSelection(): BuildAnchorSelection | 'multi' | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
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
    if (!startLine || !endLine) return null;
    if (!selectSurface.contains(startLine)) return null;
    if (startLine !== endLine) return 'multi';
    const stanzaId = startLine.dataset.stanzaId;
    const lineId = startLine.dataset.lineId;
    if (!stanzaId || !lineId) return null;
    const start = textOffsetWithin(startLine, range.startContainer, range.startOffset);
    const end = textOffsetWithin(startLine, range.endContainer, range.endOffset);
    if (start == null || end == null || start === end) return null;
    // Trim spaces the drag picked up at either edge.
    const lineText =
      currentText()
        .stanzas.find((st) => st.id === stanzaId)
        ?.lines.find((ln) => ln.id === lineId)?.text ?? '';
    let a = Math.min(start, end);
    let b = Math.max(start, end);
    while (a < b && /\s/.test(lineText[a] ?? '')) a += 1;
    while (b > a && /\s/.test(lineText[b - 1] ?? '')) b -= 1;
    if (a >= b) return null;
    return { stanzaId, lineId, start: a, end: b };
  }

  function wholeLineSelection(lineEl: HTMLElement): BuildAnchorSelection | null {
    const { stanzaId, lineId } = lineEl.dataset;
    if (!stanzaId || !lineId || !selectSurface.contains(lineEl)) return null;
    const lineText =
      currentText()
        .stanzas.find((st) => st.id === stanzaId)
        ?.lines.find((ln) => ln.id === lineId)?.text ?? '';
    const start = lineText.length - lineText.trimStart().length;
    const end = lineText.trimEnd().length;
    if (start >= end) return null;
    return { stanzaId, lineId, start, end };
  }

  function placeAddNoteButton(): void {
    const sel = window.getSelection();
    const wrapRect = selectWrap.getBoundingClientRect();
    let top = 8;
    let left = 8;
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        top = rect.bottom - wrapRect.top + 6;
        left = Math.max(0, Math.min(rect.left - wrapRect.left, wrapRect.width - 140));
      }
    }
    addNoteFloat.style.top = `${top}px`;
    addNoteFloat.style.left = `${left}px`;
    addNoteFloat.hidden = false;
  }

  function onSurfacePointerUp(event: Event): void {
    const picked = readSelection();
    if (picked === 'multi') {
      placeHint = 'Highlight words within one line, or use the bar on the left for a whole line or stanza.';
      placeStatus.textContent = placeHint;
      clearPending();
      return;
    }
    if (!picked && voiceRecorder?.isCapturing()) {
      // While recording, a plain tap pins the whole line it lands on.
      const lineEl = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '.block-editor__annotation-line-text'
      );
      const tapped = lineEl ? wholeLineSelection(lineEl) : null;
      if (tapped) applySelection(tapped);
      return;
    }
    if (!picked) {
      // A plain click on highlighted words reopens their note.
      const hl = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '.block-editor__annotation-hl'
      );
      const ids = (hl?.dataset.annotationIds ?? hl?.dataset.annotationId ?? '')
        .split(' ')
        .filter(Boolean);
      if (ids.length > 1 && hl) {
        const notes = ids
          .map((id) => annotations.find((ann) => ann.id === id))
          .filter((ann): ann is AnnotationItem => Boolean(ann));
        openBarMenu(hl, notes, null, 'words');
      } else if (ids[0]) openNote(ids[0]);
      else clearPending();
      return;
    }
    // Re-anchoring, adding a thread stop or pinning a voice tap: the teacher
    // already asked to pick a place, so apply straight away.
    if (reanchorId || reanchorStop || addingStopForId || voiceRecorder?.isCapturing()) {
      applySelection(picked);
      window.getSelection()?.removeAllRanges();
      return;
    }
    pendingSelection = picked;
    const quote = currentText()
      .stanzas.find((st) => st.id === picked.stanzaId)
      ?.lines.find((ln) => ln.id === picked.lineId)
      ?.text.slice(picked.start, picked.end);
    addNoteFloat.title = quote ? `Add a note on “${quote}”` : 'Add a note';
    placeAddNoteButton();
  }

  selectSurface.addEventListener('mouseup', onSurfacePointerUp);
  selectSurface.addEventListener('scroll', () => {
    if (pendingSelection) placeAddNoteButton();
  });
  selectSurface.addEventListener('touchend', (event) => {
    // Let the OS finish the selection before reading it.
    window.setTimeout(() => onSurfacePointerUp(event), 0);
  });
  selectSurface.addEventListener('keyup', (event) => {
    if (event.key.startsWith('Arrow') || event.key === 'Shift') onSurfacePointerUp(event);
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
    rememberView();
    listPanel.hidden = Boolean(selected) || !voicePanel.hidden;
    if (!selected) {
      notePanel.hidden = true;
      return;
    }
    notePanel.hidden = false;

    const header = document.createElement('div');
    header.className = 'block-editor__annotation-note-header';
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-note-title';
    const granularity = selected.anchor.granularity;
    heading.textContent =
      granularity === 'stanza'
        ? 'Note on this stanza'
        : granularity === 'line'
          ? 'Note on this line'
          : 'Note on';
    const actions = document.createElement('div');
    actions.className = 'block-editor__annotation-note-actions';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className =
      'hub-action-menu__item hub-action-menu__item--danger hub-action-menu__item--hold block-editor__annotation-note-delete';
    remove.setAttribute('aria-label', 'Delete note. Press and hold to confirm');
    const removeIcon = document.createElement('span');
    removeIcon.className = 'hub-action-menu__icon';
    removeIcon.innerHTML = HUB_LIST_ICONS.trash;
    const removeLabel = document.createElement('span');
    removeLabel.className = 'hub-action-menu__label';
    removeLabel.textContent = 'Delete note';
    const removeHint = document.createElement('span');
    removeHint.className = 'hub-action-menu__hint';
    removeHint.textContent = 'Hold';
    remove.append(removeIcon, removeLabel, removeHint);
    const noteId = selected.id;
    bindHoldToConfirm(remove, {
      onConfirm: () => {
        const index = annotations.findIndex((ann) => ann.id === noteId);
        if (index < 0) return;
        const gone = annotations[index]!;
        annotations = annotations.filter((ann) => ann.id !== noteId);
        if (selectedAnnotationId === noteId) selectedAnnotationId = null;
        emitChange();
        const quote = gone.anchor.quote.exact.split('\n')[0]?.slice(0, 40) || 'Note';
        offerTimedUndo({
          message: `${quote} deleted`,
          onUndo: () => {
            const at = Math.min(index, annotations.length);
            annotations = [...annotations.slice(0, at), gone, ...annotations.slice(at)];
            selectedAnnotationId = gone.id;
            emitChange();
          }
        });
        annotationsHost
          .querySelector<HTMLButtonElement>('.block-editor__annotation-ann-list .hub-list__add')
          ?.focus();
      },
      onEarlyRelease: () => {
        removeHint.textContent = 'Keep holding';
        remove.classList.add('is-nudged');
      }
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-editor__annotation-note-close';
    const closeLayer = layers.find((layer) => layer.id === activeLayerId);
    close.textContent = closeLayer ? `← ${closeLayer.name} notes` : '← All notes';
    close.addEventListener('click', () => {
      selectedAnnotationId = null;
      paintNotePanel();
      paintSelectSurface();
    });
    actions.append(remove, close);
    header.append(heading, actions);

    const quote = document.createElement('blockquote');
    quote.className = 'block-editor__annotation-note-quote';
    const quoteText = selected.anchor.quote.exact;
    quote.textContent = quoteText.length > 160 ? `${quoteText.slice(0, 160)}…` : quoteText;

    const layerLabel = document.createElement('label');
    layerLabel.className = 'block-editor__annotation-layer-pick';
    layerLabel.textContent = 'Layer';
    layerLabel.title = 'Layers group notes. Students reveal one layer at a time.';
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
    // One layer: nothing to choose, so don't show the control.
    layerLabel.hidden = layers.length <= 1;

    const bodyLabel = document.createElement('p');
    bodyLabel.className = 'block-editor__annotation-field-label';
    bodyLabel.textContent = 'Your note';

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
        persistQuiet();
      }
    });
    tipTap.host.classList.add('block-editor__annotation-body');

    const anthologyHost = document.createElement('div');
    anthologyHost.className = 'block-editor__annotation-anthology';
    const includeToggle = document.createElement('input');
    includeToggle.type = 'checkbox';
    includeToggle.className = 'block-editor__annotation-anthology-include';
    includeToggle.checked = selected.anthology?.include === true;
    includeToggle.setAttribute('aria-label', 'Add to unit anthology');
    const includeLabel = document.createElement('label');
    includeLabel.className = 'block-editor__annotation-anthology-label';
    includeLabel.append(includeToggle, document.createTextNode(' Add to unit anthology'));
    const themesInput = document.createElement('input');
    themesInput.type = 'text';
    themesInput.className = 'block-editor__annotation-anthology-themes';
    themesInput.value = (selected.anthology?.themes ?? []).join(', ');
    themesInput.placeholder = 'Themes (comma-separated)';
    themesInput.setAttribute('aria-label', 'Anthology themes');
    const conceptsInput = document.createElement('input');
    conceptsInput.type = 'text';
    conceptsInput.className = 'block-editor__annotation-anthology-concepts';
    conceptsInput.value = (selected.anthology?.concepts ?? []).join(', ');
    conceptsInput.placeholder = 'Concepts (comma-separated)';
    conceptsInput.setAttribute('aria-label', 'Anthology concepts');
    const patchAnthology = () => {
      const themes = parseTagInput(themesInput.value);
      const concepts = parseTagInput(conceptsInput.value);
      const include = includeToggle.checked;
      themesInput.value = themes.join(', ');
      conceptsInput.value = concepts.join(', ');
      annotations = annotations.map((ann) =>
        ann.id === selected.id
          ? {
              ...ann,
              anthology:
                include || themes.length > 0 || concepts.length > 0
                  ? { include, themes, concepts }
                  : undefined,
              updated_at: nowIso()
            }
          : ann
      );
      emitChange();
    };
    includeToggle.addEventListener('change', patchAnthology);
    themesInput.addEventListener('change', patchAnthology);
    conceptsInput.addEventListener('change', patchAnthology);
    const anthologyDetails = document.createElement('details');
    anthologyDetails.className = 'block-editor__annotation-anthology-details';
    anthologyDetails.open = selected.anthology?.include === true;
    const anthologySummary = document.createElement('summary');
    anthologySummary.textContent = 'Unit anthology';
    anthologyDetails.append(anthologySummary, includeLabel, themesInput, conceptsInput);
    anthologyHost.append(anthologyDetails);

    techniquePicker.replaceChildren();
    const techLabel = document.createElement('p');
    techLabel.className = 'block-editor__annotation-field-label';
    techLabel.textContent = 'Technique';
    const techCardHost = document.createElement('div');
    techCardHost.className = 'block-editor__annotation-technique-card';
    if (selected.technique?.id) {
      const techniqueId = selected.technique.id;
      void loadLiteraryElements().then((table) => {
        const technique = lookupTechnique(table, techniqueId);
        if (technique) techCardHost.replaceChildren(renderElementCard(technique, table));
      });
    }
    const techBtn = document.createElement('button');
    techBtn.type = 'button';
    techBtn.className = 'btn btn--secondary block-editor__annotation-technique-btn';
    techBtn.textContent = selected.technique?.id
      ? 'Change technique'
      : 'Tag a technique from the Periodic Table';
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
      clear.className = 'btn btn--ghost block-editor__annotation-technique-clear';
      clear.textContent = 'Remove technique';
      clear.addEventListener('click', () => {
        annotations = annotations.map((ann) =>
          ann.id === selected.id
            ? { ...ann, technique: undefined, updated_at: nowIso() }
            : ann
        );
        emitChange();
      });
      techniquePicker.append(techLabel, techCardHost, techBtn, clear);
    } else {
      techniquePicker.append(techLabel, techBtn);
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

    const threadHost = document.createElement('div');
    threadHost.className = 'block-editor__annotation-thread';

    const addPlace = document.createElement('button');
    addPlace.type = 'button';
    addPlace.className = 'block-editor__annotation-add-place';
    addPlace.textContent =
      addingStopForId === selected.id
        ? 'Now highlight the other place in the text…'
        : 'Link another place (thread)';
    addPlace.title = 'Join this note to more places in the text, e.g. a repeated image.';
    addPlace.disabled = addingStopForId === selected.id;
    addPlace.addEventListener('click', () => beginAddStop(selected.id));
    threadHost.append(addPlace);

    const isThread = (selected.also_anchors?.length ?? 0) > 0;
    if (isThread) {
      const titleLabel = document.createElement('label');
      titleLabel.className = 'block-editor__annotation-thread-title';
      const titleText = document.createElement('span');
      titleText.className = 'block-editor__hint';
      titleText.textContent = 'Thread title: what links these places? Students see this on the thread button.';
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.maxLength = 80;
      titleInput.placeholder = 'e.g. Clinical, cold words';
      titleInput.value = selected.thread?.title ?? '';
      titleInput.addEventListener('change', () => {
        const title = titleInput.value.trim();
        annotations = annotations.map((ann) => {
          if (ann.id !== selected.id) return ann;
          const thread: AnnotationThread = { ...(ann.thread ?? { order: 'text' }) };
          if (title) thread.title = title;
          else delete thread.title;
          return { ...ann, thread, updated_at: nowIso() };
        });
        emitChange();
      });
      titleLabel.append(titleText, titleInput);
      threadHost.append(titleLabel);

      const kindLabel = document.createElement('p');
      kindLabel.className = 'block-editor__hint';
      kindLabel.textContent = 'Thread kind';

      const kindPills = document.createElement('div');
      kindPills.className = 'hub-pills block-editor__annotation-thread-kind';
      kindPills.setAttribute('role', 'group');
      kindPills.setAttribute('aria-label', 'Thread kind');
      const activeKind = selected.thread?.kind;
      for (const option of THREAD_KINDS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hub-pills__btn';
        btn.textContent = option.label;
        btn.setAttribute('aria-pressed', String(option.value === activeKind));
        if (option.value === activeKind) btn.classList.add('is-active');
        btn.addEventListener('click', () => {
          annotations = annotations.map((ann) =>
            ann.id === selected.id
              ? {
                  ...ann,
                  thread: { ...(ann.thread ?? { order: 'text' }), kind: option.value },
                  updated_at: nowIso()
                }
              : ann
          );
          emitChange();
        });
        kindPills.append(btn);
      }
      requestAnimationFrame(() => applyHubPillsThumb(kindPills));

      const stopsHost = document.createElement('div');
      stopsHost.className = 'block-editor__annotation-stops';
      const rows = stopRowsOf(selected);
      const stopList = createHubList<StopRow>({
        items: rows,
        noun: 'stop',
        label: 'Thread stops',
        getKey: (row) => row.id,
        itemLabel: (row, index) =>
          row.isPrimary ? `Primary · stop ${index + 1}` : `Stop ${index + 1}`,
        describe: (row) => row.anchor.quote.exact.slice(0, 40) || 'Stop',
        min: 1,
        max: 25,
        insertBetween: false,
        create: () => {
          beginAddStop(selected.id);
          return null as unknown as StopRow;
        },
        read: () => {
          const live = annotations.find((ann) => ann.id === selected.id);
          return live ? stopRowsOf(live) : rows;
        },
        onChange: (next) => {
          if (next.length <= 1) {
            applyStopRows(selected.id, next, false);
            return;
          }
          const prevIds = rows.map((row) => row.id);
          const nextIds = next.map((row) => row.id);
          const sameSet =
            prevIds.length === nextIds.length &&
            prevIds.every((id) => nextIds.includes(id));
          const reordered = sameSet && prevIds.join() !== nextIds.join();
          const keepCustom = selected.thread?.order === 'custom';
          applyStopRows(
            selected.id,
            next,
            reordered || (keepCustom && nextIds.length > 1)
          );
        },
        extraMenuItems: () => {
          if (selected.thread?.order !== 'custom') return [];
          return [
            {
              label: 'Back to text order',
              dataset: { listAction: 'text-order' },
              onSelect: () => {
                annotations = annotations.map((ann) => {
                  if (ann.id !== selected.id || !ann.thread) return ann;
                  const thread: AnnotationThread = {
                    ...ann.thread,
                    order: 'text'
                  };
                  delete thread.anchor_order;
                  return { ...ann, thread, updated_at: nowIso() };
                });
                emitChange();
              }
            }
          ];
        },
        renderItem: (row) => {
          const wrap = document.createElement('div');
          wrap.className = 'block-editor__annotation-stop';
          const quote = document.createElement('p');
          quote.className = 'block-editor__hint';
          quote.textContent = `"${row.anchor.quote.exact}"${row.isPrimary ? ' · primary' : ''}`;
          const note = document.createElement('textarea');
          note.className = 'block-editor__annotation-stop-note';
          note.rows = 2;
          note.setAttribute('aria-label', 'Stop note');
          note.placeholder = 'Optional stop note';
          note.value = htmlToPlainText(row.anchor.note_html ?? '');
          note.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') event.stopPropagation();
          });
          note.addEventListener('input', () => {
            const noteHtml = note.value;
            annotations = annotations.map((ann) => {
              if (ann.id !== selected.id) return ann;
              if (row.isPrimary) {
                return {
                  ...ann,
                  anchor: { ...ann.anchor, note_html: noteHtml || undefined },
                  updated_at: nowIso()
                };
              }
              return {
                ...ann,
                also_anchors: (ann.also_anchors ?? []).map((anchor) =>
                  anchor.id === row.id
                    ? { ...anchor, note_html: noteHtml || undefined }
                    : anchor
                ),
                updated_at: nowIso()
              };
            });
            // Quiet save — remounting the panel would steal focus (I12 / V7).
            persistQuiet();
          });
          wrap.append(quote, note);
          return wrap;
        }
      });
      stopList.el.classList.add('block-editor__annotation-stop-list');
      const addStopBtn = stopList.el.querySelector<HTMLButtonElement>('.hub-list__add');
      if (addStopBtn) {
        addStopBtn.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            beginAddStop(selected.id);
          },
          true
        );
      }
      stopsHost.append(stopList.el);
      threadHost.append(kindLabel, kindPills, stopsHost);
    }

    notePanel.append(
      header,
      quote,
      bodyLabel,
      tipTap.host,
      techniquePicker,
      layerLabel,
      threadHost,
      attachmentsHost,
      anthologyHost
    );
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
    paintSelectSurface();
  });

  /** Which layer the teacher is annotating in; the list and new notes follow it. */
  function paintActiveLayerPick(): void {
    layerPickHost.replaceChildren();
    const choices = layers.filter((layer) => layer.kind !== 'voice');
    if (activeLayerId && !layers.some((layer) => layer.id === activeLayerId)) {
      activeLayerId = choices[0]?.id ?? null;
    }
    if (choices.length < 2) return;
    const label = document.createElement('p');
    label.className = 'block-editor__annotation-section-title';
    label.textContent = 'Annotating in';
    const row = document.createElement('div');
    row.className = 'block-editor__annotation-active-layer-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Annotating in');
    for (const layer of choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `block-editor__annotation-active-layer-btn block-editor__annotation-active-layer-btn--${layer.colour}`;
      const on = layer.id === activeLayerId;
      btn.setAttribute('aria-pressed', String(on));
      const count = annotations.filter((ann) => ann.layer_id === layer.id).length;
      btn.textContent = `${layer.name} (${count})`;
      btn.addEventListener('click', () => {
        activeLayerId = layer.id;
        remountLists();
      });
      row.append(btn);
    }
    layerPickHost.append(label, row);
  }

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
        colour: 'wave' as AnnotationColour
      }),
      duplicate: (layer) => ({
        ...layer,
        id: nextId(`${getLatest().id}_layer`),
        name: `${layer.name} copy`
      }),
      onChange: (next) => {
        const repaint = layerEditNeedsRepaint(layers, next);
        layers = next;
        if (!repaint) {
          // A rename must not rebuild the list or the open note (I12 / V7).
          syncLayerNamesInPlace();
          persistQuiet();
          return;
        }
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
        for (const value of kindChoicesFor(layer)) {
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = LAYER_KIND_LABEL[value];
          kind.append(opt);
        }
        kind.value = layer.kind;
        kind.addEventListener('change', () => {
          const nextKind = kind.value as AnnotationLayerKind;
          void commitLayerKind(layer.id, nextKind).then((applied) => {
            if (!applied && kind.isConnected) kind.value = layer.kind;
          });
        });

        const wrap = document.createElement('div');
        wrap.className = 'block-editor__annotation-layer-fields';
        wrap.append(name, colour, kind);
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
            placeholder: 'e.g. Imagery, Structure, Context'
          });
          if (!name) return;
          const kindChoices: Array<{ value: string; label: string }> = [
            { value: 'free', label: LAYER_KIND_LABEL.free },
            { value: 'lens', label: LAYER_KIND_LABEL.lens }
          ];
          if (!layers.some((l) => l.kind === 'teacher')) {
            kindChoices.push({ value: 'teacher', label: LAYER_KIND_LABEL.teacher });
          }
          if (!layers.some((l) => l.kind === 'voice')) {
            kindChoices.push({ value: 'voice', label: LAYER_KIND_LABEL.voice });
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
              colour
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

    paintActiveLayerPick();
    rememberView();
    const inLayer = (ann: AnnotationItem) => !activeLayerId || ann.layer_id === activeLayerId;
    const annList = createHubList<AnnotationItem>({
      items: annotations.filter(inLayer),
      noun: 'note',
      label: 'Notes',
      getKey: (ann) => ann.id,
      itemLabel: (_ann, index) => `Note ${index + 1}`,
      describe: (ann) =>
        ann.anchor.quote.exact.slice(0, 40) ||
        htmlToPlainText(ann.body.html).slice(0, 40) ||
        'Empty note',
      min: 0,
      // A note always starts from highlighted words, never a placeholder.
      pick: () => {
        setMode('annotate');
        placeHint = 'Highlight words in the text, then choose Add note.';
        placeStatus.textContent = placeHint;
        selectSurface.scrollIntoView({ block: 'nearest' });
      },
      onChange: (next) => {
        annotations = mergeSubset(annotations, inLayer, next);
        if (selectedAnnotationId && !annotations.some((a) => a.id === selectedAnnotationId)) {
          selectedAnnotationId = null;
        }
        emitChange();
      },
      extraMenuItems: (ann, index) => {
        const items: Array<{
          label: string;
          onSelect: () => void;
        }> = [];
        if (index === 0) {
          items.push({
            label: 'Include all my notes',
            onSelect: () => {
              annotations = annotations.map((row) => ({
                ...row,
                anthology: {
                  include: true,
                  themes: [...(row.anthology?.themes ?? [])],
                  concepts: [...(row.anthology?.concepts ?? [])]
                },
                updated_at: nowIso()
              }));
              emitChange();
            }
          });
        }
        const layer = layers.find((row) => row.id === ann.layer_id);
        if (layer?.kind !== 'teacher' && cardKindsForAnnotation(ann).length > 0) {
          items.push({
            label: 'Make card…',
            onSelect: () => {
              void makeCardFromAnnotation(ann);
            }
          });
        }
        return items;
      },
      renderItem: (ann) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'block-editor__annotation-open';
        if (ann.id === selectedAnnotationId) btn.classList.add('is-selected');
        const quote = document.createElement('span');
        quote.className = 'block-editor__annotation-open-quote';
        const places = (ann.also_anchors?.length ?? 0) + 1;
        quote.textContent =
          places > 1
            ? `${ann.thread?.title?.trim() || 'Thread'} · ${places} places`
            : `“${ann.anchor.quote.exact.split('\n')[0]}”`;
        const body = htmlToPlainText(ann.body.html).trim();
        const preview = document.createElement('span');
        preview.className = 'block-editor__annotation-open-body';
        preview.textContent = body ? body.slice(0, 120) : 'No note written yet';
        if (!body) preview.classList.add('is-empty');
        btn.append(quote, preview);
        btn.setAttribute('aria-label', `Edit note on ${ann.anchor.quote.exact.slice(0, 40)}`);
        btn.addEventListener('click', () => {
          if (mode !== 'annotate') setMode('annotate');
          openNote(ann.id);
        });
        return btn;
      }
    });
    annList.el.classList.add('block-editor__annotation-ann-list');
    if (activeLayerId && !annotations.some(inLayer)) {
      const empty = document.createElement('p');
      empty.className = 'block-editor__hint';
      empty.textContent = 'No notes in this layer yet. Highlight words in the text, then choose Add note.';
      annotationsHost.append(empty);
    }
    annotationsHost.append(annList.el);
    annotationsHost.scrollTop = annScroll;

  }

  // Title and attribution are typed. A full repaint would drop the caret and reload the layers list.
  title.addEventListener('input', () => persistQuiet());
  attribution.addEventListener('input', () => persistQuiet());
  showMarkers.addEventListener('change', emitChange);
  blockAnthologyToggle.addEventListener('change', emitChange);
  blockThemes.addEventListener('change', emitChange);
  blockConcepts.addEventListener('change', emitChange);
  defaultLayer.addEventListener('change', emitChange);

  remountLists();
  paintOrphans();
  paintNotePanel();
  paintVoiceTracks();

  const modeRow = document.createElement('div');
  modeRow.className = 'block-editor__annotation-mode-row';
  modeRow.append(modePills.el);

  const textHead = document.createElement('div');
  textHead.className = 'block-editor__annotation-text-head';
  textHead.append(kindPills.el);
  textPane.append(textHead);

  listPanel.append(layerPickHost, annotationsHost, orphansHost, missingTechniqueHost);
  workspace.append(selectWrap, listPanel, notePanel, voicePanel);
  annotatePane.append(hint, placeStatus, workspace);

  const layersDetails = document.createElement('details');
  layersDetails.className = 'block-editor__annotation-details block-editor__annotation-layers-details';
  layersDetails.open = layers.length > 1;
  const layersSummary = document.createElement('summary');
  layersSummary.textContent = 'Layers';
  const layersHelp = document.createElement('p');
  layersHelp.className = 'block-editor__hint';
  layersHelp.textContent =
    'Layers group notes, e.g. Imagery, Structure, Context. Students reveal one layer at a time. With one layer they get a single Show notes button.';
  layersDetails.append(layersSummary, layersHelp, layersHost);

  const settingsDetails = document.createElement('details');
  settingsDetails.className = 'block-editor__annotation-details block-editor__annotation-settings';
  const settingsSummary = document.createElement('summary');
  settingsSummary.textContent = 'Student view and anthology';
  defaultLayerLabel.append(defaultLayer);
  settingsDetails.append(
    settingsSummary,
    inkLabel,
    defaultLayerLabel,
    showMarkersLabel,
    blockAnthologyLabel,
    blockThemes,
    blockConcepts
  );

  fields.append(
    intro,
    headRow,
    modeRow,
    textPane,
    annotatePane,
    layersDetails,
    voiceTracksHost,
    settingsDetails
  );
  setMode(mode);

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
