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
