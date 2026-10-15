# Lesson block icons

PNG exports from Documents/`teaching hub page content icons`, renamed to palette ids (`:` → `-`). Black export backgrounds are punched out so the line art sits on cotton.

| Palette file | Source file |
| --- | --- |
| `rich_text.png` | `rich text.png` |
| `heading.png` | `heading.png` |
| `callout.png` | `callout.png` |
| `quote.png` | `quote.png` |
| `divider.png` | `divider.png` |
| `definition.png` | `definition.png` |
| `code.png` | `code.png` |
| `html.png` | `html.png` |
| `html_app.png` | `html app.png` |
| `image.png` | `image.png` |
| `gallery.png` | `gallery.png` |
| `video.png` | `video.png` |
| `embed.png` | `embed.png` |
| `embed-google_maps.png` | `map.png` |
| `embed-google_slides.png` | `slides.png` |
| `embed-google_docs.png` | `document.png` |
| `embed-pdf.png` | `pdf.png` |
| `audio.png` | `audio.png` |
| `attachment.png` | `file.png` |
| `accordion.png` | `accordian.png` |
| `table.png` | `table.png` |
| `question_set.png` | `question set.png` |
| `flashcards.png` | `flashcards.png` |
| `cloze.png` | `cloze.png` |
| `self_check.png` | `self check.png` |
| `chart.png` | `chart.png` |
| `equation.png` | `equation.png` |
| `diagram.png` | `diagram.png` |
| `mind_map.png` | `mindmap.png` |
| `concept_map.png` | `concept maps.png` |
| `columns.png` | `columns.png` |
| `section.png` | `section.png` |
| `spacer.png` | `spacer.png` |
| `timeline.png` | `timeline.png` |
| `card_stack.png` | `card stack.png` |
| `tabs.png` | `tabs.png` |
| `collection.png` | `collection.png` |
| `outcomes.png` | `outcomes.png` |

`card_stack.png` and `whiteboard.png` had no export in the source folder, so they were drawn in-repo to match (same stroke weight, transparent ground). Replace them if a designed export arrives.

Icons are served under the app base (`/teaching/assets/blocks/…`, `/tasks/assets/blocks/…`) via `blockIconSrc` in `src/blocks/block-meta.ts`. A root-absolute `/assets/blocks/…` path 404s on the umbrella site.

## Thinking Toolkit (Newington set)

Drawn for Teaching Hub as 256px line art in the same stroke as the set above. Each toolkit icon carries the orange griffin badge (bottom right) so the Newington Critical Thinking Framework blocks read as one set in the picker and edit header. The badge is baked into the PNG because the picker and edit header take a single image.

| Palette file | Shows |
| --- | --- |
| `toolkit_skill.png` | Pencil drawing a line, griffin badge |
| `toolkit_tool.png` | Toolbox, griffin badge |
| `toolkit_value.png` | Balance scale, griffin badge |
| `thinking_move.png` | Three linked cards, griffin badge |
| `question_quadrant.png` | 2×2 grid with a question mark, griffin badge |
| `concept_features.png` | Three linked nodes, griffin badge |
| `thinking_intentions.png` | Target and arrow, griffin badge |
| `thinking_reflection.png` | Loop arrows, griffin badge |
| `teacher_note.png` | Note with a lock (no badge: not part of the Newington set) |
| `badge-griffin.png` | Orange griffin on transparent, used in the toolkit eyebrow |
