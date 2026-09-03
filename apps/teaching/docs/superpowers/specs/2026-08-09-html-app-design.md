# Teaching Hub — HTML App Block Design

**Date:** 2026-08-09  
**Status:** Approved for implementation planning  
**Product name:** Teaching Hub  
**Slice:** Interactive block — `html_app` (inline sandboxed HTML + optional laned AI proxy)  
**Depends on:** Lesson builder registry / editors / publish; Netlify functions + published lesson fetch; env keys for providers  
**Parent roadmap:** `docs/BUILD.md` Next up #1; `docs/specs/03_BLOCK_SYSTEM.md` §26–27; `docs/specs/02_DATA_MODEL.md` §43  
**Not this slice:** Stored `app_id` blob library; streaming; tools/function-calling; draft-lesson AI; `allow-same-origin` on srcdoc; Builder UX column drag

## Goal

Ship a thin `html_app` lesson block: teachers paste interactive HTML that runs in a sandboxed iframe, optionally with a **server-enforced AI lane** (OpenAI/Anthropic) whose focus/guardrails are set at design time in block settings — keys never reach students.

## Decisions

| Topic | Choice |
|-------|--------|
| App source | **Inline** `content.html` (not `app_id` blob storage yet) |
| vs `html` block | `html` stays sanitised markup (no scripts); `html_app` is interactive + sandboxed |
| Sandbox | `allow-scripts allow-forms` — **no** `allow-same-origin` |
| Network / AI | Optional laned Netlify proxy; widget may `fetch` that endpoint |
| Keys | Env on Netlify (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) only |
| Guardrails | Block `content.ai` settings (system/focus, provider, model, max_tokens) — not trusted from client body |
| AI surface v1 | Single chat-completion lane; non-streaming `{ text }` |
| Proxy scope | Published lessons only (`lesson_id` + `block_id`) |
| Height | Optional `height_px` (default ~480) |

## Out of scope

- Media Library / stored App objects / large payload offloading (`app_id`)
- Streaming responses; multi-tool / function-calling lanes; rate limits beyond size caps
- AI against **draft** lessons (published lesson JSON only)
- `sandbox` flag `allow-same-origin` (weakens srcdoc isolation)
- Teacher pasting API keys into HTML or block fields
- Visual companion / heavy UI kits / iframe design tools
- Map / Slides / Document viewers; Builder column drag UX

## Data model

```ts
{
  block_type: 'html_app',
  variant: 'large',
  visibility: 'student_teacher' | 'teacher_only',
  content: {
    title?: string;
    html: string;           // full document or fragment
    height_px?: number;     // default 480 when omitted
    ai?: {
      enabled: boolean;
      provider: 'openai' | 'anthropic';
      model: string;
      system: string;       // focus / guardrails (teacher-authored)
      max_tokens: number;   // default 512; hard clamp ≤ 2000
    };
  }
}
```

- Create default: empty `html`, `height_px: 480`, **no `ai` key** until the teacher enables AI in the editor.
- When AI is first enabled, set defaults: `provider: 'openai'`, `model: 'gpt-4o-mini'`, `system: ''`, `max_tokens: 512`, `enabled: true`. Teacher must fill `system` (and may change model) before publish.
- Disabling AI removes `content.ai` (or sets `enabled: false` — prefer **remove `ai` key** so publish rules stay simple).
- Leaf block: allowed in lesson root / section / columns / tabs like other media leaves (same placement rules as `html`).
- No nested `blocks`; no id remap beyond clone of leaf content.

### Builder menus

- Add under Interactive / Media (alongside `html`, embed, etc. — follow existing group naming).
- Include in lesson Add Block menu and nested child allowlists where `html` is allowed.
- Label: **HTML app**.

## Editor

- Fields: optional title; height (number); large HTML textarea; AI toggle.
- When AI enabled: provider select, model text input, system/focus textarea, max_tokens number.
- Preview: same sandboxed iframe as student (teacher edit mode may show iframe below fields or via existing block preview patterns).
- Block chrome: visibility, Delete / Duplicate / reorder unchanged.

## Student / teacher render

1. Build iframe `srcdoc`:
   - If `html` looks like a full document (`<!DOCTYPE` / `<html`), use as-is.
   - Else wrap in a minimal HTML shell (`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>…</body></html>`).
2. If `ai.enabled`, inject a small bootstrap script into the document that defines:

   ```ts
   window.TeachingHubAI = {
     complete(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<{ text: string }>
   }
   ```

   Implementation: `POST` to the AI proxy with `{ lesson_id, block_id, messages }` only. Resolve `lesson_id` / `block_id` from data attributes on the iframe or injected constants set by the renderer (renderer knows lesson + block context — pass via render options or data attributes on the host).
3. Sandbox attribute: `allow-scripts allow-forms`.
4. `referrerpolicy="strict-origin-when-cross-origin"`; `title` from `content.title` or “HTML app”; height from `height_px`.
5. Optional muted note under iframe when AI enabled: “Uses class AI lane”.

**Render context:** `renderHtmlAppBlock` needs `lessonId` when AI is enabled so bootstrap can call the proxy. Teacher preview of unpublished drafts: iframe still renders HTML; AI `complete` may 404 until published — acceptable for v1 (document in editor help text briefly).

## AI proxy

**Endpoint:** `netlify/functions/html-app-ai.mts` (name flexible; keep consistent with existing function style).

**Request (POST JSON):**

```ts
{
  lesson_id: string;
  block_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}
```

**Server behaviour:**

1. Validate body shape; cap `messages` length (e.g. ≤ 20) and total content chars (e.g. ≤ 16k).
2. Load **published** lesson by `lesson_id` (same store as student lesson view).
3. Find block `block_id` with `block_type === 'html_app'` (walk nested columns/section/tabs like other publish walks).
4. Require `content.ai?.enabled === true`; else 403.
5. Build provider request using **only** block lane: `provider`, `model`, `system`, `max_tokens` (clamp ≤ 2000). Ignore any client-supplied system/model.
6. Prepend `system` as the provider system message; append client `messages`.
7. Call OpenAI or Anthropic with env key; return `{ text: string }`.
8. Errors: 400 bad body; 404 lesson/block; 403 lane off; 503 missing env key for provider; 502 upstream failure.

**CORS:** Allow student/teacher site origin(s) like other public Netlify routes (`SITE_ORIGIN` pattern).

**Auth:** No teacher session required for student calls. Published lesson + block lane are the capability boundary.

## Publish / visibility

- Walk nested trees; for `html_app`:
  - `html.trim()` non-empty required.
  - If `ai?.enabled`: require non-empty `system` and `model`; `max_tokens` finite and ≤ 2000.
- Visibility: same as other lesson blocks (`student_teacher` / `teacher_only`).
- Sanitiser: **do not** run rich-text sanitiser on `html_app` content (scripts are intentional inside sandbox).

## Security notes

- Never put provider keys in lesson JSON, block settings UI values beyond provider name, or iframe bootstrap.
- Client cannot widen the lane: system/model/max_tokens come from published block only.
- Omit `allow-same-origin` so srcdoc cannot easily break out of sandbox.
- Proxy does not expose raw provider error bodies that might leak key material; generic 502 message is enough.

## Testing

- Schema: accept valid `html_app`; reject bad AI enums / missing required when enabled.
- Publish rules for empty html / enabled AI without system.
- Render: iframe present; sandbox string; bootstrap injected iff AI enabled.
- Proxy helpers (pure where possible): lane resolve from nested lesson; reject when disabled; clamp max_tokens; ignore client model/system if ever present in body.
- Lean unit tests only; no new Playwright suite required for this slice.

## BUILD.md updates (end of slice)

- History: HTML app (+ laned AI proxy).
- Next up #1 → Builder UX (column drag / free widths); remove `html_app` from Next up.
- Projection: tick `html_app`.
- Latest note: html_app shipped; Builder UX next.

## Approach rejected (record)

- Parent-only postMessage AI bridge — extra shell wiring; not needed if CORS proxy works.
- Trusting client-sent system prompts — breaks design-time guardrails.
- Full `app_id` blob storage — deferred until Media Library / app library exists.
