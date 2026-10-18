# Notion → Teaching Hub import — design

**Status:** approved in brainstorm, 18 October 2026. Awaiting spec review.

## Goal

Bring selected units, programs, classes, lessons and syllabuses from the
Notion **Teaching** database into the Teaching Hub, so they look and behave
like native Teaching Hub content. Adam picks what comes over. Messy or
unfinished Notion pages stay behind.

Notion is no longer used for teaching. Re-import exists so that a page can be
brought over again after a fix. It is not a sync.

## Decisions

| Topic | Decision |
|---|---|
| Trigger | An "Import from Notion" picker inside the Teaching Hub. Paste a Notion link or search the Teaching database. |
| Source | Notion public API, through an integration token held as a Netlify secret. The integration has access to the Teaching database only. |
| Selection | Per page, with a preview. Child items can be unticked before import. |
| Re-import | Matched by Notion page ID. Notion wins: the existing copy is saved to version history, then replaced. |
| Big files | Stored in Netlify Blobs, written by the server. Import cap is 200 MB per file, and video types are allowed for imports only. Files over the cap are skipped, keep their original link and get a warning. Expected to be rare. |
| Synced blocks, mentions, inline comments | Plain text. |
| Linked databases | Skipped. |
| Text colour and highlights | Dropped. Text renders in the theme's normal colour. |
| Curriculum Map, Scope and Sequence | Skipped, and listed in the preview. |
| Conversion | Deterministic code. No AI in the conversion path. |

## Source shape

All teaching content lives in one Notion data source, `Teaching`, under
Teaching Dashboard. These are the relevant properties:

- **Category** (select): Workshop, Session, Syllabus, Scope and Sequence,
  Unit, Lesson, Class, Assessment, Program, Enrichment Program, Lab,
  Design Sprint, Seminar, Tutorial, Lecture, Project, Case Study, Game,
  Station Rotation, Curriculum Map.
- **Parent item / Sub-item** (self-relation): the hierarchy.
- **Subject**, **Year Level** (multi-select), **Outcomes** (multi-select of
  NESA codes), **Date/s**, **Files**, **Unit Title**.
- Page cover (an uploaded file) and an emoji icon.

Uploaded-file URLs from Notion are signed and expire within minutes, so every
file is downloaded during the same run that reads it.

## Architecture

```
Teaching Hub: Create → Import from Notion
  │ paste link / search
  ▼
POST /api/notion-import/plan    (background function)
  notion-reader  → NotionTree (raw blocks + properties, whole Sub-item tree)
  mapper         → ImportPlan
  plan stored in Blobs under notion-import/plans/<plan_id>
  ▼
Preview screen (polls the plan)
  ▼
POST /api/notion-import/apply   (background function, plan_id + choices)
  re-reads Notion for fresh file URLs
  media-rehoster → Blobs
  applier        → version-snapshot existing copies, write entities,
                   save the import report
```

### Units

| Unit | Job | Depends on |
|---|---|---|
| `notion-reader` | Fetches a page, its properties, its block children (recursive, paginated) and its Sub-item pages, and returns a `NotionTree`. The only code that calls Notion. | Notion API, token |
| `mapper` | Pure functions. Turn a `NotionTree` plus the existing source map into an `ImportPlan`: the entities to create or replace, their blocks, the media to fetch, and warnings. No network access. | Teaching Hub schemas, outcome catalogue, subjects list |
| `media-rehoster` | Downloads each media reference and writes it to Blobs as a `media` entity, returning the new URLs. Enforces the import cap and the allowed types. | Blobs, `teaching-blobs.mjs` |
| `applier` | Validates each entity against its schema, snapshots the existing version, writes the entity, updates the parent's lesson list, and saves the import report. | Teaching Hub storage and versioning |
| Preview UI | Shows the plan, collects choices and starts the apply step. | The two endpoints |

`ImportPlan` is the contract between the mapper and everything after it. The
mapper's output is fully testable without Notion, and the applier never has to
understand Notion block shapes.

## Entity mapping

| Notion Category | Teaching Hub |
|---|---|
| Unit | `unit`. The page body becomes `unit.blocks`. Sub-items become lessons, in Notion order (`sequence`). |
| Program, Enrichment Program | `unit` with `kind: 'program'`. Same level and fields as a unit. It never appears in a class's `active_unit_ids`. Labelled "Program" in the UI. |
| Lesson, Session | `lesson` with `pedagogical_mode: 'lesson'`. |
| Lab, Workshop, Lecture, Tutorial, Seminar, Project, Case Study, Game, Station Rotation, Design Sprint, Assessment | `lesson` with the matching `pedagogical_mode`. |
| Class | `class`. The title becomes `display_name` and a slug of it becomes `code`. `academic_year` comes from the start of Date/s, otherwise the current year. Year and subject come from the properties. Sub-item units are added to `active_unit_ids`. The page body becomes the class homepage. Students and timetable are not imported. |
| Syllabus | New entity: `document` with `kind: 'syllabus'`, `subject_id`, `blocks` and `cover`. |
| Scope and Sequence, Curriculum Map | Skipped, and listed in the preview. |

A lesson whose Notion parent is not part of the import goes into a unit chosen
in the preview. A lesson imported on its own needs that choice too.

### Properties

- **Subject:** matched by name, ignoring case, to an existing subject. If
  nothing matches, the preview offers to create the subject. The first value
  wins if there are several, and the preview can change it.
- **Year Level:** the lowest year wins, and the preview can change it. It sets
  `year_id`.
- **Outcomes:** each NESA code is matched to the outcome catalogue
  (`outcome_ids`). Unmatched codes produce warnings. The lists stay within
  the schema's 24-item limit, and anything over produces a warning.
- **Date/s:** sets a unit's `start_date` and `end_date`. Ignored on lessons.
- **Files:** each file becomes an `attachment` block at the end of the page,
  stored again in Blobs.
- **Cover:** downloaded and stored again as `cover`. Emoji icons are dropped.
- **Unit Title, Blocked by, Blocking:** ignored.

### Source link

Every imported entity gets
`source: { system: 'notion', page_id, imported_at, last_edited_at }`.
A source map in Blobs (`notion-import/source-map`, `page_id → entity id`)
lets the preview badge "updates existing copy" without scanning everything.

## Block mapping

The Teaching Hub limits nesting:

- **Top level:** any block.
- **`section`:** leaf blocks, `columns` and `tabs`.
- **`tabs`:** leaf blocks and `columns`. 2–8 tabs. No sections and no tabs.
- **`columns`:** leaf blocks only. Widths add up to 12.
- **`callout` and `accordion`:** bodies are rich-text strings.

### Straight swaps

| Notion | Teaching Hub |
|---|---|
| paragraph, bulleted / numbered list, to-do | `rich_text` (one block per consecutive run; to-dos become a checkbox list) |
| heading 1 / 2 / 3 | `heading`, variant `page` / `section` / `subsection` |
| quote, divider, code, equation, table | `quote`, `divider`, `code`, `equation`, `table` |
| image | `image` (stored again; caption → `caption`; `alt_text` defaults to the caption, otherwise the empty string, with a warning) |
| video: YouTube or Vimeo | `video` with the provider and `external_id` (from `video-url.ts`) |
| video: uploaded file | `video` with provider `file`, stored in Blobs |
| file | `attachment` |
| pdf | `embed` with provider `pdf`, stored in Blobs |
| embed: Google Slides, Docs or Maps | `embed` with the matching provider |
| embed: anything else, bookmark, link preview | `embed` with provider `generic` |
| audio | `audio` |
| uploaded `.html` file | `html_app` (HTML stored, runs sandboxed) |
| code block in HTML that contains `<html`, `<body` or `<script` | `html_app` by default, and the preview can switch it back to `code` |
| code block in Mermaid | `code`, with a warning |

### Inline text

Bold, italic, underline and links are kept. Strikethrough and inline code become plain text, because Teaching Hub rich text doesn't allow those tags.
Colours and highlights are dropped. Mentions become their plain text.
Equations stay inline as text. The mapper builds rich text only from the Teaching Hub's allowed tags, escaping all text and attribute values, so the output is already in sanitised form.

### Rules for things with no direct match

- **Synced block:** its content becomes one plain-text `rich_text` block, with
  no sync link.
- **Linked database / child database:** skipped, with a warning.
- **Child page that isn't in the Teaching database:** becomes a `heading`
  plus its content flattened in place, with a warning.
- **Callout:** its own text becomes `body`. The style comes from the colour
  first, then the emoji:

  | Colour or emoji | Style |
  |---|---|
  | red, orange, ⚠️, ❗ | `warning` |
  | yellow | `important` |
  | blue, ℹ️ 📋 📅 | `information` |
  | green, ✅ | `remember` |
  | purple, pink, 🚀 | `extension` |
  | anything else | `information` |

  Callout children that aren't text are placed straight after the callout,
  with a warning.
- **Toggle:** a run of text-only toggles becomes one `accordion` with an item
  for each toggle. A toggle containing anything else becomes a `section` with
  `collapsed_in_editor: true`, titled with the toggle text. A toggle heading
  becomes a collapsed `section`. Inside a section or tabs, a toggle or a
  1-tab or 9+-tab group becomes a subsection heading plus its blocks, because
  sections can't nest.
- **Columns:** Notion width ratios are rounded to whole 12ths, every column is
  at least 1, and the total is 12. Content that's too deep for a column is
  flattened inside the column: nested columns have their blocks stacked, and a
  toggle becomes a bold line followed by its blocks.
- **Tabs:** tabs at the top level or inside a section become `tabs`. Exactly 1
  tab, or more than 8, becomes one `section` per tab. Tabs inside tabs or
  columns become a `heading` per tab with the blocks underneath.
- **Unknown or unsupported block:** becomes `rich_text` holding any plain text
  it has, with a warning.

**Nothing disappears silently.** Every flatten, skip or change records a
warning `{ entity, notion_block_id, rule, message }`. Warnings show in the
preview and are saved as the import report for that run.

Every mapped entity passes its Zod schema (`LessonSchema`, `UnitSchema`, …)
before it's written. The import does not require the publish checks to pass:
imported lessons arrive as drafts.

## Preview screen

Teaching Hub → Create → **Import from Notion**.

1. Paste a link, or search the Teaching database by title.
2. A tree of the program, unit, class or lesson and its descendants, all
   ticked. Each row shows the type it maps to, an "updates existing copy"
   badge for re-imports, and a warning count.
3. Year and subject pickers for each top-level item, filled from Notion.
4. Warnings, grouped as flattened, skipped, file too big, and HTML run as
   interactive (each with a toggle).
5. Import, with progress in files and entities. When it finishes: open the
   result, and view the import report.

## Errors

- **Token missing, or page not shared with the integration:** an explicit
  message with the fix.
- **Notion rate limit (429):** the reader backs off and retries, respecting
  `Retry-After`.
- **A file download fails or is too big:** the block stays, pointing at its
  original URL, with a warning.
- **An entity fails its schema check:** that entity is skipped and reported,
  and the others still import.
- **Crash part-way through:** applying again is safe. Entities are matched by
  page ID, and stored files are keyed by Notion file ID.

## Testing

The repo is public, so every fixture is an **invented** Notion API JSON tree.
No real lesson content goes into the repo.

- Mapper unit tests: each block type; the awkward layouts (a column in a
  toggle in tabs, 1 tab, 9 tabs, nested columns, a callout with an image, a
  synced block); the HTML detection rules; property mapping, including
  unmatched outcomes and several years; every Category.
- Reader tests against a fake Notion: pagination, recursion, the Sub-item
  tree, 429 retry.
- Rehoster tests: the cap, the type allow-list, retry-safe keys.
- Applier tests: create, re-import with a version snapshot, the parent lesson
  list updating, one failing entity not blocking the rest.
- One end-to-end test: preview, then import, using the fake Notion and the mock
  API.
- `npm run pre-pr-check` passes.

## Delivery

One PR, with these steps as commits:

1. **Tabs check.** Read one real lesson with tabs through the public API,
   locally and not committed. If the API doesn't return tabs, use the
   fallback: the reader treats whatever the API returns as headings, and the
   tabs rule falls back to sections. Write down the result in this spec.
2. **Schemas.** `source` on lesson, unit and class; `kind: 'program'` on
   unit; the `document` entity (Syllabus); video and HTML types and the
   200 MB cap for server-side imports only.
3. **Reader and mapper,** with tests.
4. **Rehoster and applier,** with versioning.
5. **Preview UI.**
6. **Making it visible:** the Program label and filter on the subject page; the
   Syllabus document page, linked from its subject.

If step 6 grows, it moves to its own PR.

## Not in scope

- Two-way sync, or keeping Notion as a source of truth.
- Notion's HTML or Markdown zip export.
- Importing students, timetables, scheduled lessons or comments.
- Rendering Mermaid into `diagram` blocks.
- Turning Notion's Scope and Sequence pages into the timeline
  `scope_sequence`.
