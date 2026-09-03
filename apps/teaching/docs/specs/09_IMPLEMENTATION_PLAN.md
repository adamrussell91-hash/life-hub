# Implementation Plan

## 1. Purpose

This document defines the recommended implementation sequence for the Teaching Day Book.
The build should proceed in deliberate phases.
The objective is not to create the entire final product at once.
The objective is to establish a stable core architecture first, then progressively add capability without repeatedly rebuilding foundational systems.
The implementation should prioritise:
Reliable content architecture.
Fast deterministic editing.
Stable student publishing.
Strong data ownership.
Low infrastructure usage.
Low AI usage.
Consistent Block behaviour.
Simple maintainable code.
Clear separation between content and application code.
Progressive addition of advanced features.
The implementation should avoid premature complexity.

## 2. Build Philosophy

The project should follow several implementation rules.
### 2.1 Build vertical slices

Each major phase should produce something usable from end to end.
Example:
Create Lesson.
Edit Lesson.
Save Lesson.
Publish Lesson.
Open Student Lesson.
This is more valuable than separately building every possible database object before any real workflow functions.

### 2.2 Establish foundations once

The following systems should be designed carefully before large feature expansion:
Object IDs.
Data access layer.
Block Registry.
Draft and published storage.
Renderer architecture.
Design tokens.
Authentication.
Routing.
Schema validation.
These systems affect almost every later feature.

### 2.3 Avoid premature optimisation

The initial architecture should remain efficient, but do not implement complexity before evidence requires it.
Examples to avoid initially:
Block level server patching.
Realtime collaboration.
Complex offline synchronisation.
Microservices.
Large event systems.
Multiple databases.
Sophisticated search infrastructure.
Multiple AI providers.
Complex permission roles.
Whole application state management frameworks without clear need.

### 2.4 Deterministic first

Before adding AI to an interaction, determine whether ordinary application logic solves the problem.
AI should only be added where language generation, transformation, judgement or reasoning provides clear value.

## 3. Recommended Technical Foundation

The initial application should use a modern web application architecture compatible with:
Netlify hosting.
Netlify Functions.
Netlify Blobs.
Google Drive integration.
Anthropic API.
GitHub.
The exact framework should be selected during initial project setup based on compatibility and maintainability.
The implementation should favour:
Strong TypeScript support.
Good client side interaction.
Straightforward Netlify deployment.
Reusable component architecture.
Schema validation.
Simple routing.
Minimal unnecessary framework abstraction.

## 4. Project Repository Structure

A clear repository structure should exist from the beginning.
Conceptually:

```
/
    docs/

    src/
        app/
        components/
        blocks/
        renderers/
        services/
        schemas/
        registry/
        design/
        utils/

    netlify/
        functions/

    migrations/

    scripts/

    tests/

    public/

    content_samples/
```

Exact naming may change according to the selected framework.
Responsibilities should remain clear.

## 5. Specification Folder

All project specifications should live inside the repository.
Suggested:

```
/docs/specs/
```

Files:

- `00_PRODUCT_PRINCIPLES.md`
- `01_INFORMATION_ARCHITECTURE.md`
- `02_DATA_MODEL.md`
- `03_BLOCK_SYSTEM.md`
- `04_USER_EXPERIENCE.md`
- `05_DESIGN_SYSTEM.md`
- `06_AI_AGENT.md`
- `07_STORAGE_AND_PUBLISHING.md`
- `08_SECURITY.md`
- `09_IMPLEMENTATION_PLAN.md`
- `10_ACCEPTANCE_TESTS.md`
These files should remain version controlled.
They are the project source of truth.

## 6. Specification Authority

When code behaviour conflicts with the specification, the discrepancy should be deliberate.
Cursor should not silently reinterpret architecture because a shortcut seems easier.
If implementation reveals that a specification decision is impractical:
Document the issue.
Update the relevant specification.
Then update the code.
Do not allow undocumented architectural drift.

## 7. Implementation Phases

Recommended implementation phases:
Phase 0: Project Foundation
Phase 1: Core Data and Storage
Phase 2: Teacher Navigation and Curriculum Structure
Phase 3: Basic Lesson Builder
Phase 4: Student Lesson Publishing
Phase 5: Block System Expansion
Phase 6: Unit and Class Pages
Phase 7: Scheduling
Phase 8: Scope and Sequence
Phase 9: A4 Print
Phase 10: Google Drive
Phase 11: Templates and Reuse
Phase 12: Search and Navigation Acceleration
Phase 13: AI Integration
Phase 14: Versioning, Archive and Recovery
Phase 15: Refinement and Production Hardening
This sequence may overlap slightly where practical.
Major dependencies should remain respected.

## 8. Phase 0: Project Foundation

Objective
Create the stable application skeleton and development environment.
Build
Repository.
Framework.
TypeScript.
Netlify configuration.
Development environment.
Preview environment.
Production environment.
Environment variable handling.
Basic routing.
Design token structure.
Linting.
Formatting.
Testing framework.
Schema validation library.
Initial application shell.
Deliverable
A deployed empty teacher application and empty student application shell.
No meaningful teaching functionality is required yet.

## 9. Phase 0 Architecture Decisions

Before significant implementation, lock:
Framework.
Routing approach.
State management approach.
Schema validation library.
Testing approach.
Authentication mechanism.
Netlify environment configuration.
Blob store names.
ID generation utilities.
Date handling library.
Rich Text editor library.
These should be recorded in technical architecture notes.

## 10. Phase 0 Design Tokens

Implement the core Design System tokens immediately.
At minimum:
Colour.
Typography.
Spacing.
Radius.
Border.
Shadow.
Glass.
Breakpoint.
Motion.
Print measurements.
Do not begin styling individual screens with arbitrary values.

## 11. Phase 0 Application Shell

Create:
Teacher shell.
Student shell.
Left Rail placeholder.
Top Context Bar placeholder.
Main Canvas placeholder.
Right Panel placeholder.
Student Header placeholder.
Responsive foundations.
The goal is structural validation.

## 12. Phase 0 Exit Criteria

Phase 0 is complete when:
Teacher app deploys.
Student app deploys.
Environment separation works.
Design tokens load.
Basic routes work.
No production secret enters client code.
Repository structure matches agreed architecture.

## 13. Phase 1: Core Data and Storage

Objective
Create canonical objects and reliable storage operations.
Implement first
Year.
Subject.
Unit.
Lesson.
Class.
Scheduled Lesson.
Curriculum Outcome.
Media Reference.
Block.
Revision metadata.

## 14. Phase 1 Schemas

Create schema definitions based directly on:
02 DATA MODEL.md
03 BLOCK SYSTEM.md
Every primary object requires validation.
Schemas should be shared where possible between:
Client validation.
Server validation.
Imports.
AI output later.

## 15. Phase 1 ID Utilities

Implement deterministic ID creation utilities.
Examples:
year_12
subject_y12_engadv
unit_aotfw
lesson_aotfw_008
class_2026_12engadv1
IDs must be validated for uniqueness.
Human readable IDs are preferred where practical.

## 16. Phase 1 Data Access Layer

Create a central data service.
Client code should not directly know Blob implementation details.
Example conceptual interface:
getYear()
getSubject()
getUnit()
getLesson()
saveLessonDraft()
getClass()
getSchedule()

## 17. Phase 1 Server Repository Layer

Netlify Functions should access Blob storage through reusable repository functions.
Avoid writing storage logic separately inside every API function.
Example:
lessonRepository
unitRepository
classRepository
mediaRepository
versionRepository

## 18. Phase 1 Draft Storage

Implement Lesson:
Meta.
Draft.
Published placeholder.
Revision.
Save.
Load.
Initially, published may remain unused until Phase 4.

## 19. Phase 1 Sample Content

Create a small realistic sample dataset.
Recommended:
Year 12.
English Advanced.
One Class.
One Unit.
Three Lessons.
Several Curriculum Outcomes.
Several Blocks.
Use realistic teaching data rather than meaningless lorem ipsum.
This reveals architectural problems earlier.

## 20. Phase 1 Exit Criteria

Phase 1 is complete when:
Canonical objects save and load.
Schema validation works.
Revision numbers work.
Data remains readable JSON.
Development and production stores are isolated.
Sample teaching data loads reliably.
No UI component requires direct Blob knowledge.

## 21. Phase 2: Teacher Navigation and Curriculum Structure

Objective
Make the system navigable before building sophisticated editing.
Build
Teacher Home.
Left Navigation Rail.
Year navigation.
Subject navigation.
Term structure.
Unit navigation.
Lesson navigation.
Class navigation.
Basic breadcrumbs.
Current object context.

## 22. Phase 2 Teacher Home

Initial Home should include:
Today's Teaching placeholder.
Recent Lessons.
Recent Units.
Classes.
Drafts with unpublished changes placeholder.
Quick Create.
Do not overbuild dashboard analytics.

## 23. Phase 2 Hierarchy

Implement:
Year → Subject → Term → Unit → Lesson
Classes appear as separate navigation.
Use collapsible tree behaviour.
Remember local expanded state.

## 24. Phase 2 URLs

Teacher routes should use stable IDs internally.
Readable slugs may appear in user facing routes.
Internal components should never depend on visible labels for relationships.

## 25. Phase 2 Quick Creation

Support basic:
Create Unit.
Create Lesson.
Create Class.
Initial forms should remain minimal.
More advanced templates arrive later.

## 26. Phase 2 Exit Criteria

Phase 2 is complete when:
A teacher navigates from Year to Lesson.
A teacher opens Class context.
A teacher creates basic Units and Lessons.
Navigation remains clear with realistic sample volume.
IDs and relationships remain stable after renaming.

## 27. Phase 3: Basic Lesson Builder

Objective
Create the central authoring experience.
Do not implement every Block yet.
Start with a small Block set.
Initial Blocks:
Rich Text.
Heading.
Callout.
Image placeholder.
Question Set.
Section.
Columns.
Divider.
Spacer.

## 28. Phase 3 Block Registry

Build the central Block Registry before implementing many Blocks.
Registry must define:
Block type.
Display label.
Category.
Icon.
Allowed variants.
Default variant.
Schema.
Visibility support.
Layout support.
Print support placeholder.
Renderer.
Inspector controls.
AI support placeholder.
This is a major architectural checkpoint.

## 29. Phase 3 Renderer Architecture

Create separate renderer contexts:
Teacher Renderer.
Student Renderer.
Print Renderer placeholder.
They consume the same Block data.
Do not build separate Lesson content systems.

## 30. Phase 3 Block Operations

Implement deterministic operations:
Insert.
Delete.
Duplicate.
Move.
Drag.
Change variant.
Change visibility.
Edit content.
Create Section.
Move into Section.
Columns.
Undo.
Redo.
None of these operations use AI.

## 31. Phase 3 Inspector

Build basic Right Panel Inspector.
Start with:
Variant.
Visibility.
Layout.
Duplicate.
Delete.
Advanced placeholder.
Inspector options derive from Block Registry.

## 32. Phase 3 Autosave

Connect builder state to Lesson draft saving.
Requirements:
Immediate local editing.
Delayed server save.
Visible Saving state.
Visible Saved state.
Visible Save Failed state.
Revision check.
Manual Save.

## 33. Phase 3 Exit Criteria

Phase 3 is complete when:
A teacher creates a Lesson.
Adds Blocks.
Edits content.
Reorders Blocks.
Changes variants.
Adds Teacher Only content.
Reloads the page.
Sees saved content correctly.
Undo and Redo work.
No AI is involved.

## 34. Phase 4: Student Lesson Publishing

Objective
Complete the first true end to end teaching workflow.
Teacher creates Lesson.
Teacher publishes Lesson.
Student opens public URL.
This is the first major product milestone.

## 35. Phase 4 Publishing

Implement:
Draft validation.
Published snapshot.
Published revision.
Publication timestamp.
Unpublished Changes state.
Failed publication protection.
Unpublish.

## 36. Phase 4 Public Projection

Create student API projection.
Exclude:
Teacher Only Blocks.
Answers marked Teacher Only.
Draft metadata.
Version data.
Internal storage fields.
AI metadata.

## 37. Phase 4 Student Renderer

Implement public Lesson page.
Required:
Lesson title.
Unit.
Date when Class context exists.
Blocks.
Responsive rendering.
Basic breadcrumb.
Class Page link placeholder.
Unit Page link placeholder.
Previous and Next placeholder.

## 38. Phase 4 Phone Priority

Test student Lesson page early at narrow mobile widths.
Do not postpone phone responsiveness until the end.
At minimum test:
Long text.
Question Set.
Image.
Callout.
Columns stacking.
Navigation.

## 39. Phase 4 Stable URLs

Implement:
Slugs.
Object resolution.
Old slug redirect records.
Readable Lesson URLs.
Changing title should not change identity.

## 40. Phase 4 Exit Criteria

Phase 4 is complete when:
Teacher edits a draft.
Teacher publishes.
Student opens URL without login.
Student receives only published content.
Teacher edits draft again.
Student continues seeing previous version.
Teacher republishes.
Student receives new version.
This milestone proves the central architecture.

## 41. Major Milestone A

At the end of Phase 4, stop.
Use the application with real Lesson content.
Do not immediately add every planned feature.
Build several actual Lessons.
Identify:
Editing friction.
Navigation friction.
Block problems.
Storage problems.
Student rendering problems.
Only then expand the Block library.

## 42. Phase 5: Block System Expansion

Objective
Build the full initial primitive Block library.
Add Blocks incrementally.
Recommended order follows frequency and technical complexity.

## 43. Phase 5A Content Blocks

Add:
Quote.
Definition.
Table.
Accordion.
Tabs.
Timeline.
Test:
Teacher.
Student.
Mobile.
Accessibility.

## 44. Phase 5B Media Blocks

Add:
Image.
Gallery.
Video.
Audio.
Attachment.
Embed.
Initially permit manual URLs or sample references before full Drive integration.
This isolates Block behaviour from provider integration.

## 45. Phase 5C Learning Activity Blocks

Add:
Question Set expansion.
Flashcards.
Cloze.
Self Check.
Student interaction state uses browser local storage.
No account.
No server student progress storage.

## 46. Phase 5D Visualisation Blocks

Add:
Chart.
Equation.
Diagram.
Mind Map.
Concept Map.
Keep first implementations simple.
Avoid building complex graphical editors unless required.

## 47. Phase 5E Structure Blocks

Complete:
Section.
Columns.
Collection.
Divider.
Spacer.
Collection becomes important for Unit and Class pages.

## 48. Phase 5 Block Quality Gate

Every Block must work in at least:
Teacher desktop.
Student desktop.
Student phone.
Print placeholder behaviour.
Schema validation.
Invalid Block fallback.
Do not add a Block and postpone every non desktop state indefinitely.

## 49. Phase 6: Unit and Class Pages

Objective
Create the student navigation layer surrounding Lessons.
Build Unit Page first.
Then Class Page.

## 50. Phase 6 Unit Page

Implement hybrid Unit Page.
Generated:
Unit title.
Lesson sequence.
Published Lesson list.
Current position where Class context exists.
Resources.
Manual:
Normal editable Blocks.

## 51. Phase 6 Class Page

Implement hybrid Class Page.
Generated:
Current Unit.
Current Lesson.
Recent Lessons.
Unit list.
Manual:
Announcements.
Resources.
Links.
Custom Blocks.

## 52. Phase 6 Navigation

Complete student Lesson navigation:
Class Page.
Unit Page.
Previous Lesson.
Next Lesson.
Breadcrumb.
Top navigation.
Bottom navigation.
Phone navigation.

## 53. Phase 6 Collection Block

Collection should drive reusable generated navigation.
Examples:
Lessons in Unit.
Recent Class Lessons.
Resources tagged Revision.
Avoid manually authored duplicate link lists.

## 54. Phase 6 Exit Criteria

Phase 6 is complete when a student may navigate:
Class Page
→ Unit Page
→ Lesson
→ Next Lesson
→ Previous Lesson
without relying on teacher maintained link lists.

## 55. Phase 7: Scheduling

Objective
Connect reusable Lessons with real teaching chronology.
Implement Scheduled Lesson records fully.

## 56. Phase 7 Class Schedule

Start with a strong chronological list view.
Display:
Date.
Lesson.
Unit.
Status.
Sequence.
Actions.
Calendar view may follow later.

## 57. Phase 7 Schedule Actions

Support:
Schedule Lesson.
Change date.
Reorder.
Mark Delivered.
Mark Skipped.
Reschedule.
Set Current Lesson.

## 58. Phase 7 Unit Scheduling

Support adding an existing Unit to Class.
Workflow:
Select Unit.
Create initial Scheduled Lesson sequence.
Assign dates.
Review.
Adjust.
Avoid sophisticated automated timetable logic initially.

## 59. Phase 7 Class Navigation Integration

Previous and Next student Lesson navigation should now follow Scheduled Lesson order.
Class Page Recent Lessons derives from the schedule.
Current Lesson derives from explicit teacher state with date based suggestions.

## 60. Phase 7 Overrides

Add the Class customisation mechanism only after normal shared Lessons work reliably.
Implement:
Edit Master.
Customise for Class.
Sparse override record.
Visual customised state.
Published override resolution.
Given its expected rarity, this should not delay basic scheduling.

## 61. Phase 7 Exit Criteria

Phase 7 is complete when:
One Unit is reused by two Classes.
The Classes schedule the same Lesson on different dates.
Editing Master changes shared content.
Scheduling changes do not modify Master content.
Student navigation follows each Class chronology.

## 62. Phase 8: Scope and Sequence

Objective
Build annual planning on top of established Unit data.
Implement two views:
Document.
Timeline.

## 63. Phase 8 Document View

Use normal Block builder.
No separate page system.
Add curriculum planning Blocks as required through presets or existing Blocks.

## 64. Phase 8 Timeline View

Initial timeline should display:
Term 1.
Term 2.
Term 3.
Term 4.
Weeks.
Unit bars.
Duration.
Major milestones.

## 65. Phase 8 Timeline Actions

Support:
Open Unit.
Move Unit.
Adjust duration.
Move between Terms.
Add Unit.
Edit planning dates.
All changes modify planning metadata.
They do not duplicate Units.

## 66. Phase 8 Outcome Mapping

Display structured Outcome references.
Initial mapping may remain simple.
Future visual coverage analysis may follow later.
Do not delay Scope timeline launch for advanced analytics.

## 67. Phase 8 Exit Criteria

Phase 8 is complete when:
Teacher sees the whole Subject year visually.
Unit timing adjusts through timeline interaction.
Unit links open real Units.
Document and Timeline views remain consistent.
No duplicate planning Unit records exist.

## 68. Phase 9: A4 Print

Objective
Turn existing Lesson Blocks into reliable printable resources.
Print is a renderer, not a separate authoring system.

## 69. Phase 9 Print Renderer

Implement:
A4 portrait.
A4 landscape.
Page dimensions.
Margins.
Block print variants.
Page boundaries.
Teacher Print.
Student Print.

## 70. Phase 9 Right Panel

Add A4 mode to Right Context Panel.
Support:
Collapsed.
Compact.
Expanded.
Live page preview.
Page count.
Orientation.
Margin preset.

## 71. Phase 9 Print Metadata

Support:
allow_split.
keep_together.
keep_heading.
start_new_page.
include.
print variant.

## 72. Phase 9 Interactive Translation

Implement print translation for:
Accordion.
Tabs.
Video.
Audio.
Embed.
Flashcards.
HTML App.
Do not attempt to reproduce interactive experiences literally on paper.

## 73. Phase 9 Cross Selection

Selecting a Block in Lesson Canvas highlights it in A4 Preview.
Selecting in Preview selects it in Canvas.
This interaction should be implemented before advanced page break tools.

## 74. Phase 9 Page Break Editing

Add:
Start Next Page.
Keep Together.
Keep With Next.
Allow Split.
These update structured metadata.

## 75. Phase 9 Exit Criteria

Phase 9 is complete when a real Lesson may:
Render well on phone.
Render well on desktop.
Print cleanly to A4.
Require no duplicate worksheet document.

## 76. Major Milestone B

At this stage the Teaching Day Book should already function as a substantial daily teaching system.
Core capabilities now include:
Curriculum hierarchy.
Reusable Units.
Reusable Lessons.
Classes.
Scheduling.
Student pages.
Block builder.
Publishing.
Scope and Sequence.
A4 output.
Before adding AI, use the deterministic product heavily.
This is intentional.
AI should enhance a proven authoring system rather than hide flaws in an unfinished builder.

## 77. Phase 10: Google Drive

Objective
Integrate the preferred media provider after Block media behaviour already works.
This sequencing is important.
First prove the Block.
Then connect the provider.

## 78. Phase 10 Drive Authentication

Implement secure teacher Google Drive access.
Drive credentials must remain separate from public student routes.
The exact authentication method belongs to 08 SECURITY.md.

## 79. Phase 10 File Picker

Teacher workflow:
Add Media.
Choose Drive.
Select file.
Retrieve metadata.
Create Media Reference.
Insert relevant Block.

## 80. Phase 10 File Detection

Deterministically identify:
Image.
PDF.
Google Doc.
Google Slides.
Video.
Audio.
General file.
Map to appropriate Block.
No AI required.

## 81. Phase 10 Permission Checking

Implement access status:
Student Accessible.
Restricted.
Unknown.
Unavailable.
Integrate warnings into Publish flow.

## 82. Phase 10 Image Delivery

Implement responsive image strategy.
Requirements:
Avoid loading original huge images on phones.
Preserve original Drive reference.
Store dimensions.
Use thumbnail or optimised source.
Lazy load where appropriate.

## 83. Phase 10 Exit Criteria

Phase 10 is complete when:
Teacher selects a Drive file.
Correct Block appears.
Student accesses it.
Restricted files trigger teacher warning.
Media failure does not break the Lesson.

## 84. Phase 11: Templates and Reuse

Objective
Make repeated Lesson building substantially faster.
Implement:
Block Templates.
Compositions.
Lesson Templates.
Unit Templates.
Favourites.
Recent templates.

## 85. Phase 11 Composition Priority

Start with the most useful teaching Compositions.
Recommended:
Reading Comprehension.
Vocabulary Study.
Source Analysis.
Compare Texts.
Essay Planning.
Reflection Exit Ticket.
Worked Example and Practice.

## 86. Phase 11 Insert Modes

Support:
Independent copy.
Linked content where appropriate.
Default Composition insertion should usually create an independent copy.

## 87. Phase 11 Linked Blocks

Implement:
Linked indicator.
Edit Source.
Detach.
Reference checks.
Do not silently modify shared content.

## 88. Phase 11 Save as Template

Implement:
Save Block as Template.
Save Section as Composition.
Save Lesson as Template.
Save Unit as Template.
This is important because the template system should grow from real teaching practice.

## 89. Phase 11 Exit Criteria

Phase 11 is complete when common Lesson structures may be inserted and adapted without AI.
This phase is itself a major token saving measure.

## 90. Phase 12: Search and Navigation Acceleration

Objective
Keep the system usable as the archive becomes large.
Implement:
Global Search.
Command K.
Recent objects.
Favourites.
Tag search.
Outcome search.

## 91. Phase 12 Search

Search across:
Lesson titles.
Unit titles.
Block text.
Subjects.
Classes.
Tags.
Outcome codes.
Resource titles.
Templates.
Return hierarchy with results.

## 92. Phase 12 Command K

Support fast actions such as:
Open Lesson.
Open Unit.
Open Class.
Create Lesson.
Search.
Open Student View.
Open A4.
Publish current Lesson.
Keep the command system focused.

## 93. Phase 12 Tag Management

Implement controlled Tags.
Suggest existing Tags before creating a new one.
Support merging duplicate Tags later.

## 94. Phase 12 Exit Criteria

Phase 12 is complete when navigation remains fast with hundreds of Lessons loaded into realistic test data.

## 95. Phase 13: AI Integration

Objective
Add AI only after deterministic workflows are stable.
Follow 06 AI AGENT.md.
Reuse AI chat and history design from the Life Hub project.

## 96. Phase 13A AI Infrastructure

Implement:
Authenticated AI Function.
Anthropic integration.
Central Request Builder.
Central Response Handler.
Usage logging.
Context scope.
Error handling.
Structured output.

## 97. Phase 13B Block AI

Start with Selected Block.
Initial actions:
Rewrite.
Shorten.
Expand.
Adjust difficulty.
Generate questions.
Generate answers.
Add scaffold.
Create extension.

## 98. Phase 13C Proposal Interface

Implement:
AI Proposal.
Accept.
Reject.
Regenerate.
Replace.
Insert.
Undo accepted change.
Target revision validation.
No direct mutation before acceptance.

## 99. Phase 13D Composition AI

Add:
Turn Into Reading Comprehension.
Create Vocabulary Study.
Create Source Analysis.
Other approved Composition population.
AI should fill existing structure.

## 100. Phase 13E Whole Lesson AI

Only after Block AI is reliable, add:
Build Lesson with AI.
Review Lesson Flow.
Generate Learning Intention.
Generate Success Criteria.
Whole Lesson scope remains explicit.

## 101. Phase 13F Broader AI Scope

Later add:
Unit review.
Subject review.
Outcome coverage suggestions.
These should not be part of the first AI milestone.

## 102. Phase 13 AI Cost Testing

Before broad rollout, measure:
Typical Block input size.
Typical output size.
Reading Comprehension cost.
Whole Lesson cost.
Unit review cost.
Repeated usage patterns.
Use actual behaviour to tune context limits.

## 103. Phase 13 Exit Criteria

Phase 13 is complete when:
AI is optional.
Block is default scope.
AI output is structured.
AI output requires acceptance.
Normal editing still works if Anthropic fails.
Student pages require no AI.
Usage is measurable.

## 104. Phase 14: Versioning, Archive and Recovery

Some basic version behaviour exists earlier.
This phase completes the recovery experience.
Implement:
Version History UI.
Preview historical version.
Restore.
Archive.
Trash.
Restore from Trash.
Permanent Delete.
Dependency checks.
Backup Now.

## 105. Phase 14 GitHub Backup

Implement scheduled or deliberate portable content backup.
Do not commit after every edit.
Backup should:
Export structured content.
Exclude secrets.
Preserve IDs.
Preserve relationships.
Record schema versions.

## 106. Phase 14 Export

Implement at minimum:
Lesson export.
Unit export.
Full archive export.
Readable JSON is mandatory.
Additional HTML export may be added later.

## 107. Phase 14 Exit Criteria

Phase 14 is complete when accidental deletion or major editing mistakes are realistically recoverable.
The user should not fear experimenting with Lessons.

## 108. Phase 15: Production Hardening

Objective
Refine the product based on real sustained use.
This phase is not merely visual polish.
It focuses on reliability.

## 109. Phase 15 Performance

Measure:
Teacher initial load.
Lesson opening.
Save latency.
Publish latency.
Student phone load.
Public API response size.
Image loading.
Embed loading.
Search speed.
A4 render speed.
AI request behaviour.
Optimise actual bottlenecks.

## 110. Phase 15 Storage Review

Review real Lesson sizes.
Review Blob read and write volume.
Review version growth.
Review media metadata.
Review backup size.
Only introduce more sophisticated storage techniques where actual data supports the need.

## 111. Phase 15 Accessibility

Perform dedicated accessibility review across:
Keyboard navigation.
Screen reader structure.
Heading hierarchy.
Focus states.
Contrast.
Tables.
Interactive Blocks.
Phone touch targets.
Print readability.

## 112. Phase 15 Failure Testing

Deliberately test:
Netlify Function failure.
Blob read failure.
Blob write failure.
Drive unavailable.
Restricted Drive resource.
Broken Embed.
Anthropic unavailable.
AI timeout.
Malformed AI output.
Version conflict.
Invalid URL.
Unsupported Block.
The application should fail predictably.

## 113. Phase 15 Browser Testing

Test major modern browsers used in likely teaching environments.
At minimum:
Chrome.
Safari.
Edge.
Student phone Safari.
Student phone Chrome.
Do not assume desktop Chrome represents every classroom device.

## 114. Phase 15 Real Classroom Testing

Use the application during actual teaching.
Observe:
How quickly Student Links are accessed.
Whether navigation is obvious.
Whether Lessons load quickly enough.
Whether A4 output removes separate worksheet preparation.
Whether Block insertion is fast.
Whether Teacher Only notes are useful.
Whether AI actually saves time.
Architecture should respond to real use rather than imagined feature demand.

## 115. Features Explicitly Deferred

The following should not delay the initial product.
Student accounts.
Student portal.
Formal assessment tracking.
Markbook.
Reporting.
Parent access.
Automated marking.
Realtime multi teacher collaboration.
Complex permissions.
Full offline mode.
Native mobile application.
Theme marketplace.
Unlimited custom CSS.
Student AI chat.
Sophisticated LMS features.
Timetable integration.
Calendar integrations beyond internal Class scheduling.
Advanced learning analytics.
Complex classroom data collection.
These are outside the initial purpose.

## 116. Features Requiring Evidence Before Building

Some planned capabilities should remain provisional until real use demonstrates value.
Examples:
Concept Map editor.
Advanced Mind Map editor.
Complex Unit Templates.
Class specific Lesson overrides beyond basic support.
Automated Outcome analytics.
Multiple AI models.
AI generated interactive Apps.
Extensive student local state.
Advanced print fitting.
Calendar view for Class schedule.
Build the simple useful version first.

## 117. Cursor Usage Strategy

Cursor should implement narrowly scoped tasks.
Avoid prompts such as:
Build the entire Teaching Day Book from the specifications.
Instead use sequential tasks.
Example:
Implement the Year and Subject schemas from 02 DATA MODEL.md.
Then:
Implement the Unit repository and validation.
Then:
Build the Left Navigation Year and Subject tree.
Each task should have a defined acceptance condition.

## 118. Cursor Context Strategy

Cursor should receive:
Relevant specification file.
Relevant existing source files.
Current task.
Acceptance criteria.
It should not receive the entire project documentation for every minor change.
This mirrors the same small context philosophy used for the product AI.

## 119. Cursor Change Boundaries

For each implementation task, specify:
Files expected to change.
Systems that must remain untouched.
Required tests.
Relevant specification sections.
This reduces unintended architecture changes.

## 120. Cursor Refactoring Rule

Cursor should not perform broad architectural refactors as a side effect of implementing a small feature.
If a refactor appears necessary:
Stop implementation.
Document why.
Compare against specification.
Make the refactor an explicit task.

## 121. Git Workflow

Use GitHub for source control.
Recommended working approach:
One focused change set per feature or fix.
Commit messages describe functional change.
Use branches for significant work.
Keep specifications version controlled alongside code.
Do not mix unrelated large refactors with feature work.

## 122. Commit Quality

A useful commit should leave the project in a coherent state.
Avoid:
Thousands of unrelated generated changes.
Formatting the whole repository during one feature.
Combining schema migration with unrelated visual redesign.
This makes rollback and debugging harder.

## 123. Test Strategy

Testing should use several layers.
Schema tests.
Repository tests.
API tests.
Renderer tests.
Interaction tests.
Public projection tests.
Critical end to end flows.

## 124. Highest Priority End to End Test

The most important early test is:
Create Lesson.
Add Blocks.
Save.
Publish.
Open student URL.
Edit draft.
Verify student still sees old publication.
Republish.
Verify student receives new publication.
If this workflow is unreliable, later features should not proceed.

## 125. Second Priority End to End Test

Reusable content test:
Create Unit.
Create Lesson.
Attach Unit to two Classes.
Schedule Lesson differently.
Publish Lesson.
Open through both Classes.
Verify shared content.
Verify independent chronology.
This confirms the central reusable architecture.

## 126. Third Priority End to End Test

Visibility test:
Create Student Block.
Create Teacher Only Block.
Publish.
Teacher sees both.
Student sees only Student content.
Print Student version excludes teacher content.
This verifies one of the foundational product ideas.

## 127. Fourth Priority End to End Test

A4 test:
Create mixed Lesson.
Text.
Image.
Questions.
Callout.
Preview A4.
Change print settings.
Verify screen Lesson remains unchanged.
This confirms renderer separation.

## 128. Fifth Priority End to End Test

AI isolation test:
Disable Anthropic configuration.
Open existing Lesson.
Edit.
Save.
Publish.
Print.
Open student page.
Everything except AI must continue working.

## 129. Data Seeding

Development should include realistic seed scripts.
Seed:
Years 7 to 12.
Representative Subjects.
Year 11 and Year 12 English Advanced.
Year 11 and Year 12 English Standard.
Sample Classes.
Sample Unit.
Sample Lessons.
Sample Outcomes.
Sample Blocks.
This makes regression testing easier.

## 130. Senior English Structure

Seed data must explicitly test:
Year 11 English Advanced.
Year 11 English Standard.
Year 12 English Advanced.
Year 12 English Standard.
These must remain separate Subjects.
Do not allow senior English architecture to collapse into one generic English object.

## 131. Data Migration Testing

Every schema migration should test against realistic existing Lessons.
Before migration:
Backup.
Run migration against development copy.
Validate references.
Render migrated Lesson.
Compare content.
Only then apply production migration.

## 132. Security Phase Relationship

08 SECURITY.md should be implemented alongside every relevant phase rather than left until the end.
Examples:
Authentication before teacher writes.
Public projection before student publishing.
HTML sandbox before HTML App.
API protection before AI.
Secret management from Phase 0.
Security is continuous.

## 133. Documentation During Build

Technical documentation should be updated alongside implementation.
Important implementation notes include:
Framework decisions.
Storage conventions.
API contracts.
Schema changes.
Migration history.
Environment configuration.
Provider integration.
Do not rely entirely on code comments to explain architecture.

## 134. Avoid Duplicate Documentation

Product intent belongs in the numbered specification files.
Implementation specific details may live in:
Architecture notes.
README.
API documentation.
Migration records.
Do not copy full specifications into multiple places.
Cross reference instead.

## 135. Initial Production Milestone

The first production worthy milestone should include:
Teacher authentication.
Year and Subject structure.
Units.
Lessons.
Basic Classes.
Basic scheduling.
Core Block builder.
Draft saving.
Publishing.
Student Lesson pages.
Student Class Page.
Student Unit Page.
Previous and Next navigation.
Responsive phone rendering.
Basic A4 print.
Version recovery.
Google Drive media.
This provides the complete core day book.

## 136. AI Is Not Required for Initial Production

AI should not determine whether the core product is ready for daily use.
A production milestone without AI should already be useful.
This ensures:
The architecture is fundamentally sound.
Costs remain controllable.
Teacher workflow does not depend on provider availability.
AI later acts as acceleration rather than infrastructure.

## 137. Recommended First Coding Sequence

The first coding sequence should be:
Repository and framework.
Design tokens.
Environment configuration.
Core schemas.
Blob repository layer.
Lesson save and load.
Teacher application shell.
Year and Subject navigation.
Unit and Lesson navigation.
Block Registry.
Rich Text Block.
Heading Block.
Callout Block.
Section.
Basic Lesson Builder.
Autosave.
Teacher Only visibility.
Student renderer.
Publish flow.
Public Lesson route.
This sequence produces a working vertical slice quickly.

## 138. First Real Teaching Test

After the first twenty implementation steps, create one actual real Lesson.
Do not use only dummy content.
The Lesson should contain:
Real reading material.
Headings.
Teacher note.
Learning intention.
Questions.
Image.
Student instructions.
Publish it.
Open on phone.
Print it.
Problems discovered here should be fixed before adding large feature sets.

## 139. Second Coding Sequence

After the core Lesson flow works:
Class object.
Scheduled Lesson.
Class chronology.
Unit page.
Class page.
Student navigation.
Scope and Sequence.
A4 refinement.
Drive integration.
Templates.
Search.
AI.

## 140. Phase Gates

Do not progress simply because the previous feature compiles.
Each major phase has a usage gate.
Ask:
Does this workflow work with real teaching content?
Is the data model still clean?
Is the interface fast enough?
Did we introduce unnecessary complexity?
Are specifications still accurate?
Only then continue.

## 141. Technical Debt Rule

Technical debt should be recorded explicitly.
Use a project technical debt file or issue system.
Each item should explain:
Problem.
Reason debt was accepted.
Affected system.
Likely future resolution.
Do not leave unexplained shortcuts buried in code.

## 142. Performance Budgets

Define budgets during implementation.
Examples should include:
Public Lesson payload.
Initial student JavaScript.
Image load behaviour.
Number of API calls.
Teacher Lesson load.
Save request size.
Exact targets should be determined after the selected framework is established.
The principle is that student pages remain lightweight.

## 143. Bundle Separation

Teacher authoring code and student runtime code should be separated where practical.
Student pages should not download:
AI Panel.
Block drag controls.
Inspector.
Version history.
Teacher navigation.
Drive picker.
Publishing controls.
This is a major student performance requirement.

## 144. Lazy Feature Loading

Large teacher features may load when required.
Examples:
AI Panel.
A4 advanced preview.
Drive picker.
Mind Map editor.
Complex Chart editor.
This keeps the core Lesson editor responsive.

## 145. Observability

Add enough logging to diagnose real failures.
Track:
Save failures.
Publish failures.
API errors.
Render failures.
Drive failures.
AI failures.
Unsupported Blocks.
Do not build an enterprise observability platform.
Basic actionable logging is sufficient.

## 146. Cost Monitoring

Infrastructure choices should be reviewed using actual usage.
Track approximately:
Blob reads.
Blob writes.
Function calls.
Bandwidth.
AI requests.
AI token usage.
Do not optimise based on imagined extreme usage before measuring.

## 147. Netlify Cost Protection

Architecture already reduces cost through:
No rebuild on Lesson edit.
No rebuild on publish.
Dynamic stored content.
Batched saves.
Lazy media.
Compact public payloads.
The implementation should preserve these properties.
Do not introduce a static page generation workflow later for convenience if it undermines them.

## 148. AI Cost Protection

Architecture reduces AI cost through:
No AI during ordinary editing.
Block scope by default.
Composition reuse.
Template reuse.
Structured context.
Explicit broad scope.
No full archive prompts.
No automatic background analysis.
These rules should remain enforced during implementation.

## 149. Definition of Core Completion

The core Teaching Day Book is complete when the teacher may perform the full normal workflow:
Open today's Class.
Open Lesson.
Edit Lesson.
Add or rearrange Blocks.
Use Teacher Only notes.
Save automatically.
Preview student page.
Preview A4.
Publish.
Copy student URL.
Students open Lesson without login.
Students move between Class, Unit and Lessons.
Teacher later returns to edit and reuse the Unit.
The system should accomplish this without requiring AI.

## 150. Definition of Product Success

The architecture is successful when continued use increases the value of the system rather than increasing maintenance burden.
After hundreds of Lessons:
Navigation should remain fast.
Search should remain useful.
Reusable Units should remain clear.
Templates should reduce repeated work.
Student URLs should remain stable.
Old Classes should archive cleanly.
Content should remain portable.
AI should use targeted context.
Netlify usage should remain proportionate.
The system should feel more useful after several years of teaching, not more fragile.

## 151. Implementation Acceptance Criteria

Implementation planning is being followed correctly when:
The project progresses through usable vertical slices.
Core architecture is established before advanced features.
Content editing remains independent from application deployment.
The Block Registry exists before large Block expansion.
Student publishing works before AI integration.
Phone student rendering is tested early.
Real teaching content is used during development.
Unit reuse is tested across multiple Classes.
Scheduling remains separate from Lesson content.
Scope and Sequence references real Units.
A4 uses the same Block content.
Google Drive integration occurs through Media References.
Templates work without AI.
AI is added only after deterministic workflows are stable.
AI follows the Life Hub precedent.
Cursor receives focused implementation tasks.
Broad refactors are explicit rather than accidental.
Schema migrations are backed up and tested.
Student code remains separated from unnecessary teacher features.
Costs are measured from actual use.
Production teaching content remains portable.
No phase introduces student accounts or LMS scope without a new product decision.

## 152. Locked Implementation Decisions

The following decisions are locked for the initial build.
Build the product in phased vertical slices.
Do not attempt the entire product in one Cursor generation.
Establish IDs, schemas, Block Registry, storage and renderers early.
Use realistic teaching seed data.
Year to Subject structure is implemented before advanced features.
Year 11 and Year 12 English Advanced and Standard remain separate Subjects.
Lesson editing and publishing must work before large Block expansion.
Student Lesson publishing is the first major product milestone.
The first Block implementation uses a deliberately small subset.
Expand Blocks only after the core Lesson workflow works.
Class and Unit pages follow Lesson publishing.
Scheduling follows reusable content.
Scope and Sequence builds on actual Unit data.
A4 is implemented as another renderer.
Google Drive is integrated after basic Media Blocks work.
Templates and Compositions are implemented before AI where practical.
Search is added before the archive becomes large.
AI integration occurs after the deterministic product is already useful.
The Life Hub AI design is reused.
Versioning and recovery are completed before long term production reliance.
Security requirements apply throughout every phase.
Teacher and student application bundles should remain separated where practical.
Student pages should remain lightweight.
Full offline editing is excluded.
Realtime collaboration is excluded.
Student accounts are excluded.
Assessment tracking and reporting are excluded.
AI is not required for the product to operate.
Netlify builds occur for application changes, not teaching content changes.
Real classroom use should determine later optimisation and feature expansion.
