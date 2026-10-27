# Student profile: progress map (build 1 of 3)

Date: 27 October 2026. Approved by Adam in conversation.

## Purpose

A student opens their own profile and sees the unit map greyed out. It fills in colour as they finish lessons and as their work shows consistent top-end capacity. Later builds add a feedback shelf (peer feedback, viva voce comments, marks feedback) and a portfolio. This build is the profile, the Done block and the map.

The three builds are separate specs and plans: (1) profile and progress map, (2) feedback shelf, (3) portfolio. Builds 2 and 3 are out of scope here; the map reserves a Feedback chip on completed lessons that stays hidden until build 2 exists.

## Identity and access

- No login, no new student data, no names added anywhere. The profile reuses the existing class claim (`class-claims.mjs`): a student claims their initials from the class roster once on their own device, and that device keeps the claim until the teacher releases it.
- `/s/profile/<class>` calls one endpoint. The server resolves the device's claim (`claimFor`) and returns only that student's data. An unclaimed device sees the usual initials step and nothing else loads.
- Claims stay first-come with teacher release, as quizzes use them today. Students have already claimed their initials. No claim window or PIN.
- The page is `noindex`, like the student feedback page.
- The teacher already sees every student; the done records feed the unit coverage map's student view and the gradebook.

## Done block

A new block at the bottom of a lesson, with one behaviour (no per-lesson setting):

- Device already holds a claim: one button, "I've finished this", showing the student's initials ("Done as AR"). One tap records it.
- Device holds no claim: an initials box and a Done button. Submitting claims the initials through the existing `claimInitials` path (unknown initials and already-taken initials show the existing messages), then records the lesson done.
- A submitted quiz in the lesson also counts as done; the student does not tick as well.
- A done record is create-only at `profile/{class}/{student}/done/{lesson}` with `{ at, via: 'tick' | 'quiz' }`. There is no student undo. The teacher can remove a record.
- Support, extension and option lessons count as done when the student attempted something in them or ticks Done. The gradebook's existing "took this" tick (`took`) marks one as assigned/taken.

## The map

Reuses the unit coverage map's route (lesson order, support / core / extension lanes, quiz diamonds, assessment square) as a student view. The unit coverage map spec called this the later "my line" view.

- Everything starts grey. A lesson node and the route behind it fill to full colour when the lesson is done. The assessment square fills when the teacher has marked it, not when handed in. Quiz diamonds fill when submitted.
- The first lesson not yet done has a gold ring and "Next up". There is no count of lessons done anywhere.
- Support, extension and option lessons the student is assigned (or took) are full colour, with an orange or purple ring until done. Ones not assigned are faded and dashed but stay on the map; tapping one opens it, and doing it fills it like any other.
- Above the route sit four bars: Understanding, Responding, Concepts, Skills. They show mastery progress, not lessons done. Each bar has two shades: pale for building, strong for mastered. Bars only ever fill, never fall.
- Students never see scores, percentages, bands, red or amber, or any comparison. Those stay on the teacher view.
- Phone (390px): route and names stay, bars stack full width, no sideways scroll.

## Mastery rules

A pure function turns one student's evidence into `none | building | mastered` for each map item, then into the four bar fills (share of items mastered, share building). Evidence comes from the existing `classEvidence` (markbook and quiz results with catalogue tags and dot points) and the skills continuum.

- **Understanding and Responding (syllabus dot points) and Concepts:** an item is secure at 80% or more across at least two questions (existing `BANDS`). One secure result is building. Secure on at least two separate checkpoints is mastered.
- **Skills:** rungs from the existing `RUNG_THRESHOLDS`: Capable 65%, Skilled 75%, Accomplished 85%, Excellent 95%. Capable or Skilled is building. Accomplished or Excellent on at least two separate assessed pieces is mastered.
- "Separate" means different source columns or quizzes, not two questions in one.
- The thresholds and the two-checkpoint count live in `evidence/constants.ts` beside the existing ones so they can be tuned in one place.
- The server computes this and sends the student only the fills, never the evidence.

## Components

- `netlify/functions/_shared/profile.mjs` and a student endpoint: claim gate, done records, profile payload (map, fills).
- `apps/teaching/src/student/profile-view.ts`: the page. Map rendering shared with the unit coverage map where it can be.
- `apps/teaching/src/blocks/done.ts` (+ css) and its schema: the Done block.
- `apps/teaching/src/evidence/mastery.ts`: the pure mastery function.
- Teacher side: done records read by the unit coverage map student view and the gradebook student column; remove-record action.

## Testing

- Unit: mastery rules (one good quiz is building; two separate checkpoints mastered; skills on the ladder; Capable and Skilled only building), claim gate (unclaimed device, another student's id, released claim), write-once done records, quiz submission counting as done, payload carries no scores.
- Browser (Playwright): grey-to-colour fill, Done with a known device and with typed initials, assigned versus faded lessons, 390px with no sideways scroll.
- `npm run pre-pr-check` before any PR.

## Out of scope

Feedback shelf, portfolio, strand-dot branches (map option B, can be added later without changing the data), a student "undo", cross-class profiles.

## Item universe (decided in build, 27 October 2026; Adam to confirm)

Each bar is measured against the unit's declared items, not only what has been marked, so a bar never shrinks when new work lands. A group with no declared items stays empty.

- **Understanding / Responding:** dot points on the unit's lessons (`lesson.dot_points`, tag `dp:{area}:{id}`), split by the point id's first letter (U or R). Evidence reaches a point through its lesson (`withPointTags`), so only quiz results count towards these two bars. Assessment criteria carry outcomes, not dot points, and mapping them needs the outcome catalogue, which the public endpoint does not load.
- **Concepts:** catalogue techniques named in the answer keys of the unit's published quizzes (`tech:{id}`). Techniques that exist only as typed option text (`tech:~name`) and family (`fam:`) tags are left out: resolving them needs the literary elements table, which is browser-side data.
- **Skills:** `skill:` tags on the class markbook's assessment criteria plus those on the unit's published quiz keys.
- The alignment is read from the stored copy (`syllabus_alignment/{id}`) only. A public student request never reads the private source file. If the teacher has never opened the alignment, the two dot-point bars stay empty.
- The unit is the class's `current_unit_id` (first `active_unit_ids` entry when unset). The class markbook is class-wide, not per unit, so its skills are all counted.

## Added after review (27 October 2026)

- **Assessment lessons are the square.** A lesson whose type is Assessment is drawn as the map's square (no gradebook link needed). It fills only when the teacher marks it complete in the Progress view; a student tick or hand-in leaves it waiting.
- **Teacher Progress view** (a new Markbook view): one row per student, one column per lesson of the class's current unit. A tick is complete, a half circle is partial (a quiz started but not handed in, a handed-in assessment waiting to be marked, or a teacher's partial mark), a grey box is a support, extension or option lesson not set for that student, and a red dot means not complete a week (`LATE_AFTER_DAYS`) after the lesson's set date for the class. Pressing a cell cycles not done, complete, partial, cleared. Red appears only here, never on the student's page.
- **Student map layout.** The student page draws the teacher's unit coverage map (same route, lanes, week bands and a branch per syllabus line), grey until done. Quizzes are diamonds, assessments squares, the next core lesson has a gold ring and "Next up", unassigned side lessons are faded and dashed but still open. It shows no scores, percentages or counts. Dot-point (Understanding / Responding) branches are not drawn: they need the syllabus wording, which a public endpoint does not send.
- The student payload lists published lessons only.
