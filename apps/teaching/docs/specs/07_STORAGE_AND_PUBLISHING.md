# Storage And Publishing

## 1. Purpose

This document defines storage, saving, publication, media, backup and public delivery architecture for the Teaching Day Book.
The storage system must support:
Fast everyday editing.
No full site rebuild after ordinary content changes.
Separate draft and published content.
Reliable student URLs.
Version recovery.
Reusable Units and Lessons.
Google Drive media references.
Portable JSON content.
Low Netlify usage.
Low AI usage.
Long term ownership of teaching content.
Safe recovery from failed saves or publications.
The central principle is:
Application code is deployed.
Teaching content is stored.
Student pages render stored published content dynamically.
Editing a Lesson must not require rebuilding or redeploying the website.

## 2. Storage Architecture Overview

The initial architecture uses:
Netlify
for hosting the application and server functions.
Netlify Blobs
for live structured application content.
Google Drive
for teaching files and media.
GitHub
for application source and periodic content backups.
Browser local state
for immediate editing state and temporary student interaction state.
Anthropic
for explicit AI generation only.
These systems have separate responsibilities.

## 3. Responsibility Boundaries

Netlify Hosting
Stores and serves:
Teacher application shell.
Student application shell.
JavaScript bundles.
CSS.
Block renderers.
Design system.
Static application assets.
Netlify Functions
Handle:
Authenticated teacher data requests.
Saving.
Publishing.
Version creation.
Media validation.
Redirect resolution where required.
AI requests.
Protected configuration.
Netlify Blobs
Store:
Years.
Subjects.
Scopes.
Units.
Lessons.
Classes.
Scheduled Lessons.
Blocks or Block snapshots.
Templates.
Curriculum Outcomes.
Media metadata.
Versions.
Redirects.
Application settings.
Google Drive
Stores:
PDFs.
Images.
Documents.
Slides.
Audio.
Video where practical.
Other teaching files.
GitHub
Stores:
Application source.
Schemas.
Documentation.
Migration scripts.
Design tokens.
Block Registry.
Periodic portable content backups.

## 4. No Build on Content Change

This is a mandatory architectural rule.
The following actions must not trigger a Netlify site build:
Editing text.
Adding a Block.
Removing a Block.
Moving a Block.
Changing Block size.
Changing visibility.
Changing print settings.
Creating a Lesson.
Editing a Lesson.
Scheduling a Lesson.
Publishing a Lesson.
Editing a Unit.
Editing a Scope and Sequence.
Changing a Class page.
Adding a Google Drive resource.
Changing a teaching date.
Restoring a version.
These actions modify stored data only.

## 5. When a Site Deployment Is Appropriate

A Netlify deployment is appropriate when the application itself changes.
Examples:
New Block renderer.
New Block type.
Builder feature.
Design system change.
Navigation behaviour change.
New storage function.
New AI capability.
Security update.
Application bug fix.
Schema migration code.
Student renderer improvement.
Content changes are not application deployments.

## 6. Static Application Shell

Teacher and student experiences should use reusable application shells.
The student Lesson route does not represent a separately generated HTML file for every Lesson.
Conceptually:

Student opens Lesson URL.
Application resolves Lesson identity.
Application requests published Lesson data.
Application renders Blocks.
This architecture means 700 Lessons do not require 700 generated application pages.

## 7. Dynamic Content Loading

Student routes should load only the information required for the current page.
A Lesson page should primarily retrieve:
Published Lesson snapshot.
Necessary Unit navigation data.
Necessary Class schedule context.
Necessary Media metadata.
It should not retrieve:
Whole Subject.
Whole archive.
All Classes.
All Units.
Unrelated Lessons.
Draft content.

## 8. Netlify Blob Storage

Netlify Blobs is the preferred live structured storage layer for the initial build.
Blob storage should contain JSON records which remain easy to:
Inspect.
Export.
Back up.
Restore.
Migrate.
The content model must not depend on opaque proprietary binary records.

## 9. Logical Blob Stores

A sensible initial logical separation is:
content
versions
media
redirects
settings
The exact physical number of Blob stores may change during implementation if technical simplicity suggests a better arrangement.
Logical separation matters more than excessive physical fragmentation.

## 10. Content Store

The content store contains current application objects.
Conceptual keys:
years/year_12

subjects/subject_y12_engadv

scopes/scope_y12_engadv_2026

units/unit_aotfw

lessons/lesson_aotfw_008

classes/class_2026_12engadv1

scheduled_lessons/scheduled_2026_12engadv1_aotfw_008

outcomes/outcome_example

templates/template_reading_comprehension
Keys should remain predictable enough for debugging.
Internal JSON IDs remain authoritative.

## 11. Key Names Are Not Relationships

Blob key structure assists storage organisation.
It must not define application relationships.
For example:
A Lesson knows its Unit through:
{
"unit_id": "unit_aotfw"
}
not because its file happens to sit inside a particular storage folder.
This allows storage organisation to evolve without breaking the information architecture.

## 12. Lesson Storage Model

A Lesson should have one permanent identity record.
Draft and published content remain separately addressable.
A preferred conceptual structure is:
lessons/lesson_aotfw_008/meta

lessons/lesson_aotfw_008/draft

lessons/lesson_aotfw_008/published
Meta stores stable Lesson information.
Draft stores current teacher content.
Published stores the current student snapshot.
This separation reduces the risk of draft content entering public responses.

## 13. Lesson Metadata

Lesson metadata may include:
{
"id": "lesson_aotfw_008",
"type": "lesson",
"title": "Memory, Identity and Ono",
"slug": "memory_identity_and_ono",
"unit_id": "unit_aotfw",
"sequence": 8,
"draft_revision": 17,
"published_revision": 14,
"has_unpublished_changes": true,
"status": "active",
"created_at": "timestamp",
"updated_at": "timestamp",
"schema_version": 1
}
Large Block payloads do not need duplication inside this metadata record.

## 14. Draft Snapshot

The draft contains the current editable Lesson state.
Example:
{
"lesson_id": "lesson_aotfw_008",
"revision": 17,
"blocks": [],
"outcome_ids": [],
"resource_ids": [],
"updated_at": "timestamp",
"schema_version": 1
}
The draft is private teacher content.
Student routes must never read this key.

## 15. Published Snapshot

The published record is a stable student facing snapshot.
Example:
{
"lesson_id": "lesson_aotfw_008",
"revision": 14,
"blocks": [],
"outcome_ids": [],
"resource_ids": [],
"published_at": "timestamp",
"schema_version": 1
}
Published content should already be validated for student rendering.
Student routes read this snapshot rather than transforming the current draft into public content on every request.

## 16. Why Published Snapshots Matter

Published snapshots provide several advantages.
The teacher continues editing without changing student content.
Student requests do not need to filter unfinished teacher work.
Publication remains deliberate.
Previous published versions remain recoverable.
Public page behaviour becomes predictable.
Draft validation problems do not break the live Lesson.

## 17. Save Flow

Normal Lesson editing follows this sequence:
Teacher edits Block

Browser updates local state immediately

Undo history updates

Save delay begins

Additional edits reset the delay

Teacher pauses

Draft save request is sent

Server validates draft

Revision is checked

Draft Blob is updated

Lesson metadata is updated

Interface reports Saved
No site build occurs.
No AI request occurs.
No student content changes.

## 18. Save Delay

Autosave should use delayed batching rather than saving every keystroke.
The exact timing belongs to implementation configuration.
The design goal is:
Frequent enough to protect work.
Infrequent enough to avoid unnecessary write operations.
Manual Save remains available.

## 19. Immediate Save Situations

The application should attempt an immediate save when appropriate.
Examples:
Teacher manually selects Save.
Teacher navigates away from the Lesson.
Teacher starts publication.
Teacher closes a significant editing mode.
Teacher accepts an AI proposal and then leaves the page.
The system should avoid losing recently edited local state.

## 20. Local Editing State

While the Lesson remains open, the browser holds the current working state.
This allows:
Immediate typing.
Undo.
Redo.
Drag operations.
Block resizing.
Temporary AI proposals.
No full offline editing architecture is required.

## 21. Short Network Failure

If a server save fails:
Keep the current browser state.
Show Save Failed.
Permit Retry.
Do not replace local content with the older server copy.
Do not navigate away silently.
The teacher should continue working where practical.

## 22. No Full Offline System

The first version does not require:
Offline Lesson browsing.
Long term offline editing.
Background sync.
Multi device conflict merging.
Complex offline queues.
Graceful handling of short connection interruptions is sufficient.

## 23. Revision Numbers

Editable objects should use revision numbers.
Example:
{
"revision": 17
}
Each meaningful successful save increments the revision.
Revision numbers support:
Version history.
Concurrency protection.
AI target checking.
Restore operations.
Publication tracking.

## 24. Optimistic Concurrency

Save requests should include the revision the browser believes it is editing.
Conceptually:

{
"lesson_id": "lesson_aotfw_008",
"base_revision": 17,
"draft": {}
}
The server compares this against the current stored revision.
If they match:
Save proceeds.
If they do not match:
The application reports a version conflict rather than silently overwriting newer content.

## 25. Conflict Behaviour

Multi device simultaneous editing is expected to be uncommon.
The architecture should still avoid silent data loss.
When revisions conflict, possible actions include:
Reload Current Server Version.
Keep My Version as a New Draft.
Review Differences.
Full collaborative merging is not required for the initial build.

## 26. Version Creation

Version records should represent meaningful recovery points.
Create versions for events such as:
Important save checkpoint.
Publish.
Restore.
Accepted substantial AI change.
Manual checkpoint.
The system does not need a permanent version for every autosave event.

## 27. Version Retention

The initial requirement is to retain at least the ten most recent meaningful Lesson versions.
Published versions should receive stronger preservation priority.
The storage implementation may retain more if usage remains inexpensive.
The minimum recovery guarantee remains ten meaningful recent versions.

## 28. Version Storage

Versions should live separately from current draft and published records.
Conceptual keys:
versions/lessons/lesson_aotfw_008/revision_017

versions/lessons/lesson_aotfw_008/revision_016

versions/lessons/lesson_aotfw_008/revision_015
Version records are immutable snapshots.

## 29. Restore Flow

Restoring a historical version should:
Load selected snapshot.
Show preview.
Require deliberate restore action.
Create the restored state as a new current draft.
Assign a new revision.
Preserve later history.
Mark unpublished changes.
Do not automatically publish restored content.

## 30. Publication Flow

Publishing a Lesson follows this sequence:
Save current draft

Validate draft

Validate Block schemas

Validate student visibility

Validate required media references

Check Drive access where available

Check navigation context

Create version checkpoint

Create published snapshot

Update published revision

Update publication timestamp

Update Lesson metadata

Return public URL

Refresh public data
No AI request occurs.
No application build occurs.

## 31. Publication Validation

Hard publication errors should include:
Invalid Block schema.
Missing required object reference.
Missing Lesson identity.
Corrupt Block structure.
Reference to unavailable required internal content.
Security invalid HTML App configuration.
These should prevent publication.

## 32. Publication Warnings

Warnings may include:
Image missing alt text.
Google Drive access unknown.
Google Drive resource restricted.
External Embed unavailable during check.
Missing optional metadata.
Very large media resource.
Warnings should be visible and actionable.
Not every warning needs to prevent publication.

## 33. Publication Atomicity

Publication should behave as one coherent operation.
Students should not receive half updated Lessons.
The server should prepare and validate the complete published snapshot before replacing the current public version.
The previous published snapshot remains live until the new snapshot is ready.

## 34. Failed Publication

If publication fails:
Keep the previous published version live.
Keep the draft unchanged.
Report the failure to the teacher.
Do not leave student content in a partially updated state.
This is a critical reliability rule.

## 35. Republish

Publishing an unchanged draft should normally be unnecessary.
If a teacher deliberately republishes, the system may refresh publication metadata without generating unnecessary duplicate versions unless content changed.
The implementation should avoid creating meaningless history noise.

## 36. Unpublish

A Lesson should support deliberate withdrawal from student access.
Unpublishing should not destroy:
Draft.
Version history.
Scheduled Lesson record.
Unit relationship.
It changes public availability.
The precise interface belongs in the user experience specification.

## 37. Published Visibility

Suggested Lesson publication states:
draft_only
published
unpublished
archived
The exact enum should remain distinct from general object status where useful.
A Lesson may remain an active teacher object while not currently published to students.

## 38. Class Page Publication

Class pages combine:
Teacher authored Blocks.
Generated information.
The manually authored Class page Blocks require draft and published snapshots.
Generated sections derive from current structured relationships.
Student Class pages should only expose information approved for public presentation.

## 39. Class Generated Data

Generated Class sections may include:
Current Unit.
Current published Lesson.
Recent published Lessons.
Published Units.
Teacher selected resources.
Generated data must filter out:
Draft only Lessons.
Trashed Lessons.
Private teacher notes.
Unpublished Unit content.
Restricted administrative metadata.

## 40. Unit Page Publication

Unit pages also combine:
Manual Blocks.
Generated Lesson sequence.
Unit metadata.
Manual Blocks use draft and published snapshots.
The generated Lesson list should expose only student appropriate published Lessons.
Teacher view may show unpublished Lessons and publication states.

## 41. Scope and Sequence Storage

The Scope and Sequence requires:
Structured planning metadata.
Document Blocks.
Timeline metadata.
Both Document and Timeline views read the same source records.
Conceptually:

scopes/scope_y12_engadv_2026/meta

scopes/scope_y12_engadv_2026/draft

scopes/scope_y12_engadv_2026/published
If the Scope remains teacher only initially, publication support may remain dormant while using the same architecture.

## 42. Unit Timeline Storage

Timeline positioning belongs to Scope planning metadata.
Example:
{
"unit_id": "unit_aotfw",
"start_date": "2026-04-27",
"end_date": "2026-06-19",
"term_start": 2,
"term_end": 2,
"order": 3
}
Dragging the timeline item updates this metadata.
It does not rewrite the Unit.

## 43. Class Schedule Storage

Scheduled Lesson records live independently.
Conceptual key:
scheduled_lessons/scheduled_2026_12engadv1_aotfw_008
Schedule changes update only the relevant Scheduled Lesson records and Class schedule metadata.
They do not alter reusable Lesson content.

## 44. Bulk Schedule Writes

Scheduling an entire Unit may create several Scheduled Lesson records in one teacher action.
The server should support grouped validation and writes.
If a grouped operation fails part way, the system should avoid leaving an unclear half scheduled sequence.
Where practical, validate the whole requested schedule before committing changes.

## 45. Current Lesson Storage

Class metadata may store:
{
"current_scheduled_lesson_id": "scheduled_2026_12engadv1_aotfw_008"
}
The application may suggest a current Lesson from dates.
Teacher selected current Lesson remains authoritative.

## 46. Public Student URLs

Public URLs should remain human readable.
Conceptual examples:
```
/classes/12engadv1

/year12/english_advanced/artist_of_the_floating_world

/year12/english_advanced/artist_of_the_floating_world/memory_identity_and_ono
```

The exact final URL syntax belongs to routing implementation.

## 47. ID Resolution

Readable URLs use slugs.
Internal resolution uses immutable object IDs.
A route should conceptually resolve:
Slug
→ object ID
→ current published data
Relationships never depend on matching display titles.

## 48. Slug Changes

If a published slug changes:
Store previous slug.
Create redirect record.
Keep internal object ID unchanged.
Serve or redirect old public links to the current route where practical.
This protects links already shared with students.

## 49. Redirect Storage

Redirect records should live in a dedicated logical store.
Example:
{
"id": "redirect_001",
"object_id": "lesson_aotfw_008",
"old_slug": "ono_and_memory",
"current_slug": "memory_identity_and_ono",
"created_at": "timestamp"
}
Redirect chains should be collapsed where practical.
Old URL should resolve directly to the newest slug.

## 50. Stable Shared Links

Changing:
Lesson title.
Unit title.
Sequence position.
Scheduled date.
Class current Lesson.
must not destroy the underlying Lesson identity.
Links already shared should continue functioning through ID mapping or redirects.

## 51. Student Route Data

Student routes should request public projections rather than raw internal objects.
A public Lesson response should contain only what the student renderer needs.
Example conceptual response:
{
"lesson": {},
"unit": {
"id": "unit_aotfw",
"title": "Artist of the Floating World",
"slug": "artist_of_the_floating_world"
},
"class": {},
"navigation": {
"previous": {},
"next": {}
},
"media": {}
}
Teacher only storage fields should not be included.

## 52. Public Projection Principle

Do not send private fields to the browser and merely hide them with CSS.
Student APIs should exclude:
Teacher Only Blocks.
Answers marked Teacher Only.
Teacher notes.
Draft revisions.
AI activity.
Internal version history.
Storage metadata.
Private Class metadata.
Administrative settings.
Security sensitive fields.
Public data should be deliberately projected from stored records.

## 53. Student Route Authentication

Published student pages require no student account.
Public read routes should expose only published student content.
Write routes remain protected.
Public users must never receive general Blob access.

## 54. Cache Strategy

Published student content is read far more frequently than it is changed.
The architecture should support caching of public responses.
Draft teacher content should favour freshness.
Public Lesson responses may use controlled caching because publication creates stable snapshots.
A new publish operation should invalidate or bypass stale published cache appropriately.

## 55. Published Snapshot Cacheability

Published snapshots are particularly suitable for caching because they are immutable until the next publication.
A publication revision identifier should assist cache invalidation.
Conceptually:

lesson_aotfw_008 revision 14
When revision 15 publishes, public consumers should receive the new revision.

## 56. Teacher Data Caching

Teacher authoring data requires stronger freshness.
The application may cache recently loaded objects in browser state for speed.
Revision checks still protect saves.
Do not rely on long lived browser caches as the source of truth for draft content.

## 57. Google Drive Role

Google Drive is the preferred initial storage provider for uploaded files and media.
Google Drive stores the actual file.
Teaching Day Book stores a Media Reference.
Example:
{
"id": "media_aotfw_extract",
"provider": "google_drive",
"provider_file_id": "drive_file_reference",
"media_type": "pdf",
"title": "Ono Extract",
"preview_url": "",
"thumbnail_url": "",
"sharing": "public_link"
}
The Lesson does not contain the PDF bytes.

## 58. Drive File Selection

Teacher workflow should be:
Add Media.
Choose Google Drive.
Select resource.
Retrieve metadata.
Determine file type.
Create Media Reference.
Insert appropriate Block.
No AI request is required.

## 59. Drive File Types

The system should recognise common types.
Image.
PDF.
Google Doc.
Google Slides.
Video.
Audio.
General file.
The appropriate renderer or Embed provider follows from metadata.

## 60. Drive Permission State

Every student visible Drive Media Reference should record an access state.
Suggested values:
public_link
restricted
unknown
unavailable
The teacher should see this state.
Student pages should not display the internal permission label.

## 61. Drive Permission Validation

Before publication, student visible Drive resources should be checked where technically practical.
If a file is restricted:
Warn the teacher.
Provide a direct route to resolve sharing where integration permits.
Do not silently assume students have access.

## 62. Drive Permission Rechecking

Permissions may change after publication.
The system should support rechecking when:
Teacher opens media settings.
Teacher republishes.
A resource fails.
A periodic maintenance action is explicitly run.
Continuous background checking is not required for the initial build.

## 63. Media Provider Independence

Media Reference schema must remain provider independent.
Future providers may include:
OneDrive.
Direct hosted assets.
GitHub.
Other cloud storage.
External URLs.
Lesson Block schemas should not require rewriting when a new provider is added.

## 64. Media Metadata Storage

Media metadata may live in a dedicated logical Blob store.
Conceptual key:
media/media_aotfw_extract
This allows several Lessons to reference the same file.
Updating a title, permission state or thumbnail does not require rewriting every Lesson.

## 65. Shared Media

A Media Reference may be used by:
Several Blocks.
Several Lessons.
Several Units.
Media should therefore receive its own permanent ID.
Deleting one Block does not delete the Drive file.

## 66. Media Deletion

Removing a Media Block from a Lesson removes the Block reference.
It should not automatically delete:
Media Reference if still used elsewhere.
Original Google Drive file.
Permanent Drive deletion must remain outside ordinary Lesson editing.

## 67. Media Reference Trash

Unused Media References may move to Trash.
Before trashing, the system should check active references.
If still referenced:
Warn the teacher.
Do not silently break published Lessons.

## 68. Image Optimisation

Google Drive may remain the source of the original image.
Student delivery should avoid loading unnecessarily large originals where possible.
The implementation should support:
Responsive dimensions.
Thumbnail or optimised representations.
Lazy loading.
Width and height metadata.
Aspect ratio preservation.
Efficient student delivery.
The precise optimisation service may evolve without changing Lesson data.

## 69. Image Source Model

The Media Reference should distinguish:
Original source.
Thumbnail.
Optimised source where available.
Example:
{
"provider": "google_drive",
"provider_file_id": "file_001",
"original_url": "",
"thumbnail_url": "",
"optimised_url": ""
}
The renderer chooses the appropriate source.

## 70. Media Failure

If Drive becomes temporarily unavailable:
The Lesson shell should still load.
Text content should still render.
The affected Block should show a fallback state.
The entire Lesson must not fail because one external file failed.

## 71. External Embeds

External Embed data should remain references.
Do not store full external webpages inside Lesson JSON.
Embed metadata includes:
Provider.
URL.
Embed URL.
Title.
Optional thumbnail.
Access or availability state where known.

## 72. Google Slides

Google Slides should normally remain in Google Drive.
The Teaching Day Book stores:
Drive reference.
Embed information.
Title.
Access state.
Student renderer displays the deck through the shared Embed architecture.

## 73. PDFs

PDFs stored in Drive should use the document Embed or viewer pathway.
The Block should also provide a fallback Open Resource action.
Print behaviour may include:
Title.
Thumbnail.
QR.
URL.
The system does not need to insert every PDF page into Lesson JSON.

## 74. Video

Large video files should not be copied into Blob storage.
Video remains at its provider.
The Block stores references and metadata.
Student renderer lazy loads the player.

## 75. HTML Apps

Interactive HTML Apps require separate stored application assets.
Large HTML, JavaScript and CSS payloads should not sit inside Lesson JSON.
A Block references an App ID.
Conceptually:

apps/app_unreliable_narrator_sort
The storage implementation must preserve sandboxing and security requirements.

## 76. HTML App Versioning

Interactive Apps may evolve independently of Lessons.
A Lesson should reference a specific App identity.
If changing an App would materially alter published Lessons, versioned App references should be supported.
The first build may use simple version numbers.
Example:
{
"app_id": "app_example",
"app_version": 2
}

## 77. Templates

Templates should live as structured data.
Conceptual keys:
templates/blocks/template_learning_intention

templates/compositions/composition_reading_comprehension

templates/lessons/template_standard_lesson

templates/units/template_novel_study
Template insertion does not require a site build.

## 78. Template Editing

Editing a Template updates stored Template data.
Existing independent copies do not change.
Linked template content follows linked content rules.
Templates should support Archive and versioning where practical.

## 79. Curriculum Outcome Storage

Curriculum Outcomes should live centrally.
Conceptual key:
outcomes/subject_y12_engadv/outcome_code
Units and Lessons store only Outcome references.
Changing central description metadata does not require rewriting every Lesson.

## 80. Search Data

Search should operate over structured application content.
The initial build may derive a search index from current records.
Search index data is derived data.
It is not the source of truth.
If search index data becomes corrupt, it should be rebuildable from canonical records.

## 81. Derived Data Principle

The following are examples of derived data:
Search index.
Lesson count.
Recent Lesson list.
Breadcrumb.
Class recent Lessons.
Unit published Lesson list.
Current year navigation tree.
Derived data may be cached.
Canonical relationships remain the source of truth.

## 82. Backup Philosophy

The user must retain ownership of teaching content.
Backups should use portable formats.
The system should not rely only on live Netlify Blob state.
Periodic backup should export structured records into readable files.

## 83. GitHub Backup

GitHub should receive periodic content snapshots.
It should not receive a commit after every autosave.
A backup archive may contain:
Years.
Subjects.
Scopes.
Units.
Lessons.
Classes.
Scheduled Lessons.
Templates.
Outcomes.
Media metadata.
Redirects.
Schema versions.

## 84. Backup Frequency

Exact scheduling belongs to implementation configuration.
A sensible initial approach is:
Regular automatic snapshots.
Manual Backup Now action.
Additional backup before major schema migration.
Avoid a backup commit for every small edit.

## 85. Backup Repository Structure

Conceptual structure:
content_backup/

```
    years/
```


```
    subjects/
```


```
    scopes/
```


```
    units/
```


```
    lessons/
```


```
    classes/
```


```
    schedules/
```


```
    templates/
```


```
    outcomes/
```


```
    media/
```


```
    redirects/
```

This mirrors conceptual information without making physical paths authoritative.

## 86. Backup Security

Backups must not include secrets.
Exclude:
Anthropic API key.
Google OAuth secrets.
Netlify credentials.
Authentication tokens.
Private environment configuration.
Only portable teaching and application data belongs in content backups.

## 87. Google Drive Files and Backups

GitHub content backups should preserve Google Drive references and metadata.
They do not need to copy every Drive file into GitHub.
A complete content export should identify external dependencies clearly.
Example:
Media provider.
Drive file ID.
File title.
File type.
Access state.

## 88. Full Archive Export

The teacher should be able to export all Teaching Day Book data.
A full archive should contain:
Manifest.
Schema version.
Years.
Subjects.
Scopes.
Units.
Lessons.
Classes.
Scheduled Lessons.
Blocks.
Templates.
Outcomes.
Media references.
Redirects.
Optional version history.

## 89. Export Manifest

A full export should contain a manifest.
Example:
{
"product": "Teaching Day Book",
"export_version": 1,
"created_at": "timestamp",
"schema_version": 1,
"objects": {
"lessons": 742,
"units": 41,
"classes": 12
}
}
This assists restoration and migration.

## 90. Single Lesson Export

A Lesson export should include enough information to preserve the Lesson independently.
Include:
Lesson metadata.
Draft or published content according to export choice.
Blocks.
Outcome references.
Media references.
Unit reference metadata.
Schema version.
Do not duplicate original Drive files unless a separate file export feature is explicitly selected later.

## 91. Unit Export

A Unit export should include:
Unit.
Lesson sequence.
Selected Lesson content.
Unit Blocks.
Outcome references.
Media references.
Relevant templates only when explicitly requested.
The export should preserve object IDs.

## 92. Import

The architecture should support future reimport of exported JSON.
Import must validate:
Schema version.
Object IDs.
Relationships.
Block schemas.
Media references.
Duplicate IDs.
The first build may prioritise export before full import tooling, but the format must remain designed for eventual restoration.

## 93. Schema Migration

Storage records contain schema versions.
Application startup or object loading should identify old schemas.
Migration functions should transform old structures into the current supported schema.
Migrations must not depend on AI.

## 94. Migration Safety

Before a significant data migration:
Create backup.
Validate migration against sample data.
Preserve original IDs.
Log migration version.
Avoid destructive transformation without recovery.

## 95. Archive Storage

Archived records remain in canonical storage.
They should not need a separate physical archive system.
Status determines normal visibility.
Example:
{
"status": "archived"
}
Archived records remain searchable when archive filters are enabled.

## 96. Trash Storage

Trashed records also remain recoverable.
Suggested metadata:
{
"status": "trashed",
"trashed_at": "timestamp",
"previous_status": "active"
}
Trash should not immediately remove related version history.

## 97. Trash Retention

The first build should avoid automatic permanent deletion.
Permanent deletion occurs only through an explicit advanced action.
Future automatic retention rules may be introduced later.

## 98. Referential Checks Before Trash

Before trashing a reusable object, check references.
Examples:
Unit used by active Class.
Lesson present in Class schedules.
Media referenced by published Lesson.
Template linked to active content.
The teacher should receive a clear dependency warning.

## 99. Permanent Delete

Permanent Delete should require:
Explicit advanced action.
Clear object identity.
Dependency check.
Confirmation.
Where references remain, permanent deletion should normally be blocked until dependencies are resolved.

## 100. Student Publication Isolation

Student read infrastructure must remain logically separate from teacher write infrastructure.
Public requests should never receive:
Write credentials.
Blob management credentials.
Draft storage paths.
AI credentials.
Teacher authentication data.
The public student experience requires read only published projections.

## 101. Teacher Write Routes

Teacher data mutation routes require authenticated teacher access.
Protected actions include:
Save.
Publish.
Unpublish.
Restore.
Trash.
Permanent Delete.
Create.
Update.
Schedule.
Media registration.
Template editing.
AI generation.

## 102. Direct Blob Access

Browser clients should not receive unrestricted direct Blob credentials.
Teacher and student requests should travel through controlled application APIs where security or projection is required.
This allows:
Authentication.
Validation.
Public filtering.
Revision checking.
Rate control.
Error handling.

## 103. Application API Shape

Conceptual route groups may include:
```
/api/content/

/api/lessons/

/api/units/

/api/classes/

/api/schedule/

/api/media/

/api/publish/

/api/versions/

/api/ai/
```

Exact routes belong to implementation specification.
The important rule is separation of responsibilities.

## 104. Read Versus Write Operations

Read and write operations should remain clearly distinguished.
Public read:
Published student data only.
Teacher read:
Draft and teacher metadata.
Teacher write:
Authenticated mutation.
This simplifies security and debugging.

## 105. Save Payload Size

Saving one Lesson should send the Lesson draft or changed object only.
Do not send:
Entire Unit.
Entire Subject.
Entire Class archive.
Entire website state.
This limits bandwidth and Blob writes.

## 106. Whole Lesson Save Versus Block Patching

The first implementation should favour reliable whole Lesson draft saves.
Lessons are expected to remain small enough that storing one structured Lesson snapshot is straightforward.
This is simpler than complex server patch operations.
Later, Block level server patches may be introduced if actual usage demonstrates a need.

## 107. Why Whole Lesson Draft Saves Are Preferred Initially

Advantages:
Simpler recovery.
Simpler validation.
Simpler revision logic.
Simpler versioning.
Fewer partial update bugs.
Easier export.
Easier debugging.
The browser still edits Blocks individually.
The server save may store the consolidated Lesson draft.

## 108. Large Lesson Guardrail

The system should monitor Lesson payload size.
If Lessons become unusually large, likely causes include:
Embedded large text blobs.
Improper media storage.
Large HTML Apps stored inline.
Excessive duplicated content.
The system should fix the content model rather than immediately adding complex patch infrastructure.

## 109. Media Outside Lesson JSON

This rule is mandatory.
Do not embed inside Lesson JSON:
Image bytes.
PDF bytes.
Video bytes.
Audio bytes.
Large HTML application packages.
Lesson JSON contains references and metadata only.

## 110. Publication and Netlify Usage

Publication should update stored content.
It should not invoke Netlify deployment.
The cost model should therefore scale primarily with:
Storage reads.
Storage writes.
Function calls.
Media provider access.
Explicit AI calls.
It should not scale with full website rebuilds after everyday teaching edits.

## 111. Student Read Efficiency

A student loading one Lesson should not cause numerous unnecessary server operations.
Where practical, the public API should assemble a compact Lesson payload.
The client should not need twenty separate requests to understand one page.
Media itself remains independently lazy loaded.

## 112. Public Lesson Bundle

A public Lesson response may include:
Lesson published Blocks.
Basic Unit identity.
Basic Class identity.
Previous Lesson.
Next Lesson.
Required Media metadata.
This reduces repeated structural requests.
Heavy media payloads remain external.

## 113. Public Class Bundle

A Class page response may include:
Class identity.
Current Unit.
Current Lesson.
Recent published Lessons.
Published Unit list.
Published manual Class Blocks.
Important Media metadata.
The API should not expose full Class schedules if the page does not need them.

## 114. Public Unit Bundle

A Unit page response may include:
Unit identity.
Published manual Unit Blocks.
Published Lesson sequence.
Class current position when Class context exists.
Shared resources.
Navigation.
Again, unpublished teacher data remains excluded.

## 115. Publication Context

The same reusable Unit may appear through multiple Classes.
Lesson content publication belongs to the reusable Lesson.
Schedule context belongs to the Class.
The public route combines:
Published reusable Lesson content.
Specific Class schedule context.
This preserves reuse while giving students relevant dates and navigation.

## 116. Master Lesson Publication

Publishing the Master Lesson updates the content available to every Class using that Lesson.
This consequence should remain clear in teacher view.
Class specific overrides remain separate where they exist.

## 117. Class Override Publication

A Class specific override should have its own draft and published state where student facing changes exist.
Public Class Lesson resolution should conceptually follow:
Look for published Class override.
If present, apply approved override.
Otherwise use published Master Lesson.
The underlying Master Lesson remains unchanged.

## 118. Sparse Overrides

Class overrides should store only differences where practical.
This avoids maintaining complete duplicate Lessons.
The public renderer or server projection composes:
Master published Lesson.
Published Class override.
into the final student view.

## 119. Override Failure

If an override becomes invalid because the Master Lesson changed substantially:
Do not silently drop the override.
Teacher view should flag the conflict.
Student view should continue using the last valid published combination where possible.

## 120. Current Published State

Public pages should always resolve to a coherent published revision.
Teacher draft modifications do not affect that state.
This rule applies to:
Lesson.
Unit manual content.
Class manual content.
Class overrides.

## 121. Publication History

Publication metadata should record:
Published revision.
Published timestamp.
Previous published revision.
Publisher identity where relevant.
No complex approval workflow is required for the initial single teacher use case.

## 122. Rollback Publication

A previous Lesson version may be restored into draft and republished.
A direct one click public rollback may be added later.
The initial safe workflow is:
Preview old version.
Restore to draft.
Review.
Publish.

## 123. Student URL Availability

A public URL should return a meaningful state when content is unavailable.
Possible states:
Published Lesson.
Not Published.
Archived.
Removed.
Invalid Link.
The student should not receive a technical storage error.

## 124. Archived Public Content

Archiving a Lesson should not automatically destroy historical data.
Whether archived student URLs remain visible should be configurable later.
Initial default:
Archived Lessons disappear from normal navigation.
Previously shared direct links may show a simple archived or unavailable message rather than expose draft content.

## 125. Missing Route

Invalid or removed student routes should offer useful navigation.
Example:
This Lesson is no longer available.
Back to Class.
Back to Unit.
Do not show:
Blob key.
Stack trace.
Internal ID.
Function error.

## 126. Logging

Server operations should record lightweight technical logs for:
Save failures.
Publication failures.
Version conflicts.
Media validation failures.
Migration failures.
AI failures.
Unexpected public projection errors.
Logs should not unnecessarily duplicate full Lesson contents.

## 127. Privacy in Logs

Avoid logging:
Full private teaching documents.
Credentials.
API keys.
Authentication tokens.
Large AI source material.
Sensitive server configuration.
Logs should focus on operation metadata and errors.

## 128. Save Operation Metadata

Useful save metadata includes:
Object ID.
Object type.
Previous revision.
New revision.
Timestamp.
Success or failure.
Payload size.
Do not log the complete content on every save.

## 129. Publication Operation Metadata

Useful publication metadata includes:
Object ID.
Draft revision.
Published revision.
Timestamp.
Warnings.
Success or failure.
This assists debugging without duplicating whole Lesson content.

## 130. Storage Health

A lightweight maintenance view may eventually report:
Broken references.
Restricted Drive files.
Missing Media objects.
Invalid redirects.
Unsupported schema versions.
Storage totals.
This is useful but not required for the earliest build phase.

## 131. Backup Before Risky Operations

The system should create or recommend a backup before:
Large schema migration.
Bulk destructive cleanup.
Large import.
Major storage restructuring.
Routine Lesson edits do not require a GitHub backup every time.

## 132. Environment Separation

The architecture should support separation between:
Development.
Preview.
Production.
Development work should not accidentally modify live teaching content.
Environment specific Blob stores or prefixes should be used.

## 133. Development Data

Local or preview development should use:
Sample data.
Copied test records.
Dedicated development storage.
Production Lessons should not become test fixtures.

## 134. Preview Deployments

Netlify preview deployments should test application changes without automatically changing production teaching data.
Where preview deployments need data, they should use isolated or read only test sources.

## 135. Production Storage

Production teacher writes must target the production content store only from the production authenticated application.
Environment variables should clearly identify storage environment.

## 136. IDs Across Environments

Sample development data may use stable test IDs.
Production IDs should not collide with imported development fixtures.
Export and import tools should handle conflicts explicitly.

## 137. Storage Configuration

Storage names, limits and environment prefixes should live in central configuration.
Do not scatter literal store names throughout components.
Conceptual configuration:
{
"content_store": "content",
"version_store": "versions",
"media_store": "media",
"redirect_store": "redirects"
}

## 138. Data Access Layer

Application components should not call storage directly.
Use a central data access layer.
Conceptually:

UI

Data Service

API Function

Storage Repository

Netlify Blobs
This allows storage implementation changes without rewriting the entire interface.

## 139. Repository Layer

The server should expose reusable storage operations.
Examples:
getLesson
saveLessonDraft
publishLesson
getUnit
getClass
getScheduledLessons
saveMediaReference
getVersion
restoreVersion
resolveSlug
These functions centralise validation and storage behaviour.

## 140. Storage Provider Abstraction

Google Drive integration should also use a provider layer.
Conceptually:

Media Service

Provider Adapter

Google Drive
Future providers then implement the same expected operations.
Examples:
Get metadata.
Get preview.
Check access.
Resolve file type.
Generate supported display information.

## 141. Failure Isolation

A failure in one external system should have limited impact.
Anthropic unavailable:
Editing still works.
Google Drive unavailable:
Text Lessons still work.
GitHub backup unavailable:
Live storage still works.
One broken Embed:
Rest of Lesson still works.
Netlify content read unavailable:
Display a clear temporary service error.
The architecture should avoid unnecessary dependency chains.

## 142. Data Portability

Every core teaching object should remain meaningful without the original application.
A Lesson export should still reveal:
Title.
Content.
Sequence.
Outcomes.
Resources.
Teacher notes.
Relationships.
This is a core long term ownership requirement.

## 143. No Proprietary Lock In

The architecture should avoid requiring:
A proprietary editor format.
A proprietary binary database export.
An AI provider to interpret stored Lessons.
A Netlify build to reconstruct every page.
A specific media provider forever.
The application may depend on services operationally while keeping content portable.

## 144. Storage Acceptance Criteria

The storage and publishing implementation is acceptable when:
Editing one Lesson does not rebuild the website.
Saving one Lesson does not rewrite unrelated Lessons.
Publishing one Lesson does not deploy the application.
Draft content remains private.
Students only receive published content.
Published content remains stable while drafts change.
Failed publication leaves the previous published version live.
Every meaningful Lesson save uses revision control.
Version conflicts do not silently overwrite newer content.
At least ten meaningful recent Lesson versions remain recoverable.
Restoring a version creates a new draft revision.
Google Drive stores file content rather than Lesson JSON.
Media References remain provider independent.
Restricted Drive resources are visible to the teacher.
Media failure does not break an entire Lesson.
Student APIs exclude Teacher Only content.
Student APIs exclude draft content.
Public write access does not exist.
Teacher writes require authentication.
Old slugs remain recoverable through redirects where practical.
Lesson title changes do not change permanent IDs.
Class schedule changes do not alter reusable Lessons.
Class specific overrides do not duplicate whole Lessons unnecessarily.
GitHub does not receive a commit after every edit.
Portable backups are supported.
Secrets never appear in content backups.
Schema migrations preserve IDs and content.
Development and production data remain separated.
Large media files stay outside Blob Lesson records.
Storage services remain abstracted behind central application layers.
Student pages remain usable without Anthropic availability.
A broken external Embed affects only its own Block.
Public URLs return useful states rather than internal errors.
Core teaching data remains exportable as readable JSON.

## 145. Locked Storage and Publishing Decisions

The following decisions are locked for the initial build.
Netlify hosts the application.
Netlify Functions handle protected server operations.
Netlify Blobs stores live structured teaching content.
Google Drive is the preferred initial media and teaching file provider.
GitHub stores application source and periodic portable content backups.
Browser state provides immediate editing state.
Full offline architecture is excluded from the initial build.
Normal content editing never triggers a site build.
Saving never triggers a site build.
Publishing never triggers a site build.
Lesson drafts and published snapshots remain separate.
Student routes never read Lesson drafts.
Publication creates a validated stable snapshot.
Failed publication leaves the previous published snapshot live.
Autosave uses delayed batching.
Manual Save remains available.
Whole Lesson draft saves are preferred initially over complex Block level server patching.
Revisions protect against silent concurrent overwrites.
At least ten meaningful recent Lesson versions remain recoverable.
Version restoration creates a new draft.
Public student responses are projections which exclude private teacher data.
Students require no login for published pages.
Teacher write operations require authentication.
Internal relationships use immutable IDs.
Public URLs use readable slugs.
Previous published slugs should redirect where practical.
Class and Unit pages combine published manual content with generated published relationships.
Student navigation never exposes unpublished Lessons by default.
Google Drive files remain external to Lesson JSON.
Media References use permanent internal IDs.
Media architecture remains provider independent.
Google Drive permission state should be checked before publication where technically practical.
Removing a Block does not automatically delete the original Drive file.
Large images should use responsive or optimised delivery where possible.
Heavy media lazy loads.
HTML Apps remain separate stored assets referenced by ID.
Search indexes and navigation lists are derived data rather than canonical data.
GitHub backup does not run after every autosave.
Full archive export uses readable structured data.
Schema migrations use deterministic code rather than AI.
Development, preview and production storage remain separated.
Application components access storage through central data services rather than direct scattered calls.
External service failures should remain isolated wherever possible.
Core teaching content remains portable and understandable outside the Teaching Day Book.
