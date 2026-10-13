import { orphans } from '@/blocks/annotation-anchor';
import {
  parseAnnotationSource,
  serializeAnnotationSource
} from '@/blocks/annotation-text';
import { htmlToPlainText } from '@/blocks/search-text';
import type { Block } from '@/schemas/block';

type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;
type OnChange = (block: AnnotationBlock) => void;

/**
 * Slice 1a teacher editor fields: title, attribution, poem paste, prose toggle,
 * and an orphans list. Wrapped with editorShell from editors.ts.
 * Creating annotations by selection lands in slice 1b.
 */
export function createAnnotationEditorFields(
  block: AnnotationBlock,
  onChange: OnChange,
  getLatest: () => AnnotationBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__annotation';

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

  const source = document.createElement('textarea');
  source.className = 'block-editor__annotation-source';
  source.rows = 12;
  source.value = serializeAnnotationSource(block.content.text);
  source.setAttribute('aria-label', 'Poem or passage text');
  source.placeholder = 'Paste the poem. Blank line = new stanza; newline = new line.';

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent =
    'Editing the text keeps annotations and lists any that need re-anchoring. Select text on the canvas to add notes.';

  const orphansHost = document.createElement('div');
  orphansHost.className = 'block-editor__annotation-orphans';
  orphansHost.setAttribute('aria-live', 'polite');

  const layersSummary = document.createElement('p');
  layersSummary.className = 'block-editor__hint';

  const annotationsSummary = document.createElement('p');
  annotationsSummary.className = 'block-editor__hint';

  function refreshSummaries(current: AnnotationBlock): void {
    const orphanList = orphans(current);
    layersSummary.textContent =
      current.content.layers.length === 0
        ? 'No layers yet — add layers when you create the first note.'
        : `${current.content.layers.length} layer${current.content.layers.length === 1 ? '' : 's'}.`;
    annotationsSummary.textContent =
      current.content.annotations.length === 0
        ? 'Select text to add a note.'
        : `${current.content.annotations.length} annotation${current.content.annotations.length === 1 ? '' : 's'}.`;

    orphansHost.replaceChildren();
    if (orphanList.length === 0) return;
    const heading = document.createElement('h4');
    heading.className = 'block-editor__annotation-orphans-title';
    heading.textContent = 'Needs re-anchoring';
    const list = document.createElement('ul');
    list.className = 'block-editor__annotation-orphans-list';
    for (const item of orphanList) {
      const li = document.createElement('li');
      const quote = item.anchor.quote.exact;
      const preview = htmlToPlainText(item.body.html).slice(0, 80);
      li.textContent = preview
        ? `"${quote}" — ${preview}`
        : `"${quote}"`;
      list.append(li);
    }
    orphansHost.append(heading, list);
  }

  const emitChange = () => {
    const latest = getLatest();
    const kind = proseToggle.checked ? 'prose' : 'verse';
    const text = parseAnnotationSource(source.value, kind);
    const titleValue = title.value.trim();
    const attributionValue = attribution.value.trim();
    const next: AnnotationBlock = {
      ...latest,
      content: {
        ...latest.content,
        title: titleValue.length > 0 ? titleValue : undefined,
        attribution: attributionValue.length > 0 ? attributionValue : undefined,
        text
      }
    };
    onChange(next);
    refreshSummaries(next);
  };

  title.addEventListener('input', emitChange);
  attribution.addEventListener('input', emitChange);
  source.addEventListener('input', emitChange);
  proseToggle.addEventListener('change', () => {
    // Re-parse with the new kind from the same source string.
    emitChange();
  });

  refreshSummaries(block);
  fields.append(
    title,
    attribution,
    proseLabel,
    source,
    hint,
    layersSummary,
    annotationsSummary,
    orphansHost
  );
  return fields;
}
