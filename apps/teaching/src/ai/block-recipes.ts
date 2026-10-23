import { createBlock, NEW_BLOCK_TYPES } from '@/blocks/create-block';
import { QUIZ_WRITING_GUIDE } from '@/ai/quiz-writing-guide';

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
A quiz is one quiz_question block per question: content { question }. Set question.id to the block's id. Every question has prompt (always include it: the question itself, or for fill_gap a short instruction such as "Fill the gaps."), marks (1-20), and optional hint, explanation (shown after answering) and image { url, alt }. Choice ids are short unique strings within the question (e.g. "a", "b", "c").
- multiple_choice: options [{ id, text }] 2-6, correct [one option id].
- multi_select: options 2-8, correct [every right option id].
- true_false: answer true|false.
- short_answer: accepted ["answer", "other accepted spelling"] 1-10, case_sensitive optional.
- fill_gap: prompt is a short instruction; passage with each gap written inline as [[answer]] or [[answer|also accepted]]; word_bank optional.
- odd_one_out: options 3-6, correct [the odd one's id].
- matching: pairs [{ id, left, right }] 2-8; every right side different.
- ordering: items [{ id, text }] 3-8, written in the correct order (students get them shuffled).
- categorise: groups [{ id, name }] 2-4, items [{ id, text, group: group id }] 2-16.
- quote_technique: quote, options [{ id, text }] 2-6 naming techniques, correct [one id].
- find_it: segments [{ id, text }] 2-40 (the lines of a passage), correct [the ids that answer]; leave at least one line that is not an answer.
- spot_technique: passage (the poem or prose, line breaks kept), options [{ id, text, uses? }] 3-10 naming techniques (every right one plus a few plausible wrong ones), targets [{ id, quote, correct: [option ids] }] 1-12. Each quote is the few words that carry the technique, copied exactly from the passage; correct lists every technique a fair marker would accept for those words. find optional: how many students must find (leave it out to need them all; find 1 with several targets means any one counts). Students' technique list drops each name once used, so set uses to the number of answers that need it (two similes: Simile uses 2). Say "Find two…" or "Find one…" in the prompt to match. Students select words and pick a name; a selection a few words bigger or smaller still counts, and right words with the wrong name earn half.
- label_image: image { url, alt } from an image already in the lesson, pins [{ id, x, y, label }] 2-8 with x and y from 0 to 1. Skip this kind when the lesson has no image.
- extended_response: model_answer and guide optional. Teacher-marked.
- explain_effect: quote, technique optional, model_answer and guide optional. Teacher-marked.
<<<<<<< HEAD
Mix kinds to suit the content: recall questions first, then structure (matching, ordering, categorise), then at most a few teacher-marked ones. Options must be plausible and distinct; no "all of the above".
quiz_question only works in a lesson whose type is quiz, or inside a tutorial's exit check section (see Tutorials). In any other lesson, put set_mode: "quiz" on propose_insert_blocks (Accept switches the lesson to a Quiz) and say so in your message. When the teacher wants questions without a quiz ("just questions", "a few checks for understanding"), use question_set instead and leave the lesson type alone. Keep each proposal to 30 quiz questions or fewer. To rewrite or convert existing questions (e.g. turn find_it questions into spot_technique), use one propose_replace_blocks with every changed question, each keeping its block id; to convert a find_it, join its segments into the passage, keep line breaks, and quote the words that carry each technique.

## Tutorials
A tutorial lesson (type tutorial) has Common blocks at the top level, and per group a section with tutorial_group (the group's tab) and a section with tutorial_group and tutorial_exit: true (the exit check). To fill a group's tab and exit check together, use one propose_replace_blocks holding both sections (or propose_replace_section for one), each keeping its id, title, tutorial_group and tutorial_exit. A teacher note at the top of a tab is the teacher's plan for that group: follow it and keep it. Never use set_mode in a tutorial: it stays a tutorial.
Common is a short teacher demo on one extract with tap-to-reveal steps; add it with propose_insert_blocks below the Common heading. No quiz_question in Common or in a tab.
A group tab follows gradual release, I do → We do → You do: a heading with the group's goal; then I do: a fully worked faded_example (blanks: []) for a knowledge gap, or for a mix_up a contrast pair (two short callouts side by side in a columns block, one per technique, then a self_check asking which is which and why); then We do: two faded_example steps (blanks: [one part], then blanks: [two parts]), each followed by a section with side_path: true titled "A second look" that plays after a wrong answer (inside it: a short re-explanation, then one simpler fully worked example; ordinary blocks only, no sections); then one with_teacher block with 2–4 talking_points (no student names); then You do: one faded_example with every part blank on a new extract.
- faded_example: content { prompt, extract, parts: [{ label: "Technique", answer }, { label: "Where", answer }, { label: "Effect", answer }] (1–4 parts), blanks: [0-based indexes into parts of the parts the student writes, so [2] blanks Effect] }.
- with_teacher: content { talking_points: [string] } (up to 8).
No hinge_question in a tutorial tab: tabs aren't in the published lesson, so use faded_example, cloze or self_check as the checks. Exit checks: 2–3 quiz_question blocks aimed at that group's exact reason, carrying the tutorial's tag (tutorial.tag in the lesson JSON): for tech:cyclical, use quote_technique or spot_technique with technique_id: "cyclical" on the option that names it, so results land on that tag.
Goals and talking points say what students will do ("Today: explaining the effect"), never what they can't do or get wrong.
=======
Mix kinds to suit the content: recall questions first, then structure (matching, ordering, categorise), then at most a few teacher-marked ones.

${QUIZ_WRITING_GUIDE}

quiz_question only works in a lesson whose type is quiz. In any other lesson, put set_mode: "quiz" on propose_insert_blocks (Accept switches the lesson to a Quiz) and say so in your message. When the teacher wants questions without a quiz ("just questions", "a few checks for understanding"), use question_set instead and leave the lesson type alone. Keep each proposal to 30 quiz questions or fewer. To rewrite or convert existing questions (e.g. turn find_it questions into spot_technique), use one propose_replace_blocks with every changed question, each keeping its block id; to convert a find_it, join its segments into the passage, keep line breaks, and quote the words that carry each technique.
>>>>>>> origin/main

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

/**
 * Gives a new block's random inner ids (options, cards, nodes...) stable names,
 * renaming every reference to them too, so the example is the same on every call.
 */
function withStableIds<T extends { id: string }>(block: T, prefix: string): T {
  const renamed = new Map<string, string>();
  const collect = (value: unknown, top: boolean): void => {
    if (Array.isArray(value)) return value.forEach((item) => collect(item, false));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      // The block's own id stays, including where a quiz question repeats it.
      if (!top && key === 'id' && typeof child === 'string' && child !== block.id && !renamed.has(child)) {
        renamed.set(child, `${prefix}_${renamed.size + 1}`);
      }
      collect(child, false);
    }
  };
  collect(block, true);
  return JSON.parse(JSON.stringify(block), (_key, value) =>
    typeof value === 'string' && renamed.has(value) ? renamed.get(value) : value
  ) as T;
}

/**
 * One example of every block type, for the agent's static prompt. It must be
 * byte-identical on every call: it sits in the cached prompt prefix, and one
 * random id would make every job pay to write that cache again.
 */
export function buildBlockSchemaExamples(): string {
  const examples = NEW_BLOCK_TYPES.filter((type) => type !== 'collection').map((type) =>
    withStableIds(createBlock(type, `${type}_example`), type)
  );

  return JSON.stringify(examples, (key, value) =>
    key === 'created_at' || key === 'updated_at' ? '<ISO timestamp>' : value
  );
}
