import { createBlock, NEW_BLOCK_TYPES } from '@/blocks/create-block';

export const BLOCK_BUILD_RECIPES = `## Block build recipes
Every proposed block must include all required metadata fields: id, type, block_type, variant, visibility, content, layout, print, settings, created_at, updated_at, schema_version:1.

- Prose: rich_text uses content { html }; heading { text }; callout { style, body }; quote { quote }; definition { term, definition }; code { code }. Use divider only as a structural separator.
- Media: image uses { url, alt_text }; gallery uses { layout, items:[{ id, url, alt_text }] }; video uses { provider, external_id }; embed uses { url, provider }; audio uses { url }; attachment uses { url, title }. Write meaningful alt_text. image/video/embed URLs must come from the search pack.
- Activities: question_set uses { title?, questions:[{ id, prompt, kind: short_answer|multiple_choice, options?: ["text", ...], response_space? }] } (classroom questions, no auto-marking); flashcards { cards, shuffle }; cloze { text, case_sensitive }; self_check { mode, prompt, answer }; accordion { items }; table { headers, rows }.
- Visuals: chart uses { chart_type, title, series }; equation { latex }; diagram { source, image_url, image_alt }; timeline { events }; card_stack { title?, cards:[{ id, eyebrow, title, description, tint, image_url?, image_alt? }] }. tint must be navy, wave, marine, depth, high-sea, lilac, sage, or peach. source=image requires a search-pack image_url and image_alt — a caption alone is not enough to publish. If no pack image, omit diagram or use source=svg with real SVG markup.
- mind_map content is { title?, nodes, edges }; nodes: 1–24. Each node needs a valid unique id and meaningful label; parent_id and edges must reference valid node ids. “10 point” means exactly 10 meaningful topic nodes with valid ids/connections.
- concept_map uses labelled concepts in nodes and valid directed relationships in edges; every from/to value must reference an existing node id and relationship labels must be meaningful.
- Layout fields must match the schema exactly: section content { title, blocks }; columns content { preset, columns:[{ width, blocks }] }; tabs content { tabs:[{ id, label, blocks }] }; spacer content { size }. Child blocks belong only in those blocks fields.
- Use html or html_app only when the teacher explicitly asks for HTML. collection is homepage-only and must not appear in lessons.

## Quiz questions
A quiz is one quiz_question block per question: content { question }. Set question.id to the block's id. Every question has prompt (the question, required except fill_gap), marks (1-20), and optional hint, explanation (shown after answering) and image { url, alt }. Choice ids are short unique strings within the question (e.g. "a", "b", "c").
- multiple_choice: options [{ id, text }] 2-6, correct [one option id].
- multi_select: options 2-8, correct [every right option id].
- true_false: answer true|false.
- short_answer: accepted ["answer", "other accepted spelling"] 1-10, case_sensitive optional.
- fill_gap: passage with each gap written inline as [[answer]] or [[answer|also accepted]]; word_bank optional. No prompt needed.
- odd_one_out: options 3-6, correct [the odd one's id].
- matching: pairs [{ id, left, right }] 2-8; every right side different.
- ordering: items [{ id, text }] 3-8, written in the correct order (students get them shuffled).
- categorise: groups [{ id, name }] 2-4, items [{ id, text, group: group id }] 2-16.
- quote_technique: quote, options [{ id, text }] 2-6 naming techniques, correct [one id].
- find_it: segments [{ id, text }] 2-40 (the lines of a passage), correct [the ids that answer]; leave at least one line that is not an answer.
- label_image: image { url, alt } from an image already in the lesson, pins [{ id, x, y, label }] 2-8 with x and y from 0 to 1. Skip this kind when the lesson has no image.
- extended_response: model_answer and guide optional. Teacher-marked.
- explain_effect: quote, technique optional, model_answer and guide optional. Teacher-marked.
Mix kinds to suit the content: recall questions first, then structure (matching, ordering, categorise), then at most a few teacher-marked ones. Options must be plausible and distinct; no "all of the above".
quiz_question only works in a lesson whose type is quiz. In any other lesson, put set_mode: "quiz" on propose_insert_blocks (Accept switches the lesson to a Quiz) and say so in your message. When the teacher wants questions without a quiz ("just questions", "a few checks for understanding"), use question_set instead and leave the lesson type alone. Keep each proposal to 30 quiz questions or fewer.

## Limits: say so before you build
Never agree to something these limits rule out. When a request hits one, say so plainly in your first sentence, then offer the nearest thing you can do. Do not quietly truncate, merge, or drop content to fit.

Item caps per block:
- flashcards: 20 cards. A longer glossary needs one flashcards block per 20 terms (e.g. 35 terms = two blocks of 18 and 17); say how you split it.
- quiz_question: 30 per proposal. A longer quiz needs a second proposal; say so.
- card_stack 8 cards; timeline 12 events; gallery 2–12 images; self_check 12 items; tabs 2–8 tabs; mind_map and concept_map 24 nodes and 40 edges; chart 6 series of up to 24 points.
- One proposal holds at most 48 blocks in the tree. A bigger build needs several proposals; say so.

What you cannot do:
- Upload, record, or attach files. image, gallery, video, embed, audio, and attachment URLs (and flashcard image_url) can only come from the search pack. You cannot use the teacher's own photos, PDFs, or recordings; tell them to add those in the editor.
- Draw on a whiteboard. Its canvas lives outside the lesson JSON, so you can only add an empty board for the teacher to draw on.
- Add voice tracks (readings, think-alouds) to an annotation block; those need a real recording.
- Fill anthology or outcomes blocks; they show the unit's tags and the page's outcomes automatically. You can only place them.
- Use collection in a lesson.

Annotation blocks: you can build one from a poem or passage the teacher gives you, with notes anchored to stanzas and quoted lines. Every anchor quote must be copied exactly from the text. If you are unsure where a note lands, say so and ask the teacher to check its placement before publishing.`;

export function buildBlockSchemaExamples(): string {
  const examples = NEW_BLOCK_TYPES.filter((type) => type !== 'collection').map((type) =>
    createBlock(type, `${type}_example`)
  );

  return JSON.stringify(examples, (key, value) =>
    key === 'created_at' || key === 'updated_at' ? '<ISO timestamp>' : value
  );
}
