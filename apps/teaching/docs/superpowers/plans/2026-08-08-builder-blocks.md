# Builder Blocks (Image / Video / Embed / HTML) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add URL-based `image`, `video`, `embed`, and sanitised `html` blocks to the lesson editor, schema, renderers, and publish pipeline so teachers can save/publish them and students see safe output.

**Architecture:** Extend the existing Zod `Block` discriminated union and `blockRegistry` (schema → editor → renderer). Small pure helpers for HTTP URL checks and YouTube/Vimeo parsing. Publish path (mock-api + Netlify) sanitises `html` like `rich_text` and rejects incomplete media via `PublishableLessonSchema` refinements.

**Tech Stack:** TypeScript, Zod, Vite, Vitest (happy-dom), existing DOM sanitiser

**Spec:** `docs/superpowers/specs/2026-08-08-builder-blocks-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/blocks/url-safety.ts` | `isHttpUrl(value)` |
| `src/blocks/video-url.ts` | Parse YouTube/Vimeo URL or bare id → `{ provider, external_id }` |
| `src/schemas/block.ts` | New block schemas + union |
| `src/schemas/lesson.ts` | Publish refinements for new block rules |
| `src/blocks/render.ts` | Renderers for four types |
| `src/blocks/editors.ts` | Field editors for four types |
| `src/blocks/registry.ts` | Register four types |
| `src/teacher/lesson-editor.ts` | Add-block menu + factories |
| `scripts/mock-api.ts` | Sanitise `html` on publish |
| `netlify/functions/publish.mts` | Same sanitise on publish |
| `src/styles/app.css` | Figure / iframe / embed-card styles |
| `tests/unit/url-safety.test.ts` | URL helper |
| `tests/unit/video-url.test.ts` | Video parse |
| `tests/unit/schemas-lesson.test.ts` | Extend block + publishable cases |
| `tests/unit/render-blocks.test.ts` | New render cases |
| `tests/unit/lesson-editor.test.ts` | Add new block types if practical |

---

### Task 1: URL safety + video URL helpers

**Files:**
- Create: `src/blocks/url-safety.ts`
- Create: `src/blocks/video-url.ts`
- Create: `tests/unit/url-safety.test.ts`
- Create: `tests/unit/video-url.test.ts`

- [ ] **Step 1: Write failing URL safety tests**

Create `tests/unit/url-safety.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isHttpUrl } from '@/blocks/url-safety';

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('https://example.com/a.png')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript, data, and empty', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,hi')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run from repo root:

```
npx vitest run --config "./vite.config.ts" tests/unit/url-safety.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/blocks/url-safety.ts`**

```ts
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Write failing video-url tests**

Create `tests/unit/video-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseVideoInput } from '@/blocks/video-url';

describe('parseVideoInput', () => {
  it('parses YouTube watch and youtu.be URLs', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
    expect(parseVideoInput('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
  });

  it('parses Vimeo URLs', () => {
    expect(parseVideoInput('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      external_id: '123456789'
    });
  });

  it('parses bare YouTube ids', () => {
    expect(parseVideoInput('dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      external_id: 'dQw4w9WgXcQ'
    });
  });

  it('returns null for unrecognised input', () => {
    expect(parseVideoInput('')).toBeNull();
    expect(parseVideoInput('https://example.com/video')).toBeNull();
  });
});
```

- [ ] **Step 5: Run to verify fail**

```
npx vitest run --config "./vite.config.ts" tests/unit/video-url.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Implement `src/blocks/video-url.ts`**

```ts
export type VideoProvider = 'youtube' | 'vimeo';

export interface ParsedVideo {
  provider: VideoProvider;
  external_id: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d+$/;

export function parseVideoInput(raw: string): ParsedVideo | null {
  const input = raw.trim();
  if (!input) return null;

  if (YOUTUBE_ID.test(input)) {
    return { provider: 'youtube', external_id: input };
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      if (YOUTUBE_ID.test(id)) return { provider: 'youtube', external_id: id };
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const v = url.searchParams.get('v');
      if (v && YOUTUBE_ID.test(v)) return { provider: 'youtube', external_id: v };
      const embed = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})/);
      if (embed) return { provider: 'youtube', external_id: embed[1] };
    }

    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      if (VIMEO_ID.test(id)) return { provider: 'vimeo', external_id: id };
    }
  } catch {
    // not a URL
  }

  return null;
}

export function videoEmbedSrc(provider: VideoProvider, externalId: string): string {
  if (provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}`;
  }
  return `https://player.vimeo.com/video/${encodeURIComponent(externalId)}`;
}
```

- [ ] **Step 7: Run both test files — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/url-safety.test.ts tests/unit/video-url.test.ts
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/blocks/url-safety.ts src/blocks/video-url.ts \
  tests/unit/url-safety.test.ts tests/unit/video-url.test.ts
git commit -m "$(cat <<'EOF'
feat: add URL safety and YouTube/Vimeo parse helpers

EOF
)"
```

---

### Task 2: Zod schemas + publish refinements

**Files:**
- Modify: `src/schemas/block.ts`
- Modify: `src/schemas/lesson.ts`
- Modify: `tests/unit/schemas-lesson.test.ts`

- [ ] **Step 1: Write failing schema tests**

Append to `tests/unit/schemas-lesson.test.ts` inside `describe('BlockSchema')` (or a new describe):

```ts
  it('parses image, video, embed, and html blocks', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/a.png', alt_text: 'A painting', caption: 'Fig 1' }
      }).block_type
    ).toBe('image');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_v',
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ' }
      }).block_type
    ).toBe('video');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_e',
        block_type: 'embed',
        variant: 'large',
        content: { url: 'https://example.com/page', title: 'Example' }
      }).block_type
    ).toBe('embed');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'block_h',
        block_type: 'html',
        content: { html: '<p>Hi</p>' }
      }).block_type
    ).toBe('html');
  });

  it('allows empty image url in drafts', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: '', alt_text: '' }
      }).content.url
    ).toBe('');
  });
```

Remove any draft-level “rejects image with non-http url” assertion — that rule lives only on publish.
Add publishable refine tests (new describe or extend existing PublishableLessonSchema tests):

```ts
describe('PublishableLessonSchema media rules', () => {
  const baseLesson = {
    id: 'lesson_1',
    type: 'lesson' as const,
    title: 'Lesson',
    slug: 'lesson',
    status: 'active' as const,
    unit_id: 'unit_aotfw',
    sequence: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  const okImage = {
    ...baseBlock,
    block_type: 'image' as const,
    variant: 'large',
    content: { url: 'https://example.com/a.png', alt_text: 'Alt' }
  };

  it('rejects image missing alt_text on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...okImage, content: { url: 'https://example.com/a.png', alt_text: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('rejects unrecognised video on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'video',
          variant: 'large',
          content: { provider: 'youtube', external_id: '' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty html after trim on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [{ ...baseBlock, block_type: 'html', content: { html: '   ' } }]
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid image video embed html together', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        okImage,
        {
          ...baseBlock,
          id: 'b2',
          block_type: 'video',
          variant: 'large',
          content: { provider: 'vimeo', external_id: '123456789' }
        },
        {
          ...baseBlock,
          id: 'b3',
          block_type: 'embed',
          variant: 'large',
          content: { url: 'https://example.com' }
        },
        {
          ...baseBlock,
          id: 'b4',
          block_type: 'html',
          content: { html: '<p>Ok</p>' }
        }
      ]
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```
npx vitest run --config "./vite.config.ts" tests/unit/schemas-lesson.test.ts
```

- [ ] **Step 3: Extend `src/schemas/block.ts`**

Replace `BlockTypeSchema` and append schemas before the union. Keep existing rich_text/heading/callout schemas unchanged.

```ts
export const BlockTypeSchema = z.enum([
  'rich_text',
  'heading',
  'callout',
  'image',
  'video',
  'embed',
  'html'
]);

export const VideoProviderSchema = z.enum(['youtube', 'vimeo']);

// Draft URLs may be empty while editing; PublishableLessonSchema enforces http(s).
export const ImageBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('image'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    alt_text: z.string(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const VideoBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('video'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    provider: VideoProviderSchema,
    external_id: z.string(),
    url: z.string().optional(),
    title: z.string().optional(),
    caption: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const EmbedBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('embed'),
  variant: z.string().default('large'),
  visibility: VisibilitySchema,
  content: z.object({
    url: z.string(),
    title: z.string().optional()
  }),
  ...blockLayout,
  ...blockTimestamps
});

export const HtmlBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block'),
  block_type: z.literal('html'),
  variant: z.string().default('medium'),
  visibility: VisibilitySchema,
  content: z.object({ html: z.string() }),
  ...blockLayout,
  ...blockTimestamps
});

export const BlockSchema = z.discriminatedUnion('block_type', [
  RichTextBlockSchema,
  HeadingBlockSchema,
  CalloutBlockSchema,
  ImageBlockSchema,
  VideoBlockSchema,
  EmbedBlockSchema,
  HtmlBlockSchema
]);
```

- [ ] **Step 4: Extend `PublishableLessonSchema` in `src/schemas/lesson.ts`**

```ts
import { z } from 'zod';
import { CommonFields, IsoDateSchema } from './common';
import { BlockSchema } from './block';
import { isHttpUrl } from '@/blocks/url-safety';

export const LessonSchema = z.object({
  ...CommonFields,
  type: z.literal('lesson'),
  unit_id: z.string().min(1),
  sequence: z.number().int(),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema.optional()
});

function publishBlockIssues(blocks: z.infer<typeof BlockSchema>[]): string | null {
  for (const block of blocks) {
    if (block.block_type === 'image') {
      if (!isHttpUrl(block.content.url) || block.content.alt_text.trim().length === 0) {
        return 'Image blocks need a valid URL and alt text to publish';
      }
    }
    if (block.block_type === 'video') {
      if (!block.content.external_id.trim()) {
        return 'Video blocks need a recognised YouTube or Vimeo id to publish';
      }
    }
    if (block.block_type === 'embed') {
      if (!isHttpUrl(block.content.url)) {
        return 'Embed blocks need a valid http(s) URL to publish';
      }
    }
    if (block.block_type === 'html') {
      if (block.content.html.trim().length === 0) {
        return 'HTML blocks need content to publish';
      }
    }
  }
  return null;
}

export const PublishableLessonSchema = LessonSchema.superRefine((lesson, ctx) => {
  if (lesson.title.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Title is required to publish', path: ['title'] });
  }
  const blockIssue = publishBlockIssues(lesson.blocks);
  if (blockIssue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: blockIssue, path: ['blocks'] });
  }
});

export type Lesson = z.infer<typeof LessonSchema>;
```

Also add a publish case rejecting `javascript:` image URLs:

```ts
  it('rejects javascript image url on publish', () => {
    const result = PublishableLessonSchema.safeParse({
      ...baseLesson,
      blocks: [
        {
          ...baseBlock,
          block_type: 'image',
          variant: 'large',
          content: { url: 'javascript:alert(1)', alt_text: 'x' }
        }
      ]
    });
    expect(result.success).toBe(false);
  });
```

If existing tests assert the old `.refine` API for title-only failures, update them for `superRefine`.

- [ ] **Step 5: Run tests + tsc — expect PASS**

```
npx vitest run --config "./vite.config.ts" tests/unit/schemas-lesson.test.ts
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/schemas/block.ts src/schemas/lesson.ts tests/unit/schemas-lesson.test.ts
git commit -m "$(cat <<'EOF'
feat: add image video embed html block schemas

EOF
)"
```

---

### Task 3: Renderers + CSS

**Files:**
- Modify: `src/blocks/render.ts`
- Modify: `src/styles/app.css`
- Modify: `tests/unit/render-blocks.test.ts`

- [ ] **Step 1: Write failing render tests**

Add cases to `tests/unit/render-blocks.test.ts` (follow existing patterns for `baseBlock` / timestamps):

```ts
  it('renders image with alt and caption', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'image',
        variant: 'large',
        content: { url: 'https://example.com/a.png', alt_text: 'Alt', caption: 'Caption' }
      },
      'student'
    );
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
    expect(img?.getAttribute('alt')).toBe('Alt');
    expect(el.textContent).toContain('Caption');
  });

  it('renders youtube video iframe lazily', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'video',
        variant: 'large',
        content: { provider: 'youtube', external_id: 'dQw4w9WgXcQ' }
      },
      'student'
    );
    const iframe = el.querySelector('iframe');
    expect(iframe?.getAttribute('loading')).toBe('lazy');
    expect(iframe?.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('renders embed iframe plus open link', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'embed',
        variant: 'large',
        content: { url: 'https://example.com/page', title: 'Example' }
      },
      'student'
    );
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe('https://example.com/page');
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/page');
    expect(link?.textContent).toContain('Example');
  });

  it('sanitises html blocks', () => {
    const el = renderBlock(
      {
        ...baseBlock,
        block_type: 'html',
        content: { html: '<p>Hi</p><script>alert(1)</script>' }
      },
      'student'
    );
    expect(el.innerHTML).toContain('<p>Hi</p>');
    expect(el.innerHTML).not.toContain('script');
  });
```

Import `renderBlock` if not already. Ensure `baseBlock` includes fields matching new schemas (`variant` defaults ok).

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run --config "./vite.config.ts" tests/unit/render-blocks.test.ts
```

- [ ] **Step 3: Implement renderers in `src/blocks/render.ts`**

Add imports:

```ts
import { videoEmbedSrc } from '@/blocks/video-url';
```

Add functions and extend `renderBlock` switch:

```ts
export function renderImageBlock(
  block: Extract<Block, { block_type: 'image' }>,
  mode: RenderMode
): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'block-image';
  const img = document.createElement('img');
  img.src = block.content.url;
  img.alt = block.content.alt_text;
  img.loading = 'lazy';
  figure.append(img);
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
  wrap.className = 'block-video';
  if (block.content.title) {
    const title = document.createElement('p');
    title.className = 'block-video__title';
    title.textContent = block.content.title;
    wrap.append(title);
  }
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
  if (block.content.caption) {
    const cap = document.createElement('p');
    cap.className = 'block-video__caption';
    cap.textContent = block.content.caption;
    wrap.append(cap);
  }
  return wrapBlock(wrap, block, mode);
}

export function renderEmbedBlock(
  block: Extract<Block, { block_type: 'embed' }>,
  mode: RenderMode
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-embed';
  const iframe = document.createElement('iframe');
  iframe.className = 'block-embed__frame';
  iframe.src = block.content.url;
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
  iframe.title = block.content.title || 'Embedded content';
  wrap.append(iframe);

  const link = document.createElement('a');
  link.className = 'block-embed__open';
  link.href = block.content.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = block.content.title?.trim() || 'Open in new tab';
  wrap.append(link);

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
```

Update `renderBlock`:

```ts
export function renderBlock(block: Block, mode: RenderMode): HTMLElement {
  switch (block.block_type) {
    case 'rich_text':
      return renderRichTextBlock(block, mode);
    case 'heading':
      return renderHeadingBlock(block, mode);
    case 'callout':
      return renderCalloutBlock(block, mode);
    case 'image':
      return renderImageBlock(block, mode);
    case 'video':
      return renderVideoBlock(block, mode);
    case 'embed':
      return renderEmbedBlock(block, mode);
    case 'html':
      return renderHtmlBlock(block, mode);
  }
}
```

- [ ] **Step 4: Add CSS** to `src/styles/app.css` (near other block styles):

```css
.block-image img,
.block-video__frame,
.block-embed__frame {
  display: block;
  width: 100%;
  max-width: 100%;
  border: 0;
  border-radius: calc(var(--radius-md) * 0.5);
}

.block-video__frame,
.block-embed__frame {
  aspect-ratio: 16 / 9;
  background: var(--glass);
}

.block-image__caption,
.block-video__caption,
.block-video__title {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--muted);
  margin-top: 0.5rem;
}

.block-embed__open {
  display: inline-block;
  margin-top: 0.5rem;
  font-family: var(--font-ui);
  font-size: 0.85rem;
}
```

- [ ] **Step 5: Run tests + tsc — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/blocks/render.ts src/styles/app.css tests/unit/render-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: render image video embed and html blocks

EOF
)"
```

---

### Task 4: Editors + registry + lesson editor Add menu

**Files:**
- Modify: `src/blocks/editors.ts`
- Modify: `src/blocks/registry.ts`
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `tests/unit/lesson-editor.test.ts` (add one “can add image block” case)

- [ ] **Step 1: Write failing lesson-editor test**

In `tests/unit/lesson-editor.test.ts`, add a test that after mount, clicking the Add control for Image (use the label/button pattern already used for rich_text) results in a block with `data-block-type="image"` (or query `.block-editor[data-block-type="image"]`). Mirror existing add-block tests exactly — read the file for the current button selector before writing.

If Add UI is a `<select>` or buttons with text “Rich text”, extend similarly for “Image”.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement editors**

In `src/blocks/editors.ts`, add:

```ts
export function createImageEditor(
  block: Extract<Block, { block_type: 'image' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'image' }>>
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__image-url';
  url.value = block.content.url;
  url.placeholder = 'https://…';
  url.setAttribute('aria-label', 'Image URL');
  url.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, url: url.value } });
  });

  const alt = document.createElement('input');
  alt.type = 'text';
  alt.className = 'block-editor__image-alt';
  alt.value = block.content.alt_text;
  alt.setAttribute('aria-label', 'Alt text');
  alt.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, alt_text: alt.value } });
  });

  const caption = document.createElement('input');
  caption.type = 'text';
  caption.className = 'block-editor__image-caption';
  caption.value = block.content.caption ?? '';
  caption.setAttribute('aria-label', 'Caption');
  caption.addEventListener('input', () => {
    onChange({
      ...block,
      content: { ...block.content, caption: caption.value || undefined }
    });
  });

  fields.append(url, alt, caption);
  return editorShell(block, onChange, fields);
}

export function createVideoEditor(
  block: Extract<Block, { block_type: 'video' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'video' }>>
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

  url.addEventListener('input', () => {
    const parsed = parseVideoInput(url.value);
    if (parsed) {
      status.textContent = `${parsed.provider}: ${parsed.external_id}`;
      onChange({
        ...block,
        content: {
          ...block.content,
          provider: parsed.provider,
          external_id: parsed.external_id,
          url: url.value
        }
      });
    } else {
      status.textContent = 'Unrecognised video link';
      onChange({
        ...block,
        content: { ...block.content, external_id: '', url: url.value }
      });
    }
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__video-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Video title');
  title.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, title: title.value || undefined } });
  });

  fields.append(url, status, title);
  return editorShell(block, onChange, fields);
}

export function createEmbedEditor(
  block: Extract<Block, { block_type: 'embed' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'embed' }>>
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';

  const url = document.createElement('input');
  url.type = 'url';
  url.className = 'block-editor__embed-url';
  url.value = block.content.url;
  url.setAttribute('aria-label', 'Embed URL');
  url.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, url: url.value } });
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'block-editor__embed-title';
  title.value = block.content.title ?? '';
  title.setAttribute('aria-label', 'Embed title');
  title.addEventListener('input', () => {
    onChange({ ...block, content: { ...block.content, title: title.value || undefined } });
  });

  fields.append(url, title);
  return editorShell(block, onChange, fields);
}

export function createHtmlEditor(
  block: Extract<Block, { block_type: 'html' }>,
  onChange: BlockChangeHandler<Extract<Block, { block_type: 'html' }>>
): HTMLElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'block-editor__html';
  textarea.value = block.content.html;
  textarea.rows = 8;
  textarea.setAttribute('aria-label', 'HTML');
  textarea.addEventListener('input', () => {
    onChange({ ...block, content: { html: textarea.value } });
  });
  return editorShell(block, onChange, textarea);
}
```

Add at top of editors.ts:

```ts
import { parseVideoInput } from '@/blocks/video-url';
```

Update `createBlockEditor` switch (read current function — extend all cases).

- [ ] **Step 4: Update `src/blocks/registry.ts`**

Extend `BlockByType` and `blockRegistry` with image/video/embed/html entries mapping to the new render/editor functions. Re-export new creators/renderers.

- [ ] **Step 5: Update `src/teacher/lesson-editor.ts`**

```ts
const NEW_BLOCK_TYPES = ['rich_text', 'heading', 'callout', 'image', 'video', 'embed', 'html'] as const;

const NEW_BLOCK_LABEL: Record<NewBlockType, string> = {
  rich_text: 'Rich text',
  heading: 'Heading',
  callout: 'Callout',
  image: 'Image',
  video: 'Video',
  embed: 'Embed',
  html: 'HTML'
};
```

Extend `createBlock` switch with image/video/embed/html factories (empty `url` / `external_id` / `html` allowed for drafts).

- [ ] **Step 6: Run lesson-editor + related unit tests + tsc — PASS**
```
npx vitest run --config "./vite.config.ts" tests/unit/lesson-editor.test.ts tests/unit/render-blocks.test.ts tests/unit/schemas-lesson.test.ts
npx tsc -p tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/blocks/editors.ts src/blocks/registry.ts src/teacher/lesson-editor.ts \
  src/schemas/block.ts tests/unit/lesson-editor.test.ts tests/unit/schemas-lesson.test.ts
git commit -m "$(cat <<'EOF'
feat: add editors and Add-block entries for media blocks

EOF
)"
```

---

### Task 5: Publish sanitise `html` (mock-api + Netlify)

**Files:**
- Modify: `scripts/mock-api.ts` (publish mapping)
- Modify: `netlify/functions/publish.mts`
- Modify: `tests/integration/publish-flow.test.ts` and/or unit auth/content tests if they assert sanitise behaviour — add a focused unit test that publish sanitises html blocks

- [ ] **Step 1: Write failing test**

Prefer extending an existing publish integration/unit that uses mock-api: publish a lesson containing an `html` block with `<script>`, then GET published snapshot and assert script stripped.

Example sketch (adapt to how `createMockApi` is used in `tests/integration/publish-flow.test.ts`):

```ts
  it('sanitises html blocks on publish', async () => {
    // arrange: authenticated session, draft lesson with html block containing <script>
    // act: POST publish
    // assert: published blocks html content has no script
  });
```

- [ ] **Step 2: Run — expect FAIL** (html returned unsanitised)

- [ ] **Step 3: Update both publish mappers**

In `scripts/mock-api.ts` and `netlify/functions/publish.mts`, change the map to:

```ts
  const studentBlocks = filterBlocksForStudent(fullSnapshot.blocks).map((block) => {
    if (block.block_type === 'rich_text' || block.block_type === 'html') {
      return {
        ...block,
        content: { html: sanitizeRichTextHtml(block.content.html) }
      };
    }
    return block;
  });
```

- [ ] **Step 4: Run affected tests + tsc — PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/mock-api.ts netlify/functions/publish.mts tests/integration/publish-flow.test.ts
git commit -m "$(cat <<'EOF'
feat: sanitise html blocks on lesson publish

EOF
)"
```

---

### Task 6: Verification

**Files:** none (fix only if needed)

- [ ] **Step 1: Full unit suite**

```
npx vitest run --config "./vite.config.ts" tests/unit
```

Expected: all PASS

- [ ] **Step 2: Integration + build**

```
npx vitest run --config "./vite.config.ts" tests/integration
npm run build
```

Expected: exit 0

- [ ] **Step 3: Playwright**

```
npm run test:browser
```

Expected: PASS (fix selectors only if broken)

- [ ] **Step 4: Manual smoke (optional)**

`npm run dev` — add Image/Video/Embed/HTML, save, publish, open student URL.

- [ ] **Step 5: Commit fixes only if Step 3–4 required changes**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| image/video/embed/html schemas | 2 |
| URL-only media | 1, 2, 4 |
| video URL parse | 1 |
| isHttpUrl | 1 |
| Editors + Add menu | 4 |
| Student render + lazy iframe | 3 |
| Publish validation rules | 2 |
| Sanitise html on publish | 5 |
| CSS | 3 |
| Out of scope media library | — |

## Self-review notes

- Draft image/embed URLs are `z.string()` (may be empty); publish enforces http(s) — avoids broken createBlock → save.  
- `parseVideoInput` / `videoEmbedSrc` / `isHttpUrl` names consistent across tasks.  
- No Media Library / html_app.
