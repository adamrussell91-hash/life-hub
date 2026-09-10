# Map / Slides / Document Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `embed` provider-aware for Google Maps/Slides/Docs and PDFs, with friendly Media-menu presets and hybrid student render (iframe vs resource card).

**Architecture:** Extend embed content with optional `provider` + `embed_url`; add `embed-url.ts` parse/derive helpers (video-url pattern); insert aliases create embed presets; renderer chooses iframe (maps/slides/generic) or card (docs/pdf).

**Tech Stack:** TypeScript, Zod, Vitest (happy-dom)

**Spec:** `docs/superpowers/specs/2026-08-09-embed-viewers-design.md`

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/schemas/block.ts` | `EmbedProviderSchema`; extend embed `content` |
| `src/blocks/embed-url.ts` | Detect provider + derive `embed_url` |
| `src/blocks/create-block.ts` | Embed defaults; insert aliases; `createFromInsertMenu` |
| `src/blocks/editors.ts` | Embed editor detect + provider select |
| `src/blocks/render.ts` | Hybrid iframe / card render |
| `src/styles/app.css` | `.block-embed__card` styles |
| `src/teacher/lesson-editor.ts` | Use `createFromInsertMenu` + alias labels |
| `src/teacher/sections/homepage-editor.ts` | Same insert resolution |
| `src/blocks/nested-blocks-editor.ts` | Same insert resolution |
| `tests/unit/embed-url.test.ts` | Parse matrix |
| `tests/unit/embed-viewers.test.ts` | Schema + create + render |
| `docs/BUILD.md` | History / Next up / projection |

---

### Task 1: Schema + embed-url helper

**Files:**
- Modify: `src/schemas/block.ts`
- Create: `src/blocks/embed-url.ts`
- Create: `tests/unit/embed-url.test.ts`
- Modify: `tests/unit/embed-viewers.test.ts` (schema section) — create this file

- [ ] **Step 1: Write failing tests**

Create `tests/unit/embed-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEmbedInput, embedFrameSrc } from '@/blocks/embed-url';

describe('parseEmbedInput', () => {
  it('detects Google Slides and derives embed url', () => {
    const parsed = parseEmbedInput(
      'https://docs.google.com/presentation/d/abc123XYZ/edit#slide=id.p'
    );
    expect(parsed).toEqual({
      provider: 'google_slides',
      embed_url: 'https://docs.google.com/presentation/d/abc123XYZ/embed'
    });
  });

  it('detects Google Docs (no embed_url)', () => {
    expect(parseEmbedInput('https://docs.google.com/document/d/doc99/edit')).toEqual({
      provider: 'google_docs'
    });
  });

  it('detects Drive file as pdf', () => {
    expect(parseEmbedInput('https://drive.google.com/file/d/fileABC/view')).toEqual({
      provider: 'pdf'
    });
  });

  it('detects direct pdf urls', () => {
    expect(parseEmbedInput('https://cdn.example.com/notes/week1.pdf')).toEqual({
      provider: 'pdf'
    });
  });

  it('detects Google Maps place with coordinates', () => {
    const parsed = parseEmbedInput(
      'https://www.google.com/maps/place/Sydney/@-33.8688,151.2093,12z'
    );
    expect(parsed?.provider).toBe('google_maps');
    expect(parsed?.embed_url).toContain('output=embed');
    expect(parsed?.embed_url).toContain('-33.8688');
    expect(parsed?.embed_url).toContain('151.2093');
  });

  it('passes through existing maps embed urls', () => {
    const url = 'https://www.google.com/maps/embed?pb=hello';
    expect(parseEmbedInput(url)).toEqual({
      provider: 'google_maps',
      embed_url: url
    });
  });

  it('returns generic for unknown http urls', () => {
    expect(parseEmbedInput('https://example.com/page')).toEqual({
      provider: 'generic'
    });
  });

  it('returns null for empty or non-http', () => {
    expect(parseEmbedInput('')).toBeNull();
    expect(parseEmbedInput('javascript:alert(1)')).toBeNull();
  });
});

describe('embedFrameSrc', () => {
  it('uses embed_url when present', () => {
    expect(
      embedFrameSrc({
        url: 'https://docs.google.com/presentation/d/abc/edit',
        provider: 'google_slides',
        embed_url: 'https://docs.google.com/presentation/d/abc/embed'
      })
    ).toBe('https://docs.google.com/presentation/d/abc/embed');
  });

  it('returns null for card-first providers', () => {
    expect(embedFrameSrc({ url: 'https://docs.google.com/document/d/x/edit', provider: 'google_docs' })).toBeNull();
    expect(embedFrameSrc({ url: 'https://x.com/a.pdf', provider: 'pdf' })).toBeNull();
  });

  it('falls back to url for generic', () => {
    expect(embedFrameSrc({ url: 'https://example.com', provider: 'generic' })).toBe(
      'https://example.com'
    );
  });
});
```

Create schema tests at top of `tests/unit/embed-viewers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EmbedBlockSchema, EmbedProviderSchema } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

describe('embed provider schema', () => {
  it('accepts all providers', () => {
    for (const provider of EmbedProviderSchema.options) {
      const block = EmbedBlockSchema.parse({
        id: 'e1',
        type: 'block',
        block_type: 'embed',
        variant: 'large',
        visibility: 'student_teacher',
        layout: {},
        print: {},
        settings: {},
        ...timestamps,
        schema_version: 1,
        content: { url: 'https://example.com', provider }
      });
      expect(block.content.provider).toBe(provider);
    }
  });

  it('accepts legacy embed without provider', () => {
    const block = EmbedBlockSchema.parse({
      id: 'e1',
      type: 'block',
      block_type: 'embed',
      variant: 'large',
      visibility: 'student_teacher',
      layout: {},
      print: {},
      settings: {},
      ...timestamps,
      schema_version: 1,
      content: { url: 'https://example.com' }
    });
    expect(block.content.provider).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run tests/unit/embed-url.test.ts tests/unit/embed-viewers.test.ts
```

- [ ] **Step 3: Implement schema + helper**

In `src/schemas/block.ts` near other enums:

```ts
export const EmbedProviderSchema = z.enum([
  'google_maps',
  'google_slides',
  'google_docs',
  'pdf',
  'generic'
]);
export type EmbedProvider = z.infer<typeof EmbedProviderSchema>;
```

Update `EmbedBlockSchema` content:

```ts
content: z.object({
  url: z.string(),
  title: z.string().optional(),
  provider: EmbedProviderSchema.optional(),
  embed_url: z.string().optional()
}),
```

Create `src/blocks/embed-url.ts`:

```ts
import { isHttpUrl } from '@/blocks/url-safety';
import type { EmbedProvider } from '@/schemas/block';

export interface ParsedEmbed {
  provider: EmbedProvider;
  embed_url?: string;
}

function slidesEmbedFromPath(pathname: string): string | undefined {
  const match = pathname.match(/\/presentation\/d\/([^/]+)/);
  if (!match) return undefined;
  return `https://docs.google.com/presentation/d/${match[1]}/embed`;
}

export function parseEmbedInput(raw: string): ParsedEmbed | null {
  const input = raw.trim();
  if (!input || !isHttpUrl(input)) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'docs.google.com' && url.pathname.includes('/presentation/')) {
    const embed_url = slidesEmbedFromPath(url.pathname);
    return { provider: 'google_slides', ...(embed_url ? { embed_url } : {}) };
  }

  if (host === 'docs.google.com' && url.pathname.includes('/document/')) {
    return { provider: 'google_docs' };
  }

  if (host === 'drive.google.com' && url.pathname.includes('/file/d/')) {
    return { provider: 'pdf' };
  }

  if (url.pathname.toLowerCase().endsWith('.pdf')) {
    return { provider: 'pdf' };
  }

  const isMaps =
    host === 'maps.google.com' ||
    host === 'google.com' && url.pathname.startsWith('/maps') ||
    host.endsWith('.google.com') && url.pathname.startsWith('/maps') ||
    host === 'goo.gl' && url.pathname.startsWith('/maps');

  if (isMaps || (host === 'google.com' && url.pathname.startsWith('/maps'))) {
    if (url.pathname.includes('/embed') || url.searchParams.get('output') === 'embed') {
      return { provider: 'google_maps', embed_url: url.toString() };
    }
    const at = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (at) {
      return {
        provider: 'google_maps',
        embed_url: `https://maps.google.com/maps?q=${at[1]},${at[2]}&z=15&output=embed`
      };
    }
    return {
      provider: 'google_maps',
      embed_url: `https://maps.google.com/maps?q=${encodeURIComponent(url.href)}&output=embed`
    };
  }

  return { provider: 'generic' };
}

export function embedFrameSrc(content: {
  url: string;
  provider?: EmbedProvider;
  embed_url?: string;
}): string | null {
  const provider = content.provider ?? 'generic';
  if (provider === 'google_docs' || provider === 'pdf') return null;
  if (!isHttpUrl(content.url) && !(content.embed_url && isHttpUrl(content.embed_url))) {
    return null;
  }
  if (content.embed_url && isHttpUrl(content.embed_url)) return content.embed_url.trim();
  if (provider === 'google_slides' || provider === 'google_maps') {
    const parsed = parseEmbedInput(content.url);
    if (parsed?.embed_url && isHttpUrl(parsed.embed_url)) return parsed.embed_url;
  }
  if (isHttpUrl(content.url)) return content.url.trim();
  return null;
}

export function embedUsesIframe(provider?: EmbedProvider): boolean {
  const p = provider ?? 'generic';
  return p === 'google_slides' || p === 'google_maps' || p === 'generic';
}
```

Fix maps host check operator precedence carefully:

```ts
const isMaps =
  host === 'maps.google.com' ||
  host === 'goo.gl' && url.pathname.startsWith('/maps') ||
  (host === 'google.com' || host.endsWith('.google.com')) &&
    url.pathname.startsWith('/maps');
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/unit/embed-url.test.ts tests/unit/embed-viewers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/schemas/block.ts src/blocks/embed-url.ts tests/unit/embed-url.test.ts tests/unit/embed-viewers.test.ts
git commit -m "$(cat <<'EOF'
feat: add embed provider schema and URL detection

Detect Google Maps/Slides/Docs and PDF links; derive Slides/Maps embed URLs.
EOF
)"
```

---

### Task 2: Create defaults + insert menu aliases

**Files:**
- Modify: `src/blocks/create-block.ts`
- Modify: `src/teacher/lesson-editor.ts`
- Modify: `src/teacher/sections/homepage-editor.ts`
- Modify: `src/blocks/nested-blocks-editor.ts`
- Modify: `tests/unit/embed-viewers.test.ts`

- [ ] **Step 1: Write failing create/alias tests**

Append to `tests/unit/embed-viewers.test.ts`:

```ts
import {
  createBlock,
  createFromInsertMenu,
  EMBED_INSERT_PRESETS,
  INSERT_MENU_LABEL,
  expandGroupTypesForMenu
} from '@/blocks/create-block';
import type { Block } from '@/schemas/block';

describe('embed insert presets', () => {
  it('createBlock embed defaults to generic', () => {
    const block = createBlock('embed', 'e1');
    expect(block.block_type).toBe('embed');
    if (block.block_type === 'embed') {
      expect(block.content.provider).toBe('generic');
    }
  });

  it('createFromInsertMenu sets providers for Map/Slides/Document/PDF', () => {
    const expected: Record<string, string> = {
      'embed:google_maps': 'google_maps',
      'embed:google_slides': 'google_slides',
      'embed:google_docs': 'google_docs',
      'embed:pdf': 'pdf'
    };
    for (const preset of EMBED_INSERT_PRESETS) {
      const block = createFromInsertMenu(preset.value, 'x') as Extract<
        Block,
        { block_type: 'embed' }
      >;
      expect(block.block_type).toBe('embed');
      expect(block.content.provider).toBe(expected[preset.value]);
    }
  });

  it('expandGroupTypesForMenu inserts aliases after embed', () => {
    const expanded = expandGroupTypesForMenu(['video', 'embed', 'audio']);
    expect(expanded).toEqual([
      'video',
      'embed',
      'embed:google_maps',
      'embed:google_slides',
      'embed:google_docs',
      'embed:pdf',
      'audio'
    ]);
    expect(INSERT_MENU_LABEL['embed:google_slides']).toBe('Slides');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/embed-viewers.test.ts
```

- [ ] **Step 3: Implement create + menu wiring**

In `create-block.ts`:

```ts
import type { EmbedProvider } from '@/schemas/block';

export const EMBED_INSERT_PRESETS = [
  { value: 'embed:google_maps', label: 'Map', provider: 'google_maps' as const },
  { value: 'embed:google_slides', label: 'Slides', provider: 'google_slides' as const },
  { value: 'embed:google_docs', label: 'Document', provider: 'google_docs' as const },
  { value: 'embed:pdf', label: 'PDF', provider: 'pdf' as const }
] as const;

export type EmbedInsertValue = (typeof EMBED_INSERT_PRESETS)[number]['value'];
export type InsertMenuValue = NewBlockType | EmbedInsertValue;

export const INSERT_MENU_LABEL: Record<InsertMenuValue, string> = {
  ...NEW_BLOCK_LABEL,
  'embed:google_maps': 'Map',
  'embed:google_slides': 'Slides',
  'embed:google_docs': 'Document',
  'embed:pdf': 'PDF'
};

export function expandGroupTypesForMenu(
  types: readonly NewBlockType[]
): InsertMenuValue[] {
  const out: InsertMenuValue[] = [];
  for (const t of types) {
    out.push(t);
    if (t === 'embed') {
      for (const preset of EMBED_INSERT_PRESETS) out.push(preset.value);
    }
  }
  return out;
}

export function createFromInsertMenu(value: string, id: string): Block {
  const preset = EMBED_INSERT_PRESETS.find((p) => p.value === value);
  if (preset) {
    return createEmbedBlock(id, preset.provider);
  }
  return createBlock(value as NewBlockType, id);
}

function createEmbedBlock(id: string, provider: EmbedProvider): Block {
  const shared = /* same as createBlock shared fields with id */;
  return {
    ...shared,
    block_type: 'embed',
    variant: 'large',
    content: { url: '', provider }
  };
}
```

Update `case 'embed':` in `createBlock` to `return createEmbedBlock(id, 'generic');` (or inline `provider: 'generic'`).

Refactor `createBlock` so shared timestamp helper is reusable by `createEmbedBlock`.

In `lesson-editor.ts`, `homepage-editor.ts`, `nested-blocks-editor.ts`:

- When building `<option>`s, use `expandGroupTypesForMenu(group.types)` (nested: filter allowed types first, then expand).
- Labels: `INSERT_MENU_LABEL[value]`
- On add: `createFromInsertMenu(select.value, id)` instead of `createBlock(type, id)`

Nested editor pattern:

```ts
const baseTypes = group.types.filter((t) => options.allowedTypes.includes(t));
const menuTypes = expandGroupTypesForMenu(baseTypes);
for (const type of menuTypes) {
  const opt = document.createElement('option');
  opt.value = type;
  opt.textContent = INSERT_MENU_LABEL[type];
  og.append(opt);
}
// on add:
emit([...blocks, createFromInsertMenu(select.value, nextId())]);
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/embed-viewers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/create-block.ts src/teacher/lesson-editor.ts src/teacher/sections/homepage-editor.ts src/blocks/nested-blocks-editor.ts tests/unit/embed-viewers.test.ts
git commit -m "$(cat <<'EOF'
feat: add Map/Slides/Document/PDF insert presets

Media menu aliases create embed blocks with the matching provider.
EOF
)"
```

---

### Task 3: Editor + render + CSS

**Files:**
- Modify: `src/blocks/editors.ts` (`createEmbedEditor`)
- Modify: `src/blocks/render.ts` (`renderEmbedBlock`)
- Modify: `src/styles/app.css`
- Modify: `tests/unit/embed-viewers.test.ts`
- Modify: `tests/unit/render-blocks.test.ts` (keep legacy generic case green)

- [ ] **Step 1: Write failing editor + render tests**

Append to `tests/unit/embed-viewers.test.ts`:

```ts
import { createEmbedEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { createBlock } from '@/blocks/create-block';

describe('embed editor detect', () => {
  it('updates provider and embed_url when URL changes', () => {
    const block = createBlock('embed', 'e1') as Extract<Block, { block_type: 'embed' }>;
    let latest = block;
    const root = createEmbedEditor(block, (next) => {
      latest = next;
    }, () => latest);

    const url = root.querySelector('.block-editor__embed-url') as HTMLInputElement;
    url.value = 'https://docs.google.com/presentation/d/abc123XYZ/edit';
    url.dispatchEvent(new Event('input'));

    expect(latest.content.provider).toBe('google_slides');
    expect(latest.content.embed_url).toBe(
      'https://docs.google.com/presentation/d/abc123XYZ/embed'
    );
  });
});

describe('embed hybrid render', () => {
  const base = {
    id: 'b1',
    type: 'block' as const,
    variant: 'large',
    visibility: 'student_teacher' as const,
    layout: {},
    print: {},
    settings: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema_version: 1 as const
  };

  it('renders slides iframe from embed_url', () => {
    const el = renderBlock(
      {
        ...base,
        block_type: 'embed',
        content: {
          url: 'https://docs.google.com/presentation/d/abc/edit',
          provider: 'google_slides',
          embed_url: 'https://docs.google.com/presentation/d/abc/embed',
          title: 'Deck'
        }
      },
      'student'
    );
    expect(el.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://docs.google.com/presentation/d/abc/embed'
    );
    expect(el.querySelector('a')?.getAttribute('href')).toContain('presentation');
  });

  it('renders docs as resource card without iframe', () => {
    const el = renderBlock(
      {
        ...base,
        block_type: 'embed',
        content: {
          url: 'https://docs.google.com/document/d/doc1/edit',
          provider: 'google_docs',
          title: 'Worksheet'
        }
      },
      'student'
    );
    expect(el.querySelector('iframe')).toBeNull();
    expect(el.querySelector('.block-embed__card')).toBeTruthy();
    expect(el.querySelector('a')?.textContent).toMatch(/Open/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/unit/embed-viewers.test.ts
```

- [ ] **Step 3: Implement editor + render + CSS**

Update `createEmbedEditor` to:

1. Keep URL + title inputs.  
2. Add provider `<select class="block-editor__embed-provider">` with EmbedProviderSchema options (labels: Google Maps, Google Slides, Google Docs, PDF, Generic).  
3. On URL input: `parseEmbedInput(url.value)`; if parsed, set provider select + store embed_url.  
4. `emitChange` writes `{ url, title?, provider, embed_url? }` — omit embed_url when undefined.  
5. On provider change: clear embed_url then re-parse URL if present to refill when compatible.  
6. Hint paragraph: `Share settings must allow viewers. Docs and PDFs open as a link card.`

Update `renderEmbedBlock`:

```ts
import { embedFrameSrc, embedUsesIframe } from '@/blocks/embed-url';

export function renderEmbedBlock(...): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'block-embed';
  const safeUrl = isHttpUrl(block.content.url) ? block.content.url.trim() : undefined;
  if (!safeUrl) {
    // unavailable
    return wrapBlock(...);
  }

  const provider = block.content.provider ?? 'generic';
  const frameSrc = embedFrameSrc(block.content);

  if (embedUsesIframe(provider) && frameSrc) {
    // existing iframe + open link using safeUrl
  } else {
    const card = document.createElement('div');
    card.className = 'block-embed__card';
    const title = document.createElement('p');
    title.className = 'block-embed__card-title';
    title.textContent = block.content.title?.trim() || defaultTitle(provider);
    const meta = document.createElement('p');
    meta.className = 'block-embed__card-meta';
    meta.textContent = providerLabel(provider);
    const link = document.createElement('a');
    link.className = 'block-embed__open';
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in new tab';
    card.append(title, meta, link);
    wrap.append(card);
  }
  return wrapBlock(wrap, block, mode);
}
```

CSS (near existing embed styles):

```css
.block-embed__card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--color-ink) 12%, transparent);
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
}

.block-embed__card-title {
  margin: 0;
  font-weight: 600;
}

.block-embed__card-meta {
  margin: 0;
  font-size: 0.875rem;
  opacity: 0.75;
}
```

(Use existing design tokens from nearby media block CSS if variable names differ.)

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run tests/unit/embed-viewers.test.ts tests/unit/render-blocks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/blocks/editors.ts src/blocks/render.ts src/styles/app.css tests/unit/embed-viewers.test.ts
git commit -m "$(cat <<'EOF'
feat: hybrid embed editor and viewer for Maps/Slides/Docs/PDF

Auto-detect on paste; iframe for Maps/Slides; resource card for Docs/PDF.
EOF
)"
```

---

### Task 4: BUILD.md + full verification

**Files:**
- Modify: `docs/BUILD.md`

- [ ] **Step 1: Update BUILD.md**

- History row for Map / Slides / Document viewer (link design + plan)  
- Next up → A4 print (or platform tracks)  
- Tick Content/media Map/Slides/Document  
- Phase 5: viewers done  
- Latest note  

- [ ] **Step 2: Full unit suite**

```bash
npm run test:unit
```

Expected: pass

- [ ] **Step 3: Commit**

```bash
git add docs/BUILD.md docs/superpowers/specs/2026-08-09-embed-viewers-design.md docs/superpowers/plans/2026-08-09-embed-viewers.md
git commit -m "$(cat <<'EOF'
docs: mark embed viewers shipped in BUILD roadmap
EOF
)"
```

---

## Done when

- Media menu offers Map / Slides / Document / PDF presets  
- Paste into Embed auto-detects Google/PDF URLs  
- Student view: iframe for Maps/Slides/generic; card for Docs/PDF; Open link always when URL valid  
- Legacy embeds without provider still work  
- Tests green; BUILD.md updated  

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| provider + embed_url on embed | 1 |
| URL detection matrix | 1 |
| Insert aliases | 2 |
| Editor detect + provider | 3 |
| Hybrid render | 3 |
| BUILD.md | 4 |
| No Drive / new primitives | out of scope (honoured) |
