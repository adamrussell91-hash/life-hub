import katex from 'katex';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import {
  HUB_LIST_ICONS,
  createHubList,
  createHubMenuButton
} from '../../design-kit/js/hub-list.js';
import { DEFAULT_ANTHROPIC_MODEL } from '@/ai/models';
import type { CollectionLink } from '@/blocks/collection-resolve';
import { buildChartSvg, CHART_SERIES_COLOR_OPTIONS } from '@/blocks/chart-svg';
import { mountGraphEditor } from '../../../../packages/graph-blocks';
import {
  createColumnsEditor,
  createSectionEditor,
  createSpacerEditor,
  createTabsEditor
} from '@/blocks/layout-editors';
import { renderCollectionBlock } from '@/blocks/render';
import { mountRichTextTiptap } from '@/blocks/rich-text-tiptap';
import { mountHubWhiteboard } from '@/blocks/whiteboard-runtime';
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
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'block-editor__visibility';
  select.setAttribute('aria-label', 'Visibility');

  for (const option of VISIBILITY_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = block.visibility === option.value;
    select.append(opt);
  }

  select.addEventListener('change', () => {
    onChange({
      ...getLatest(),
      visibility: select.value as Block['visibility']
    });
  });

  return select;
}

function driveErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Google Drive is not configured yet. Upload the file or paste its link instead.';
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
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'block-editor__media-size';
  select.setAttribute('aria-label', 'Size');

  for (const option of MEDIA_SIZE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    opt.selected = selected === option.value;
    select.append(opt);
  }

  select.addEventListener('change', onChange);
  return select;
}

type Choice = { el: HTMLElement; getValue(): string; setValue(value: string): void };

/** One labelled choice control. Teaching uses a native select. */
function createChoice(options: {
  key: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  className: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}): Choice {
  const select = document.createElement('select');
  select.className = options.className;
  select.setAttribute('aria-label', options.ariaLabel);
  for (const option of options.options) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    select.append(opt);
  }
  select.value = options.value;
  select.addEventListener('change', () => options.onChange(select.value));
  return asChoice(select);
}

function asChoice(select: HTMLSelectElement): Choice {
  return {
    el: select,
    getValue: () => select.value,
    setValue: (value) => {
      select.value = value;
    }
  };
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

/**
 * Teachers write prose here, so the surface shows formatted text and keeps the
 * markup out of sight. It renders sanitised html, which makes the editor an
 * honest preview of what publishing keeps.
 *
 * Editing engine: Tiptap (ProseMirror). Persist format remains HTML through
 * `sanitizeRichTextHtml` — specialised lesson blocks stay outside this schema.
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

  const variantSelect = document.createElement('select');
  variantSelect.className = 'block-editor__heading-variant';
  variantSelect.setAttribute('aria-label', 'Heading level');

  for (const variant of ['page', 'section', 'subsection'] as const) {
    const opt = document.createElement('option');
    opt.value = variant;
    opt.textContent = variant;
    opt.selected = block.variant === variant;
    variantSelect.append(opt);
  }

  const emitChange = () => {
    onChange({
      ...getLatest(),
      variant: variantSelect.value as typeof block.variant,
      content: { text: textInput.value }
    });
  };

  textInput.addEventListener('input', emitChange);
  variantSelect.addEventListener('change', emitChange);

  fields.append(textInput, variantSelect);
  return editorShell(block, onChange, fields, getLatest);
}

export function createCalloutEditor(
  block: Extract<Block, { block_type: 'callout' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'callout' }>>,
  getLatest: () => Extract<Block, { block_type: 'callout' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const styleSelect = document.createElement('select');
  styleSelect.className = 'block-editor__callout-style';
  styleSelect.setAttribute('aria-label', 'Callout style');

  for (const style of [
    'information',
    'important',
    'warning',
    'extension',
    'scaffold',
    'example',
    'remember',
    'teacher'
  ] as const) {
    const opt = document.createElement('option');
    opt.value = style;
    opt.textContent = style;
    opt.selected = block.content.style === style;
    styleSelect.append(opt);
  }

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
        style: styleSelect.value as typeof block.content.style,
        title: title.length > 0 ? title : undefined,
        body: bodyInput.value
      }
    });
  };

  styleSelect.addEventListener('change', emitChange);
  titleInput.addEventListener('input', emitChange);
  bodyInput.addEventListener('input', emitChange);

  fields.append(styleSelect, titleInput, bodyInput);
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
      variant: sizeSelect.value as typeof block.variant,
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

  fields.append(url, alt, caption, sizeSelect, libraryBtn, driveBtn, driveHint, libraryHost);
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
    : 'Paste a YouTube or Vimeo link, or a direct .mp4 / .webm file';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__video-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Video title');

  const emitChange = () => {
    const parsed = parseVideoInput(url.value);
    if (parsed) {
      status.textContent = parsed.start_seconds
        ? `${parsed.provider}: ${parsed.external_id} · starts at ${parsed.start_seconds}s`
        : `${parsed.provider}: ${parsed.external_id}`;
      const { start_seconds: _previousStart, ...rest } = block.content;
      onChange({
        ...getLatest(),
        variant: sizeSelect.value as typeof block.variant,
        content: {
          ...rest,
          provider: parsed.provider,
          external_id: parsed.external_id,
          ...(parsed.start_seconds ? { start_seconds: parsed.start_seconds } : {}),
          url: url.value,
          title: title.value || undefined
        }
      });
    } else {
      status.textContent = 'Unrecognised video link';
      onChange({
        ...getLatest(),
        variant: sizeSelect.value as typeof block.variant,
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

  fields.append(url, status, title, sizeSelect);
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

  const provider = document.createElement('select');
  provider.className = 'block-editor__embed-provider';
  provider.setAttribute('aria-label', 'Embed provider');
  const providerOptions: Array<{ value: EmbedProvider; label: string }> = [
    { value: 'google_maps', label: 'Google Maps' },
    { value: 'google_slides', label: 'Google Slides' },
    { value: 'google_docs', label: 'Google Docs' },
    { value: 'pdf', label: 'PDF' },
    { value: 'generic', label: 'Generic' }
  ];
  for (const opt of providerOptions) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    provider.append(option);
  }
  provider.value = block.content.provider ?? 'generic';

  const hint = document.createElement('p');
  hint.className = 'block-editor__hint';
  hint.textContent = 'Share settings must allow viewers. Docs and Drive files preview in place.';

  const emitChange = (embedUrl?: string) => {
    const selected = provider.value as EmbedProvider;
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
      provider.value = parsed.provider;
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
  provider.addEventListener('change', () => {
    const parsed = parseEmbedInput(url.value);
    if (parsed && parsed.provider === provider.value) {
      emitChange(parsed.embed_url);
      return;
    }
    emitChange(undefined);
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

  fields.append(url, title, provider, driveBtn, hint);
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

  const provider = document.createElement('select');
  provider.className = 'block-editor__html-app-ai-provider';
  provider.setAttribute('aria-label', 'AI provider');
  for (const [value, label] of [
    ['openai', 'OpenAI'],
    ['anthropic', 'Anthropic']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    provider.append(opt);
  }
  provider.value = block.content.ai?.provider ?? 'openai';

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

  aiFields.append(provider, model, system, maxTokens);

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
        provider: provider.value === 'anthropic' ? 'anthropic' : 'openai',
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
      model.value = provider.value === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : 'gpt-4o-mini';
    }
    emitChange();
  });

  title.addEventListener('input', emitChange);
  height.addEventListener('input', emitChange);
  html.addEventListener('input', emitChange);
  provider.addEventListener('change', emitChange);
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

/* ── Repeatable item lists ───────────────────────────────────────────────
 * Every list inside a block (accordion items, table rows, questions, gallery
 * images, timeline events, cards, checklist items, chart series and points)
 * uses the kit list builder: grip to drag, ··· for move / duplicate /
 * hold-to-delete, Undo after delete, "Add …" at the end. Do not hand-roll
 * Up / Down / Remove buttons in a block editor.
 */

type FieldKind = 'text' | 'url' | 'number' | 'textarea';

function editorField(
  className: string,
  value: string,
  placeholder: string,
  label: string,
  onInput: (value: string) => void,
  kind: FieldKind = 'text',
  rows = 3
): HTMLInputElement | HTMLTextAreaElement {
  const field =
    kind === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (field instanceof HTMLTextAreaElement) field.rows = rows;
  else field.type = kind;
  field.className = className;
  field.value = value;
  field.placeholder = placeholder;
  field.setAttribute('aria-label', label);
  field.addEventListener('input', () => onInput(field.value));
  return field;
}

/** Two fields side by side (stacks on a phone). */
function fieldPair(...nodes: HTMLElement[]): HTMLElement {
  const pair = document.createElement('div');
  pair.className = 'block-editor__pair';
  pair.append(...nodes);
  return pair;
}

function fragmentOf(...nodes: Node[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(...nodes);
  return fragment;
}

function itemId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createAccordionEditor(
  block: Extract<Block, { block_type: 'accordion' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'accordion' }>>,
  getLatest: () => Extract<Block, { block_type: 'accordion' }> = () => block
): HTMLElement {
  type Item = { title: string; body: string };
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let items: Item[] = block.content.items.map((item) => ({ title: item.title, body: item.body }));

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: { items: items.map((item) => ({ title: item.title, body: item.body })) }
    });
  };

  const list = createHubList<Item>({
    items,
    noun: 'item',
    label: 'Accordion items',
    itemLabel: (_item, index) => `Item ${index + 1}`,
    describe: (item, index) => item.title.trim() || `Item ${index + 1}`,
    min: 1,
    minReason: 'An accordion needs at least one item.',
    create: () => ({ title: '', body: '' }),
    duplicate: (item) => ({ ...item }),
    onChange: (next) => {
      items = next;
      emitChange();
    },
    renderItem: (item, ctx) =>
      fragmentOf(
        editorField('block-editor__accordion-title', item.title, 'Title students click', `Accordion item ${ctx.index + 1} title`, (value) =>
          ctx.update({ ...ctx.current, title: value })
        ),
        editorField(
          'block-editor__accordion-body',
          item.body,
          'What opens underneath',
          `Accordion item ${ctx.index + 1} body`,
          (value) => ctx.update({ ...ctx.current, body: value }),
          'textarea'
        )
      )
  });
  list.el.classList.add('block-editor__accordion-items');

  fields.append(list.el);
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

  const table = document.createElement('div');
  table.className = 'block-editor__table';

  const emitChange = () => {
    onChange({
      ...getLatest(),
      content: {
        headers: [...headers],
        rows: rows.map((row) => [...row])
      }
    });
  };

  function fitRow(row: string[]): string[] {
    const next = [...row];
    while (next.length < headers.length) next.push('');
    next.length = headers.length;
    return next;
  }

  function setColumns(nextHeaders: string[], nextRows: string[][]): void {
    headers = nextHeaders;
    rows = nextRows;
    emitChange();
    render();
  }

  function moveColumn(from: number, to: number): void {
    if (to < 0 || to >= headers.length) return;
    const order = headers.map((_, i) => i);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved!);
    setColumns(
      order.map((i) => headers[i]!),
      rows.map((row) => {
        const fitted = fitRow(row);
        return order.map((i) => fitted[i]!);
      })
    );
  }

  function removeColumn(index: number): void {
    if (headers.length <= 1) return;
    const goneHeader = headers[index]!;
    const goneCells = rows.map((row) => fitRow(row)[index] ?? '');
    setColumns(
      headers.filter((_, i) => i !== index),
      rows.map((row) => fitRow(row).filter((_, i) => i !== index))
    );
    offerTimedUndo({
      message: `Column “${goneHeader || index + 1}” deleted`,
      onUndo: () => {
        const at = Math.min(index, headers.length);
        const nextHeaders = [...headers];
        nextHeaders.splice(at, 0, goneHeader);
        setColumns(
          nextHeaders,
          rows.map((row, r) => {
            const next = fitRow(row);
            next.splice(at, 0, goneCells[r] ?? '');
            return next;
          })
        );
      }
    });
  }

  function addColumn(): void {
    setColumns(
      [...headers, `Column ${headers.length + 1}`],
      rows.map((row) => [...fitRow(row), ''])
    );
  }

  function cellsStyle(el: HTMLElement): void {
    el.style.setProperty('--table-cols', String(headers.length));
  }

  function render(): void {
    table.replaceChildren();
    cellsStyle(table);

    const head = document.createElement('div');
    head.className = 'block-editor__table-head';
    const cells = document.createElement('div');
    cells.className = 'block-editor__table-cells block-editor__table-header-row';
    cellsStyle(cells);

    headers.forEach((header, colIndex) => {
      const cell = document.createElement('div');
      cell.className = 'block-editor__table-header-cell';
      const input = editorField('block-editor__table-header', header, `Column ${colIndex + 1}`, `Column ${colIndex + 1} header`, (value) => {
        headers[colIndex] = value;
        emitChange();
      });
      const atMin = headers.length <= 1;
      const menu = createHubMenuButton(
        () => [
          { label: 'Move left', icon: HUB_LIST_ICONS.left, disabled: colIndex === 0, dataset: { listAction: 'left' }, onSelect: () => moveColumn(colIndex, colIndex - 1) },
          { label: 'Move right', icon: HUB_LIST_ICONS.right, disabled: colIndex === headers.length - 1, dataset: { listAction: 'right' }, onSelect: () => moveColumn(colIndex, colIndex + 1) },
          'separator',
          {
            label: 'Delete column',
            icon: HUB_LIST_ICONS.trash,
            danger: true,
            hold: true,
            disabled: atMin,
            reason: atMin ? 'A table needs at least one column.' : undefined,
            dataset: { listAction: 'delete' },
            onSelect: () => removeColumn(colIndex)
          }
        ],
        { label: `Column ${colIndex + 1} options`, className: 'block-editor__table-column-menu' }
      );
      cell.append(input, menu);
      cells.append(cell);
    });

    const addCol = document.createElement('button');
    addCol.type = 'button';
    addCol.className = 'hub-list__more block-editor__table-add-column';
    addCol.setAttribute('aria-label', 'Add column');
    addCol.title = 'Add column';
    addCol.innerHTML = HUB_LIST_ICONS.plus;
    addCol.addEventListener('click', addColumn);

    head.append(document.createElement('span'), cells, addCol);

    const list = createHubList<string[]>({
      items: rows.map((row) => fitRow(row)),
      noun: 'row',
      label: 'Table rows',
      variant: 'compact',
      create: () => headers.map(() => ''),
      duplicate: (row) => [...row],
      onChange: (next) => {
        rows = next.map((row) => [...row]);
        emitChange();
      },
      renderItem: (row, ctx) => {
        const rowCells = document.createElement('div');
        rowCells.className = 'block-editor__table-cells block-editor__table-row';
        cellsStyle(rowCells);
        row.forEach((cell, colIndex) => {
          rowCells.append(
            editorField('block-editor__table-cell', cell, '', `Row ${ctx.index + 1} column ${colIndex + 1}`, (value) => {
              const next = [...ctx.current];
              next[colIndex] = value;
              ctx.update(next);
            })
          );
        });
        return rowCells;
      }
    });

    table.append(head, list.el);
  }

  render();
  fields.append(table);
  return editorShell(block, onChange, fields, getLatest);
}

export function createQuestionSetEditor(
  block: Extract<Block, { block_type: 'question_set' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'question_set' }>>,
  getLatest: () => Extract<Block, { block_type: 'question_set' }> = () => block
): HTMLElement {
  type ResponseSpace = 'none' | 'short' | 'medium' | 'long' | 'extended';
  type QuestionDraft = {
    id: string;
    prompt: string;
    kind: 'short_answer' | 'multiple_choice';
    options?: string[];
    response_space?: ResponseSpace;
  };
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const title = editorField('block-editor__question-set-title', block.content.title ?? '', 'Set title (optional)', 'Question set title', () => emitChange());

  const RESPONSE_SPACE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'short', label: 'Short' },
    { value: 'medium', label: 'Medium' },
    { value: 'long', label: 'Long' },
    { value: 'extended', label: 'Extended' }
  ];

  let questions: QuestionDraft[] = block.content.questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    options: q.options ? [...q.options] : undefined,
    response_space: q.kind === 'short_answer' ? (q.response_space ?? 'medium') : undefined
  }));

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

  const splitOptions = (raw: string) =>
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const list = createHubList<QuestionDraft>({
    items: questions,
    noun: 'question',
    label: 'Questions',
    getKey: (q) => q.id,
    itemLabel: (_q, index) => `Question ${index + 1}`,
    describe: (_q, index) => `Question ${index + 1}`,
    min: 1,
    minReason: 'A question set needs at least one question.',
    create: () => ({ id: itemId('q'), prompt: '', kind: 'short_answer', response_space: 'medium' }),
    duplicate: (q) => ({ ...q, id: itemId('q'), options: q.options ? [...q.options] : undefined }),
    onChange: (next) => {
      questions = next;
      emitChange();
    },
    renderItem: (question, ctx) => {
      const n = ctx.index + 1;
      const prompt = editorField('block-editor__question-prompt', question.prompt, 'Question', `Question ${n} prompt`, (value) => ctx.update({ ...ctx.current, prompt: value }), 'textarea', 2);

      const options = editorField(
        'block-editor__question-options',
        (question.options ?? []).join('\n'),
        'Answer options, one per line',
        `Question ${n} options`,
        (value) => ctx.update({ ...ctx.current, options: splitOptions(value) }),
        'textarea'
      );
      options.hidden = question.kind !== 'multiple_choice';

      const responseSpace = createChoice({
        key: 'Space',
        value: question.response_space ?? 'medium',
        options: RESPONSE_SPACE_OPTIONS,
        className: 'block-editor__question-response-space',
        ariaLabel: `Question ${n} response space`,
        onChange: (value) => ctx.update({ ...ctx.current, response_space: value as ResponseSpace })
      });
      responseSpace.el.hidden = question.kind !== 'short_answer';

      const kind = createChoice({
        key: 'Kind',
        value: question.kind,
        options: [
          { value: 'short_answer', label: 'Short answer' },
          { value: 'multiple_choice', label: 'Multiple choice' }
        ],
        className: 'block-editor__question-kind',
        ariaLabel: `Question ${n} kind`,
        onChange: (value) => {
          const nextKind = value as QuestionDraft['kind'];
          ctx.update({
            ...ctx.current,
            kind: nextKind,
            options: nextKind === 'multiple_choice' ? splitOptions(options.value) : undefined,
            response_space: nextKind === 'short_answer' ? 'medium' : undefined
          });
          options.hidden = nextKind !== 'multiple_choice';
          responseSpace.el.hidden = nextKind !== 'short_answer';
          if (nextKind === 'short_answer') responseSpace.setValue('medium');
        }
      });

      const settings = document.createElement('div');
      settings.className = 'block-editor__inline-settings';
      settings.append(kind.el, responseSpace.el);
      return fragmentOf(prompt, settings, options);
    }
  });
  list.el.classList.add('block-editor__questions');

  fields.append(title, list.el);
  return editorShell(block, onChange, fields, getLatest);
}

export function createGalleryEditor(
  block: Extract<Block, { block_type: 'gallery' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'gallery' }>>,
  getLatest: () => Extract<Block, { block_type: 'gallery' }> = () => block
): HTMLElement {
  type GalleryItem = { id: string; url: string; alt_text: string; caption?: string };
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  let layout = block.content.layout;
  let items: GalleryItem[] = block.content.items.map((entry) => ({ ...entry }));

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

  const sizeSelect = asChoice(createMediaSizeSelect(block.variant, emitChange));
  const listHost = document.createElement('div');

  const emptyItem = (): GalleryItem => ({ id: itemId(`${getLatest().id}_i`), url: '', alt_text: '' });

  function renderList(): void {
    const comparison = layout === 'comparison';
    const list = createHubList<GalleryItem>({
      items,
      noun: 'image',
      label: 'Gallery images',
      getKey: (entry) => entry.id,
      itemLabel: (_entry, index) => (comparison ? (index === 0 ? 'Before' : 'After') : `Image ${index + 1}`),
      describe: (_entry, index) => `Image ${index + 1}`,
      min: 2,
      max: comparison ? 2 : 12,
      minReason: comparison ? 'A comparison shows exactly two images.' : 'A gallery needs at least two images.',
      maxReason: comparison ? 'A comparison shows exactly two images.' : 'A gallery holds up to twelve images.',
      addLabel: comparison ? false : 'Add image',
      create: emptyItem,
      duplicate: (entry) => ({ ...entry, id: itemId(`${getLatest().id}_i`) }),
      onChange: (next) => {
        items = next;
        emitChange();
      },
      renderItem: (entry, ctx) => {
        const n = ctx.index + 1;
        return fragmentOf(
          editorField('block-editor__gallery-url', entry.url, 'Image link (https://…)', `Gallery image ${n} URL`, (value) => ctx.update({ ...ctx.current, url: value }), 'url'),
          fieldPair(
            editorField('block-editor__gallery-alt', entry.alt_text, 'Alt text (required to publish)', `Gallery image ${n} alt text`, (value) => ctx.update({ ...ctx.current, alt_text: value })),
            editorField('block-editor__gallery-caption', entry.caption ?? '', 'Caption (optional)', `Gallery image ${n} caption`, (value) => ctx.update({ ...ctx.current, caption: value || undefined }))
          )
        );
      }
    });
    list.el.classList.add('block-editor__gallery-items');
    listHost.replaceChildren(list.el);
  }

  const layoutSelect = createChoice({
    key: 'Layout',
    value: layout,
    options: [
      { value: 'grid', label: 'Grid' },
      { value: 'carousel', label: 'Carousel' },
      { value: 'comparison', label: 'Comparison' }
    ],
    className: 'block-editor__gallery-layout',
    ariaLabel: 'Gallery layout',
    onChange: (value) => {
      layout = value as typeof layout;
      if (layout === 'comparison' && items.length > 2) items = items.slice(0, 2);
      while (layout === 'comparison' && items.length < 2) items = [...items, emptyItem()];
      emitChange();
      renderList();
    }
  });

  const settings = document.createElement('div');
  settings.className = 'block-editor__inline-settings';
  settings.append(layoutSelect.el, sizeSelect.el);

  renderList();
  fields.append(settings, listHost);
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

  let events: TimelineEventDraft[] = block.content.events.map((event) => ({ ...event }));

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

  const list = createHubList<TimelineEventDraft>({
    items: events,
    noun: 'event',
    label: 'Timeline events',
    getKey: (event) => event.id,
    itemLabel: (_event, index) => `Event ${index + 1}`,
    describe: (event, index) => event.label.trim() || `Event ${index + 1}`,
    min: 1,
    max: 12,
    minReason: 'A timeline needs at least one event.',
    maxReason: 'A timeline holds up to twelve events.',
    create: () => ({ id: itemId(`${getLatest().id}_e`), when: '', label: '', description: '' }),
    duplicate: (event) => ({ ...event, id: itemId(`${getLatest().id}_e`) }),
    onChange: (next) => {
      events = next;
      emitChange();
    },
    renderItem: (event, ctx) => {
      const n = ctx.index + 1;
      const patch = (partial: Partial<TimelineEventDraft>) => ctx.update({ ...ctx.current, ...partial });
      return fragmentOf(
        fieldPair(
          editorField('block-editor__timeline-when', event.when, 'When', `Timeline event ${n} when`, (value) => patch({ when: value })),
          editorField('block-editor__timeline-label', event.label, 'Label', `Timeline event ${n} label`, (value) => patch({ label: value }))
        ),
        editorField('block-editor__timeline-description', event.description, 'What happened', `Timeline event ${n} description`, (value) => patch({ description: value }), 'textarea'),
        fieldPair(
          editorField('block-editor__timeline-image-url', event.image_url ?? '', 'Image link (optional)', `Timeline event ${n} image URL`, (value) => patch({ image_url: value }), 'url'),
          editorField('block-editor__timeline-image-alt', event.image_alt ?? '', 'Image alt (required if image set)', `Timeline event ${n} image alt`, (value) => patch({ image_alt: value }))
        ),
        fieldPair(
          editorField('block-editor__timeline-link-url', event.link_url ?? '', 'Link (optional)', `Timeline event ${n} link URL`, (value) => patch({ link_url: value }), 'url'),
          editorField('block-editor__timeline-link-label', event.link_label ?? '', 'Link label (optional)', `Timeline event ${n} link label`, (value) => patch({ link_label: value }))
        )
      );
    }
  });
  list.el.classList.add('block-editor__timeline-items');

  fields.append(list.el);
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

  const title = editorField('block-editor__card-stack-title', block.content.title ?? '', 'Stack heading (optional)', 'Card stack heading', () => emitChange());

  let cards: CardStackDraft[] = block.content.cards.map((card) => ({ ...card }));

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

  const list = createHubList<CardStackDraft>({
    items: cards,
    noun: 'card',
    label: 'Cards',
    getKey: (card) => card.id,
    itemLabel: (_card, index) => `Card ${index + 1}`,
    describe: (card, index) => card.title.trim() || `Card ${index + 1}`,
    min: 1,
    max: CARD_STACK_MAX_CARDS,
    minReason: 'A card stack needs at least one card.',
    maxReason: `A card stack holds up to ${CARD_STACK_MAX_CARDS} cards.`,
    create: (index) => ({
      id: itemId(`${getLatest().id}_c`),
      eyebrow: '',
      title: '',
      description: '',
      tint: nextCardStackTint(index)
    }),
    duplicate: (card) => ({ ...card, id: itemId(`${getLatest().id}_c`) }),
    onChange: (next) => {
      cards = next;
      emitChange();
    },
    renderItem: (card, ctx) => {
      const n = ctx.index + 1;
      const patch = (partial: Partial<CardStackDraft>) => ctx.update({ ...ctx.current, ...partial });
      const tint = createChoice({
        key: 'Tint',
        value: card.tint,
        options: CARD_STACK_TINTS.map((value) => ({ value, label: CARD_STACK_TINT_LABEL[value] })),
        className: 'block-editor__card-stack-tint',
        ariaLabel: `Card ${n} tint`,
        onChange: (value) => patch({ tint: value as CardStackTint })
      });
      const settings = document.createElement('div');
      settings.className = 'block-editor__inline-settings';
      settings.append(
        editorField('block-editor__card-stack-number', card.number ?? '', 'Number (optional)', `Card ${n} number`, (value) => patch({ number: value })),
        tint.el
      );
      return fragmentOf(
        fieldPair(
          editorField('block-editor__card-stack-eyebrow', card.eyebrow, 'Eyebrow', `Card ${n} eyebrow`, (value) => patch({ eyebrow: value })),
          editorField('block-editor__card-stack-card-title', card.title, 'Title', `Card ${n} title`, (value) => patch({ title: value }))
        ),
        editorField('block-editor__card-stack-description', card.description, 'Description', `Card ${n} description`, (value) => patch({ description: value }), 'textarea'),
        fieldPair(
          editorField('block-editor__card-stack-image-url', card.image_url ?? '', 'Image link (optional)', `Card ${n} image URL`, (value) => patch({ image_url: value }), 'url'),
          editorField('block-editor__card-stack-image-alt', card.image_alt ?? '', 'Image alt (required if image set)', `Card ${n} image alt`, (value) => patch({ image_alt: value }))
        ),
        settings
      );
    }
  });
  list.el.classList.add('block-editor__card-stack-items');

  fields.append(title, list.el);
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

  const shuffle = document.createElement('input');
  shuffle.type = 'checkbox';
  shuffle.className = 'block-editor__flashcards-shuffle';
  shuffle.checked = block.content.shuffle ?? false;
  shuffle.setAttribute('aria-label', 'Shuffle cards for students');

  const shuffleLabel = document.createElement('label');
  shuffleLabel.className = 'block-editor__flashcards-shuffle-label';
  shuffleLabel.append(shuffle, document.createTextNode(' Shuffle cards'));

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

  const list = createHubList<FlashcardDraft>({
    items: cards,
    noun: 'card',
    label: 'Flashcards',
    getKey: (card) => card.id,
    itemLabel: (_card, index) => `Card ${index + 1}`,
    describe: (card, index) => card.front.trim() || `Card ${index + 1}`,
    min: 1,
    max: 20,
    minReason: 'A flashcard set needs at least one card.',
    maxReason: 'A flashcard set holds up to twenty cards.',
    create: () => ({ id: itemId(`${getLatest().id}_c`), front: '', back: '' }),
    duplicate: (card) => ({ ...card, id: itemId(`${getLatest().id}_c`) }),
    onChange: (next) => {
      cards = next;
      emitChange();
    },
    renderItem: (card, ctx) => {
      const n = ctx.index + 1;
      const patch = (partial: Partial<FlashcardDraft>) => ctx.update({ ...ctx.current, ...partial });
      return fragmentOf(
        fieldPair(
          editorField('block-editor__flashcards-front', card.front, 'Front', `Flashcard ${n} front`, (value) => patch({ front: value })),
          editorField('block-editor__flashcards-back', card.back, 'Back', `Flashcard ${n} back`, (value) => patch({ back: value }))
        ),
        fieldPair(
          editorField('block-editor__flashcards-image-url', card.image_url ?? '', 'Image link (optional)', `Flashcard ${n} image URL`, (value) => patch({ image_url: value }), 'url'),
          editorField('block-editor__flashcards-image-alt', card.image_alt ?? '', 'Image alt (required if image set)', `Flashcard ${n} image alt`, (value) => patch({ image_alt: value }))
        )
      );
    }
  });
  list.el.classList.add('block-editor__flashcards-items');

  shuffle.addEventListener('change', emitChange);

  fields.append(shuffleLabel, list.el);
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

  const title = editorField('block-editor__self-check-title', block.content.title ?? '', 'Title (optional)', 'Self check title', () => emitChange());
  const prompt = editorField('block-editor__self-check-prompt', block.content.prompt, 'Prompt', 'Self check prompt', () => emitChange(), 'textarea');
  const answer = editorField('block-editor__self-check-answer', block.content.answer ?? '', 'Answer', 'Self check answer', () => emitChange(), 'textarea');

  const itemsHost = document.createElement('div');
  itemsHost.className = 'block-editor__self-check-items';

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

  const newItem = (): SelfCheckItemDraft => ({ id: itemId(`${getLatest().id}_i`), label: '' });

  function renderItems(): void {
    const list = createHubList<SelfCheckItemDraft>({
      items,
      noun: 'item',
      label: 'Checklist items',
      variant: 'compact',
      getKey: (item) => item.id,
      describe: (item, index) => item.label.trim() || `Item ${index + 1}`,
      min: 1,
      max: 12,
      minReason: 'A checklist needs at least one item.',
      maxReason: 'A checklist holds up to twelve items.',
      create: newItem,
      duplicate: (item) => ({ ...item, id: itemId(`${getLatest().id}_i`) }),
      onChange: (next) => {
        items = next;
        emitChange();
      },
      renderItem: (item, ctx) =>
        editorField('block-editor__self-check-item-label', item.label, 'Checklist item', `Checklist item ${ctx.index + 1}`, (value) =>
          ctx.update({ ...ctx.current, label: value })
        )
    });
    itemsHost.replaceChildren(list.el);
  }

  function renderModeFields(): void {
    const showAnswer = mode === 'reveal' || mode === 'confidence';
    const showItems = mode === 'checklist';
    answer.hidden = !showAnswer;
    itemsHost.hidden = !showItems;
    if (showItems && items.length === 0) items = [newItem()];
    if (showItems) renderItems();
  }

  const modeSelect = createChoice({
    key: 'Mode',
    value: mode,
    options: [
      { value: 'reveal', label: 'Reveal answer' },
      { value: 'checklist', label: 'Checklist' },
      { value: 'confidence', label: 'Confidence rating' }
    ],
    className: 'block-editor__self-check-mode',
    ariaLabel: 'Self check mode',
    onChange: (value) => {
      mode = value as typeof mode;
      renderModeFields();
      emitChange();
    }
  });

  renderModeFields();
  fields.append(title, modeSelect.el, prompt, answer, itemsHost);
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

  const title = editorField('block-editor__chart-title', block.content.title ?? '', 'Title (optional)', 'Chart title', () => emitChange());
  const xLabel = editorField('block-editor__chart-x-label', block.content.x_label ?? '', 'X axis label (optional)', 'Chart X label', () => emitChange());
  const yLabel = editorField('block-editor__chart-y-label', block.content.y_label ?? '', 'Y axis label (optional)', 'Chart Y label', () => emitChange());

  const preview = document.createElement('div');
  preview.className = 'block-editor__viz-preview block-editor__chart-preview';
  preview.setAttribute('aria-label', 'Chart preview');

  const content = () => ({
    chart_type: chartType,
    title: title.value.trim() || undefined,
    x_label: xLabel.value.trim() || undefined,
    y_label: yLabel.value.trim() || undefined,
    series: seriesContentFromDraft(series)
  });

  const emitChange = () => {
    const next = content();
    preview.innerHTML = buildChartSvg(next);
    onChange({ ...getLatest(), content: next });
  };

  const chartTypeSelect = createChoice({
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
    onChange: (value) => {
      chartType = value as typeof chartType;
      emitChange();
    }
  });

  const seriesList = createHubList<ChartSeriesDraft>({
    items: series,
    noun: 'series',
    label: 'Chart series',
    getKey: (entry) => entry.id,
    itemLabel: (_entry, index) => `Series ${index + 1}`,
    describe: (entry, index) => entry.name.trim() || `Series ${index + 1}`,
    min: 1,
    max: 6,
    minReason: 'A chart needs at least one series.',
    maxReason: 'A chart holds up to six series.',
    create: (index) => ({ id: itemId(`${getLatest().id}_s`), name: `Series ${index + 1}`, points: [{ x: '', y: 0 }] }),
    duplicate: (entry) => ({
      ...entry,
      id: itemId(`${getLatest().id}_s`),
      name: `${entry.name} copy`,
      points: entry.points.map((point) => ({ ...point }))
    }),
    onChange: (next) => {
      series = next;
      emitChange();
    },
    renderItem: (entry, ctx) => {
      const n = ctx.index + 1;
      const name = editorField('block-editor__chart-series-name', entry.name, 'Series name', `Series ${n} name`, (value) => ctx.update({ ...ctx.current, name: value }));
      const colour = createChoice({
        key: 'Colour',
        value: entry.color ?? '',
        options: [
          { value: '', label: 'Auto' },
          ...CHART_SERIES_COLOR_OPTIONS.map((option) => ({ value: option.id, label: option.label }))
        ],
        className: 'block-editor__chart-series-color',
        ariaLabel: `Series ${n} colour`,
        onChange: (value) => ctx.update({ ...ctx.current, color: value === '' ? undefined : (value as ChartSeriesColor) })
      });

      const points = createHubList<ChartPointDraft>({
        items: entry.points,
        noun: 'point',
        label: `Series ${n} points`,
        variant: 'compact',
        min: 1,
        max: 24,
        minReason: 'A series needs at least one point.',
        maxReason: 'A series holds up to 24 points.',
        create: () => ({ x: '', y: 0 }),
        duplicate: (point) => ({ ...point }),
        onChange: (next) => ctx.update({ ...ctx.current, points: next }),
        renderItem: (point, pointCtx) => {
          const m = pointCtx.index + 1;
          const x = editorField('block-editor__chart-point-x', String(point.x), 'X', `Series ${n} point ${m} X`, (value) =>
            pointCtx.update({ ...pointCtx.current, x: parseChartX(value) })
          );
          const y = editorField('block-editor__chart-point-y', String(point.y), 'Y', `Series ${n} point ${m} Y`, (value) =>
            pointCtx.update({ ...pointCtx.current, y: parseChartY(value) }), 'number'
          );
          return fragmentOf(x, y);
        }
      });
      points.el.classList.add('block-editor__chart-points');

      return fragmentOf(fieldPair(name, colour.el), points.el);
    }
  });
  seriesList.el.classList.add('block-editor__chart-series');

  const settings = document.createElement('div');
  settings.className = 'block-editor__inline-settings';
  settings.append(chartTypeSelect.el);

  preview.innerHTML = buildChartSvg(content());
  fields.append(settings, title, fieldPair(xLabel, yLabel), seriesList.el, preview);
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

  const sourceSelect = document.createElement('select');
  sourceSelect.className = 'block-editor__diagram-source';
  sourceSelect.setAttribute('aria-label', 'Diagram source');
  for (const [value, label] of [
    ['image', 'Image URL'],
    ['svg', 'Inline SVG']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = source === value;
    sourceSelect.append(opt);
  }

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

  sourceSelect.addEventListener('change', () => {
    source = sourceSelect.value as typeof source;
    renderSourceFields();
    emitChange();
  });
  imageUrl.addEventListener('input', emitChange);
  imageAlt.addEventListener('input', emitChange);
  svgMarkup.addEventListener('input', emitChange);
  caption.addEventListener('input', emitChange);

  renderSourceFields();
  updatePreview();
  fields.append(sourceSelect, imageUrl, imageAlt, svgMarkup, caption, preview);
  return editorShell(block, onChange, fields, getLatest);
}

type GraphBlock = Extract<Block, { block_type: 'mind_map' | 'concept_map' }>;

function createGraphBlockEditor<T extends GraphBlock>(
  block: T,
  onChange: BlockChangeHandler<T>,
  getLatest: () => T
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__graph-fields';
  const kind = block.block_type === 'mind_map' ? 'mind' : 'concept';
  mountGraphEditor(fields, {
    kind,
    content: block.content,
    idPrefix: block.id,
    titleClassName: kind === 'mind' ? 'block-editor__mind-map-title' : 'block-editor__concept-map-title',
    onChange: (content) =>
      onChange({
        ...getLatest(),
        content: {
          ...content,
          edges: content.edges.map(({ label, ...edge }) => (label?.trim() ? { ...edge, label } : edge))
        }
      } as T)
  });
  return editorShell(block, onChange, fields, getLatest);
}

export function createMindMapEditor(
  block: Extract<Block, { block_type: 'mind_map' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'mind_map' }>>,
  getLatest: () => Extract<Block, { block_type: 'mind_map' }> = () => block
): HTMLElement {
  return createGraphBlockEditor(block, onChange, getLatest);
}

export function createConceptMapEditor(
  block: Extract<Block, { block_type: 'concept_map' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'concept_map' }>>,
  getLatest: () => Extract<Block, { block_type: 'concept_map' }> = () => block
): HTMLElement {
  return createGraphBlockEditor(block, onChange, getLatest);
}

export function createWhiteboardEditor(
  block: Extract<Block, { block_type: 'whiteboard' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'whiteboard' }>>,
  getLatest: () => Extract<Block, { block_type: 'whiteboard' }> = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields block-editor__whiteboard-fields';

  const meta = document.createElement('div');
  meta.className = 'block-editor__whiteboard-meta';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__whiteboard-title';
  title.value = block.content.title ?? '';
  title.placeholder = 'Whiteboard title (optional)';
  title.setAttribute('aria-label', 'Whiteboard title');

  const height = document.createElement('input');
  height.type = 'number';
  height.className = 'block-editor__whiteboard-height';
  height.min = '360';
  height.max = '1400';
  height.step = '40';
  height.value = String(block.content.height_px ?? 640);
  height.setAttribute('aria-label', 'Whiteboard height in pixels');

  const status = document.createElement('span');
  status.className = 'block-editor__whiteboard-status';
  status.setAttribute('role', 'status');

  const surface = document.createElement('div');
  surface.className = 'block-editor__whiteboard-surface';
  surface.style.height = `${block.content.height_px ?? 640}px`;

  const emitMetadata = () => {
    const latest = getLatest();
    const nextHeight = Math.max(360, Math.min(1400, Number(height.value) || 640));
    surface.style.height = `${nextHeight}px`;
    onChange({
      ...latest,
      content: {
        ...latest.content,
        title: title.value.trim() || undefined,
        height_px: nextHeight
      }
    });
  };

  title.addEventListener('input', emitMetadata);
  height.addEventListener('change', emitMetadata);

  meta.append(title, height, status);
  fields.append(meta, surface);

  void mountHubWhiteboard(surface, block, {
    readOnly: false,
    onBlockChange: (next) => {
      const latest = getLatest();
      const { seed_document_id: _seed, ...content } = latest.content;
      onChange({
        ...latest,
        content: {
          ...content,
          document_id: next.content.document_id
        }
      });
    },
    onStatus: (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('block-editor__whiteboard-status--error', isError);
    }
  });

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

  const source = document.createElement('select');
  source.className = 'block-editor__collection-source';
  source.setAttribute('aria-label', 'Collection source');
  for (const [value, label] of [
    ['unit_lessons', 'Unit lessons'],
    ['recent_lessons', 'Recent lessons']
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = block.content.source === value;
    source.append(opt);
  }

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
        source: source.value as 'unit_lessons' | 'recent_lessons',
        title: title.value.trim() || undefined
      }
    };
    onChange(draft);
    updatePreview(draft);
  };

  source.addEventListener('change', emitChange);
  title.addEventListener('input', emitChange);

  fields.append(source, title, preview);
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
    case 'whiteboard':
      return createWhiteboardEditor(block, onChange, latest as () => Extract<Block, { block_type: 'whiteboard' }>);
    case 'spacer':
      return createSpacerEditor(block, onChange, latest as () => Extract<Block, { block_type: 'spacer' }>);
    case 'section':
      return createSectionEditor(block, onChange, latest as () => Extract<Block, { block_type: 'section' }>, context);
    case 'columns':
      return createColumnsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'columns' }>, context);
    case 'tabs':
      return createTabsEditor(block, onChange, latest as () => Extract<Block, { block_type: 'tabs' }>, context);
  }
}
