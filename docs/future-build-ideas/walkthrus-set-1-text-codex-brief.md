# Brief for Codex: build `set-1.json` (WalkThrus step text)

**For:** GPT Codex, run on Adam's Mac. **Writes:** one private file. **Date:** 29 October 2026.

## Goal

Convert Adam's sectioned text extraction of the Teaching WalkThrus book into one JSON file that the Life Hub reads for the five steps of each technique and the framework summaries. The app cannot show real steps until this file exists.

## Where the file goes

`adamrussell91-hash/life-hub-data`, path `data/teaching/walkthrus/set-1.json`, on `main`. That repository is **private**.

## Hard rules

1. The book's wording goes **only** into that private file. Never put any of it in the public `life-hub` repo: not in code, tests, fixtures, docs, comments, commit messages, PR text or screenshots. Do not paste it into chat or an issue either.
2. Do not edit the public `life-hub` repo for this task. Read it only to validate.
3. Do not invent or paraphrase text. Copy the book's step wording as extracted, fixing only obvious OCR errors (and say which you fixed in your final message, by technique id and step number, without quoting more than a few words).
4. If a technique or step is missing or unclear in the extraction, leave that technique out or leave the step out. Do not fill gaps. List every gap in your final message.
5. Do not use the traced SVGs for text. Text comes only from the sectioned text extraction.

## Inputs

- The sectioned text extraction (Adam will attach or point you to it). It covers printed pages 6 to 163; page 164 (References) was not supplied.
- The public catalogue: `packages/walkthrus/catalogue.mjs` in `adamrussell91-hash/life-hub`, for ids.
- The schema: `netlify/functions/_shared/walkthrus-text-schema.mjs` in the same repo.

## Output shape

```json
{
  "set": 1,
  "techniques": [
    {
      "id": "w1-cold-calling",
      "steps": [
        { "n": 1, "label": "Short step heading", "text": "The step's wording." }
      ],
      "footer": "Optional: the note printed under the five steps."
    }
  ],
  "frameworks": [
    { "id": "w1-fw-rosenshine", "summary": "The framework chapter's summary wording." }
  ]
}
```

Constraints (the schema enforces them):
- `set` is `1`.
- Each technique has 1 to 5 steps; `n` is 1 to 5 and unique within the technique; steps in order.
- `label` is at most 120 characters. `text` and `footer` are at most 2000. Framework `summary` at most 4000. If a field is too long, do not truncate silently: keep the full wording in a shorter split (e.g. move a trailing sentence to the footer) and report it.
- Use plain text. No Markdown, no HTML, no figure descriptions. A step's label is the short heading beside its number in the book; its text is the explanatory wording for that step.
- Technique ids must come from this table. Match by printed page and name. Do not create new ids.

## Ids

| id | Name | Series and page |
|---|---|---|
| `w1-check-for-understanding` | Check for understanding | Q&F 96 |
| `w1-cold-calling` | Cold calling | Q&F 90 |
| `w1-show-me-boards` | Show-me boards | Q&F 94 |
| `w1-think-pair-share` | Think, pair, share | Q&F 92 |
| `w1-say-it-again-better` | Say it again better | Q&F 98 |
| `w1-probing-questions` | Probing questions | Q&F 100 |
| `w1-process-questions` | Process questions | Q&F 102 |
| `w1-whole-class-feedback` | Whole class feedback | Q&F 108 |
| `w1-feedback-that-moves-forward` | Feedback that moves forward | Q&F 104 |
| `w1-feedback-as-actions` | Feedback as actions | Q&F 106 |
| `w1-quizzing` | Quizzing | P&R 112 |
| `w1-weekly-and-monthly-review` | Weekly and monthly review | P&R 122 |
| `w1-elaborative-interrogation` | Elaborative interrogation | P&R 114 |
| `w1-using-a-knowledge-organiser` | Using a knowledge organiser | P&R 116 |
| `w1-rehearsal-and-performance` | Rehearsal and performance | P&R 118 |
| `w1-peer-supported-retrieval` | Peer supported retrieval | P&R 120 |
| `w1-concrete-examples` | Concrete examples | P&R 124 |
| `w1-guided-practice` | Guided practice | P&R 126 |
| `w1-independent-practice` | Independent practice | P&R 128 |
| `w1-building-fluency` | Building fluency | P&R 130 |
| `w1-live-modelling` | Live modelling | E&M 78 |
| `w1-worked-examples-and-backward-fading` | Worked examples and backward fading | E&M 68 |
| `w1-dual-coding` | Dual coding | E&M 70 |
| `w1-deliberate-vocabulary-development` | Deliberate vocabulary development | E&M 72 |
| `w1-big-picture-small-picture` | Big picture, small picture | E&M 74 |
| `w1-abstract-models-with-concrete-examples` | Abstract models with concrete examples | E&M 76 |
| `w1-scaffolding` | Scaffolding | E&M 80 |
| `w1-metacognitive-talk` | Metacognitive talk | E&M 82 |
| `w1-set-the-standards` | Set the standards | E&M 84 |
| `w1-head-on-misconceptions` | Head on misconceptions | E&M 86 |
| `w1-sequence-concepts-in-small-steps` | Sequence concepts in small steps | CP 52 |
| `w1-designing-a-knowledge-rich-curriculum` | Designing a knowledge rich curriculum | CP 50 |
| `w1-coherent-mapping` | Coherent mapping | CP 54 |
| `w1-blend-knowledge-and-experience` | Blend knowledge and experience | CP 56 |
| `w1-pitch-it-up` | Pitch it up | CP 58 |
| `w1-plan-for-reading` | Plan for reading | CP 60 |
| `w1-tiered-questions-and-problems` | Tiered questions and problems | CP 62 |
| `w1-deliver-core-signpost-hinterland` | Deliver core; signpost hinterland | CP 64 |
| `w1-rehearse-routines` | Rehearse routines | B&R 44 |
| `w1-positive-relationships` | Positive relationships | B&R 36 |
| `w1-establish-your-expectations` | Establish your expectations | B&R 38 |
| `w1-signal-pause-insist` | Signal, pause, insist | B&R 40 |
| `w1-positive-framing` | Positive framing | B&R 42 |
| `w1-choices-and-consequences` | Choices and consequences | B&R 46 |
| `w1-collaborative-learning` | Collaborative learning | MB 134 |
| `w1-oracy-debating` | Oracy: debating | MB 142 |
| `w1-homework-as-guided-study` | Homework as guided study | MB 136 |
| `w1-enquiry-projects` | Enquiry projects | MB 138 |
| `w1-open-response-tasks` | Open response tasks | MB 140 |
| `w1-oracy-talk-for-writing` | Oracy: talk for writing | MB 144 |
| `w1-oracy-instructional-inputs` | Oracy: instructional inputs | MB 146 |
| `w1-independent-learning-pre-reading` | Independent learning: pre reading | MB 148 |
| `w1-fw-rosenshine` | Rosenshine’s principles | framework |
| `w1-fw-willingham` | Willingham’s principles | framework |
| `w1-fw-marge` | MARGE | framework |
| `w1-fw-wiliam` | Wiliam’s five strategies | framework |
| `w1-fw-berger` | Berger’s principles | framework |

The 50 techniques are set out in five steps each; the framework chapters are in the book's Why section.

## Steps

1. Clone `life-hub` (read only use) and `life-hub-data`. Run `npm ci` in `life-hub`.
2. Read the extraction. For each technique, match it to an id by name and printed page. Build the JSON.
3. Write it to a scratch path first, then validate with the repo's own schema from the `life-hub` root:

   ```sh
   node -e "
   import('./netlify/functions/_shared/walkthrus-text-schema.mjs').then(async ({ WalkthruSetTextSchema }) => {
     const raw = JSON.parse(await (await import('node:fs/promises')).readFile(process.argv[1], 'utf8'));
     const r = WalkthruSetTextSchema.safeParse(raw);
     console.log(r.success ? 'OK ' + raw.techniques.length + ' techniques, ' + raw.frameworks.length + ' frameworks' : JSON.stringify(r.error.issues, null, 2));
     if (!r.success) process.exit(1);
   });" /path/to/set-1.json
   ```

4. Also check that every `id` exists in the catalogue table above and that none is duplicated.
5. Copy the validated file to `life-hub-data/data/teaching/walkthrus/set-1.json`, commit to `main` in **life-hub-data only**, with the message `Add WalkThrus set 1 step text`, and push. Commit nothing to `life-hub`.

## Done means

- The validator prints OK.
- The count of techniques is reported against 50, and frameworks against 5, with a list of every missing id.
- A list of OCR fixes and any over-length splits, by id and step number, without quoting the book.
- Nothing from the book appears outside `life-hub-data`.

## After the push (Adam)

Open the Learning board. The app copies the file on first use; to refresh after later edits, POST `{ "action": "refresh" }` to `/api/walkthrus-text` while signed in.
