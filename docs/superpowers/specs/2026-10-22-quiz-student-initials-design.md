# Quiz student initials — design

Date: 22 October 2026
Status: approved in chat, awaiting spec review

## Problem

Quiz answers already reach the server and show in the teacher panel's
Results tab, but each attempt is tied only to a random device token. The
panel labels them "Student A", "Student B" in submission order, so the
teacher can see every answer but not whose it is.

## Goal

Students identify themselves with their initials. Initials are checked
against the class list, one device owns each set of initials for the whole
class, and the teacher sees "BB · Bob Brown" in Results. Each attempt records
a stable class and student id so a gradebook can be built on top later.

## Decisions (from chat, 22 Oct)

- **Initials, not a name dropdown.** A dropdown makes picking someone else's
  name a single tap.
- **Checked against the class list.** Initials not on the list are refused,
  which stops random letters.
- **A class is always known.** A quiz takes answers only for a class.
  *Revised 22 Oct, same day:* Publish only hands out the plain lesson link,
  so that link has to work too. The class page link names the class; the
  teacher's Share box offers one link per class (`/s/lessons/:lessonId?class=:classId`);
  a plain link with no class uses the lesson's class when there is one
  (scheduled into it, or in its current or active units) and asks "Which
  class are you in?" when there are several. Only a lesson in no class
  shows "Open this quiz from your class page."
- **Strict device lock, per class.** Students use their own device every
  lesson. The first device to claim a set of initials in a class owns it
  for every quiz in that class until the teacher releases it.
- **Year and year level come from the class.** `Class` already carries
  `academic_year` and `year_id`, so BB in a 2027 Year 12 class and BB in a
  2028 Year 7 class are different people because they are on different
  class lists. Nothing is set per student.
- **Double-ups get a number.** A second BB in the same class becomes BB2.

## Data

### Class list

`ClassStudentSchema` (`apps/teaching/src/schemas/class.ts`) gains:

- `id`: stable student id, generated when the student is added, never
  shown. Renames and initials edits keep it. The gradebook keys on it.
- `initials`: 1–4 uppercase letters plus an optional number (`/^[A-Z]{1,4}[0-9]?$/`),
  unique within the class.

Existing lists with neither field get both on the next load. The id is
generated, and the initials are derived from the name.

Deriving initials: take the first letter of each word in the name, up to
four, uppercase. On a clash inside the class, add the lowest free number
from 2 upwards. The teacher can edit the initials, and the editor refuses
a duplicate or a bad format inline.

### Claims

A per-class claims record in the teaching Blobs store:
`class-claims/{classId}` → `{ [studentId]: { device: string; claimed_at: string } }`.

`device` is a hash of a class-scoped device token, stored client side under
`class-device:{classId}` with the same token helpers as the quiz
(`deviceToken` in `apps/teaching/src/quiz/dom.ts`). The raw token never
lives on the server.

### Attempts

New attempts store `class_id` and `student_id` beside the current device
field. Older attempts keep neither and stay anonymous.

## Student flow

1. A student opens the quiz from the class page. The client sends
   `class_id` and the class device token with every quiz request.
2. If this device already holds a claim in the class, the start screen
   shows "Quizzing as BB" and the quiz runs as now.
3. Otherwise the start screen shows one initials box. The server:
   - refuses initials that aren't on the list: "BB isn't in this class,
     check with your teacher."
   - refuses initials claimed by another device: "BB is already taken,
     see your teacher."
   - refuses a second claim from a device that already holds one.
   - otherwise records the claim and continues.
4. No control lets a student change their initials.
5. Live mode: `live_join` requires a claim as well, and the live board
   uses the initials.
6. A class with no initials set yet (an empty or unconverted list) keeps
   the current anonymous behaviour, so nothing breaks before the teacher
   sets it up.

Students never see full names. All matching happens on the server, and
published class pages already leave the student list out
(`teacher/sections/class-students.ts`).

## Teacher side

- **Students section** (`teacher/sections/class-students.ts`): an
  initials column, auto-filled and editable, with an inline clash or
  format error. A claimed / not claimed badge per student, plus a
  **Release** button that deletes that claim.
- **Quiz Results** (`quiz/teacher-panel.ts`): attempts with a `student_id`
  show "BB · Bob Brown". Attempts without one keep the "Student A"
  labels from `deviceNames`.
- **Teacher preview** of a quiz is unaffected.

## Out of scope

- The gradebook itself.
- Personal codes or passwords.
- Following a student across classes or years.

## Errors and edge cases

- A student was released and claims again: allowed, and the new device
  takes over. Their earlier attempts stay with them through `student_id`.
- The teacher deletes a student from the list: their claim is dropped,
  and their attempts keep `student_id` but show the initials as "removed
  student".
- The teacher edits a student's initials: the claim and attempts follow
  `student_id`, so nothing is lost. The device shows the new initials
  next time.
- The device can't store a token (private browsing, storage blocked): the
  quiz says "This browser can't remember you. Use your usual browser."
  and doesn't start.

## Testing

- Unit tests: deriving initials, numbering clashes, initials format
  checks, and filling in missing ids and initials on old lists.
- Server tests: claim accepted, not on the list, taken by another device,
  device already holds a claim, released then re-claimed, class with no
  initials stays anonymous, and the plain lesson link refused.
- Teacher panel test: Results labels "BB · Bob Brown" for new attempts
  and "Student A" for old ones.
- Fixtures use invented names only, because the repository is public.
