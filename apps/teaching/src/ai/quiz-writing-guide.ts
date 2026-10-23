/**
 * How to write quiz questions that measure what was taught, for every agent
 * that builds quiz_question blocks. Drawn from the item-writing research:
 * Haladyna, Downing & Rodriguez (2002) on multiple-choice item writing,
 * Rodriguez (2005) on the number of options, Little, Bjork, Bjork & Angello
 * (2012) and Butler (2018) on plausible alternatives and learning from tests,
 * Marsh et al. (2007) on wrong answers students learn as true, Frisbie &
 * Becker (1991) on true-false items, and Biggs on constructive alignment.
 * Its rules are matched to the quiz engine: how each kind is shown and marked.
 */
export const QUIZ_WRITING_GUIDE = `## Writing questions that test something
A question is good when the students who learnt the lesson get it right and the students who did not get it wrong. A test-wise student who missed the lessons should not beat chance from the wording, the option lengths or common sense.

### Start from the lessons and the syllabus, not from the topic
1. Read the lessons the quiz covers (read_lesson) and their syllabus: the dot points and outcomes read_lesson lists. Those say what students are meant to be able to do.
2. Before writing, list the key ideas the lessons actually taught: the terms with the lesson's own definitions, the claims, the examples and quotes used, and the skills practised (e.g. naming a technique in an unseen line, explaining its effect). Tie each one to a dot point or outcome. Those key ideas, and how often each was taught, decide the question count per idea.
3. List what students confuse: near-miss terms (simile and metaphor, connotation and denotation), the wrong answers students gave in class activities, and similar examples from elsewhere in the unit. These become your wrong options.
4. Match each question to the level its dot point asks for. A dot point that asks students to analyse how a poet shapes meaning needs a line or quote to analyse, not a fact about the poet. Recall questions check the vocabulary and knowledge that analysis needs; they are not the whole quiz.
5. Every fact in a question comes from a lesson or note you opened in this job. Never test a detail you only half know: a poet's influences, a date, a publication, a quote. If the lessons do not say it, do not ask it. Lesson content beats your general knowledge when they differ.
6. Use the lessons' own examples, texts and wording for recall, and fresh but similar material (another line from the same poem, a new everyday example) for application, so students apply the idea and do not just recognise a sentence.

### Every kind
- One idea per question. The stem asks a clear question that a student who knows the content could answer with the options covered.
- The stem never teaches the answer. Cut any preamble that states the point being tested. Never put a word in the stem that only the right answer matches (a stem saying "Japanese forms" with one Japanese name among the options), or a grammatical cue (a/an, singular/plural) that fits only the key.
- State it positively. Avoid NOT and EXCEPT; when one is truly needed, write it in capitals.
- No trick questions, no trivia (page numbers, exact dates, middle names) and no opinion presented as fact; when a question asks for an interpretation, say whose ("In the lesson's reading of…").
- Questions stand alone: one question's wording must not give away another's answer.
- Write an explanation for every question: why the right answer is right, and why the most tempting wrong answer is wrong, in the lesson's words. Students read it after answering, and it stops them learning a wrong option as true.
- Marks follow the decisions. 1 mark for a single recall decision. More only for more decisions (each pair, gap or target) or harder thinking. Keep marks proportional across the quiz.

### multiple_choice
- 3 or 4 options. Three good options measure as well as five. Never pad with a weak option to reach four.
- Every wrong option is plausible to a student with partial or confused knowledge: the same category, era, register and grammatical form as the key, drawn from your list of confusions and from other content in the unit. A question about a poet's Japanese influence offers other Japanese poets or forms, not Shakespeare.
- Options match in length, detail and tone. The key is not the longest, the most qualified, the most balanced or the most technical-sounding. Wrong options are not absolutes ("all", "only", "never", "line for line"), extremes or jokes.
- No "all of the above", "none of the above" or "both A and B". Options do not overlap, and none contains another.
- For an inference or analysis question, give students something to work on: a short quote or line from the lessons' texts in the stem, then ask about its effect or meaning. Wrong options are readings a student might really give: too literal, the right technique with the wrong effect, an effect that belongs to another line.
- Keep options short; put shared words in the stem, not repeated in each option.

### multi_select
- Say how to answer in the prompt ("Select every…"). Each right pick earns a share and each wrong pick takes one back, so every option is a true-or-false judgment: write each as clearly right or clearly wrong by the lesson.
- 4 to 6 options, with 2 or 3 right. Not all right and not one right. Wrong options follow the multiple_choice rules.

### true_false
- One idea per statement, based on something important. A false statement states a real misconception from your list, not a reworded true one with "not" added.
- No specific determiners ("always", "never", "all", "only", "usually") and no negatives or double negatives: they give the answer away.
- Write true and false statements of similar length and detail, and keep the number of trues and falses in a quiz roughly even.
- Use true_false sparingly. It is a coin toss for a student who does not know.

### short_answer
- Ask for one term, name or short phrase with only one defensible answer ("Name the critical term for…", not "What is defamiliarisation about?"). If several answers would be right, list them all in accepted, or change the question.
- List every accepted form: spellings (Australian and American), with and without articles, singular and plural, abbreviations, a surname alone. Near misses go to the teacher, so do not stretch accepted to cover wrong ideas.
- Prefer it to multiple_choice for key vocabulary: recalling a term is harder than recognising it.

### fill_gap
- Write a fresh sentence or short paragraph about the idea in the lesson's terms. Do not copy a sentence word for word from the lesson (that rewards memorising the sentence rather than understanding it).
- Gap the key term or idea, never a trivial word. One gap per sentence, near the end, with enough context that only one answer fits. Give each gap every accepted form ([[defamiliarisation|defamiliarization]]).
- 2 to 4 gaps per passage, worth a mark each. Turn on word_bank only for lower-stakes recognition: the bank holds only the answers, so the last gap is a free choice. Without it, gaps test recall.

### matching
- 4 to 8 pairs from one category: all terms and their meanings, or all quotes and their techniques. Do not mix the two. With fewer pairs the last match is free.
- Short items on the right, the longer ones on the left. No left side shares a distinctive word, root or idea with its right side (not "Stolen Generations" and "children removed from their families" beside "Assimilation" and "adopting a dominant culture"). Each right side should seem a possible match for several left sides.
- Right sides parallel in length and form, and every one different.

### ordering
- Only a real sequence the lessons taught: the stages of an argument or process, events in a text, the moves in a paragraph structure. Not an order you invented.
- 4 to 8 items with one defensible order. Items are similar in length and none gives its place away ("Finally…", "First…").

### categorise
- Use the lessons' own categories (two techniques, two poems, two critical ideas). 2 to 4 groups that do not overlap, each with at least 2 items.
- Every item belongs clearly in one group by the lesson, with no borderline items. Mix easy and harder items, and avoid surface cues (every quote in one group mentioning the same image).

### odd_one_out
- The shared feature of the rest must be something the lessons taught, and only one option may break it. Say in the explanation what the others share.
- Make sure no second option can be argued odd on another feature.

### quote_technique and spot_technique
- Use passages from the lessons' texts. Ask only about techniques the lessons named. Every quote must really carry the technique a fair marker would accept.
- Wrong technique names are the ones students confuse with the right one (simile, metaphor and personification; juxtaposition and contrast), not unrelated ones.

### Check every question before you propose it
- Cover test: hide the options. Could a student who learnt the lesson answer? If not, the stem is unclear.
- Test-wise test: read only the options. Can you spot the key by length, tone, absolutes, a stem echo or common sense? If so, rewrite.
- Lesson test: point to the lesson and dot point it checks. If you cannot, cut it.
- Then check the quiz as a whole: every key idea covered in proportion to how it was taught, a spread from recall to application, kinds varied, and no question giving away another's answer.`;
