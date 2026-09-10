# Here is 02 DATA MODEL.md. I have made this more technical than 01 because this file should become the source of truth Cursor uses when creating schemas, storage functions and object relationships.

02 DATA MODEL
## 1. Purpose

This document defines the core data model for the Teaching Day Book.
The model must support:
Reusable curriculum content.
Real class schedules.
Separate teacher and student views.
Draft and published content.
Version recovery.
Reusable Blocks and templates.
Structured curriculum outcomes.
Google Drive media references.
Efficient storage in Netlify Blobs.
Minimal AI context and token use.
Stable public URLs.
Future expansion without restructuring existing content.
The data model must remain simple enough for direct inspection and export.
JSON is the preferred canonical content format.

## 2. Core Data Principles

### 2.1 One source of truth

Each reusable object exists once.
A Unit is stored once.
A Lesson is stored once.
A curriculum Outcome is stored once.
Relationships use references rather than duplicate embedded copies wherever reuse matters.

### 2.2 Immutable identity

Every major object receives a permanent internal ID.
The ID does not change when:
The title changes.
The slug changes.
The object moves.
The Term changes.
The Class schedule changes.
A Unit gets reused in another Class.
Display information and identity remain separate.

### 2.3 Human readable IDs

IDs should remain readable where practical.
Examples:
{
"id": "subject_y12_engadv"
}
{
"id": "unit_aotfw"
}
{
"id": "lesson_aotfw_008"
}
{
"id": "class_2026_12engadv1"
}
Random UUID values are not required for ordinary content unless collision risk or later technical requirements justify them.

### 2.4 References over duplication

Relationships use IDs.
Example:
{
"unit_id": "unit_aotfw"
}
rather than embedding the entire Unit object inside a Lesson.
This keeps content small and prevents multiple conflicting versions.

### 2.5 Separate content from scheduling

Reusable Lesson data describes what the Lesson contains.
Scheduled Lesson data describes when and where the Lesson is taught.
These remain separate objects.

### 2.6 Separate saving from publishing

Draft content and student facing published content remain separate.
Saving updates the draft.
Publishing creates a new published state.
Students never read directly from an unfinished draft.

## 3. Entity Overview

The initial system contains these primary entities:
Year
Subject
Scope and Sequence
Term
Unit
Lesson
Class
Scheduled Lesson
Block
Curriculum Outcome
Media Reference
Block Template
Composition Template
Lesson Template
Unit Template
Version Record
Redirect Record
Tag
User Preferences
The first implementation does not require each entity to live in a separate physical storage system.
The logical distinction matters more than the physical location.

## 4. Common Object Fields

Most major objects should use a shared metadata structure.
Recommended common fields:
{
"id": "unit_aotfw",
"type": "unit",
"title": "Artist of the Floating World",
"slug": "artist_of_the_floating_world",
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"created_by": "teacher",
"updated_by": "teacher",
"schema_version": 1
}
Required common concepts:
id
type
title
slug
status
created_at
updated_at
schema_version
The first build assumes one primary teacher, so complex ownership structures are unnecessary.

## 5. Status Values

General object status should use a controlled enum.
Recommended values:
{
"status": "active"
}
Allowed values:
active
archived
trashed
Objects marked trashed remain recoverable.
Permanent deletion sits outside normal workflows.

## 6. Year Object

The Year object represents a student year level.
Example:
{
"id": "year_12",
"type": "year",
"title": "Year 12",
"year_level": 12,
"slug": "year_12",
"subject_ids": [
"subject_y12_engadv",
"subject_y12_engstd"
],
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
Required fields:
id
type
title
year_level
slug
subject_ids
status
timestamps
schema_version

## 7. Subject Object

A Subject belongs to one Year.
English Advanced and English Standard remain separate Subject objects.
Example:
{
"id": "subject_y12_engadv",
"type": "subject",
"title": "English Advanced",
"display_title": "Year 12 English Advanced",
"slug": "english_advanced",
"year_id": "year_12",
"scope_id": "scope_y12_engadv_2026",
"unit_ids": [
"unit_aotfw"
],
"outcome_ids": [],
"class_ids": [
"class_2026_12engadv1"
],
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
A Subject stores references rather than complete child objects.

## 8. Scope and Sequence Object

Each Subject has a structured Scope and Sequence.
The Scope and Sequence contains annual planning data plus editable Blocks.
Example:
{
"id": "scope_y12_engadv_2026",
"type": "scope",
"title": "Year 12 English Advanced 2026",
"subject_id": "subject_y12_engadv",
"academic_year": 2026,
"term_ids": [
"term_y12_engadv_2026_t1",
"term_y12_engadv_2026_t2",
"term_y12_engadv_2026_t3",
"term_y12_engadv_2026_t4"
],
"timeline_items": [],
"block_ids": [],
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
The Scope and Sequence must support two renderers:
document
timeline
Both views read the same stored data.

## 9. Timeline Item

A timeline item connects a Unit to an annual teaching period.
Example:
{
"id": "timeline_aotfw_2026",
"unit_id": "unit_aotfw",
"term_start": 2,
"term_end": 2,
"start_date": "date",
"end_date": "date",
"order": 3,
"milestone_ids": [],
"notes": ""
}
Timeline movement changes planning metadata.
Moving a Unit does not duplicate or alter its Lesson content.

## 10. Term Object

Term objects provide chronological organisation.
Example:
{
"id": "term_y12_engadv_2026_t2",
"type": "term",
"title": "Term 2",
"term_number": 2,
"academic_year": 2026,
"subject_id": "subject_y12_engadv",
"unit_ids": [
"unit_aotfw"
],
"status": "active",
"schema_version": 1
}
Terms should remain lightweight.
They organise content rather than owning substantial content themselves.

## 11. Unit Object

A Unit is reusable.
Example:
{
"id": "unit_aotfw",
"type": "unit",
"title": "Artist of the Floating World",
"slug": "artist_of_the_floating_world",
"year_id": "year_12",
"subject_id": "subject_y12_engadv",
"primary_term": 2,
"description": "",
"duration_weeks": 7,
"outcome_ids": [],
"lesson_ids": [
"lesson_aotfw_001",
"lesson_aotfw_002",
"lesson_aotfw_003"
],
"resource_ids": [],
"block_ids": [],
"student_visibility": "published",
"publication": {},
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
Important distinction:
lesson_ids stores designed Lesson sequence.
Class schedules store actual delivery dates separately.

## 12. Unit Lesson Sequence

Lesson sequence should remain explicit.
A simple ordered array works for the initial implementation.
Example:
{
"lesson_ids": [
"lesson_aotfw_001",
"lesson_aotfw_002",
"lesson_aotfw_003"
]
}
Array position defines default sequence.
Each Lesson should also store its own sequence value for easier independent retrieval.
Example:
{
"sequence": 8
}
The application should detect inconsistent sequence data and repair or flag it.

## 13. Lesson Object

Lesson is the central reusable teaching content object.
Example:
{
"id": "lesson_aotfw_008",
"type": "lesson",
"title": "Memory, Identity and Ono",
"slug": "memory_identity_and_ono",
"unit_id": "unit_aotfw",
"sequence": 8,
"suggested_duration_minutes": 50,
"outcome_ids": [],
"tag_ids": [],
"draft": {
"revision": 17,
"block_ids": []
},
"published": {
"revision": 14,
"block_ids": [],
"published_at": "timestamp"
},
"version_ids": [],
"resource_ids": [],
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
The Lesson object should remain reasonably small.
Large media files never live directly inside Lesson JSON.

## 14. Draft State

The draft represents the editable working state.
Recommended structure:
{
"draft": {
"revision": 17,
"block_ids": [
"block_l008_001",
"block_l008_002"
],
"updated_at": "timestamp",
"dirty": true
}
}
dirty means unpublished changes exist.
The interface should derive clear user states from this information.
Examples:
Saved
Saving
Unpublished changes
Published
Save failed

## 15. Published State

Published content represents the student facing version.
Example:
{
"published": {
"revision": 14,
"block_ids": [
"block_l008_pub_001",
"block_l008_pub_002"
],
"published_at": "timestamp"
}
}
The published snapshot should remain stable while the draft changes.
Publishing creates or replaces the student facing snapshot.

## 16. Publication Strategy

For the first build, published Lesson content should function as a snapshot.
Publishing should:
Validate the draft.
Validate student visible resources.
Validate navigation references.
Copy the approved draft state into the published state.
Update publication metadata.
Preserve the previous published revision in version history.
Make the new published version available to student routes.
The publishing process must not trigger AI generation.

## 17. Version Record

Version history exists for recovery.
Recommended policy:
Keep at least the ten most recent meaningful saved versions of each Lesson.
A Version Record might contain:
{
"id": "version_l008_017",
"type": "lesson_version",
"lesson_id": "lesson_aotfw_008",
"revision": 17,
"created_at": "timestamp",
"reason": "save",
"snapshot": {}
}
Possible reasons:
save
publish
restore
AI accepted
manual checkpoint
The initial system does not need a Version Record after every keystroke.
Versions should represent meaningful save points.

## 18. Class Object

A Class represents a real teaching group.
Example:
{
"id": "class_2026_12engadv1",
"type": "class",
"code": "12ENGADV1",
"title": "Year 12 English Advanced",
"display_name": "12ENGADV1",
"academic_year": 2026,
"year_id": "year_12",
"subject_id": "subject_y12_engadv",
"active_unit_ids": [
"unit_aotfw"
],
"scheduled_lesson_ids": [],
"current_unit_id": "unit_aotfw",
"current_scheduled_lesson_id": "",
"homepage_block_ids": [],
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
The Class code must remain unique within the relevant academic year.

## 19. Scheduled Lesson Object

A Scheduled Lesson connects a reusable Lesson with a Class and date.
Example:
{
"id": "scheduled_2026_12engadv1_aotfw_008",
"type": "scheduled_lesson",
"class_id": "class_2026_12engadv1",
"lesson_id": "lesson_aotfw_008",
"unit_id": "unit_aotfw",
"date": "date",
"schedule_order": 32,
"duration_minutes": 50,
"delivery_status": "planned",
"override_id": null,
"teacher_note_block_ids": [],
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
Allowed delivery status values:
planned
current
delivered
skipped
rescheduled
The system should not infer delivered status solely from the date.

## 20. Schedule Order

Dates provide chronology, but an explicit schedule order should also exist.
This supports:
Multiple Lessons on one date.
Lessons moved between dates.
School events.
Unusual timetables.
Lessons delivered out of original Unit sequence.
The schedule order defines previous and next Lesson navigation for the Class.

## 21. Class Specific Override

Overrides should remain sparse because they are expected to be uncommon.
Example:
{
"id": "override_12engadv1_l008",
"type": "lesson_override",
"class_id": "class_2026_12engadv1",
"scheduled_lesson_id": "scheduled_2026_12engadv1_aotfw_008",
"source_lesson_id": "lesson_aotfw_008",
"block_changes": [],
"created_at": "timestamp",
"updated_at": "timestamp"
}
The override stores differences rather than a full duplicate Lesson where practical.
The interface must clearly label the Lesson as customised.

## 22. Block Object

Blocks are the basic content units.
All Lesson, Unit, Scope and homepage content should use the same underlying Block architecture where practical.
Example:
{
"id": "block_l008_001",
"type": "block",
"block_type": "rich_text",
"variant": "medium",
"visibility": "student_teacher",
"content": {},
"layout": {},
"print": {},
"settings": {},
"source": {},
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
Block details will be defined fully in 03 BLOCK SYSTEM.md.

## 23. Block Visibility

Visibility should use controlled values.
Recommended values:
student_teacher
teacher_only
future values may include:
student_only
hidden
The initial build primarily requires:
student_teacher
teacher_only
The teacher renderer displays both.
The student renderer excludes teacher_only Blocks.

## 24. Block Size Variant

Blocks support controlled design variants.
Initial values:
small
medium
large
banner
full_page
Variant meaning depends on Block type.
The same variant also maps into screen and print behaviours.
Precise rendering rules belong in 03 BLOCK SYSTEM.md and 05 DESIGN SYSTEM.md.

## 25. Block Layout Data

Layout should remain structured rather than storing arbitrary CSS.
Example:
{
"layout": {
"desktop_columns": 12,
"tablet_columns": 12,
"mobile_order": 1
}
}
The application renderer translates these values into visual output.
AI output should never write arbitrary page CSS as the normal layout mechanism.

## 26. Print Data

Each Block supports print metadata.
Example:
{
"print": {
"variant": "medium",
"allow_split": true,
"keep_heading": true,
"start_new_page": false
}
}
A4 rendering rules remain separate from screen rendering rules.

## 27. Block Content

The content shape depends on block_type.
Example rich text content:
{
"content": {
```
    "html": "<p>Lesson content</p>"
```

}
}
Example image content:
{
"content": {
"media_id": "media_001",
"caption": "",
"alt_text": ""
}
}
Example question content:
{
"content": {
"prompt": "How does Ishiguro represent memory?",
"response_type": "short_response",
"answer": "",
"teacher_guidance": ""
}
}
Each Block type must have a validated content schema.

## 28. Block Nesting

Maximum structural nesting depth:
Page
Section
Block
This equals three conceptual layers.
Blocks should not recursively contain unlimited Blocks.
Controlled composite Blocks may contain child references where their schema explicitly permits it.
Example:
{
"block_type": "section",
"child_block_ids": [
"block_001",
"block_002"
]
}
Unlimited nesting is prohibited.

## 29. Linked Blocks

A reusable linked Block references a source Block.
Example:
{
"id": "block_link_001",
"block_type": "linked",
"source_block_id": "block_shared_014",
"mode": "linked"
}
Linked Blocks remain source controlled.
Editing options:
Edit Source
Detach
Detach creates an independent Block with a new ID.

## 30. Composition Object

A Composition is a reusable group of Blocks.
Example:
{
"id": "composition_reading_comprehension",
"type": "composition",
"title": "Reading Comprehension",
"block_ids": [],
"category": "reading",
"status": "active",
"schema_version": 1
}
Compositions support repeated teaching structures without requiring repeated AI generation.

## 31. Template Base Structure

All templates should share common metadata.
Example:
{
"id": "template_reading_comprehension",
"type": "composition_template",
"title": "Reading Comprehension",
"description": "",
"category": "reading",
"version": 1,
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp"
}
Templates should remain editable and versionable.

## 32. Block Template

A Block Template stores a predefined Block configuration.
Example uses:
Learning intention banner
Success criteria card
Teacher note panel
Extension box
The template references one Block schema.

## 33. Composition Template

A Composition Template stores a reusable group of Blocks.
Example:
Reading Comprehension
Possible contained Blocks:
Reading text
Vocabulary
Literal questions
Inferential questions
Evaluative response
Extension
The AI should assemble from Composition Templates rather than generating each structure from nothing wherever practical.

## 34. Lesson Template

A Lesson Template stores an entire Lesson structure.
It should include:
Default Blocks
Default ordering
Optional metadata
Optional AI instructions
Default print behaviour
Default visibility rules
Creating from a Lesson Template produces a new independent Lesson.

## 35. Unit Template

A Unit Template stores a reusable Unit structure.
Potential uses:
Novel study
Poetry study
Research skills unit
Psychology inquiry unit
The architecture should remain flexible because Unit Templates will evolve after real classroom use.

## 36. Curriculum Outcome Object

Curriculum Outcomes use official syllabus coding.
Example structure:
{
"id": "outcome_example",
"type": "curriculum_outcome",
"code": "official_code",
"title": "Official outcome title",
"description": "Official outcome description",
"year_id": "year_12",
"subject_id": "subject_y12_engadv",
"syllabus": "English Advanced",
"syllabus_version": "current",
"reference_url": "",
"status": "active"
}
Units and Lessons reference Outcome IDs.
Outcome wording should not be copied into every Lesson record.

## 37. Outcome Mapping

A Unit might contain:
{
"outcome_ids": [
"outcome_001",
"outcome_002"
]
}
A Lesson might contain:
{
"outcome_ids": [
"outcome_002"
]
}
This structure later supports curriculum coverage reports and Scope and Sequence visualisation.

## 38. Media Reference Object

Files and media should remain external to Lesson JSON.
Google Drive is the preferred first media provider.
Example:
{
"id": "media_aotfw_extract",
"type": "media",
"provider": "google_drive",
"provider_file_id": "drive_file_reference",
"file_name": "Ono Extract.pdf",
"media_type": "pdf",
"mime_type": "application/pdf",
"title": "Ono Extract",
"preview_url": "",
"download_url": "",
"thumbnail_url": "",
"sharing": "public_link",
"last_checked_at": "timestamp",
"status": "active"
}
Lesson Blocks reference media_id.

## 39. Media Providers

The schema must not assume Google Drive forever.
provider should use a controlled value.
Initial:
google_drive
Future examples:
direct
github
onedrive
external
Changing storage providers should not require redesigning Lesson records.

## 40. Media Access Validation

Student facing media requires an accessibility state.
Recommended values:
public_link
restricted
unknown
unavailable
Publishing should warn when student visible Blocks reference restricted or unavailable media.
The system should not silently publish broken resources.

## 41. Images

Images require additional metadata.
Example:
{
"media_type": "image",
"width": 1600,
"height": 900,
"aspect_ratio": "16:9",
"alt_text": "",
"thumbnail_url": "",
"optimised_url": ""
}
The application should support responsive image delivery.
The final optimisation implementation belongs in the technical storage specification.

## 42. Embed Reference

Embeds should use structured provider data.
Example:
{
"provider": "youtube",
"external_id": "video_reference",
"url": "",
"embed_url": "",
"title": ""
}
Potential providers include:
YouTube
Vimeo
Google Slides
Google Docs
Google Drive
Desmos
GeoGebra
Google Maps
ArcGIS
Canva
Padlet
generic iframe
Provider specific rendering belongs in the Block system.

## 43. Interactive HTML App

Interactive HTML content requires stricter metadata.
Example:
{
"block_type": "html_app",
"content": {
"source_type": "stored_app",
"app_id": "app_example"
},
"settings": {
"sandboxed": true,
"allow_network": false
}
}
Interactive HTML must run inside a sandboxed environment.
Arbitrary scripts must not gain access to teacher credentials, storage functions or application state.
Detailed restrictions belong in 08 SECURITY.md.

## 44. Tag Object

Tags support search and retrieval.
Example:
{
"id": "tag_unreliable_narration",
"type": "tag",
"label": "Unreliable narration",
"category": "concept",
"status": "active"
}
Tags should use controlled records rather than uncontrolled strings.
This avoids variants such as:
memory
Memory
memories
Memory theme
The interface should suggest existing tags before creating new ones.

## 45. Redirect Record

Published slugs may change.
Old student URLs should remain usable where practical.
Example:
{
"id": "redirect_001",
"type": "redirect",
"object_id": "lesson_aotfw_008",
"old_slug": "ono_and_memory",
"current_slug": "memory_identity_and_ono",
"created_at": "timestamp"
}
Internal references continue using object IDs regardless of slug changes.

## 46. Class Homepage Data

Class homepage data should separate automatic and manual sections.
Example:
{
"homepage": {
"block_ids": [],
"show_current_unit": true,
"show_current_lesson": true,
"show_recent_lessons": true,
"show_unit_list": true
}
}
Generated lesson lists should never be stored manually as duplicated content.
The renderer derives them from Scheduled Lesson records.

## 47. Unit Page Data

Unit page data follows the same hybrid pattern.
Example:
{
"student_page": {
"block_ids": [],
"show_lesson_sequence": true,
"show_unit_overview": true,
"show_resources": true
}
}
The lesson sequence derives from Unit lesson_ids.

## 48. Navigation Data

Navigation should be derived rather than manually authored.
For a student Lesson page, the system resolves:
class_id
unit_id
scheduled_lesson_id
previous_scheduled_lesson_id
next_scheduled_lesson_id
Previous and next navigation should follow the Class schedule rather than assuming Unit sequence always matches delivery sequence.

## 49. Current Lesson

A Class may store:
{
"current_scheduled_lesson_id": "scheduled_2026_12engadv1_aotfw_008"
}
The system may suggest the current Lesson from schedule dates.
The stored value remains explicitly controllable by the teacher.
This handles timetable changes and teaching delays.

## 50. Local Student State

Student interactions without login should use browser local storage.
Student state must never enter the core teacher data model unless a later feature explicitly requires collection.
Example local state:
{
"lesson_id": "lesson_aotfw_008",
"revealed_answers": [],
"flashcard_index": 4,
"checklist_state": {}
}
No student identity is required.

## 51. Teacher Notes

Teacher notes should use normal Blocks wherever practical.
A teacher note may optionally reference another Block.
Example:
{
"block_type": "teacher_note",
"visibility": "teacher_only",
"settings": {
"related_block_id": "block_l008_004"
}
}
This allows notes to sit beside relevant student content in teacher view.

## 52. AI Context Metadata

The data model should support narrow AI operations.
Each AI request should explicitly define scope.
Possible values:
block
section
lesson
unit
subject
The default is block.
AI history design should follow the established Life Hub project implementation.
The Teaching Day Book should not create an independent AI history architecture unless required by a future divergence.
Accepted AI output becomes normal content.
The permanent value sits in the Blocks and Lessons, not in indefinitely retained chat transcripts.

## 53. AI Action Record

A lightweight action record is useful for debugging and recovery.
Example:
{
"id": "ai_action_001",
"type": "ai_action",
"scope": "block",
"target_id": "block_l008_004",
"action": "generate_questions",
"accepted": true,
"created_at": "timestamp"
}
Do not store full prompt and response history by default.
The exact AI logging model should follow the Life Hub precedent.

## 54. Save Behaviour

Normal editing updates local application state immediately.
Server saves should be batched.
A server save updates only the relevant object.
Editing one Lesson should not regenerate:
The Unit
The Subject
The Class
Other Lessons
The student application shell
The entire website
This rule is mandatory for cost control.

## 55. Blob Storage Model

Netlify Blobs should hold live structured content.
Recommended logical stores:
content
versions
media_metadata
redirects
settings
The exact physical store split may change during implementation if a simpler structure performs better.
Blob keys should preserve enough hierarchy for debugging and prefix listing.
Example conceptual keys:
years/year_12
subjects/subject_y12_engadv
units/unit_aotfw
lessons/lesson_aotfw_008
classes/class_2026_12engadv1
schedules/scheduled_2026_12engadv1_aotfw_008
The storage hierarchy does not define object relationships.
IDs inside the data remain authoritative.

## 56. Draft and Published Storage

Two implementation patterns are acceptable:
Option A
Draft and published states exist inside one Lesson object.
Option B
Draft and published snapshots use separate Blob keys.
The preferred initial model is one Lesson metadata record with separate draft and published content snapshots.
This reduces accidental student access to draft Blocks while retaining one clear Lesson identity.
The final storage specification should validate the simplest reliable implementation.

## 57. GitHub Role

GitHub stores:
Application source
Schemas
Documentation
Renderer code
Block definitions
Design system
Periodic content backups
GitHub should not receive a commit after every Lesson edit.
Live Lesson editing belongs in Netlify Blob storage.
Backup processes should export readable JSON.

## 58. Export Format

Ownership and portability are core requirements.
Every major object should export as readable JSON.
Export scopes should include:
Lesson
Unit
Subject
Class
Complete archive
An archive should preserve:
IDs
Relationships
Blocks
Metadata
Outcome references
Media references
Version information where selected
The system must not depend on proprietary binary storage.

## 59. Schema Versioning

Every major object should contain:
{
"schema_version": 1
}
When schemas evolve, migration functions should upgrade older records.
Existing content should never require manual rewriting after a schema change.

## 60. Validation

Every object type requires schema validation.
Validation should occur:
When loading
Before saving
Before publishing
After AI output
During imports
AI output must never bypass schema validation.
Malformed Blocks should fail safely rather than corrupting the Lesson.

## 61. Referential Integrity

The application should validate references.
Examples:
A Lesson must reference an existing Unit.
A Unit must reference an existing Subject.
A Scheduled Lesson must reference an existing Class and Lesson.
A Media Block must reference an existing Media object.
A linked Block must reference an existing source Block.
A curriculum reference must reference an existing Outcome.
Broken references should appear clearly in the teacher interface.

## 62. Orphan Handling

Deleting or trashing an object with active references requires protection.
Examples:
Trashing a Unit referenced by a Class should generate a warning.
Trashing a Lesson with Scheduled Lesson records should generate a warning.
Trashing a Media object used in published Lessons should generate a warning.
The system should never silently destroy referenced content.

## 63. Trash Behaviour

Trashing an object should record:
trashed_at
previous_status
Optionally:
trash_reason
Restoring returns the object to its previous state where safe.
Relationships remain intact while the object sits in Trash.

## 64. Archive Behaviour

Archive differs from Trash.
Archived content remains valid and reusable.
Examples:
A completed 2026 Class.
An old Unit no longer taught.
A superseded Scope and Sequence.
Archived items disappear from normal active navigation but remain searchable.

## 65. Search Index Data

Search should be built from object content rather than manually maintained search entries.
Searchable metadata should include:
title
type
Year
Subject
Unit
Class
tags
outcomes
dates
Block text
media titles
The search implementation belongs in a later technical specification.
The data model must expose enough structured metadata to support it.

## 66. Derived Data

Where information derives reliably from existing relationships, avoid storing duplicate values.
Examples:
A Lesson's Subject derives through Unit.
A Unit's Year derives through Subject.
A student Lesson breadcrumb derives through Class, Subject and Unit references.
A Unit lesson count derives from lesson_ids.
Derived values may be cached for performance, but the source relationship remains authoritative.

## 67. Denormalisation Rule

Selective duplication is acceptable only where it clearly improves performance or recovery.
Any duplicated value must have an identified source of truth.
For the initial build, favour clarity over aggressive optimisation.
The expected content volume does not justify a complex database architecture.

## 68. Relationship Summary

Primary relationships:
Year contains Subjects.
Subject belongs to Year.
Subject owns Scope and Sequence.
Subject references Units.
Subject references Outcomes.
Class references Year and Subject.
Class references active Units.
Unit belongs to Subject.
Unit references Lessons.
Lesson belongs to Unit.
Scheduled Lesson references Class and Lesson.
Lesson references Blocks.
Unit pages reference Blocks.
Scope and Sequence references Blocks.
Class homepage references Blocks.
Blocks may reference Media.
Blocks may reference other shared Blocks where linking is enabled.
Units and Lessons reference Curriculum Outcomes.
Templates reference Block structures.

## 69. Example Relationship

Year 12

English Advanced

Scope and Sequence 2026

Artist of the Floating World

Lesson 001

Lesson 002

Lesson 003

Lesson 008

Class 12ENGADV1 2026

references Year 12

references English Advanced

references Artist of the Floating World

Scheduled Lesson

references Lesson 008

teaching date

class specific notes
The curriculum tree and Class schedule remain connected without becoming the same structure.

## 70. Initial Build Requirements

The first implementation must support these entities:
Year
Subject
Scope and Sequence
Term
Unit
Lesson
Class
Scheduled Lesson
Block
Curriculum Outcome
Media Reference
Version Record
Redirect Record
Templates
Tags
The first implementation must support these relationships:
Year to Subject
Subject to Scope and Sequence
Subject to Unit
Unit to Lesson
Class to Subject
Class to Unit
Class to Scheduled Lesson
Scheduled Lesson to Lesson
Lesson to Block
Block to Media
Lesson and Unit to Curriculum Outcome

## 71. Locked Data Decisions

The following decisions are considered locked for the initial build.
JSON is the canonical content format.
Major objects use immutable IDs.
Titles and slugs remain editable.
Units are reusable.
Lessons are reusable.
Classes reference reusable curriculum content.
Teaching dates belong to Scheduled Lesson records.
Lesson sequence and Class chronology remain separate.
Draft and published states remain separate.
Students only read published content.
Version history retains at least ten meaningful recent versions for Lessons.
Normal deletion uses Trash.
Archive remains separate from Trash.
Linked Blocks support Edit Source and Detach.
Curriculum Outcomes use structured official codes.
Google Drive is the first media provider.
Media files do not live inside Lesson JSON.
Media architecture supports future providers.
Student interaction state stays in browser local storage.
Teacher notes use the normal Block architecture.
AI operations default to Block scope.
Accepted AI output becomes normal structured content.
AI chat and history follow the Life Hub project precedent.
Netlify Blobs store live content.
GitHub stores application source and periodic content backups.
Normal editing does not trigger full site rebuilds.
Saving does not invoke AI.
Publishing does not invoke AI.
Schema validation applies to AI generated and manually authored content.
Every major object includes schema version information.
Export must preserve readable, portable JSON.
The architecture must remain workable with thousands of Lessons.
The next one should be 03 BLOCK SYSTEM.md. That is probably the most important specification after these two because it establishes the controlled vocabulary the builder, AI agent, student renderer and A4 renderer all share.
