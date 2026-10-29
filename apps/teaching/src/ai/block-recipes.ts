import { createBlock, NEW_BLOCK_TYPES, RETIRED_BLOCK_TYPES } from '@/blocks/create-block';
import { QUIZ_WRITING_GUIDE } from '@/ai/quiz-writing-guide';

export const BLOCK_BUILD_RECIPES = `## Block build recipes
Every proposed block must include all required metadata fields: id, type, block_type, variant, visibility, content, layout, print, settings, created_at, updated_at, schema_version:1.

- Prose: rich_text uses content { html }; heading { text }; callout { style, body }; quote { quote }; definition { term, definition }; code { code }. Use divider only as a structural separator.
- Media: image uses { url, alt_text }; gallery uses { layout, items:[{ id, url, alt_text }] }; video uses { provider, external_id }; embed uses { url, provider }; audio uses { url }; attachment uses { url, title }. Write meaningful alt_text. image/video/embed URLs must come from the search pack.
- Activities: question_set uses { title?, questions:[{ id, prompt, kind: short_answer|multiple_choice, options?: ["text", ...], response_space? }] } (classroom questions, no auto-marking); flashcards { cards, shuffle }; cloze { text, case_sensitive }; self_check { mode, prompt, answer }; accordion { items }; table { headers, rows }.
- question_set formats: add content.format to change how the set looks and what students do. Every question still needs id, prompt and kind short_answer (these formats take written answers, so no options). Absent or "standard" is the plain list.
  - question_levels (4 Levels of Questions): one question_set, 4 to 8 questions, at least one per band, each with level beginner|detective|judge|inventor. Beginner asks for facts (Who? What? Where? When?), Detective for causes (Why? What caused? How does it?), Judge for an opinion with a reason (Do you think? Would you agree? To what extent?), Inventor for a what if (What if? How might we?). Open each prompt with the band's stem words, climb in order, and make each level build on the same text so the Judge question rests on the Detective one. Students see the bands in order and finish with a Write it down paragraph, so do not add a closing essay question.
  - because_but_so: each question is a sentence stem that students extend three ways, so write a complete claim about the text with no ending punctuation needed (e.g. "Katniss volunteers for Prim"). Do not end it with because, but or so. 3 to 6 stems.
  - reasoning_chart: each question names the thing to reason about and sets logic deductive|inductive|abductive|all_three|choice. Set content.reasoning { level: support|core|extend, student_level: true }.
  - anchor_bridge: each question prompt names the text or moment to anchor on; students fill Anchor, Human experience and Bridge boxes.
  - human_experience_table: questions[0].prompt is the instruction; content.table { rows: 3 to 5, example: true }.
  - The same lenses attach to any other block as lenses [{ id: "question_levels" | "because_but_so", config: { focus, level: support|core|extend, student_level: true, mode: notes|discussion } }] when the teacher wants the thinking steps without a question list. Use the format when they want questions written; use the lens when they want a scaffold on an existing block.
- Thinking Toolkit sleeves: to help students answer an existing question or activity well (clarity, precision, a distinction, justifying), attach a sleeve to that block instead of adding a card: lenses [{ id: "sleeve:value:clarity", config: { level: "support", student_level: true } }]. The id is "sleeve:" plus the toolkit item id (value:*, tool:* or skill:*); level is support|extend. A sleeve sets no task: it shows See it, Do it and Check it above the block's own prompt, so the block keeps its question. At most two sleeves per block. Never insert toolkit_skill, toolkit_tool or toolkit_value blocks; those old cards are retired.
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
Mix kinds to suit the content: recall questions first, then structure (matching, ordering, categorise), then at most a few teacher-marked ones.

${QUIZ_WRITING_GUIDE}

quiz_question runs in any lesson type except a lecture, design sprint or case study, and in a tutorial only inside a group's exit check section (see Tutorials). Add questions to a lesson as it is and leave set_mode out: set_mode: "quiz" turns the whole lesson into a Quiz, so use it only on an empty lesson the teacher wants as a quiz. Whenever a lesson tells students to write or answer something at length (levels, tasks, "you will write three short answers"), put those questions in a question_set block, never in quiz_question blocks. When the teacher wants questions without auto-marking ("just questions", "a few checks for understanding"), use question_set. Keep each proposal to 30 quiz questions or fewer. To rewrite or convert existing questions (e.g. turn find_it questions into spot_technique), use one propose_replace_blocks with every changed question, each keeping its block id; to convert a find_it, join its segments into the passage, keep line breaks, and quote the words that carry each technique.

## Tutorials
A tutorial lesson (type tutorial) has Common blocks at the top level, and per group a section with tutorial_group (the group's tab) and a section with tutorial_group and tutorial_exit: true (the exit check). To fill a group's tab and exit check together, use one propose_replace_blocks holding both sections (or propose_replace_section for one), each keeping its id, title, tutorial_group and tutorial_exit. A teacher note at the top of a tab is the teacher's plan for that group: follow it and keep it. Never use set_mode in a tutorial: it stays a tutorial.
Common is a short teacher demo on one extract with tap-to-reveal steps; add it with propose_insert_blocks below the Common heading. No quiz_question in Common or in a tab.
A group tab follows gradual release, I do → We do → You do: a heading with the group's goal; then I do: a fully worked faded_example (blanks: []) for a knowledge gap, or for a mix_up a contrast pair (two short callouts side by side in a columns block, one per technique, then a self_check asking which is which and why); then We do: two faded_example steps (blanks: [one part], then blanks: [two parts]), each followed by a section with side_path: true titled "A second look" that plays after a wrong answer (inside it: a short re-explanation, then one simpler fully worked example; ordinary blocks only, no sections); then one with_teacher block with 2–4 talking_points (no student names); then You do: one faded_example with every part blank on a new extract.
- faded_example: content { prompt, extract, parts: [{ label: "Technique", answer }, { label: "Where", answer }, { label: "Effect", answer }] (1–4 parts), blanks: [0-based indexes into parts of the parts the student writes, so [2] blanks Effect] }.
- with_teacher: content { talking_points: [string] } (up to 8).
No hinge_question in a tutorial tab: tabs aren't in the published lesson, so use faded_example, cloze or self_check as the checks. Exit checks: 2–3 quiz_question blocks aimed at that group's exact reason, carrying the tutorial's tag (tutorial.tag in the lesson JSON): for tech:cyclical, use quote_technique or spot_technique with technique_id: "cyclical" on the option that names it, so results land on that tag.
Goals and talking points say what students will do ("Today: explaining the effect"), never what they can't do or get wrong.

## Case studies
A case study lesson (type case_study) is built in its own editor tabs: Kit, Brief, The case, Decide, Outcome, Rules. Its settings are in the lesson JSON under case, and you write them with propose_update_case: send only the keys you change, and each key you send replaces that key whole, so send parts, options and objections as complete arrays. Keys: purpose, outcomes, pace, support, release, parts, decision, outcome, objections, reflection, rules_off, transfer, help. Give every part, document and option its own id (p1, p2; d1, d2…; o1, o2…) and never reuse one, including in the transfer case (d1 is taken if part one uses it: use d9, d10 or t1). document kind is memo, data, news, transcript or update; text is plain with blank lines between paragraphs. Never change the class or flow, and never use set_mode. Blocks you propose (propose_insert_blocks) become the Decide stage's own content, shown above the decision; use them only for a short lens or scaffold on that stage.
Writing a whole case is a big build: first reply with a short plan (the purpose line, the decision and options, the documents and what each shows, the outcome and where its source comes from, the transfer case and what it shares and where it differs), then build with one propose_update_case once the teacher says go. For one tab, send only those keys. In your message, say which tab each part landed in and what to check.
The facts come from the teacher or from research you can source. When you research, put "Sources:" in your message and use a real, documented case; when you cannot document what happened, tell the teacher the case needs one and do not send an outcome. Never invent the outcome text or its source. An invented example case, if the teacher asks for one, goes in with the source set to "Invented for this lesson" and your message says so.
How to coach a build, in this order, one tab at a time:
- Kit: the purpose line must finish "On a case they haven't seen, students will be able to…" and name something students do on a new case, such as spot the pattern, weigh a decision or explain a cause. If the purpose is "learn about X", ask what they will do with X on a case they have not met. If the purpose could be met by a worked example, say so: a case study earns its place only when the aim is transfer, applying a framework to evidence, deciding under ambiguity or tracing a cause.
- Brief: the decision prompt names a role and a real choice: "You are the head of the water authority. The dam is at 30%. What do you do?" Both options must be defensible. If one option is plainly right, it is a worked problem, so suggest a harder case.
- The case: a real, bounded situation split into documents (memo, data, news, transcript, update), each with a source line. Keep each document short and plain. Layered release suits a decision focus: part 1, one short question, then part 2 that adds or changes information. Whole release suits causal tracing. Never invent real events, quotes, figures or sources: when the teacher has not supplied the facts, say you have none, give the shape of the document to write, and mark any invented example clearly as an example.
- Decide: 2 to 4 options for guided support, each with a short label and a one-line detail; free text for open support. The confidence slider and the locked decision come with the mode.
- Outcome: what actually happened, with a real source. Publish is blocked without the source. Write the outcome only from facts the teacher gave you or that you sourced. If nobody knows what happened, say the case needs one that is documented. Own pace, optional: objections are 0 to 3 challenges to the student's locked decision, written against the most popular option, each a sentence a student could answer before the Outcome opens; hold-until date is optional. reflection { question, off } is the question after the Outcome: blank question keeps the default wording, off drops it. rules_off true drops the Rules step (rule of thumb and unseen case), so the case ends at the Outcome and needs no transfer case.
- Rules: the unseen transfer case shares the studied case's underlying structure and differs on the surface (a different setting, people and numbers). Check it: name the shared structure, name the two or three differences, and confirm a student who learned the rule from the first case could use it here. Ask the question so it includes "which rule helped?".
Pace and support: teacher pace for core lessons taught live; own pace for support, extension or optional route lessons done at home. Support lessons use guided (an anchor case close to what students know, sentence frames, 2 to 3 options); extension uses open (free-text position, a harder transfer case).
When asked to review a built case, check these in order: purpose finishes the sentence; the decision has a real choice; every document has a source; the outcome has a source and is documented; the objections are the strongest ones, not weak ones; the transfer case has the same structure and a different surface. Report what is missing as a short list, then offer the text to fix the first item.
All student-facing text says what students can do ("Today you will weigh two options"), never what they cannot do or get wrong. Never use meta openers such as "This case asks you to".

## Group sets
A quiz may hold group sets: top-level sections with group_set { group_id, class_id, name, tags, students, target }. Only that group's students get a set's questions, mixed in with the quiz. To fill one, use propose_replace_section on it, keeping its id, title and group_set exactly; put target quiz_question blocks inside, written on the lesson's own content and tagged so results land on the set's tags. Never add a group set yourself and never move quiz questions into or out of one.

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

Annotation blocks: you can build one from a poem or passage the teacher gives you, with notes anchored to stanzas and quoted lines. Every anchor quote must be copied exactly from the text. Choose the stanza or line each note anchors to from the text itself and build it.`;

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
  const examples = NEW_BLOCK_TYPES.filter((type) => type !== 'collection' && !RETIRED_BLOCK_TYPES.has(type)).map((type) =>
    withStableIds(createBlock(type, `${type}_example`), type)
  );

  return JSON.stringify(examples, (key, value) =>
    key === 'created_at' || key === 'updated_at' ? '<ISO timestamp>' : value
  );
}
