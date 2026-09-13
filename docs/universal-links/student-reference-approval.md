# StudentReference approval record

Status: recorded for this repository's narrow, synthetic-fixture-only
StudentReference implementation (implementation programme Slice 8). This is
not the College's operational sign-off named in comms-hub-people-
unification.md ยง6.5 — that review still gates entering any real initials or
codes, and remains outstanding.

## Operational purpose

Support narrow Teaching operational needs only: who is in a class, who
participates in a program, who attends an excursion, who receives coaching,
and whether a permission note is pending, submitted, approved, or declined.
Not a student information system.

## Permitted fields

- a stable random internal id (`student_ref_<uuid>`)
- a neutral display code derived from initials plus a numeric duplicate
  suffix (`AR`, `AR2`, ...) — never a student number, date of birth, year
  group, class, or other embedded identifier
- lifecycle status (`active` | `archived` | `deleted`)
- class/program/excursion/coaching membership, recorded as a canonical
  `participates_in` Universal Link (relationship-registry.mjs), never a
  second Teaching-owned membership table
- permission status only (`pending` | `submitted` | `approved` | `declined`)

No full names, emails, school identifiers, parent/family information,
uploaded permission forms, medical/disability/wellbeing/behaviour
information, dates of birth, or free text profiles.

## Hosting provider

The existing umbrella Netlify deployment's `teaching-hub-content` Blobs
store (StudentReference identity records) plus the shared
`universal-link-content` store (membership relationships only, visibility
`teaching_protected`). No new deployment, hostname, or storage vendor.

## Authorised users

The single authenticated operator, through the existing `LIFE_HUB_PASSPHRASE_HASH`
/ `SESSION_SECRET` / `life_hub_session` session — no second passphrase,
cookie, or authentication flow.

## Retention and deletion

Archived StudentReference records may be deleted on request
(`student-reference-repository.mjs`'s `delete`), leaving only a
non-identifying tombstone (id and deletion timestamp) required for
Universal Link integrity. No fixed retention period is set here; this
review's completion (ยง6.5) is required before any real record is retained
against a documented period.

## Incident responsibility

Adam, as the umbrella application's sole operator, is responsible for
incident response for this repository's implementation. The approved
school system remains the source of truth for official student records.

## Repository boundary

Every fixture and test in this repository uses synthetic codes only
(`STUDENT_A1`, `AR1`, and similar), clearly marked as synthetic
(comms-hub-people-unification.md ยง6.3). No real class lists, real initials
paired with real classes or activities, production exports, or production
logs may enter this repository.

## Outstanding

Before any real initials or codes are entered, the full College review
named in comms-hub-people-unification.md ยง6.5 — confirming the College
permits this limited use with the selected hosting provider — must still be
completed and recorded here.
