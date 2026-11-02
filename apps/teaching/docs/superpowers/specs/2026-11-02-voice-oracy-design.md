# Voice block: oracy types

Date: 2 November 2026
Status: design, not built
Branch: `claude/voice-oracy`
Builds on: `2026-10-21-voice-block-design.md`

## What this is

The oracy techniques in WalkThrus Books 1 and 2 appear in Life Hub only as guidance on the board and the lesson strip. Students have nothing to do them with.

This adds four recorded oracy types to the existing Voice block: **Speech, Debate, Presentation and Recite**. There is no new block type, in line with the Voice spec's first decision: one block with modes, not a family of blocks.

## Decisions already made (Adam, 2 November 2026)

1. Oracy goes inside the Voice block.
2. Recordings first. Each student records alone on their own device and is marked from the recording.
3. Presentation slides stay in the student's own tool. There is no slide upload.

## Out of scope

- Marking a live speech, debate or performance in the room.
- Multi-speaker recordings and back-and-forth debate.
- Slide upload, or syncing slides to a recording.
- Comparing a recitation word by word with the text.
- Student teaches and Talk for writing. These are mainly classroom activities and would be lesson templates, built separately.
- Do/Say cues for Book 2's oracy techniques. These are private data work, separate from this build.

## Data model

The stored `mode` enum stays `listen`, `respond` and `viva`. Oracy types are a layer on top, so the server's submission, marking, returned-work and progress code keeps working as it does now.

| Picker pill | Stored `mode` | Stored `oracy` |
|---|---|---|
| Listen | `listen` | none |
| Respond | `respond` | none |
| Viva | `viva` | none |
| Speech | `viva` | `speech` |
| Debate | `viva` | `debate` |
| Presentation | `viva` | `presentation` |
| Recite | `respond` | `recite` |

New optional fields on the `audio` block's `content`:

| Field | Type | Used by | Meaning |
|---|---|---|---|
| `oracy` | `speech`, `debate`, `presentation` or `recite` | all four | The oracy type |
| `side` | `proposing` or `opposing` | Debate | The side set by the teacher. Absent means students pick |
| `stems` | up to 12 strings, 120 characters each | Speech, Debate | Phrases or techniques shown to the student |
| `recite_text` | string, up to 8000 characters | Recite | The text to memorise |

Existing blocks have no `oracy` field and behave exactly as they do now.

## Teacher editor

"What students do" is one row of seven pills: Listen, Respond, Viva, Speech, Debate, Presentation, Recite.

Choosing a pill sets `mode` and `oracy` together. Choosing an oracy type fills in its starter content only where the field is empty, so switching type never overwrites the teacher's work. Fields the new type does not use stay stored, hidden, and return if the teacher switches back.

| Type | Main field label | Starter scaffold | Other fields |
|---|---|---|---|
| Speech | Speech topic | Hook · Main message · Reason 1 · Reason 2 · Call to action | Editable techniques: Rhetorical opener, Rule of three, Repetition, Pause |
| Debate | Motion | Our case · First reason · Second reason · What they will say · Close | Side (Students pick, Proposing, Opposing), editable stems |
| Presentation | Presentation topic | Slide 1 · Slide 2 · Slide 3 · Slide 4 | A note that slides stay in the student's own tool |
| Recite | Instruction (optional) | None | Text to recite, with a live count of the parts found |

Starter stems for Debate: "I believe that…", "Firstly… secondly…", "Moreover…", "Our opponents may argue…".

A class split into sides uses two Debate blocks, one per side. Nothing assigns students to sides automatically.

**Speaking time.** A 5 min option joins the existing pills. The block's existing limit of 300 seconds already allows this. If no time is set when a type is first chosen, the default is 3 min for Speech and Debate, 5 min for Presentation, and no limit for Recite. "Students choose" still offers 60 s, 90 s or 2 min.

**Publish checks.** Recite needs non-empty `recite_text` and no longer needs a `prompt`. All other types still need a `prompt`.

**Codes.** No new default codes. The existing Speaking group already has pace, pause, volume, fluency, tone and timing. It has no rhetoric code, so Adam can add one in the existing feedback codes editor if wanted.

## Student flow

### Speech, Debate and Presentation

These run the existing viva flow: dot points, 3-2-1, timer across the points, takes, send the best take, and read feedback.

The additions are small:

- The eyebrow names the type ("Speech", "Debate", "Presentation").
- Speech and Debate show the `stems` as chips under the dot points. They are prompts only and insert nothing.
- Debate shows the side. If `side` is absent the student picks before planning. The choice sits in the device's plan draft and is sent with the submission, and it can be changed until the take is sent.
- Presentation's plan hint reads "One point per slide. Present from your own slides."

### Recite

Recite runs the respond flow with a practice stage in front of it.

**Parts.** `recite_text` splits on blank lines. A teacher controls the parts by placing blank lines. Line breaks within a part are kept.

**Practice.** For each part the student goes through three steps:

1. **Read:** the part is shown, with the hint to read it aloud twice.
2. **Cover:** the text is hidden and the student says it aloud from memory.
3. **Check:** the text comes back and the student chooses Try again or Next part.

From the second part onwards, the parts learned so far are recited together before the next new part, following the book's pattern (A, B, A and B, C, A to C). Practice is not recorded and nothing is scored. The student judges how it went.

Progress stays in the device's plan draft, so a reload resumes the same place. A "Ready to record" button is always available, so a student who already knows the text can skip practice.

**Recording.** The text stays hidden during recording. A student who gets stuck keeps going or stops and tries another take. Between takes they can open the text again. The practice-take list and sending are unchanged.

## Teacher marking

Marking stays as it is: one-tap codes landing on transcript words.

Two additions to the marking view:

- **Debate:** the submission shows the student's side as a chip.
- **Recite:** the text sits in a folded "Text" section above the transcript, for checking by eye.

## Server changes

Few, because `mode` is unchanged:

- `findVoiceBlock` and `maxSecondsFor` in `voice-submissions.mjs` need no change.
- The submission accepts an optional `side`, validated against `proposing` and `opposing`, kept only for a Debate block and returned in the teacher's view of the record.
- The block schema and publish checks are also compiled into `teaching-block-schema.mjs`, `notion-import-core.mjs` and `teaching-ai-runtime.mjs`. These are regenerated with their scripts, never edited by hand.

No new AI calls. Recordings use the existing transcription path.

## Edge cases

- **Recite text edited after students start:** the saved practice position is clamped to the new number of parts.
- **Recite text with no blank lines:** one part. The editor's part count shows this.
- **Print:** Recite prints the text. The other types print as viva does, with lines for dot points.
- **Class Display:** unchanged. It shows the task and "Record your answer on your own device". Recite text is not shown on the class screen.
- **Type switched after submissions exist:** existing submissions and their marks stay. The block's new type applies to students who have not submitted.
- **Long recordings:** 5 min is the longest time this build offers, and the server caps every recording at `MAX_VOICE_SECONDS` (300 s). So Recite's "no limit" means up to 5 min, and the student view must stop the recording at that cap and say so. Transcription of a 5-minute take is to be checked during the build, since the longest pill so far is 3 min.
- **Recite with no instruction:** the task card reads "Recite this from memory."

## Testing

Unit tests:

- Each pill maps to the right `mode` and `oracy`, and back.
- Starter content fills only empty fields.
- Parts split on blank lines.
- The cumulative practice order for one, two and four parts.
- Publish checks for Recite.
- `side` is accepted, rejected when invalid, and dropped for non-Debate blocks.
- Blocks with no `oracy` field still parse and render as before.

Browser walk in the Voice block preview page (`apps/teaching/voice-block.html`), at desktop and 390px: the editor, all four student flows, a Recite practice run with a reload partway through, and marking with the side chip and folded text.

Not covered by this walk, so reported as unverified at PR time: Safari and iPhone microphone behaviour, and a live recording through to transcription on the deployed site.

## Build shape

One PR on `claude/voice-oracy`, in two or three large chunks, with `npm run pre-pr-check` once at the end. The diff stays in `apps/teaching` and `netlify/functions`, and the Grove suite should not run. If the gate reports the full suite, stop and find out why before going further.
