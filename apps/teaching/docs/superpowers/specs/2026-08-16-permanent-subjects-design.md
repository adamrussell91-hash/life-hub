# Permanent Subjects and Subject Creation

**Date:** 2026-08-16  
**Status:** Approved

## Goal

Make subjects permanent curriculum entities and let a teacher add them from the existing global create menu.

Subjects are not classes and do not expire. Examples include English, English Advanced, English Standard, History, and Psychology. English Advanced and English Standard are separate subjects. A class is the temporary group of students that studies a subject during an academic period.

## Domain model

### Subject

A subject is global and independent of year level.

The existing Subject entity keeps:

- `id`
- `title`
- `display_title`
- `slug`
- `scope_id?`
- `unit_ids`
- `outcome_ids`
- `class_ids`
- common status, timestamp, and schema fields

Remove `year_id` from Subject. `display_title` defaults to `title`; it must not prepend a year level.

### Class

A class remains the time-bound teaching group and carries:

- a class code unique to that student group and period
- academic year
- year level through `year_id`
- a permanent subject through `subject_id`

Special qualifiers such as extension, elective, enrichment group, and co-curricular are valid class identity concerns, but adding qualifier support is outside this change.

### Stage

Stage is derived from year level rather than stored independently. This change does not add stage fields or stage UI. The exact mapping remains a separate class/year-level concern and does not affect subject creation.

### Year-to-subject relationship

`Year.subject_ids` is not the source of truth for subject identity or availability. All subjects are available to all year levels.

For compatibility with existing navigation, `Year.subject_ids` remains a cache of subjects represented by classes in that year. Creating a class adds its `subject_id` to the selected year when absent. Subject pickers must not use this cache to filter the permanent subject catalogue.

## Create flow

Add **Subject** to the existing global `+` menu alongside Class, Unit, Lesson, and Scope & Sequence.

The Create Subject modal contains one required field:

- **Title**

The server generates the id and slug, defaults `display_title` to the submitted title, and initializes relation arrays as empty.

After successful creation, the app refreshes curriculum data. The subject is immediately available in Class, Unit, and Scope & Sequence subject pickers.

Class and Unit forms keep their Year and Subject fields, but selecting a year no longer filters subjects. Every permanent subject is available for every year.

## API

Add:

`POST /api/subjects`

Request:

```json
{
  "title": "Psychology"
}
```

Response: `201` with the created Subject.

Validation:

- Missing or blank title: `400`
- Case-insensitive duplicate title: `409`
- Authentication follows the existing create endpoints

The local mock API and production Netlify handler must expose the same contract. The client create API adds `postSubject`, and `CreateKind` adds `subject`.

## Data migration

Update seeded and stored Subject records by:

1. Removing `year_id`
2. Replacing year-prefixed `display_title` values with the permanent subject title
3. Preserving ids and relationship arrays so existing classes, units, scopes, and outcomes continue to resolve

English Advanced and English Standard remain separate Subject records. Their existing classes continue to reference them through `subject_id`.

Production Blob data requires an explicit, idempotent migration. It must update Subject records without deleting or recreating referenced entities. Re-running the migration must make no further changes.

## Existing behavior to update

- Remove year-based subject filtering from the create modal.
- Update navigation and templates that infer a subject's year from `subject.year_id`.
- Resolve year context from the class, unit, or explicit user selection instead.
- Keep subject labels year-neutral.
- Ensure curriculum loading accepts migrated global subjects.

## Error handling

The create modal shows API validation and conflict errors using the existing modal error treatment. It remains open so the title can be corrected. A successful create closes the modal only after the curriculum refresh succeeds.

The production migration must report malformed records and stop without partially rewriting a malformed Subject.

## Testing

### Schema and unit tests

- Subject parses without `year_id`.
- A blank Subject title is rejected.
- Subject labels do not include a year automatically.
- All subjects are returned for Class and Unit pickers regardless of selected year.
- Class creation adds the subject to the selected year's compatibility cache without duplication.

### API integration tests

- `POST /api/subjects` creates a global Subject with generated fields and empty relation arrays.
- A case-insensitive duplicate returns `409`.
- Curriculum GET includes the newly created Subject.
- Mock and Netlify handlers follow the same contract.

### UI tests

- The global `+` menu contains Subject.
- Create Subject requests only a title.
- A newly created Subject appears in Class, Unit, and Scope & Sequence pickers after refresh.

### Migration tests

- Existing Subject ids and relationships are preserved.
- `year_id` is removed and `display_title` becomes year-neutral.
- Running the migration twice is safe.

## Out of scope

- Subject edit, archive, delete, or reordering
- A dedicated Subjects management page
- Creating or editing years
- Class qualifier fields
- Stage UI or stage mapping changes
- Changes to class lifecycles

## Success criteria

A teacher can create Psychology or another permanent subject from the global `+` menu with only a title. The subject is not tied to a year, is immediately available when creating curriculum or classes for any year level, and existing subject-linked content continues to work after migration.
