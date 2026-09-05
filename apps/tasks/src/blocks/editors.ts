import katex from 'katex';
import { DEFAULT_ANTHROPIC_MODEL } from '@/ai/models';
import type { CollectionLink } from '@/blocks/collection-resolve';
import { buildChartSvg, CHART_SERIES_COLOR_OPTIONS } from '@/blocks/chart-svg';
import { buildConceptMapSvg, buildMindMapSvg } from '@/blocks/graph-svg';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor,
  createTabsEditor
} from '@/blocks/layout-editors';
import { renderCollectionBlock } from '@/blocks/render';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import { sanitizeSvgMarkup } from '@/blocks/sanitize-svg';
import { isHttpUrl } from '@/blocks/url-safety';
import { parseEmbedInput } from '@/blocks/embed-url';
import { parseVideoInput } from '@/blocks/video-url';
import {
  CARD_STACK_MAX_CARDS,
  CARD_STACK_TINT_LABEL,
  CARD_STACK_TINTS,
  nextCardStackTint
} from '@/blocks/card-stack';
import {
  DIAGRAM_IMAGE_PUBLISH_URL_ISSUE,
  type Block,
  type CardStackTint,
  type ChartSeriesColor,
  type EmbedProvider
} from '@/schemas/block';
import type { Media } from '@/schemas/media';
import { openDrivePicker } from '@/teacher/drive-picker';
import { uploadMediaFile } from '@/teacher/media-api';
import {
  mountMediaLibraryPicker,
  resolveMediaLibraryUrl
} from '@/teacher/media-library-picker';
import {
  createEditorFilter,
  type HubFilterControl
} from '@/views/hub-kit';

export type BlockChangeHandler<T extends Block = Block> = (block: T) => void;

export type BlockEditorContext = {
  resolveCollection?: (
    block: Extract<Block, { block_type: 'collection' }>
  ) => { links: CollectionLink[]; emptyMessage?: string };
  media?: ReadonlyArray<Media>;
};

const VISIBILITY_OPTIONS = [
  { value: 'student_teacher', label: 'Students & teacher' },
  { value: 'teacher_only', label: 'Teacher only' }
] as const;

const MEDIA_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }
] as const;

export function createVisibilitySelect<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>,
  getLatest: () => T = () => block
): HTMLElement {
  return createEditorFilter({
    key: 'Shown to',
    value: block.visibility,
    options: VISIBILITY_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label
    })),
    className: 'block-editor__visibility',
    ariaLabel: 'Visibility',
    onChange: (value) => {
      onChange({
        ...getLatest(),
        visibility: value as Block['visibility']
      });
    }
  }).el;
}

function driveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Google Drive is not configured.';
}

function createDrivePickButton(options: {
  onPicked: (url: string, title: string) => void;
  onError?: (message: string) => void;
}): HTMLButtonElement {
  const driveBtn = document.createElement('button');
  driveBtn.type = 'button';
  driveBtn.className = 'btn btn--ghost block-editor__drive-btn';
  driveBtn.textContent = 'Add from Drive';
  driveBtn.addEventListener('click', () => {
    void (async () => {
      driveBtn.disabled = true;
      try {
        const pick = await openDrivePicker();
        if (!pick) return;
        if (pick.kind === 'link') {
          options.onPicked(pick.preview_url, pick.title);
          return;
        }
        const media = await uploadMediaFile(pick.file, {
          title: pick.title,
          provider_file_id: pick.provider_file_id
        });
        const resolved = resolveMediaLibraryUrl(media);
        if (!resolved) {
          throw new Error('Uploaded file has no usable URL.');
        }
        options.onPicked(resolved, pick.title);
      } catch (error) {
        options.onError?.(driveErrorMessage(error));
      } finally {
        driveBtn.disabled = false;
      }
    })();
  });
  return driveBtn;
}

function createMediaSizeSelect(
  selected: 'small' | 'medium' | 'large',
  onChange: () => void
): HubFilterControl {
  return createEditorFilter({
    key: 'Size',
    value: selected,
    options: MEDIA_SIZE_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label
    })),
    className: 'block-editor__media-size',
    ariaLabel: 'Size',
    onChange
  });
}

export function editorShell<T extends Block>(
  block: T,
  onChange: BlockChangeHandler<T>,
  fields: HTMLElement,
  getLatest: () => T = () => block
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'block-editor';
  shell.dataset.blockId = block.id;
  shell.dataset.blockType = block.block_type;
  shell.append(createVisibilitySelect(block, onChange, getLatest), fields);
  return shell;
}

function selectionRangeWithin(surface: HTMLElement): Range | null {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return surface.contains(range.commonAncestorContainer) ? range : null;
}

function wrapRangeIn(range: Range, tag: 'strong' | 'em'): void {
  const wrapper = document.createElement(tag);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
}

/**
 * One list item per paragraph the selection covers, falling back to text lines
 * when the selection sits inside a single paragraph.
 */
function linesForList(surface: HTMLElement, range: Range | null): string[] {
  const selected = range && !range.collapsed;
  const scope: ParentNode = selected ? range.cloneContents() : surface;
  const paragraphs = [...scope.querySelectorAll('p, li, blockquote')]
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean);
  if (paragraphs.length > 0) return paragraphs;

  const text = selected ? range.toString() : (surface.textContent ?? '');
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [''];
}

function createRichTextToolbar(args: {
  surface: HTMLElement;
  emit: () => void;
  onToggleSource: () => void;
}): HTMLElement {
  const { surface, emit } = args;

  const toolbar = document.createElement('div');
  toolbar.className = 'block-editor__toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting');

  function applyInline(tag: 'strong' | 'em'): void {
    const range = selectionRangeWithin(surface);
    if (!range || range.collapsed) return;
    wrapRangeIn(range, tag);
    emit();
  }

  function applyList(tag: 'ul' | 'ol'): void {
    const range = selectionRangeWithin(surface);
    const items = linesForList(surface, range);
    const list = document.createElement(tag);
    for (const line of items) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }

    if (range && !range.collapsed) {
      range.deleteContents();
      range.insertNode(list);
    } else {
      surface.replaceChildren(list);
    }
    emit();
  }

  const actions: Array<{ label: string; run: () => void }> = [
    { label: 'Bold', run: () => applyInline('strong') },
    { label: 'Italic', run: () => applyInline('em') },
    { label: 'Bullet list', run: () => applyList('ul') },
    { label: 'Numbered list', run: () => applyList('ol') },
    { label: 'HTML', run: () => args.onToggleSource() }
  ];

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost block-editor__toolbar-btn';
    button.textContent = action.label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      action.run();
    });
    toolbar.append(button);
  }

  return toolbar;
}

/**
 * Teachers write prose here, so the surface shows formatted text and keeps the
 * markup out of sight. It renders sanitised html, which makes the editor an
 * honest preview of what publishing keeps.
 */
export function createRichTextEditor(
  block: Extract<Block, { block_type: 'rich_text' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'rich_text' }>>,
  getLatest: () => Extract<Block, { block_type: 'rich_text' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const source = document.createElement('textarea');
  source.className = 'block-editor__html';
  source.value = block.content.html;
  source.rows = 10;
  source.hidden = true;
  source.setAttribute('aria-label', 'Rich text HTML');

  function publish(html: string): void {
    onChange({
      ...getLatest(),
      content: { html }
    });
  }

  const tiptap = mountRichTextTiptap({
    html: block.content.html,
    onHtml: (html) => {
      source.value = html;
      publish(html);
    }
  });

  const toolbar = document.createElement('div');
  toolbar.className = 'block-editor__toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting');

  const actions: Array<{ label: string; run: () => void }> = [
    { label: 'Bold', run: () => tiptap.toggleBold() },
    { label: 'Italic', run: () => tiptap.toggleItalic() },
    { label: 'Bullet list', run: () => tiptap.toggleBulletList() },
    { label: 'Numbered list', run: () => tiptap.toggleOrderedList() },
    {
      label: 'HTML',
      run: () => {
        const showSource = source.hidden;
        source.hidden = !showSource;
        tiptap.host.hidden = showSource;
        if (showSource) {
          source.value = tiptap.getHtml();
        } else {
          tiptap.setHtml(source.value, true);
        }
      }
    }
  ];

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost block-editor__toolbar-btn';
    button.textContent = action.label;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      action.run();
    });
    toolbar.append(button);
  }

  source.addEventListener('input', () => {
    const html = sanitizeRichTextHtml(source.value);
    publish(html);
  });

  fields.append(toolbar, tiptap.host, source);
  const shell = editorShell(block, onChange, fields, getLatest);
  shell.addEventListener(
    'remove',
    () => {
      tiptap.destroy();
    },
    { once: true }
  );
  return shell;
}

export function createHeadingEditor(
  block: Extract<Block, { block_type: 'heading' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'heading' }>>,
  getLatest: () => Extract<Block, { block_type: 'heading' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'block-editor__heading-text';
  textInput.value = block.content.text;
  textInput.setAttribute('aria-label', 'Heading text');

  const variantSelect = createEditorFilter({
    key: 'Level',
    value: block.variant,
    options: (['page', 'section', 'subsection'] as const).map((variant) => ({
      value: variant,
      label: variant
    })),
    className: 'block-editor__heading-variant',
    ariaLabel: 'Heading level',
    onChange: () => emitChange()
  });

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: variantSelect.getValue() as typeof block.variant,
      content: { text: textInput.value }
    });
  };

  textInput.addEventListener('input', emitChange);

  fields.append(textInput, variantSelect.el);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCalloutEditor(
  block: Extract<Block, { block_type: 'callout' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'callout' }>>,
  getLatest: () => Extract<Block, { block_type: 'callout' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const styleSelect = createEditorFilter({
    key: 'Style',
    value: block.content.style,
    options: (
      [
        'information',
        'important',
        'warning',
        'extension',
        'scaffold',
        'example',
        'remember',
        'teacher'
      ] as const
    ).map((style) => ({ value: style, label: style })),
    className: 'block-editor__callout-style',
    ariaLabel: 'Callout style',
    onChange: () => emitChange()
  });

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'block-editor__callout-title';
  titleInput.value = block.content.title ?? '';
  titleInput.setAttribute('aria-label', 'Callout title');

  const bodyInput = document.createElement('textarea');
  bodyInput.className = 'block-editor__callout-body';
  bodyInput.value = block.content.body;
  bodyInput.rows = 4;
  bodyInput.setAttribute('aria-label', 'Callout body');

  const emitChange = () => {
    const title = titleInput.value.trim();
    onChange({
      ...getLatest(),
      content: {
        style: styleSelect.getValue() as typeof block.content.style,
        title: title.length > 0 ? title : undefined,
        body: bodyInput.value
      }
    });
  };

  titleInput.addEventListener('input', emitChange);
  bodyInput.addEventListener('input', emitChange);

  fields.append(styleSelect.el, titleInput, bodyInput);
  return editorShell(block, onChange, fields, getLatest);
}

export function createImageEditor(
  block: Extract<Block, { block_type: 'image' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'image' }>>,
  getLatest: () => Extract<Block, { block_type: 'image' }> = () => block,
  context: BlockEditorContext = {}
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__image-url';
  url.value = block.content.url;
  url.placeholder = 'Image URL (https://…)';
  url.setAttribute('aria-label', 'Image URL');

  const alt = document.createElement('input');
  alt.type = 'text';
  alt.className = 'block-editor__image-alt';
  alt.value = block.content.alt_text;
  alt.placeholder = 'Alt text (required to publish)';
  alt.setAttribute('aria-label', 'Alt text');

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__image-caption';
  caption.value = block.content.caption ?? '';
  caption.placeholder = 'Caption (optional)';
  caption.setAttribute('aria-label', 'Caption');

  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'btn btn--ghost block-editor__library-btn';
  libraryBtn.textContent = 'Choose from library';

  const libraryHost = document.createElement('div');
  libraryHost.className = 'block-editor__library';
  libraryHost.hidden = true;

  const driveHint = document.createElement('p');
  driveHint.className = 'block-editor__hint';
  driveHint.hidden = true;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: sizeSelect.getValue() as typeof block.variant,
      content: {
        url: url.value,
        alt_text: alt.value,
        caption: caption.value || undefined
      }
    });
  };

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  libraryBtn.addEventListener('click', () => {
    libraryHost.hidden = !libraryHost.hidden;
    if (!libraryHost.hidden) {
      mountMediaLibraryPicker(libraryHost, {
        media: context.media ?? [],
        mediaTypes: ['image'],
        emptyMessage: 'No images in library',
        onPick: (media) => {
          const resolved = resolveMediaLibraryUrl(media);
          if (!resolved) return;
          url.value = resolved;
          if (!alt.value.trim() && media.title) {
            alt.value = media.title;
          }
          libraryHost.hidden = true;
          emitChange();
        }
      });
    }
  });

  const driveBtn = createDrivePickButton({
    onPicked: (pickedUrl, pickedTitle) => {
      url.value = pickedUrl;
      if (!alt.value.trim()) alt.value = pickedTitle;
      driveHint.hidden = true;
      emitChange();
    },
    onError: (message) => {
      driveHint.hidden = false;
      driveHint.textContent = message;
    }
  });

  url.addEventListener('input', emitChange);
  alt.addEventListener('input', emitChange);
  caption.addEventListener('input', emitChange);

  fields.append(url, alt, caption, sizeSelect.el, libraryBtn, driveBtn, driveHint, libraryHost);
  return editorShell(block, onChange, fields, getLatest);
}

export function createVideoEditor(
  block: Extract<Block, { block_type: 'video' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'video' }>>,
  getLatest: () => Extract<Block, { block_type: 'video' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'text';
  url.className = 'block-editor__video-url';
  url.value = block.content.url ?? block.content.external_id;
  url.placeholder = 'YouTube or Vimeo URL';
  url.setAttribute('aria-label', 'Video URL');

  const status = document.createElement('p');
  status.className = 'block-editor__hint';
  status.textContent = block.content.external_id
    ? `${block.content.provider}: ${block.content.external_id}`
    : 'Paste a YouTube or Vimeo link';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__video-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Video title');

  const emitChange = () => {
    const parsed = parseVideoInput(url.value);
    if (parsed) {
      status.textContent = `${parsed.provider}: ${parsed.external_id}`;
      onChange({
        ...getLatest(),
        variant: sizeSelect.getValue() as typeof block.variant,
        content: {
          ...block.content,
          provider: parsed.provider,
          external_id: parsed.external_id,
          url: url.value,
          title: title.value || undefined
        }
      });
    } else {
      status.textContent = 'Unrecognised video link';
      onChange({
        ...getLatest(),
        variant: sizeSelect.getValue() as typeof block.variant,
        content: {
          ...block.content,
          external_id: '',
          url: url.value,
          title: title.value || undefined
        }
      });
    }
  };

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(url, status, title, sizeSelect.el);
  return editorShell(block, onChange, fields, getLatest);
}

export function createEmbedEditor(
  block: Extract<Block, { block_type: 'embed' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'embed' }>>,
  getLatest: () => Extract<Block, { block_type: 'embed' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__embed-url';
  url.value = block.content.url;
  url.setAttribute('aria-label', 'Embed URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__embed-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Embed title');

  const providerOptions: Array<{ value: EmbedProvider; label: string }> = [
    { value: 'google_maps', label: 'Google Maps' },
    { value: 'google_slides', label: 'Google Slides' },
    { value: 'google_docs', label: 'Google Docs' },
    { value: 'pdf', label: 'PDF' },
    { value: 'generic', label: 'Generic' }
  ];
  const provider = createEditorFilter({
    key: 'Provider',
    value: block.content.provider ?? 'generic',
    options: providerOptions,
    className: 'block-editor__embed-provider',
    ariaLabel: 'Embed provider',
    onChange: () => {
      const parsed = parseEmbedInput(url.value);
      if (parsed && parsed.provider === provider.getValue()) {
        emitChange(parsed.embed_url);
        return;
      }
      emitChange(undefined);
    }
  });

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Share settings must allow viewers. Docs and Drive files preview in place.';

  const emitChange = (embedUrl?: string) => {
    const selected = provider.getValue() as EmbedProvider;
    onChange({
      ...getLatest(),
      content: {
        url: url.value,
        title: title.value || undefined,
        provider: selected,
        ...(embedUrl ? { embed_url: embedUrl } : {})
      }
    });
  };

  const applyUrlDetection = () => {
    const parsed = parseEmbedInput(url.value);
    if (parsed) {
      provider.setValue(parsed.provider);
      emitChange(parsed.embed_url);
      return;
    }
    emitChange(undefined);
  };

  url.addEventListener('input', applyUrlDetection);
  title.addEventListener('input', () => {
    const latest = getLatest();
    emitChange(latest.content.embed_url);
  });

  const driveBtn = createDrivePickButton({
    onPicked: (pickedUrl, pickedTitle) => {
      url.value = pickedUrl;
      if (!title.value.trim()) title.value = pickedTitle;
      applyUrlDetection();
    },
    onError: (message) => {
      hint.textContent = message;
    }
  });

  fields.append(url, title, provider.el, driveBtn, hint);
  return editorShell(block, onChange, fields, getLatest);
}

export function createHtmlEditor(
  block: Extract<Block, { block_type: 'html' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'html' }>>,
  getLatest: () => Extract<Block, { block_type: 'html' }> = () => block
): HTMLElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 8;
  textarea.setAttribute('aria-label', 'HTML');
  textarea.addEventListener('input', () => {
    onChange({ ...getLatest(), content: { html: textarea.value } });
  });
  return editorShell(block, onChange, textarea, getLatest);
}

export function createHtmlAppEditor(
  block: Extract<Block, { block_type: 'html_app' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'html_app' }>>,
  getLatest: () => Extract<Block, { block_type: 'html_app' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__html-app-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'HTML app title');

  const height = document.createElement('input');
  height.type = 'number';
  height.className = 'block-editor__html-app-height';
  height.min = '120';
  height.max = '4000';
  height.value = String(block.content.height_px ?? 480);
  height.setAttribute('aria-label', 'Height in pixels');

  const html = document.createElement('textarea');
  html.className = 'block-editor__html-app-html';
  html.value = block.content.html;
  html.rows = 10;
  html.setAttribute('aria-label', 'HTML app markup');

  const aiToggleLabel = document.createElement('label');
  aiToggleLabel.className = 'block-editor__html-app-ai-toggle';
  const aiToggle = document.createElement('input');
  aiToggle.type = 'checkbox';
  aiToggle.className = 'block-editor__html-app-ai-enabled';
  aiToggle.checked = Boolean(block.content.ai);
  aiToggle.setAttribute('aria-label', 'Enable AI lane');
  aiToggleLabel.append(aiToggle, document.createTextNode(' Enable AI lane'));

  const aiFields = document.createElement('div');
  aiFields.className = 'block-editor__html-app-ai-fields';
  aiFields.hidden = !block.content.ai;

  const provider = createEditorFilter({
    key: 'AI',
    value: block.content.ai?.provider ?? 'openai',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' }
    ],
    className: 'block-editor__html-app-ai-provider',
    ariaLabel: 'AI provider',
    onChange: () => emitChange()
  });

  const model = document.createElement('input');
  model.type = 'text';
  model.className = 'block-editor__html-app-ai-model';
  model.value = block.content.ai?.model ?? 'gpt-4o-mini';
  model.placeholder = 'Model';
  model.setAttribute('aria-label', 'AI model');

  const system = document.createElement('textarea');
  system.className = 'block-editor__html-app-ai-system';
  system.value = block.content.ai?.system ?? '';
  system.rows = 4;
  system.placeholder = 'Focus / guardrails (system prompt)';
  system.setAttribute('aria-label', 'AI system prompt');

  const maxTokens = document.createElement('input');
  maxTokens.type = 'number';
  maxTokens.className = 'block-editor__html-app-ai-max-tokens';
  maxTokens.min = '1';
  maxTokens.max = '2000';
  maxTokens.value = String(block.content.ai?.max_tokens ?? 512);
  maxTokens.setAttribute('aria-label', 'Max tokens');

  aiFields.append(provider.el, model, system, maxTokens);

  const emitChange = () => {
    const current = getLatest();
    const heightPx = Number.parseInt(height.value, 10);
    const content: Extract<Block, { block_type: 'html_app' }>['content'] = {
      html: html.value,
      height_px: Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 480
    };
    const titleVal = title.value.trim();
    if (titleVal) content.title = titleVal;

    if (aiToggle.checked) {
      const tokens = Number.parseInt(maxTokens.value, 10);
      content.ai = {
        enabled: true,
        provider: provider.getValue() === 'anthropic' ? 'anthropic' : 'openai',
        model: model.value.trim() || 'gpt-4o-mini',
        system: system.value,
        max_tokens:
          Number.isFinite(tokens) && tokens > 0 ? Math.min(tokens, 2000) : 512
      };
    }

    onChange({ ...current, content });
  };

  aiToggle.addEventListener('change', () => {
    aiFields.hidden = !aiToggle.checked;
    if (aiToggle.checked && !model.value.trim()) {
      model.value = provider.getValue() === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : 'gpt-4o-mini';
    }
    emitChange();
  });

  title.addEventListener('input', emitChange);
  height.addEventListener('input', emitChange);
  html.addEventListener('input', emitChange);
  model.addEventListener('input', emitChange);
  system.addEventListener('input', emitChange);
  maxTokens.addEventListener('input', emitChange);

  fields.append(title, height, html, aiToggleLabel, aiFields);
  return editorShell(block, onChange, fields, getLatest);
}

export function createQuoteEditor(
  block: Extract<Block, { block_type: 'quote' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'quote' }>>,
  getLatest: () => Extract<Block, { block_type: 'quote' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const quote = document.createElement('textarea');
  quote.className = 'block-editor__quote-text';
  quote.value = block.content.quote;
  quote.rows = 3;
  quote.setAttribute('aria-label', 'Quote');

  const attribution = document.createElement('input');
  attribution.type = 'text';
  attribution.className = 'block-editor__quote-attribution';
  attribution.value = block.content.attribution ?? '';
  attribution.placeholder = 'Attribution (optional)';
  attribution.setAttribute('aria-label', 'Attribution');

  const source = document.createElement('input');
  source.type = 'text';
  source.className = 'block-editor__quote-source';
  source.value = block.content.source ?? '';
  source.placeholder = 'Source (optional)';
  source.setAttribute('aria-label', 'Source');

  const reference = document.createElement('input');
  reference.type = 'text';
  reference.className = 'block-editor__quote-reference';
  reference.value = block.content.reference ?? '';
  reference.placeholder = 'Reference (optional)';
  reference.setAttribute('aria-label', 'Reference');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        quote: quote.value,
        attribution: attribution.value.trim() || undefined,
        source: source.value.trim() || undefined,
        reference: reference.value.trim() || undefined
      }
    });
  };

  quote.addEventListener('input', emitChange);
  attribution.addEventListener('input', emitChange);
  source.addEventListener('input', emitChange);
  reference.addEventListener('input', emitChange);

  fields.append(quote, attribution, source, reference);
  return editorShell(block, onChange, fields, getLatest);
}

export function createDividerEditor(
  block: Extract<Block, { block_type: 'divider' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'divider' }>>,
  getLatest: () => Extract<Block, { block_type: 'divider' }> = () => block
): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Divider — no extra fields.';
  return editorShell(block, onChange, hint, getLatest);
}

export function createDefinitionEditor(
  block: Extract<Block, { block_type: 'definition' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'definition' }>>,
  getLatest: () => Extract<Block, { block_type: 'definition' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const term = document.createElement('input');
  term.type = 'text';
  term.className = 'block-editor__definition-term';
  term.value = block.content.term;
  term.placeholder = 'Term';
  term.setAttribute('aria-label', 'Term');

  const definition = document.createElement('textarea');
  definition.className = 'block-editor__definition-body';
  definition.value = block.content.definition;
  definition.rows = 3;
  definition.placeholder = 'Definition';
  definition.setAttribute('aria-label', 'Definition');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        term: term.value,
        definition: definition.value
      }
    });
  };

  term.addEventListener('input', emitChange);
  definition.addEventListener('input', emitChange);

  fields.append(term, definition);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCodeEditor(
  block: Extract<Block, { block_type: 'code' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'code' }>>,
  getLatest: () => Extract<Block, { block_type: 'code' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const language = document.createElement('input');
  language.type = 'text';
  language.className = 'block-editor__code-language';
  language.value = block.content.language ?? '';
  language.placeholder = 'Language (optional)';
  language.setAttribute('aria-label', 'Language');

  const code = document.createElement('textarea');
  code.className = 'block-editor__code';
  code.value = block.content.code;
  code.rows = 8;
  code.setAttribute('aria-label', 'Code');
  code.spellcheck = false;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        code: code.value,
        language: language.value.trim() || undefined
      }
    });
  };

  language.addEventListener('input', emitChange);
  code.addEventListener('input', emitChange);

  fields.append(language, code);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAudioEditor(
  block: Extract<Block, { block_type: 'audio' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'audio' }>>,
  getLatest: () => Extract<Block, { block_type: 'audio' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__audio-url';
  url.value = block.content.url;
  url.placeholder = 'Audio URL (https://…)';
  url.setAttribute('aria-label', 'Audio URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__audio-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Audio title');

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        url: url.value,
        title: title.value.trim() || undefined
      }
    });
  };

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(url, title);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAttachmentEditor(
  block: Extract<Block, { block_type: 'attachment' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'attachment' }>>,
  getLatest: () => Extract<Block, { block_type: 'attachment' }> = () => block,
  context: BlockEditorContext = {}
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__attachment-url';
  url.value = block.content.url;
  url.placeholder = 'File URL (https://…)';
  url.setAttribute('aria-label', 'Attachment URL');

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__attachment-title';
  title.value = block.content.title;
  title.placeholder = 'Title';
  title.setAttribute('aria-label', 'Attachment title');

  const filename = document.createElement('input');
  filename.type = 'text';
  filename.className = 'block-editor__attachment-filename';
  filename.value = block.content.filename ?? '';
  filename.placeholder = 'Filename (optional)';
  filename.setAttribute('aria-label', 'Filename');

  const libraryBtn = document.createElement('button');
  libraryBtn.type = 'button';
  libraryBtn.className = 'btn btn--ghost block-editor__library-btn';
  libraryBtn.textContent = 'Choose from library';

  const libraryHost = document.createElement('div');
  libraryHost.className = 'block-editor__library';
  libraryHost.hidden = true;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        url: url.value,
        title: title.value,
        filename: filename.value.trim() || undefined
      }
    });
  };

  libraryBtn.addEventListener('click', () => {
    libraryHost.hidden = !libraryHost.hidden;
    if (!libraryHost.hidden) {
      mountMediaLibraryPicker(libraryHost, {
        media: context.media ?? [],
        emptyMessage: 'No media in library',
        onPick: (media) => {
          const resolved = resolveMediaLibraryUrl(media);
          if (!resolved) return;
          url.value = resolved;
          if (!title.value.trim() && media.title) {
            title.value = media.title;
          }
          if (!filename.value.trim()) {
            filename.value = media.file_name ?? media.title;
          }
          libraryHost.hidden = true;
          emitChange();
        }
      });
    }
  });

  const driveHint = document.createElement('p');
  driveHint.className = 'block-editor__hint';
  driveHint.hidden = true;

  const driveBtn = createDrivePickButton({
    onPicked: (pickedUrl, pickedTitle) => {
      url.value = pickedUrl;
      if (!title.value.trim()) title.value = pickedTitle;
      if (!filename.value.trim()) filename.value = pickedTitle;
      driveHint.hidden = true;
      emitChange();
    },
    onError: (message) => {
      driveHint.hidden = false;
      driveHint.textContent = message;
    }
  });

  url.addEventListener('input', emitChange);
  title.addEventListener('input', emitChange);
  filename.addEventListener('input', emitChange);

  fields.append(url, title, filename, libraryBtn, driveBtn, driveHint, libraryHost);
  return editorShell(block, onChange, fields, getLatest);
}

export function createAccordionEditor(
  block: Extract<Block, { block_type: 'accordion' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'accordion' }>>,
  getLatest: () => Extract<Block, { block_type: 'accordion' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__accordion-items';

  let items = block.content.items.map((item) => ({ ...item }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: { items: items.map((item) => ({ title: item.title, body: item.body })) }
    });
  };

  function renderItems(): void {
    itemsContainer.replaceChildren();

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__accordion-item';

      const title = document.createElement('input');
      title.type = 'text';
      title.className = 'block-editor__accordion-title';
      title.value = item.title;
      title.placeholder = 'Section title';
      title.setAttribute('aria-label', `Accordion item ${index + 1} title`);

      const body = document.createElement('textarea');
      body.className = 'block-editor__accordion-body';
      body.value = item.body;
      body.rows = 3;
      body.placeholder = 'Section body';
      body.setAttribute('aria-label', `Accordion item ${index + 1} body`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__accordion-remove';
      remove.textContent = 'Remove';
      remove.disabled = items.length <= 1;
      remove.addEventListener('click', () => {
        items = items.filter((_, i) => i !== index);
        if (items.length === 0) {
          items = [{ title: '', body: '' }];
        }
        emitChange();
        renderItems();
      });

      title.addEventListener('input', () => {
        items[index] = { ...items[index]!, title: title.value };
        emitChange();
      });
      body.addEventListener('input', () => {
        items[index] = { ...items[index]!, body: body.value };
        emitChange();
      });

      row.append(title, body, remove);
      itemsContainer.append(row);
    });
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__accordion-add';
  addButton.textContent = 'Add item';
  addButton.addEventListener('click', () => {
    items = [...items, { title: '', body: '' }];
    emitChange();
    renderItems();
  });

  renderItems();
  fields.append(itemsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

export function createTableEditor(
  block: Extract<Block, { block_type: 'table' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'table' }>>,
  getLatest: () => Extract<Block, { block_type: 'table' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let headers = [...block.content.headers];
  let rows = block.content.rows.map((row) => [...row]);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'block-editor__table-wrap';

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        headers: [...headers],
        rows: rows.map((row) => [...row])
      }
    });
  };

  function ensureRowWidth(row: string[]): string[] {
    while (row.length < headers.length) row.push('');
    if (row.length > headers.length) row.length = headers.length;
    return row;
  }

  function renderTable(): void {
    tableWrap.replaceChildren();

    const headerRow = document.createElement('div');
    headerRow.className = 'block-editor__table-header-row';

    headers.forEach((header, colIndex) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'block-editor__table-header';
      input.value = header;
      input.setAttribute('aria-label', `Column ${colIndex + 1} header`);
      input.addEventListener('input', () => {
        headers[colIndex] = input.value;
        emitChange();
      });
      headerRow.append(input);
    });
    tableWrap.append(headerRow);

    rows.forEach((row, rowIndex) => {
      ensureRowWidth(row);
      const rowEl = document.createElement('div');
      rowEl.className = 'block-editor__table-row';

      row.forEach((cell, colIndex) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'block-editor__table-cell';
        input.value = cell;
        input.setAttribute('aria-label', `Row ${rowIndex + 1} column ${colIndex + 1}`);
        input.addEventListener('input', () => {
          rows[rowIndex]![colIndex] = input.value;
          emitChange();
        });
        rowEl.append(input);
      });

      tableWrap.append(rowEl);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'block-editor__table-actions';

  const addRow = document.createElement('button');
  addRow.type = 'button';
  addRow.className = 'btn btn--secondary';
  addRow.textContent = 'Add row';
  addRow.addEventListener('click', () => {
    rows = [...rows, Array.from({ length: headers.length }, () => '')];
    emitChange();
    renderTable();
  });

  const addCol = document.createElement('button');
  addCol.type = 'button';
  addCol.className = 'btn btn--secondary';
  addCol.textContent = 'Add column';
  addCol.addEventListener('click', () => {
    headers = [...headers, `Column ${headers.length + 1}`];
    rows = rows.map((row) => [...ensureRowWidth(row), '']);
    emitChange();
    renderTable();
  });

  actions.append(addRow, addCol);
  renderTable();
  fields.append(tableWrap, actions);
  return editorShell(block, onChange, fields, getLatest);
}

export function createQuestionSetEditor(
  block: Extract<Block, { block_type: 'question_set' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'question_set' }>>,
  getLatest: () => Extract<Block, { block_type: 'question_set' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__question-set-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Set title (optional)';
  title.setAttribute('aria-label', 'Question set title');

  const questionsContainer = document.createElement('div');
  questionsContainer.className = 'block-editor__questions';

  const RESPONSE_SPACE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Medium' },
    { value: 'long', label: 'Long' },
    { value: 'extended', label: 'Extended' }
  ] as const;

  let questions = block.content.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    options: q.options ? [...q.options] : undefined as string[] | undefined,
    response_space:
      q.kind === 'short_answer' ? (q.response_space ?? ('medium' as const)) : undefined
  }));
  let questionCounter = questions.length;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        title: title.value.trim() || undefined,
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          kind: q.kind,
          options: q.kind === 'multiple_choice' ? [...(q.options ?? [])] : undefined,
          ...(q.kind === 'short_answer' && q.response_space
            ? { response_space: q.response_space }
            : {})
        }))
      }
    });
  };

  function renderQuestions(): void {
    questionsContainer.replaceChildren();

    questions.forEach((question, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__question';

      const prompt = document.createElement('textarea');
      prompt.className = 'block-editor__question-prompt';
      prompt.value = question.prompt;
      prompt.rows = 2;
      prompt.placeholder = 'Prompt';
      prompt.setAttribute('aria-label', `Question ${index + 1} prompt`);

      const kind = createEditorFilter({
        key: 'Kind',
        value: question.kind,
        options: [
          { value: 'short_answer', label: 'Short answer' },
          { value: 'multiple_choice', label: 'Multiple choice' }
        ],
        className: 'block-editor__question-kind',
        ariaLabel: `Question ${index + 1} kind`,
        onChange: () => {
          const nextKind = kind.getValue() as 'short_answer' | 'multiple_choice';
          questions[index] = {
            ...questions[index]!,
            kind: nextKind,
            options:
              nextKind === 'multiple_choice'
                ? options.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                : undefined,
            response_space: nextKind === 'short_answer' ? 'medium' : undefined
          };
          options.hidden = nextKind !== 'multiple_choice';
          responseSpace.el.hidden = nextKind !== 'short_answer';
          if (nextKind === 'short_answer') {
            responseSpace.setValue('medium');
          }
          emitChange();
        }
      });

      const responseSpace = createEditorFilter({
        key: 'Space',
        value: question.response_space ?? 'medium',
        options: RESPONSE_SPACE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label
        })),
        className: 'block-editor__question-response-space',
        ariaLabel: `Question ${index + 1} response space`,
        onChange: () => {
          questions[index] = {
            ...questions[index]!,
            response_space: responseSpace.getValue() as
              | 'none'
              | 'short'
              | 'medium'
              | 'long'
              | 'extended'
          };
          emitChange();
        }
      });
      responseSpace.el.hidden = question.kind !== 'short_answer';

      const options = document.createElement('textarea');
      options.className = 'block-editor__question-options';
      options.rows = 3;
      options.placeholder = 'Options (one per line)';
      options.value = (question.options ?? []).join('\n');
      options.hidden = question.kind !== 'multiple_choice';
      options.setAttribute('aria-label', `Question ${index + 1} options`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost';
      remove.textContent = 'Remove';
      remove.disabled = questions.length <= 1;
      remove.addEventListener('click', () => {
        questions = questions.filter((_, i) => i !== index);
        if (questions.length === 0) {
          questionCounter += 1;
          questions = [
            {
              id: `q_${questionCounter}`,
              prompt: '',
              kind: 'short_answer' as const,
              options: undefined,
              response_space: 'medium' as const
            }
          ];
        }
        emitChange();
        renderQuestions();
      });

      prompt.addEventListener('input', () => {
        questions[index] = { ...questions[index]!, prompt: prompt.value };
        emitChange();
      });

      options.addEventListener('input', () => {
        questions[index] = {
          ...questions[index]!,
          options: options.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        };
        emitChange();
      });

      row.append(prompt, kind.el, responseSpace.el, options, remove);
      questionsContainer.append(row);
    });
  }

  title.addEventListener('input', emitChange);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary';
  addButton.textContent = 'Add question';
  addButton.addEventListener('click', () => {
    questionCounter += 1;
    questions = [
      ...questions,
      {
        id: `q_${questionCounter}`,
        prompt: '',
        kind: 'short_answer' as const,
        options: undefined,
        response_space: 'medium' as const
      }
    ];
    emitChange();
    renderQuestions();
  });

  renderQuestions();
  fields.append(title, questionsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

export function createGalleryEditor(
  block: Extract<Block, { block_type: 'gallery' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'gallery' }>>,
  getLatest: () => Extract<Block, { block_type: 'gallery' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let layout = block.content.layout;
  let items = block.content.items.map((entry) => ({ ...entry }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: sizeSelect.getValue() as typeof block.variant,
      content: {
        layout,
        items: items.map((entry) => ({
          id: entry.id,
          url: entry.url,
          alt_text: entry.alt_text,
          ...(entry.caption ? { caption: entry.caption } : {})
        }))
      }
    });
  };

  const layoutSelect = createEditorFilter({
    key: 'Layout',
    value: layout,
    options: [
      { value: 'grid', label: 'Grid' },
      { value: 'carousel', label: 'Carousel' },
      { value: 'comparison', label: 'Comparison' }
    ],
    className: 'block-editor__gallery-layout',
    ariaLabel: 'Gallery layout',
    onChange: () => {
      layout = layoutSelect.getValue() as typeof layout;
      if (layout === 'comparison' && items.length > 2) {
        items = items.slice(0, 2);
      }
      while (layout === 'comparison' && items.length < 2) {
        items = [...items, emptyItem(`${getLatest().id}_i${items.length + 1}`)];
      }
      emitChange();
      renderItems();
    }
  });

  const sizeSelect = createMediaSizeSelect(block.variant, emitChange);

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__gallery-items';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__gallery-add';
  addButton.textContent = 'Add image';

  function emptyItem(id: string) {
    return { id, url: '', alt_text: '', caption: undefined as string | undefined };
  }

  function renderItems(): void {
    itemsContainer.replaceChildren();
    const comparison = layout === 'comparison';
    const atMin = items.length <= 2;
    const atMax = items.length >= 12;

    items.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__gallery-item';

      const url = document.createElement('input');
      url.type = 'url';
      url.className = 'block-editor__gallery-url';
      url.value = entry.url;
      url.placeholder = 'Image URL (https://…)';
      url.setAttribute('aria-label', `Gallery image ${index + 1} URL`);

      const alt = document.createElement('input');
      alt.type = 'text';
      alt.className = 'block-editor__gallery-alt';
      alt.value = entry.alt_text;
      alt.placeholder = 'Alt text (required to publish)';
      alt.setAttribute('aria-label', `Gallery image ${index + 1} alt text`);

      const caption = document.createElement('input');
      caption.type = 'text';
      caption.className = 'block-editor__gallery-caption';
      caption.value = entry.caption ?? '';
      caption.placeholder = 'Caption (optional)';
      caption.setAttribute('aria-label', `Gallery image ${index + 1} caption`);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__gallery-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...items];
        const tmp = next[index - 1]!;
        next[index - 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__gallery-down';
      down.textContent = 'Down';
      down.disabled = index === items.length - 1;
      down.addEventListener('click', () => {
        if (index >= items.length - 1) return;
        const next = [...items];
        const tmp = next[index + 1]!;
        next[index + 1] = next[index]!;
        next[index] = tmp;
        items = next;
        emitChange();
        renderItems();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__gallery-remove';
      remove.textContent = 'Remove';
      remove.disabled = comparison || atMin;
      remove.addEventListener('click', () => {
        if (comparison || items.length <= 2) return;
        items = items.filter((_, i) => i !== index);
        emitChange();
        renderItems();
      });

      url.addEventListener('input', () => {
        items[index] = { ...items[index]!, url: url.value };
        emitChange();
      });
      alt.addEventListener('input', () => {
        items[index] = { ...items[index]!, alt_text: alt.value };
        emitChange();
      });
      caption.addEventListener('input', () => {
        items[index] = {
          ...items[index]!,
          caption: caption.value || undefined
        };
        emitChange();
      });

      row.append(url, alt, caption, up, down, remove);
      itemsContainer.append(row);
    });

    if (comparison) {
      addButton.remove();
    } else if (!addButton.isConnected) {
      fields.append(addButton);
    }
    addButton.disabled = atMax;
  }

  addButton.addEventListener('click', () => {
    if (layout === 'comparison' || items.length >= 12) return;
    const id = `${getLatest().id}_i${Date.now()}`;
    items = [...items, emptyItem(id)];
    emitChange();
    renderItems();
  });

  fields.append(layoutSelect.el, sizeSelect.el, itemsContainer, addButton);
  renderItems();
  return editorShell(block, onChange, fields, getLatest);
}

type TimelineEventDraft = {
  id: string;
  when: string;
  label: string;
  description: string;
  image_url?: string;
  image_alt?: string;
  link_url?: string;
  link_label?: string;
};

export function createTimelineEditor(
  block: Extract<Block, { block_type: 'timeline' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'timeline' }>>,
  getLatest: () => Extract<Block, { block_type: 'timeline' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const eventsContainer = document.createElement('div');
  eventsContainer.className = 'block-editor__timeline-items';

  let events: TimelineEventDraft[] = block.content.events.map((event) => ({ ...event }));
  let eventCounter = events.length;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        events: events.map((event) => ({
          id: event.id,
          when: event.when,
          label: event.label,
          description: event.description,
          image_url: event.image_url?.trim() ? event.image_url : undefined,
          image_alt: event.image_alt?.trim() ? event.image_alt : undefined,
          link_url: event.link_url?.trim() ? event.link_url : undefined,
          link_label: event.link_label?.trim() ? event.link_label : undefined
        }))
      }
    });
  };

  function renderEvents(): void {
    eventsContainer.replaceChildren();

    events.forEach((event, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__timeline-item';

      const when = document.createElement('input');
      when.type = 'text';
      when.className = 'block-editor__timeline-when';
      when.value = event.when;
      when.placeholder = 'When';
      when.setAttribute('aria-label', `Timeline event ${index + 1} when`);

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'block-editor__timeline-label';
      label.value = event.label;
      label.placeholder = 'Label';
      label.setAttribute('aria-label', `Timeline event ${index + 1} label`);

      const description = document.createElement('textarea');
      description.className = 'block-editor__timeline-description';
      description.value = event.description;
      description.rows = 3;
      description.placeholder = 'Description';
      description.setAttribute('aria-label', `Timeline event ${index + 1} description`);

      const imageUrl = document.createElement('input');
      imageUrl.type = 'url';
      imageUrl.className = 'block-editor__timeline-image-url';
      imageUrl.value = event.image_url ?? '';
      imageUrl.placeholder = 'Image URL (optional)';
      imageUrl.setAttribute('aria-label', `Timeline event ${index + 1} image URL`);

      const imageAlt = document.createElement('input');
      imageAlt.type = 'text';
      imageAlt.className = 'block-editor__timeline-image-alt';
      imageAlt.value = event.image_alt ?? '';
      imageAlt.placeholder = 'Image alt (required if URL set)';
      imageAlt.setAttribute('aria-label', `Timeline event ${index + 1} image alt`);

      const linkUrl = document.createElement('input');
      linkUrl.type = 'url';
      linkUrl.className = 'block-editor__timeline-link-url';
      linkUrl.value = event.link_url ?? '';
      linkUrl.placeholder = 'Link URL (optional)';
      linkUrl.setAttribute('aria-label', `Timeline event ${index + 1} link URL`);

      const linkLabel = document.createElement('input');
      linkLabel.type = 'text';
      linkLabel.className = 'block-editor__timeline-link-label';
      linkLabel.value = event.link_label ?? '';
      linkLabel.placeholder = 'Link label (optional)';
      linkLabel.setAttribute('aria-label', `Timeline event ${index + 1} link label`);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__timeline-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...events];
        const current = next[index]!;
        next[index] = next[index - 1]!;
        next[index - 1] = current;
        events = next;
        emitChange();
        renderEvents();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__timeline-down';
      down.textContent = 'Down';
      down.disabled = index >= events.length - 1;
      down.addEventListener('click', () => {
        if (index >= events.length - 1) return;
        const next = [...events];
        const current = next[index]!;
        next[index] = next[index + 1]!;
        next[index + 1] = current;
        events = next;
        emitChange();
        renderEvents();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__timeline-remove';
      remove.textContent = 'Remove';
      remove.disabled = events.length <= 1;
      remove.addEventListener('click', () => {
        if (events.length <= 1) return;
        events = events.filter((_, i) => i !== index);
        emitChange();
        renderEvents();
      });

      const patch = (partial: Partial<TimelineEventDraft>) => {
        events[index] = { ...events[index]!, ...partial };
        emitChange();
      };

      when.addEventListener('input', () => patch({ when: when.value }));
      label.addEventListener('input', () => patch({ label: label.value }));
      description.addEventListener('input', () => patch({ description: description.value }));
      imageUrl.addEventListener('input', () => patch({ image_url: imageUrl.value }));
      imageAlt.addEventListener('input', () => patch({ image_alt: imageAlt.value }));
      linkUrl.addEventListener('input', () => patch({ link_url: linkUrl.value }));
      linkLabel.addEventListener('input', () => patch({ link_label: linkLabel.value }));

      row.append(
        when,
        label,
        description,
        imageUrl,
        imageAlt,
        linkUrl,
        linkLabel,
        up,
        down,
        remove
      );
      eventsContainer.append(row);
    });

    addButton.disabled = events.length >= 12;
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__timeline-add';
  addButton.textContent = 'Add event';
  addButton.addEventListener('click', () => {
    if (events.length >= 12) return;
    eventCounter += 1;
    events = [
      ...events,
      {
        id: `${getLatest().id}_e${eventCounter}`,
        when: '',
        label: '',
        description: ''
      }
    ];
    emitChange();
    renderEvents();
  });

  renderEvents();
  fields.append(eventsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

type CardStackDraft = {
  id: string;
  number?: string;
  eyebrow: string;
  title: string;
  description: string;
  image_url?: string;
  image_alt?: string;
  tint: CardStackTint;
};

export function createCardStackEditor(
  block: Extract<Block, { block_type: 'card_stack' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'card_stack' }>>,
  getLatest: () => Extract<Block, { block_type: 'card_stack' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__card-stack-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Stack heading (optional)';
  title.setAttribute('aria-label', 'Card stack heading');

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'block-editor__card-stack-items';

  let cards: CardStackDraft[] = block.content.cards.map((card) => ({ ...card }));
  let cardCounter = cards.length;

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        title: title.value.trim() || undefined,
        cards: cards.map((card) => ({
          id: card.id,
          number: card.number?.trim() ? card.number : undefined,
          eyebrow: card.eyebrow,
          title: card.title,
          description: card.description,
          image_url: card.image_url?.trim() ? card.image_url : undefined,
          image_alt: card.image_alt?.trim() ? card.image_alt : undefined,
          tint: card.tint
        }))
      }
    });
  };

  function renderCards(): void {
    cardsContainer.replaceChildren();

    cards.forEach((card, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__card-stack-item';

      const number = document.createElement('input');
      number.type = 'text';
      number.className = 'block-editor__card-stack-number';
      number.value = card.number ?? '';
      number.placeholder = 'Number (optional)';
      number.setAttribute('aria-label', `Card ${index + 1} number`);

      const eyebrow = document.createElement('input');
      eyebrow.type = 'text';
      eyebrow.className = 'block-editor__card-stack-eyebrow';
      eyebrow.value = card.eyebrow;
      eyebrow.placeholder = 'Eyebrow';
      eyebrow.setAttribute('aria-label', `Card ${index + 1} eyebrow`);

      const cardTitle = document.createElement('input');
      cardTitle.type = 'text';
      cardTitle.className = 'block-editor__card-stack-card-title';
      cardTitle.value = card.title;
      cardTitle.placeholder = 'Title';
      cardTitle.setAttribute('aria-label', `Card ${index + 1} title`);

      const description = document.createElement('textarea');
      description.className = 'block-editor__card-stack-description';
      description.value = card.description;
      description.rows = 3;
      description.placeholder = 'Description';
      description.setAttribute('aria-label', `Card ${index + 1} description`);

      const imageUrl = document.createElement('input');
      imageUrl.type = 'url';
      imageUrl.className = 'block-editor__card-stack-image-url';
      imageUrl.value = card.image_url ?? '';
      imageUrl.placeholder = 'Image URL (optional)';
      imageUrl.setAttribute('aria-label', `Card ${index + 1} image URL`);

      const imageAlt = document.createElement('input');
      imageAlt.type = 'text';
      imageAlt.className = 'block-editor__card-stack-image-alt';
      imageAlt.value = card.image_alt ?? '';
      imageAlt.placeholder = 'Image alt (required if URL set)';
      imageAlt.setAttribute('aria-label', `Card ${index + 1} image alt`);

      const tint = document.createElement('select');
      tint.className = 'block-editor__card-stack-tint';
      tint.setAttribute('aria-label', `Card ${index + 1} tint`);
      for (const value of CARD_STACK_TINTS) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = CARD_STACK_TINT_LABEL[value];
        opt.selected = card.tint === value;
        tint.append(opt);
      }

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__card-stack-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...cards];
        const current = next[index]!;
        next[index] = next[index - 1]!;
        next[index - 1] = current;
        cards = next;
        emitChange();
        renderCards();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__card-stack-down';
      down.textContent = 'Down';
      down.disabled = index >= cards.length - 1;
      down.addEventListener('click', () => {
        if (index >= cards.length - 1) return;
        const next = [...cards];
        const current = next[index]!;
        next[index] = next[index + 1]!;
        next[index + 1] = current;
        cards = next;
        emitChange();
        renderCards();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__card-stack-remove';
      remove.textContent = 'Remove';
      remove.disabled = cards.length <= 1;
      remove.addEventListener('click', () => {
        if (cards.length <= 1) return;
        cards = cards.filter((_, i) => i !== index);
        emitChange();
        renderCards();
      });

      const patch = (partial: Partial<CardStackDraft>) => {
        cards[index] = { ...cards[index]!, ...partial };
        emitChange();
      };

      number.addEventListener('input', () => patch({ number: number.value }));
      eyebrow.addEventListener('input', () => patch({ eyebrow: eyebrow.value }));
      cardTitle.addEventListener('input', () => patch({ title: cardTitle.value }));
      description.addEventListener('input', () => patch({ description: description.value }));
      imageUrl.addEventListener('input', () => patch({ image_url: imageUrl.value }));
      imageAlt.addEventListener('input', () => patch({ image_alt: imageAlt.value }));
      tint.addEventListener('change', () => patch({ tint: tint.value as CardStackTint }));

      row.append(
        number,
        eyebrow,
        cardTitle,
        description,
        imageUrl,
        imageAlt,
        tint,
        up,
        down,
        remove
      );
      cardsContainer.append(row);
    });

    addButton.disabled = cards.length >= CARD_STACK_MAX_CARDS;
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__card-stack-add';
  addButton.textContent = 'Add card';
  addButton.addEventListener('click', () => {
    if (cards.length >= CARD_STACK_MAX_CARDS) return;
    cardCounter += 1;
    cards = [
      ...cards,
      {
        id: `${getLatest().id}_c${cardCounter}`,
        eyebrow: '',
        title: '',
        description: '',
        tint: nextCardStackTint(cards.length)
      }
    ];
    emitChange();
    renderCards();
  });

  title.addEventListener('input', () => emitChange());
  renderCards();
  fields.append(title, cardsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

type FlashcardDraft = {
  id: string;
  front: string;
  back: string;
  image_url?: string;
  image_alt?: string;
};

export function createFlashcardsEditor(
  block: Extract<Block, { block_type: 'flashcards' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'flashcards' }>>,
  getLatest: () => Extract<Block, { block_type: 'flashcards' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let cards: FlashcardDraft[] = block.content.cards.map((card) => ({ ...card }));
  let cardCounter = cards.length;

  const shuffle = document.createElement('input');
  shuffle.type = 'checkbox';
  shuffle.className = 'block-editor__flashcards-shuffle';
  shuffle.checked = block.content.shuffle ?? false;
  shuffle.setAttribute('aria-label', 'Shuffle cards for students');

  const shuffleLabel = document.createElement('label');
  shuffleLabel.className = 'block-editor__flashcards-shuffle-label';
  shuffleLabel.append(shuffle, document.createTextNode(' Shuffle cards'));

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'block-editor__flashcards-items';

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        shuffle: shuffle.checked || undefined,
        cards: cards.map((card) => ({
          id: card.id,
          front: card.front,
          back: card.back,
          image_url: card.image_url?.trim() ? card.image_url : undefined,
          image_alt: card.image_alt?.trim() ? card.image_alt : undefined
        }))
      }
    });
  };

  function renderCards(): void {
    cardsContainer.replaceChildren();
    const atMin = cards.length <= 1;
    const atMax = cards.length >= 20;

    cards.forEach((card, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__flashcards-item';

      const front = document.createElement('input');
      front.type = 'text';
      front.className = 'block-editor__flashcards-front';
      front.value = card.front;
      front.placeholder = 'Front';
      front.setAttribute('aria-label', `Flashcard ${index + 1} front`);

      const back = document.createElement('input');
      back.type = 'text';
      back.className = 'block-editor__flashcards-back';
      back.value = card.back;
      back.placeholder = 'Back';
      back.setAttribute('aria-label', `Flashcard ${index + 1} back`);

      const imageUrl = document.createElement('input');
      imageUrl.type = 'url';
      imageUrl.className = 'block-editor__flashcards-image-url';
      imageUrl.value = card.image_url ?? '';
      imageUrl.placeholder = 'Image URL (optional)';
      imageUrl.setAttribute('aria-label', `Flashcard ${index + 1} image URL`);

      const imageAlt = document.createElement('input');
      imageAlt.type = 'text';
      imageAlt.className = 'block-editor__flashcards-image-alt';
      imageAlt.value = card.image_alt ?? '';
      imageAlt.placeholder = 'Image alt (required if URL set)';
      imageAlt.setAttribute('aria-label', `Flashcard ${index + 1} image alt`);

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn--ghost block-editor__flashcards-up';
      up.textContent = 'Up';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        if (index === 0) return;
        const next = [...cards];
        const current = next[index]!;
        next[index] = next[index - 1]!;
        next[index - 1] = current;
        cards = next;
        emitChange();
        renderCards();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'btn btn--ghost block-editor__flashcards-down';
      down.textContent = 'Down';
      down.disabled = index >= cards.length - 1;
      down.addEventListener('click', () => {
        if (index >= cards.length - 1) return;
        const next = [...cards];
        const current = next[index]!;
        next[index] = next[index + 1]!;
        next[index + 1] = current;
        cards = next;
        emitChange();
        renderCards();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__flashcards-remove';
      remove.textContent = 'Remove';
      remove.disabled = atMin;
      remove.addEventListener('click', () => {
        if (cards.length <= 1) return;
        cards = cards.filter((_, i) => i !== index);
        emitChange();
        renderCards();
      });

      const patch = (partial: Partial<FlashcardDraft>) => {
        cards[index] = { ...cards[index]!, ...partial };
        emitChange();
      };

      front.addEventListener('input', () => patch({ front: front.value }));
      back.addEventListener('input', () => patch({ back: back.value }));
      imageUrl.addEventListener('input', () => patch({ image_url: imageUrl.value }));
      imageAlt.addEventListener('input', () => patch({ image_alt: imageAlt.value }));

      row.append(front, back, imageUrl, imageAlt, up, down, remove);
      cardsContainer.append(row);
    });

    addButton.disabled = atMax;
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__flashcards-add';
  addButton.textContent = 'Add card';
  addButton.addEventListener('click', () => {
    if (cards.length >= 20) return;
    cardCounter += 1;
    cards = [
      ...cards,
      {
        id: `${getLatest().id}_c${cardCounter}`,
        front: '',
        back: ''
      }
    ];
    emitChange();
    renderCards();
  });

  shuffle.addEventListener('change', emitChange);

  renderCards();
  fields.append(shuffleLabel, cardsContainer, addButton);
  return editorShell(block, onChange, fields, getLatest);
}

export function createClozeEditor(
  block: Extract<Block, { block_type: 'cloze' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'cloze' }>>,
  getLatest: () => Extract<Block, { block_type: 'cloze' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__cloze-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Cloze title');

  const text = document.createElement('textarea');
  text.className = 'block-editor__cloze-text';
  text.value = block.content.text;
  text.rows = 6;
  text.setAttribute('aria-label', 'Cloze text');

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Use [[answer]] or [[answer|hint]] for blanks.';

  const caseSensitive = document.createElement('input');
  caseSensitive.type = 'checkbox';
  caseSensitive.className = 'block-editor__cloze-case-sensitive';
  caseSensitive.checked = block.content.case_sensitive ?? false;
  caseSensitive.setAttribute('aria-label', 'Case sensitive answers');

  const caseLabel = document.createElement('label');
  caseLabel.className = 'block-editor__cloze-case-label';
  caseLabel.append(caseSensitive, document.createTextNode(' Case sensitive'));

  const emitChange = () => {
    const titleValue = title.value.trim();
    onChange({
      ...getLatest(),
      content: {
        title: titleValue.length > 0 ? titleValue : undefined,
        text: text.value,
        case_sensitive: caseSensitive.checked || undefined
      }
    });
  };

  title.addEventListener('input', emitChange);
  text.addEventListener('input', emitChange);
  caseSensitive.addEventListener('change', emitChange);

  fields.append(title, text, hint, caseLabel);
  return editorShell(block, onChange, fields, getLatest);
}

type SelfCheckItemDraft = {
  id: string;
  label: string;
};

export function createSelfCheckEditor(
  block: Extract<Block, { block_type: 'self_check' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'self_check' }>>,
  getLatest: () => Extract<Block, { block_type: 'self_check' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let mode = block.content.mode;
  let items: SelfCheckItemDraft[] = (block.content.items ?? []).map((item) => ({ ...item }));
  let itemCounter = items.length;

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__self-check-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Self check title');

  const modeSelect = createEditorFilter({
    key: 'Mode',
    value: mode,
    options: [
      { value: 'reveal', label: 'Reveal answer' },
      { value: 'checklist', label: 'Checklist' },
      { value: 'confidence', label: 'Confidence rating' }
    ],
    className: 'block-editor__self-check-mode',
    ariaLabel: 'Self check mode',
    onChange: () => {
      mode = modeSelect.getValue() as typeof mode;
      renderModeFields();
      emitChange();
    }
  });

  const prompt = document.createElement('textarea');
  prompt.className = 'block-editor__self-check-prompt';
  prompt.value = block.content.prompt;
  prompt.rows = 3;
  prompt.placeholder = 'Prompt';
  prompt.setAttribute('aria-label', 'Self check prompt');

  const answer = document.createElement('textarea');
  answer.className = 'block-editor__self-check-answer';
  answer.value = block.content.answer ?? '';
  answer.rows = 3;
  answer.placeholder = 'Answer';
  answer.setAttribute('aria-label', 'Self check answer');

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'block-editor__self-check-items';

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        title: title.value.trim() || undefined,
        mode,
        prompt: prompt.value,
        answer: mode === 'checklist' ? undefined : answer.value,
        items:
          mode === 'checklist'
            ? items.map((item) => ({ id: item.id, label: item.label }))
            : undefined
      }
    });
  };

  function renderItems(): void {
    itemsContainer.replaceChildren();

    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__self-check-item';

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'block-editor__self-check-item-label';
      label.value = item.label;
      label.placeholder = 'Checklist item';
      label.setAttribute('aria-label', `Checklist item ${index + 1}`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__self-check-item-remove';
      remove.textContent = 'Remove';
      remove.disabled = items.length <= 1;
      remove.addEventListener('click', () => {
        items = items.filter((_, i) => i !== index);
        if (items.length === 0) {
          itemCounter += 1;
          items = [{ id: `${getLatest().id}_i${itemCounter}`, label: '' }];
        }
        emitChange();
        renderItems();
      });

      label.addEventListener('input', () => {
        items[index] = { ...items[index]!, label: label.value };
        emitChange();
      });

      row.append(label, remove);
      itemsContainer.append(row);
    });

    addItemButton.disabled = items.length >= 12;
  }

  const addItemButton = document.createElement('button');
  addItemButton.type = 'button';
  addItemButton.className = 'btn btn--secondary block-editor__self-check-item-add';
  addItemButton.textContent = 'Add item';
  addItemButton.addEventListener('click', () => {
    if (items.length >= 12) return;
    itemCounter += 1;
    items = [...items, { id: `${getLatest().id}_i${itemCounter}`, label: '' }];
    emitChange();
    renderItems();
  });

  function renderModeFields(): void {
    const showAnswer = mode === 'reveal' || mode === 'confidence';
    const showItems = mode === 'checklist';

    answer.hidden = !showAnswer;
    itemsContainer.hidden = !showItems;
    addItemButton.hidden = !showItems;

    if (showItems && items.length === 0) {
      itemCounter += 1;
      items = [{ id: `${getLatest().id}_i${itemCounter}`, label: '' }];
      renderItems();
    } else if (showItems) {
      renderItems();
    }
  }

  title.addEventListener('input', emitChange);
  prompt.addEventListener('input', emitChange);
  answer.addEventListener('input', emitChange);

  renderModeFields();
  fields.append(title, modeSelect.el, prompt, answer, itemsContainer, addItemButton);
  return editorShell(block, onChange, fields, getLatest);
}


function parseChartX(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return raw;
}

function parseChartY(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

type ChartPointDraft = { x: string | number; y: number };
type ChartSeriesDraft = {
  id: string;
  name: string;
  color?: ChartSeriesColor;
  points: ChartPointDraft[];
};

function seriesDraftFromBlock(
  series: Extract<Block, { block_type: 'chart' }>['content']['series']
): ChartSeriesDraft[] {
  return series.map((entry) => ({
    id: entry.id,
    name: entry.name,
    color: entry.color,
    points: entry.points.map((point) => ({ ...point }))
  }));
}

function seriesContentFromDraft(series: ChartSeriesDraft[]) {
  return series.map((entry) => ({
    id: entry.id,
    name: entry.name,
    ...(entry.color ? { color: entry.color } : {}),
    points: entry.points.map((point) => ({ x: point.x, y: point.y }))
  }));
}

export function createChartEditor(
  block: Extract<Block, { block_type: 'chart' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'chart' }>>,
  getLatest: () => Extract<Block, { block_type: 'chart' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let chartType = block.content.chart_type;
  let series: ChartSeriesDraft[] = seriesDraftFromBlock(block.content.series);
  let seriesCounter = series.length;

  const chartTypeSelect = createEditorFilter({
    key: 'Type',
    value: chartType,
    options: [
      { value: 'bar', label: 'Bar' },
      { value: 'line', label: 'Line' },
      { value: 'pie', label: 'Pie' },
      { value: 'scatter', label: 'Scatter' }
    ],
    className: 'block-editor__chart-type',
    ariaLabel: 'Chart type',
    onChange: () => {
      chartType = chartTypeSelect.getValue() as typeof chartType;
      emitChange();
    }
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__chart-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Chart title');

  const xLabel = document.createElement('input');
  xLabel.type = 'text';
  xLabel.className = 'block-editor__chart-x-label';
  xLabel.value = block.content.x_label ?? '';
  xLabel.placeholder = 'X axis label (optional)';
  xLabel.setAttribute('aria-label', 'Chart X label');

  const yLabel = document.createElement('input');
  yLabel.type = 'text';
  yLabel.className = 'block-editor__chart-y-label';
  yLabel.value = block.content.y_label ?? '';
  yLabel.placeholder = 'Y axis label (optional)';
  yLabel.setAttribute('aria-label', 'Chart Y label');

  const seriesContainer = document.createElement('div');
  seriesContainer.className = 'block-editor__chart-series';

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__chart-preview';
  preview.setAttribute('aria-label', 'Chart preview');

  const emitChange = () => {
    const content = {
      chart_type: chartType,
      title: title.value.trim() || undefined,
      x_label: xLabel.value.trim() || undefined,
      y_label: yLabel.value.trim() || undefined,
      series: seriesContentFromDraft(series)
    };
    preview.innerHTML = buildChartSvg(content);
    onChange({
      ...getLatest(),
      content
    });
  };

  function renderSeries(): void {
    seriesContainer.replaceChildren();
    const atMinSeries = series.length <= 1;
    const atMaxSeries = series.length >= 6;

    series.forEach((entry, seriesIndex) => {
      const row = document.createElement('div');
      row.className = 'block-editor__chart-series-item';

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'block-editor__chart-series-name';
      name.value = entry.name;
      name.placeholder = 'Series name';
      name.setAttribute('aria-label', `Series ${seriesIndex + 1} name`);

      const colour = createEditorFilter({
        key: 'Colour',
        value: entry.color ?? '',
        options: [
          { value: '', label: 'Auto' },
          ...CHART_SERIES_COLOR_OPTIONS.map((option) => ({
            value: option.id,
            label: option.label
          }))
        ],
        className: 'block-editor__chart-series-color',
        ariaLabel: `Series ${seriesIndex + 1} colour`,
        onChange: (value) => {
          const next = value as ChartSeriesColor | '';
          series[seriesIndex] = {
            ...series[seriesIndex]!,
            color: next === '' ? undefined : next
          };
          emitChange();
        }
      });
      const pointsContainer = document.createElement('div');
      pointsContainer.className = 'block-editor__chart-points';

      const atMinPoints = entry.points.length <= 1;
      const atMaxPoints = entry.points.length >= 24;

      entry.points.forEach((point, pointIndex) => {
        const pointRow = document.createElement('div');
        pointRow.className = 'block-editor__chart-point';

        const xInput = document.createElement('input');
        xInput.type = 'text';
        xInput.className = 'block-editor__chart-point-x';
        xInput.value = String(point.x);
        xInput.placeholder = 'X';
        xInput.setAttribute('aria-label', `Series ${seriesIndex + 1} point ${pointIndex + 1} X`);

        const yInput = document.createElement('input');
        yInput.type = 'number';
        yInput.className = 'block-editor__chart-point-y';
        yInput.value = String(point.y);
        yInput.placeholder = 'Y';
        yInput.setAttribute('aria-label', `Series ${seriesIndex + 1} point ${pointIndex + 1} Y`);

        const removePoint = document.createElement('button');
        removePoint.type = 'button';
        removePoint.className = 'btn btn--ghost block-editor__chart-remove-point';
        removePoint.textContent = 'Remove point';
        removePoint.disabled = atMinPoints;
        removePoint.addEventListener('click', () => {
          if (series[seriesIndex]!.points.length <= 1) return;
          series[seriesIndex] = {
            ...series[seriesIndex]!,
            points: series[seriesIndex]!.points.filter((_, i) => i !== pointIndex)
          };
          emitChange();
          renderSeries();
        });

        xInput.addEventListener('input', () => {
          series[seriesIndex]!.points[pointIndex] = {
            ...series[seriesIndex]!.points[pointIndex]!,
            x: parseChartX(xInput.value)
          };
          emitChange();
        });
        yInput.addEventListener('input', () => {
          series[seriesIndex]!.points[pointIndex] = {
            ...series[seriesIndex]!.points[pointIndex]!,
            y: parseChartY(yInput.value)
          };
          emitChange();
        });

        pointRow.append(xInput, yInput, removePoint);
        pointsContainer.append(pointRow);
      });

      const addPoint = document.createElement('button');
      addPoint.type = 'button';
      addPoint.className = 'btn btn--ghost block-editor__chart-add-point';
      addPoint.textContent = 'Add point';
      addPoint.disabled = atMaxPoints;
      addPoint.addEventListener('click', () => {
        if (series[seriesIndex]!.points.length >= 24) return;
        series[seriesIndex] = {
          ...series[seriesIndex]!,
          points: [...series[seriesIndex]!.points, { x: '', y: 0 }]
        };
        emitChange();
        renderSeries();
      });

      const removeSeries = document.createElement('button');
      removeSeries.type = 'button';
      removeSeries.className = 'btn btn--ghost block-editor__chart-remove-series';
      removeSeries.textContent = 'Remove series';
      removeSeries.disabled = atMinSeries;
      removeSeries.addEventListener('click', () => {
        if (series.length <= 1) return;
        series = series.filter((_, i) => i !== seriesIndex);
        emitChange();
        renderSeries();
      });

      name.addEventListener('input', () => {
        series[seriesIndex] = { ...series[seriesIndex]!, name: name.value };
        emitChange();
      });

      row.append(name, colour.el, pointsContainer, addPoint, removeSeries);
      seriesContainer.append(row);
    });

    addSeriesButton.disabled = atMaxSeries;
  }

  const addSeriesButton = document.createElement('button');
  addSeriesButton.type = 'button';
  addSeriesButton.className = 'btn btn--secondary block-editor__chart-add-series';
  addSeriesButton.textContent = 'Add series';
  addSeriesButton.addEventListener('click', () => {
    if (series.length >= 6) return;
    seriesCounter += 1;
    series = [
      ...series,
      {
        id: `${getLatest().id}_s${seriesCounter}`,
        name: `Series ${seriesCounter}`,
        points: [{ x: '', y: 0 }]
      }
    ];
    emitChange();
    renderSeries();
  });

  title.addEventListener('input', emitChange);
  xLabel.addEventListener('input', emitChange);
  yLabel.addEventListener('input', emitChange);

  renderSeries();
  preview.innerHTML = buildChartSvg({
    chart_type: chartType,
    title: title.value.trim() || undefined,
    x_label: xLabel.value.trim() || undefined,
    y_label: yLabel.value.trim() || undefined,
    series: seriesContentFromDraft(series)
  });
  fields.append(chartTypeSelect.el, title, xLabel, yLabel, seriesContainer, addSeriesButton, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createEquationEditor(
  block: Extract<Block, { block_type: 'equation' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'equation' }>>,
  getLatest: () => Extract<Block, { block_type: 'equation' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const latex = document.createElement('textarea');
  latex.className = 'block-editor__equation-latex';
  latex.value = block.content.latex;
  latex.rows = 4;
  latex.placeholder = 'LaTeX';
  latex.setAttribute('aria-label', 'Equation LaTeX');

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__equation-caption';
  caption.value = block.content.caption ?? '';
  caption.placeholder = 'Caption (optional)';
  caption.setAttribute('aria-label', 'Equation caption');

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__equation-preview';
  preview.setAttribute('aria-label', 'Equation preview');

  const updatePreview = () => {
    preview.replaceChildren();
    const math = document.createElement('div');
    math.className = 'block-equation__math';
    const value = latex.value;
    if (!value.trim()) {
      math.textContent = '';
    } else {
      try {
        katex.render(value, math, { throwOnError: false, displayMode: true });
      } catch {
        math.textContent = value;
        math.classList.add('block-equation__math--error');
      }
    }
    preview.append(math);
  };

  const emitChange = () => {
    updatePreview();
    onChange({
      ...getLatest(),
      content: {
        latex: latex.value,
        caption: caption.value.trim() || undefined
      }
    });
  };

  latex.addEventListener('input', emitChange);
  caption.addEventListener('input', emitChange);

  updatePreview();
  fields.append(latex, caption, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createDiagramEditor(
  block: Extract<Block, { block_type: 'diagram' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'diagram' }>>,
  getLatest: () => Extract<Block, { block_type: 'diagram' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let source = block.content.source;

  const sourceSelect = createEditorFilter({
    key: 'Source',
    value: source,
    options: [
      { value: 'image', label: 'Image URL' },
      { value: 'svg', label: 'Inline SVG' }
    ],
    className: 'block-editor__diagram-source',
    ariaLabel: 'Diagram source',
    onChange: () => {
      source = sourceSelect.getValue() as typeof source;
      renderSourceFields();
      emitChange();
    }
  });

  const imageUrl = document.createElement('input');
  imageUrl.type = 'url';
  imageUrl.className = 'block-editor__diagram-url';
  imageUrl.value = block.content.image_url ?? '';
  imageUrl.placeholder = 'Image URL (https://…)';
  imageUrl.setAttribute('aria-label', 'Diagram image URL');

  const imageAlt = document.createElement('input');
  imageAlt.type = 'text';
  imageAlt.className = 'block-editor__diagram-alt';
  imageAlt.value = block.content.image_alt ?? '';
  imageAlt.placeholder = 'Alt text';
  imageAlt.setAttribute('aria-label', 'Diagram image alt');

  const svgMarkup = document.createElement('textarea');
  svgMarkup.className = 'block-editor__diagram-svg';
  svgMarkup.value = block.content.svg_markup ?? '';
  svgMarkup.rows = 6;
  svgMarkup.placeholder = '<svg>…</svg>';
  svgMarkup.setAttribute('aria-label', 'Diagram SVG markup');

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__diagram-caption';
  caption.value = block.content.caption ?? '';
  caption.placeholder = 'Caption (optional)';
  caption.setAttribute('aria-label', 'Diagram caption');

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__diagram-preview';
  preview.setAttribute('aria-label', 'Diagram preview');

  const updatePreview = () => {
    preview.replaceChildren();
    if (source === 'image') {
      const url = imageUrl.value;
      if (isHttpUrl(url)) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = imageAlt.value;
        preview.append(img);
      } else {
        const unavailable = document.createElement('p');
        unavailable.textContent = DIAGRAM_IMAGE_PUBLISH_URL_ISSUE;
        preview.append(unavailable);
      }
    } else {
      const wrap = document.createElement('div');
      wrap.innerHTML = sanitizeSvgMarkup(svgMarkup.value);
      preview.append(wrap);
    }
  };

  const renderSourceFields = () => {
    const isImage = source === 'image';
    imageUrl.hidden = !isImage;
    imageAlt.hidden = !isImage;
    svgMarkup.hidden = isImage;
  };

  const emitChange = () => {
    updatePreview();
    onChange({
      ...getLatest(),
      content: {
        source,
        image_url: source === 'image' ? imageUrl.value : undefined,
        image_alt: source === 'image' ? imageAlt.value : undefined,
        svg_markup: source === 'svg' ? svgMarkup.value : undefined,
        caption: caption.value.trim() || undefined
      }
    });
  };

  imageUrl.addEventListener('input', emitChange);
  imageAlt.addEventListener('input', emitChange);
  svgMarkup.addEventListener('input', emitChange);
  caption.addEventListener('input', emitChange);

  renderSourceFields();
  updatePreview();
  fields.append(sourceSelect.el, imageUrl, imageAlt, svgMarkup, caption, preview);
  return editorShell(block, onChange, fields, getLatest);
}

type MindMapNodeDraft = { id: string; label: string; parent_id?: string | null };

export function createMindMapEditor(
  block: Extract<Block, { block_type: 'mind_map' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'mind_map' }>>,
  getLatest: () => Extract<Block, { block_type: 'mind_map' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let nodes: MindMapNodeDraft[] = block.content.nodes.map((node) => ({ ...node }));
  let nodeCounter = nodes.length;

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__mind-map-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Mind map title');

  const nodesContainer = document.createElement('div');
  nodesContainer.className = 'block-editor__mind-map-nodes';

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__mind-map-preview';
  preview.setAttribute('aria-label', 'Mind map preview');

  const emitChange = () => {
    const latest = getLatest();
    const content = {
      title: title.value.trim() || undefined,
      nodes: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        parent_id: node.parent_id ?? null
      })),
      edges: latest.content.edges ?? []
    };
    preview.innerHTML = buildMindMapSvg(content);
    onChange({
      ...latest,
      content
    });
  };

  function parentOptionsFor(nodeId: string) {
    return [
      { value: '', label: 'None' },
      ...nodes
        .filter((other) => other.id !== nodeId)
        .map((other) => ({
          value: other.id,
          label: other.label.trim() || other.id
        }))
    ];
  }

  function renderNodes(): void {
    nodesContainer.replaceChildren();
    const atMin = nodes.length <= 1;
    const atMax = nodes.length >= 24;
    const parentFilters: HubFilterControl[] = [];

    nodes.forEach((node, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__mind-map-node';

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'block-editor__mind-map-label';
      label.value = node.label;
      label.placeholder = 'Node label';
      label.setAttribute('aria-label', `Mind map node ${index + 1} label`);

      const parent = createEditorFilter({
        key: 'Parent',
        value: node.parent_id ?? '',
        options: parentOptionsFor(node.id),
        className: 'block-editor__mind-map-parent',
        ariaLabel: `Mind map node ${index + 1} parent`,
        onChange: (value) => {
          nodes[index] = {
            ...nodes[index]!,
            parent_id: value ? value : null
          };
          emitChange();
        }
      });
      parentFilters.push(parent);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__mind-map-remove';
      remove.textContent = 'Remove';
      remove.disabled = atMin;
      remove.addEventListener('click', () => {
        if (nodes.length <= 1) return;
        const removedId = nodes[index]!.id;
        nodes = nodes
          .filter((_, i) => i !== index)
          .map((entry) =>
            entry.parent_id === removedId ? { ...entry, parent_id: null } : entry
          );
        emitChange();
        renderNodes();
      });

      label.addEventListener('input', () => {
        nodes[index] = { ...nodes[index]!, label: label.value };
        emitChange();
        parentFilters.forEach((filter, i) => {
          const current = nodes[i]!;
          filter.setOptions(parentOptionsFor(current.id), current.parent_id ?? '');
        });
      });

      row.append(label, parent.el, remove);
      nodesContainer.append(row);
    });

    addButton.disabled = atMax;
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn btn--secondary block-editor__mind-map-add';
  addButton.textContent = 'Add node';
  addButton.addEventListener('click', () => {
    if (nodes.length >= 24) return;
    nodeCounter += 1;
    const root = nodes.find((n) => n.parent_id == null) ?? nodes[0];
    nodes = [
      ...nodes,
      {
        id: `${getLatest().id}_n${nodeCounter}`,
        label: '',
        parent_id: root?.id ?? null
      }
    ];
    emitChange();
    renderNodes();
  });

  title.addEventListener('input', emitChange);

  renderNodes();
  preview.innerHTML = buildMindMapSvg({
    title: title.value.trim() || undefined,
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.label,
      parent_id: node.parent_id ?? null
    })),
    edges: []
  });
  fields.append(title, nodesContainer, addButton, preview);
  return editorShell(block, onChange, fields, getLatest);
}

type ConceptNodeDraft = { id: string; label: string };
type ConceptEdgeDraft = { id: string; from: string; to: string; label?: string };

export function createConceptMapEditor(
  block: Extract<Block, { block_type: 'concept_map' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'concept_map' }>>,
  getLatest: () => Extract<Block, { block_type: 'concept_map' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let nodes: ConceptNodeDraft[] = block.content.nodes.map((node) => ({
    id: node.id,
    label: node.label
  }));
  let edges: ConceptEdgeDraft[] = block.content.edges.map((edge) => ({ ...edge }));
  let nodeCounter = nodes.length;
  let edgeCounter = edges.length;

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__concept-map-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Concept map title');

  const nodesContainer = document.createElement('div');
  nodesContainer.className = 'block-editor__concept-map-nodes';

  const edgesContainer = document.createElement('div');
  edgesContainer.className = 'block-editor__concept-map-edges';

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__concept-map-preview';
  preview.setAttribute('aria-label', 'Concept map preview');

  const emitChange = () => {
    const content = {
      title: title.value.trim() || undefined,
      nodes: nodes.map((node) => ({ id: node.id, label: node.label })),
      edges: edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label?.trim() ? edge.label : undefined
      }))
    };
    preview.innerHTML = buildConceptMapSvg(content);
    onChange({
      ...getLatest(),
      content
    });
  };

  function nodeOptions() {
    return nodes.map((node) => ({
      value: node.id,
      label: node.label.trim() || node.id
    }));
  }

  function fillNodeSelect(filter: HubFilterControl, selectedId: string): void {
    const options = nodeOptions();
    filter.setOptions(
      options.length > 0 ? options : [{ value: '', label: 'No nodes' }],
      selectedId
    );
  }

  const edgeFilters: Array<{ from: HubFilterControl; to: HubFilterControl }> = [];

  function renderEdges(): void {
    edgesContainer.replaceChildren();
    edgeFilters.length = 0;

    edges.forEach((edge, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__concept-map-edge';

      const from = createEditorFilter({
        key: 'From',
        value: edge.from,
        options: nodeOptions().length ? nodeOptions() : [{ value: '', label: 'No nodes' }],
        className: 'block-editor__concept-map-edge-from',
        ariaLabel: `Concept map edge ${index + 1} from`,
        onChange: (value) => {
          edges[index] = { ...edges[index]!, from: value };
          emitChange();
        }
      });

      const to = createEditorFilter({
        key: 'To',
        value: edge.to,
        options: nodeOptions().length ? nodeOptions() : [{ value: '', label: 'No nodes' }],
        className: 'block-editor__concept-map-edge-to',
        ariaLabel: `Concept map edge ${index + 1} to`,
        onChange: (value) => {
          edges[index] = { ...edges[index]!, to: value };
          emitChange();
        }
      });
      edgeFilters.push({ from, to });

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'block-editor__concept-map-edge-label';
      label.value = edge.label ?? '';
      label.placeholder = 'Edge label';
      label.setAttribute('aria-label', `Concept map edge ${index + 1} label`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__concept-map-edge-remove';
      remove.textContent = 'Remove edge';
      remove.addEventListener('click', () => {
        edges = edges.filter((_, i) => i !== index);
        emitChange();
        renderEdges();
      });

      label.addEventListener('input', () => {
        edges[index] = { ...edges[index]!, label: label.value };
        emitChange();
      });

      row.append(from.el, to.el, label, remove);
      edgesContainer.append(row);
    });

    addEdgeButton.disabled = edges.length >= 40 || nodes.length === 0;
  }

  function renderNodes(): void {
    nodesContainer.replaceChildren();
    const atMin = nodes.length <= 1;
    const atMax = nodes.length >= 24;

    nodes.forEach((node, index) => {
      const row = document.createElement('div');
      row.className = 'block-editor__concept-map-node';

      const label = document.createElement('input');
      label.type = 'text';
      label.className = 'block-editor__concept-map-node-label';
      label.value = node.label;
      label.placeholder = 'Node label';
      label.setAttribute('aria-label', `Concept map node ${index + 1} label`);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost block-editor__concept-map-node-remove';
      remove.textContent = 'Remove';
      remove.disabled = atMin;
      remove.addEventListener('click', () => {
        if (nodes.length <= 1) return;
        const removedId = nodes[index]!.id;
        nodes = nodes.filter((_, i) => i !== index);
        edges = edges.filter((edge) => edge.from !== removedId && edge.to !== removedId);
        emitChange();
        renderNodes();
        renderEdges();
      });

      label.addEventListener('input', () => {
        nodes[index] = { ...nodes[index]!, label: label.value };
        emitChange();
        edgeFilters.forEach((pair) => {
          fillNodeSelect(pair.from, pair.from.getValue());
          fillNodeSelect(pair.to, pair.to.getValue());
        });
      });

      row.append(label, remove);
      nodesContainer.append(row);
    });

    addNodeButton.disabled = atMax;
  }

  const addNodeButton = document.createElement('button');
  addNodeButton.type = 'button';
  addNodeButton.className = 'btn btn--secondary block-editor__concept-map-node-add';
  addNodeButton.textContent = 'Add node';
  addNodeButton.addEventListener('click', () => {
    if (nodes.length >= 24) return;
    nodeCounter += 1;
    nodes = [...nodes, { id: `${getLatest().id}_n${nodeCounter}`, label: '' }];
    emitChange();
    renderNodes();
    renderEdges();
  });

  const addEdgeButton = document.createElement('button');
  addEdgeButton.type = 'button';
  addEdgeButton.className = 'btn btn--secondary block-editor__concept-map-edge-add';
  addEdgeButton.textContent = 'Add edge';
  addEdgeButton.addEventListener('click', () => {
    if (edges.length >= 40 || nodes.length === 0) return;
    edgeCounter += 1;
    const from = nodes[0]!.id;
    const to = nodes[1]?.id ?? nodes[0]!.id;
    edges = [...edges, { id: `${getLatest().id}_e${edgeCounter}`, from, to, label: '' }];
    emitChange();
    renderEdges();
  });

  title.addEventListener('input', emitChange);

  renderNodes();
  renderEdges();
  preview.innerHTML = buildConceptMapSvg({
    title: title.value.trim() || undefined,
    nodes: nodes.map((node) => ({ id: node.id, label: node.label })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label?.trim() ? edge.label : undefined
    }))
  });
  fields.append(title, nodesContainer, addNodeButton, edgesContainer, addEdgeButton, preview);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCollectionEditor(
  block: Extract<Block, { block_type: 'collection' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'collection' }>>,
  getLatest: () => Extract<Block, { block_type: 'collection' }> = () => block,
  context: BlockEditorContext = {}
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const source = createEditorFilter({
    key: 'Source',
    value: block.content.source,
    options: [
      { value: 'unit_lessons', label: 'Unit lessons' },
      { value: 'recent_lessons', label: 'Recent lessons' }
    ],
    className: 'block-editor__collection-source',
    ariaLabel: 'Collection source',
    onChange: () => emitChange()
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__collection-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Title (optional)';
  title.setAttribute('aria-label', 'Collection title');

  const preview = document.createElement('div');
  preview.className = 'block-editor__collection-preview';
  preview.setAttribute('aria-label', 'Collection preview');

  const updatePreview = (draft: Extract<Block, { block_type: 'collection' }>) => {
    const resolved = context.resolveCollection?.(draft) ?? {
      links: [],
      emptyMessage: 'Preview needs class context.'
    };
    preview.replaceChildren(renderCollectionBlock(draft, 'teacher', resolved));
  };

  const emitChange = () => {
    const draft = {
      ...getLatest(),
      content: {
        source: source.getValue() as 'unit_lessons' | 'recent_lessons',
        title: title.value.trim() || undefined
      }
    };
    onChange(draft);
    updatePreview(draft);
  };

  title.addEventListener('input', emitChange);

  fields.append(source.el, title, preview);
  updatePreview(getLatest());
  return editorShell(block, onChange, fields, getLatest);
}

export function createOutcomesEditor(
  block: Extract<Block, { block_type: 'outcomes' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'outcomes' }>>,
  getLatest: () => Extract<Block, { block_type: 'outcomes' }> = () => block
): HTMLElement {
  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Shows the outcomes tagged on this page.';
  return editorShell(block, onChange, hint, getLatest);
}

export function createBlockEditor(
  block: Block,
  onChange: BlockChangeHandler,
  getLatest?: () => Block,
  context: BlockEditorContext = {}
): HTMLElement {
  const latest = (getLatest ?? (() => block)) as () => Block;
  switch (block.block_type) {
    case 'rich_text':
      return createRichTextEditor(block, onChange, latest as () => Extract<Block, { block_type: 'rich_text' }>);
    case 'heading':
      return createHeadingEditor(block, onChange, latest as () => Extract<Block, { block_type: 'heading' }>);
    case 'callout':
      return createCalloutEditor(block, onChange, latest as () => Extract<Block, { block_type: 'callout' }>);
    case 'image':
      return createImageEditor(
        block,
        onChange,
        latest as () => Extract<Block, { block_type: 'image' }>,
        context
      );
    case 'video':
      return createVideoEditor(block, onChange, latest as () => Extract<Block, { block_type: 'video' }>);
    case 'embed':
      return createEmbedEditor(block, onChange, latest as () => Extract<Block, { block_type: 'embed' }>);
    case 'html':
      return createHtmlEditor(block, onChange, latest as () => Extract<Block, { block_type: 'html' }>);
    case 'html_app':
      return createHtmlAppEditor(
        block,
        onChange,
        latest as () => Extract<Block, { block_type: 'html_app' }>
      );
    case 'quote':
      return createQuoteEditor(block, onChange, latest as () => Extract<Block, { block_type: 'quote' }>);
    case 'divider':
      return createDividerEditor(block, onChange, latest as () => Extract<Block, { block_type: 'divider' }>);
    case 'definition':
      return createDefinitionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'definition' }>);
    case 'code':
      return createCodeEditor(block, onChange, latest as () => Extract<Block, { block_type: 'code' }>);
    case 'audio':
      return createAudioEditor(block, onChange, latest as () => Extract<Block, { block_type: 'audio' }>);
    case 'attachment':
      return createAttachmentEditor(
        block,
        onChange,
        latest as () => Extract<Block, { block_type: 'attachment' }>,
        context
      );
    case 'accordion':
      return createAccordionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'accordion' }>);
    case 'gallery':
      return createGalleryEditor(block, onChange, latest as () => Extract<Block, { block_type: 'gallery' }>);
    case 'table':
      return createTableEditor(block, onChange, latest as () => Extract<Block, { block_type: 'table' }>);
    case 'question_set':
      return createQuestionSetEditor(block, onChange, latest as () => Extract<Block, { block_type: 'question_set' }>);
    case 'timeline':
      return createTimelineEditor(block, onChange, latest as () => Extract<Block, { block_type: 'timeline' }>);
    case 'card_stack':
      return createCardStackEditor(block, onChange, latest as () => Extract<Block, { block_type: 'card_stack' }>);
    case 'collection':
      return createCollectionEditor(
        block,
        onChange,
        latest as () => Extract<Block, { block_type: 'collection' }>,
        context
      );
    case 'outcomes':
      return createOutcomesEditor(
        block,
        onChange,
        latest as () => Extract<Block, { block_type: 'outcomes' }>
      );
    case 'flashcards':
      return createFlashcardsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'flashcards' }>);
    case 'cloze':
      return createClozeEditor(block, onChange, latest as () => Extract<Block, { block_type: 'cloze' }>);
    case 'self_check':
      return createSelfCheckEditor(block, onChange, latest as () => Extract<Block, { block_type: 'self_check' }>);
    case 'chart':
      return createChartEditor(block, onChange, latest as () => Extract<Block, { block_type: 'chart' }>);
    case 'equation':
      return createEquationEditor(block, onChange, latest as () => Extract<Block, { block_type: 'equation' }>);
    case 'diagram':
      return createDiagramEditor(block, onChange, latest as () => Extract<Block, { block_type: 'diagram' }>);
    case 'mind_map':
      return createMindMapEditor(block, onChange, latest as () => Extract<Block, { block_type: 'mind_map' }>);
    case 'concept_map':
      return createConceptMapEditor(block, onChange, latest as () => Extract<Block, { block_type: 'concept_map' }>);
    case 'spacer':
      return createSpacerEditor(block, onChange, latest as () => Extract<Block, { block_type: 'spacer' }>);
    case 'section':
      return createSectionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'section' }>);
    case 'columns':
      return createColumnsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'columns' }>);
    case 'tabs':
      return createTabsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'tabs' }>);
  }
}
