# User Experience

## 1. Purpose

This document defines the user experience for the Teaching Day Book.
The interface must support constant use throughout a school day.
The product should feel faster than opening separate documents, folders, websites and AI tools.
The teacher experience must prioritise:
Rapid navigation.
Fast lesson editing.
Clear curriculum structure.
Minimal repeated data entry.
Immediate student preview.
Safe publishing.
Efficient reuse.
Low AI and infrastructure usage.
Clear save state.
Consistent design.
The student experience must prioritise:
Immediate access.
Clear lesson sequence.
Strong readability.
Simple navigation.
Good phone performance.
No login.
Minimal interface clutter.
Reliable access to resources.
The same underlying content powers teacher, student and print experiences.

## 2. Primary Experiences

The product contains four major experiences.
Teacher Workspace
Student Class Page
Student Unit Page
Student Lesson Page
A4 Print Preview is a specialised teacher view rather than a separate content system.

## 3. Teacher Workspace Structure

The desktop teacher workspace uses four primary regions.
Left Navigation Rail
Top Context Bar
Main Canvas
Right Context Panel
Conceptually:

┌──────────┬──────────────────────────────────────┬───────────────┐
│          │            Context Bar               │               │
│          ├──────────────────────────────────────┤               │
│          │                                      │               │
│   Left   │                                      │     Right     │
│   Rail   │             Main Canvas              │     Panel     │
│          │                                      │               │
│          │                                      │               │
│          │                                      │               │
└──────────┴──────────────────────────────────────┴───────────────┘
The Main Canvas remains the dominant visual area.
Navigation and controls should never overwhelm the content.

## 4. Left Navigation Rail

The left rail is the main organisational navigation system.
It reflects the Year to Subject structure.
Primary navigation should include:
Home
Years
Classes
Templates
Search
Trash
Settings
Within Years, the navigation expands hierarchically.
Example:
Year 12
English Advanced
Scope and Sequence
Term 1
Term 2
Artist of the Floating World
Lesson 01
Lesson 02
Lesson 03
Term 3
Term 4

English Standard
The hierarchy must support collapsing branches.
A teacher working within one Unit should not need to view hundreds of unrelated Lessons.

## 5. Navigation Persistence

The left rail should remember expanded sections locally.
If the teacher has:
Year 12
English Advanced
Term 2
Artist of the Floating World
expanded, reopening the workspace should preserve this navigation state where practical.
This is a convenience state rather than core teaching data.

## 6. Navigation Density

The left rail should support two display modes.
Expanded
Compact
Expanded shows icons and labels.
Compact reduces the rail width and relies more heavily on icons and tooltips.
The teacher should be able to collapse the rail when maximum Lesson workspace is required.

## 7. Current Location

The active Year, Subject, Unit and Lesson must remain visually clear.
The active Lesson receives a strong selected state.
Parent sections remain visibly expanded.
The teacher should never need to infer where a Lesson sits within the hierarchy.

## 8. Teacher Home

The teacher Home view should focus on immediate teaching work rather than functioning as a general dashboard.
Suggested content:
Today's Classes
Today's Lessons
Recently Edited
Drafts with Unpublished Changes
Quick Create
Recent Units
Search
The Home page should remain lightweight.
Avoid filling it with metrics which do not support daily teaching.

## 9. Today's Teaching

Today's Teaching should derive from Scheduled Lesson records.
Each item should show:
Class
Subject
Lesson
Unit
Scheduled date
Publication state
Direct actions
Suggested direct actions:
Open Lesson
Student View
Copy Student URL
Publish
The system should provide rapid access to today's teaching without requiring navigation through the curriculum hierarchy.

## 10. Top Context Bar

The Context Bar changes according to the current object.
For a Lesson it should display:
Lesson title
Class context where relevant
Unit
Scheduled date where relevant
Save state
Student preview
Share
Publish
More actions
The bar should remain visually restrained.

## 11. Editable Lesson Title

The Lesson title should support direct inline editing.
Changing the title updates the draft immediately.
Slug changes should be handled by the system.
The teacher should not normally interact with internal IDs or URL management.

## 12. Save State

Save state must always be visible but unobtrusive.
Possible states:
Saved
Saving
Unpublished Changes
Published
Save Failed
The interface should distinguish between:
Saved to live teacher storage
Published to students
These are different concepts.
A Lesson may therefore show:
Saved. Unpublished Changes.

## 13. Autosave

Typing and Block editing update local application state immediately.
Autosave should batch server updates.
The interface should avoid saving after every keystroke.
A save should occur after an appropriate pause in editing.
Manual Save should remain available.
Navigation away from a Lesson with an unsaved local state should trigger an immediate save attempt.

## 14. Publish Action

Publish must be an explicit teacher action.
Publishing does not occur automatically after saving.
Selecting Publish should perform validation.
Checks may include:
Missing media
Restricted Drive files
Missing alt text warnings
Broken links
Invalid Blocks
Missing Lesson title
Student visibility issues
After validation, the teacher confirms publication.
The process should remain fast.
Routine publication should not require several unnecessary confirmation screens.

## 15. Publish Result

Successful publication should clearly confirm:
Published
Publication time
Student URL
Actions:
Copy Link
Open Student View
The success state should then return quickly to normal editing.

## 16. Unpublished Changes

After editing a previously published Lesson, the interface should clearly show Unpublished Changes.
Students continue seeing the previous published version.
The teacher may continue editing for as long as required.
Publishing replaces the previous student version only when deliberately requested.

## 17. Main Lesson Canvas

The Main Canvas contains the Block builder.
It should resemble the final student page closely enough for intuitive editing without becoming a strict WYSIWYG editor.
The teacher must see:
Actual content
Block boundaries when relevant
Teacher only content
Selection state
Insertion points
The teacher should not see persistent technical JSON or HTML.

## 18. Teacher and Student Content

Student visible content should look close to its student appearance.
Teacher only content receives a clear but restrained visual treatment.
A teacher only Block should be recognisable instantly without dominating the page.
Suggested treatment:
Soft tinted surface
Teacher icon
Teacher label
The student renderer excludes the Block entirely.

## 19. Block Hover Behaviour

Hovering over a Block on desktop may reveal compact controls.
Possible controls:
Drag
Add Below
More
Controls should remain minimal.
Full settings belong in the Right Context Panel.

## 20. Block Selection

Clicking a Block selects it.
Selected state should use the Glass design language.
The selected Block should receive:
Blue tinted glass boundary
Clear focus
Contextual inspector
Optional small Block label
Selection should not materially shift surrounding content.

## 21. Block Insertion

The teacher should be able to insert Blocks through several paths.
Add button between Blocks
Slash command within supported editing contexts
Keyboard shortcut
Insert menu
AI generation
Composition insertion
Template insertion
The primary insertion interaction should remain simple.
Selecting an insertion point opens a searchable menu.

## 22. Insert Menu

The Insert menu groups options by category.
Suggested categories:
Text
Media
Activity
Visualisation
Layout
Teaching Presets
Templates
Recent
Favourites
Search should remain available from the top of the menu.
The teacher should be able to type:
PDF
Reading comprehension
Learning intention
Slides
Map
and immediately reach the appropriate action.

## 23. Drag and Drop

Blocks should reorder through drag and drop.
Clear insertion indicators should show where a Block will land.
Section and Column containers should show valid drop areas.
Invalid nesting should be prevented rather than repaired after the drop.
Moving Blocks is a normal local operation and must not invoke AI.

## 24. Keyboard Movement

Drag and drop must not be the only movement mechanism.
The teacher should also be able to:
Move Up
Move Down
Move to Section
Use keyboard accessible movement controls
This supports accessibility and precise editing.

## 25. Right Context Panel

The right panel provides contextual tools without crowding the Lesson canvas.
The panel should support these major modes:
Inspector
AI
A4 Print
Page Settings
Only one primary panel mode needs to occupy the space at a time.

## 26. Right Panel Behaviour

The panel supports:
Collapsed
Compact
Expanded
Collapsed leaves a narrow control strip.
Compact shows standard controls.
Expanded supports larger experiences such as A4 preview or AI conversation.
The chosen width should persist during the current working session.

## 27. Inspector Mode

When a Block is selected, Inspector shows relevant settings.
Common settings:
Variant
Visibility
Layout
Print
Link status
Duplicate
Save as Template
Delete
Only settings supported by the selected Block should appear.
An Image should not show Question Set controls.
A Question Set should not show map provider controls.
The Block Registry determines Inspector options.

## 28. Progressive Settings

Common controls appear first.
Less frequently used controls sit under Advanced.
The teacher should not encounter dozens of options for every Block.
Good defaults are essential.

## 29. AI Panel

The AI Panel follows the interaction and history precedent established in the Life Hub website or project.
Do not independently redesign the underlying AI chat and history model unless Teaching Day Book requirements require an extension.
The Teaching Day Book AI panel must understand the current context.
Possible contexts:
Selected Block
Selected Section
Current Lesson
Current Unit
Current Subject
The default context is the smallest relevant scope.

## 30. AI Context Indicator

The AI panel should clearly display current scope.
Examples:
Working with: Selected Reading Block
Working with: Section, Comprehension
Working with: Whole Lesson
This protects against accidental large context requests.
Broader context should require deliberate selection.

## 31. AI Input

The teacher should be able to:
Type instructions
Paste large text
Paste source material
Reference selected Blocks
Reference a Composition
Reference an uploaded resource where supported
Typical request:
Turn this into a reading comprehension task.
The AI should then create or propose structured Blocks.

## 32. AI Proposal Experience

AI changes should appear as proposals.
Possible actions:
Accept
Reject
Regenerate
Insert
Replace
Compare
The original content should remain recoverable until the teacher accepts the proposal.
The teacher should never wonder whether AI silently changed existing teaching content.

## 33. AI Activity Indicator

While generation occurs, the affected area should show a calm loading state.
Avoid full page blocking.
The teacher should still be able to inspect other parts of the Lesson where technically safe.
The interface should clearly identify which Block or Section the AI is modifying.

## 34. AI History

AI chat and history behaviour should copy the established Life Hub precedent.
The permanent teaching content remains more important than retaining every historical prompt.
The interface should not force large historical conversations back into the context of every future AI request.

## 35. A4 Print Panel

A4 Print is a dedicated right panel mode.
It should display a live scaled representation of the printable Lesson.
Controls should include:
Portrait
Landscape
Margins
Teacher Print
Student Print
Page count
Fit target
Print
Export PDF where supported
Advanced print settings

## 36. A4 Panel Sizes

Collapsed:
Print icon
Current page count
Compact:
Scaled page preview
Basic controls
Expanded:
Larger page preview
Pagination controls
Page break editing
Full print settings

## 37. Block Selection Across Views

Selecting a Block in the Main Canvas should identify the corresponding Block in A4 Preview.
Selecting a Block in A4 Preview should select the corresponding Block in the Main Canvas.
This relationship is important.
The teacher should not need to identify the same content manually across views.

## 38. A4 Page Boundaries

The preview must show real A4 page boundaries.
The teacher should immediately see:
Where a Block starts
Where a Block splits
What moves to the next page
How many pages the Lesson requires
Page boundaries should update as content changes.

## 39. Print Page Break Controls

The A4 preview should provide direct page break controls.
Possible actions:
Start this Block on next page
Keep this Block together
Allow Block split
Keep with next
These actions change structured print metadata.
They do not insert arbitrary HTML.

## 40. Desktop Student Preview

Student Preview should be available directly from the Lesson Context Bar.
Preview modes:
Desktop
Phone
Print
The Desktop and Phone previews show the student renderer rather than the teacher builder.
Teacher only Blocks disappear.
Editing controls disappear.

## 41. Phone Preview

Phone preview is important because students are expected to access Lesson URLs from phones.
Phone preview should show:
Actual mobile width
Stacked Columns
Compact navigation
Responsive text
Media sizing
Touch controls
The teacher should not need a physical phone to detect basic layout problems.

## 42. Student Class Page

The Class page acts as the main student entry point.
No login is required.
The page should feel simpler than the teacher workspace.
Core structure:
Class header
Current Unit
Current Lesson
Recent Lessons
Unit list
Teacher authored content
Important resources

## 43. Class Page Header

The Class page header should include:
Class display name
Subject
Academic year where useful
Current Unit
Navigation
The design should remain compact on phones.

## 44. Current Lesson

Current Lesson should receive strong prominence.
Suggested content:
Lesson title
Date
Unit
Open Lesson
The teacher explicitly controls the current Scheduled Lesson, with schedule based suggestions where helpful.

## 45. Recent Lessons

Recent Lessons derive automatically from the Class schedule.
They should display in chronological order.
Suggested information:
Lesson title
Date
Unit
The teacher does not maintain this list manually.

## 46. Future Lessons

Future Lessons should default to hidden unless published and intentionally exposed.
The system should not accidentally reveal unfinished Lesson titles or teaching plans.
A future option may allow published upcoming Lessons to appear.

## 47. Class Page Editable Regions

The Class page should contain editable Block regions around the generated sections.
Possible teacher authored content:
Welcome message
Class information
Announcements
Reference files
Useful websites
Revision resources
Recurring links
Images
Extension opportunities
Generated sections should remain protected from manual accidental deletion.
The teacher may choose whether supported generated sections are visible.

## 48. Student Unit Page

The Unit page provides a coherent home for a Unit.
Core automatic content:
Unit title
Unit overview metadata
Lesson sequence
Current Lesson where Class context exists
Resources
Navigation
Editable Blocks sit around these generated sections.

## 49. Unit Context

A reusable Unit may be viewed without a Class context or through a Class.
When opened through a Class:
Current Lesson
Previous and Next Lesson
Class Page
scheduled dates
may be displayed.
When opened independently:
The Unit uses generic sequence information without Class specific chronology.

## 50. Unit Lesson Sequence

The Lesson sequence derives from the Unit object.
Published Lessons should be clickable.
Unpublished Lessons should not be exposed publicly by default.
Teacher view may show all Lessons with publication states.

## 51. Student Lesson Page

The Lesson page is the central student experience.
Core structure:
Compact navigation
Lesson header
Lesson content
Previous and Next navigation
Optional footer resources
The Lesson page must favour reading and activity completion over interface features.

## 52. Lesson Header

The student Lesson header may contain:
Lesson title
Unit title
Class
Date
Lesson sequence number where useful
Optional learning intention
Navigation
Do not overcrowd the header with metadata.

## 53. Student Breadcrumb

Desktop student view should support a clickable breadcrumb.
Example:
Year 12
English Advanced
Artist of the Floating World
Memory, Identity and Ono
The relevant levels are clickable.
On smaller screens, the breadcrumb should simplify rather than wrap across several lines.

## 54. Persistent Student Navigation

Student Lesson pages should provide access to:
Class Page
Unit Page
Previous Lesson
Next Lesson
Previous and Next should appear near both the top and bottom where appropriate.
The controls should derive from Class Scheduled Lesson order when Class context exists.

## 55. Mobile Student Navigation

Phone navigation should remain compact.
Recommended visible actions:
Back to Unit
Previous
Next
Class Page may sit inside a compact menu.
The Lesson title remains the primary visual focus.

## 56. Direct Lesson URLs

Students may arrive directly at a Lesson URL without visiting the Class page first.
The Lesson must therefore contain enough navigation context to orient the student immediately.
No essential navigation should depend on browser history.

## 57. Student Page Performance

Student pages must prioritise fast first render.
Load first:
Navigation
Headings
Text
Essential images
Load later:
Videos
Document viewers
Maps
Websites
Interactive HTML Apps
Large external embeds
Lazy loading is required for heavy content.

## 58. Embed Placeholder

Heavy Embeds should initially display a lightweight preview card.
Possible content:
Title
Thumbnail
Provider
Open or Load action
When the student activates or scrolls sufficiently close, the full Embed loads.
This reduces unnecessary bandwidth.

## 59. Failed Resources

A broken resource must not break the Lesson.
Student fallback should provide:
Resource title
Unavailable message
Open externally where possible
Teacher view should provide more detailed information.

## 60. Student Interactive State

Student interactive state remains local to the browser.
Possible persistent states:
Flashcards
Self Check
Revealed answers
Cloze progress
Accordion state where useful
The student should be able to reset local activity state.
No account or student identity is required.

## 61. Student View Simplicity

The student interface should not expose:
Teacher tools
Edit controls
Publication states
Internal IDs
AI controls
Teacher notes
Storage provider details
Block type names
Complex curriculum metadata unless deliberately included
The student page is a teaching resource, not an administration interface.

## 62. Scope and Sequence Teacher Experience

The Scope and Sequence requires two major views.
Document
Timeline
A clear view switch should sit near the page title.
Both views edit the same underlying Scope and Sequence data.

## 63. Scope Document View

Document view uses the normal Block builder.
Typical content:
Annual goals
Curriculum priorities
Outcome mapping
Assessment information
Term notes
Resources
Planning commentary
The teacher may insert regular Blocks.

## 64. Scope Timeline View

Timeline view provides an annual visual representation.
Primary horizontal organisation:
School year
Term 1
Term 2
Term 3
Term 4
Units appear as timeline items spanning their planned duration.
The teacher should be able to see the entire year at a glance.

## 65. Timeline Interaction

Timeline should support:
Drag Unit timing
Adjust Unit duration
Open Unit
Add Unit
Move Unit between Terms
View milestone
View outcome coverage where later implemented
Changing the timeline modifies planning metadata rather than duplicating Unit content.

## 66. Timeline Scale

The first implementation should prioritise useful school planning rather than complex project management.
A practical scale might show:
Terms
Weeks within Terms
Unit duration
Exact daily scheduling belongs to Class schedules, not the Scope timeline.

## 67. Class Schedule Experience

Each Class needs a chronological schedule view.
The schedule connects reusable Lessons with teaching dates.
Suggested presentations:
List
Calendar
Term sequence
The first implementation only needs one strong primary schedule view if scope must remain controlled.
A chronological list grouped by date or week is a sensible starting point.

## 68. Scheduling a Lesson

The teacher should be able to:
Choose Lesson
Choose date
Set optional duration
Place it in Class sequence
The system creates a Scheduled Lesson record.
If working inside an active Unit, Unit and Class context should already be populated.

## 69. Scheduling From Unit

A fast workflow should support scheduling an entire Unit Lesson sequence.
Example:
Add Unit to Class
Select starting period or date
Create Scheduled Lesson entries
The teacher then adjusts individual dates around school interruptions.
This avoids scheduling every Lesson from scratch.

## 70. Schedule Changes

Changing a Lesson date modifies the Scheduled Lesson only.
It must not modify:
Master Lesson
Unit sequence
Other Classes
Published content
This distinction should remain invisible to the teacher during ordinary use unless relevant.

## 71. Delivered Lessons

The teacher should be able to mark a Scheduled Lesson:
Delivered
Skipped
Rescheduled
This is lightweight planning state.
It is not student assessment tracking.

## 72. Class Specific Customisation

When editing a reusable Lesson within Class context, an obvious indicator should show:
Shared Lesson
If the teacher attempts a structural modification in a Class specific context, the interface should provide:
Edit Master
Customise for Class
Given the expected rarity of Class specific overrides, this interaction should not clutter normal editing.

## 73. Search

Global search should be accessible from the left rail and keyboard shortcut.
Search should work across:
Lessons
Units
Classes
Subjects
Scope and Sequence
Block text
Tags
Outcomes
Resources
Templates

## 74. Search Results

Results should show context.
Example:
Memory, Identity and Ono
Lesson
Year 12 → English Advanced → Artist of the Floating World
Relevant matching text may appear beneath.
Search should favour fast navigation rather than becoming a separate content management application.

## 75. Quick Switcher

A keyboard driven Quick Switcher should be considered early.
Example shortcut:
Command K
Possible searches:
Lesson title
Class code
Unit
Subject
Template
This would significantly improve constant daily use.
It should remain a deterministic search feature with zero AI requirement.

## 76. Command Menu

The Quick Switcher may also support common actions.
Examples:
New Lesson
New Unit
Open Today
Open Class
Insert Block
Open Student View
Open Print Preview
Search
Publish Current Lesson
This should remain focused rather than becoming a huge command system.

## 77. New Lesson Workflow

Creating a Lesson should require minimal information.
Required:
Title
Unit
Optional:
Template
Suggested duration
Outcome references
The system generates:
ID
Slug
Sequence position
Draft
Initial Blocks
A teacher should be able to create a blank Lesson in seconds.

## 78. Create With AI

New Lesson may also offer:
Blank
From Template
From Composition
Build with AI
Build with AI should begin with a narrow request.
Examples:
Paste source material
Describe teaching purpose
Select Year and Subject context
The AI then returns structured Blocks for preview.

## 79. Duplicate Lesson

Duplicate Lesson creates a new independent Lesson.
The interface should ask for:
New title
Destination Unit
Optional inclusion of teacher notes
Media references may remain linked because they refer to external files.
Block IDs must be regenerated.

## 80. New Unit Workflow

Creating a Unit should require:
Title
Year
Subject
Primary Term
Optional Template
The system creates an empty or templated Unit page and Lesson sequence.
The teacher may then add Lessons manually or through AI.

## 81. Reusing a Unit

Adding an existing Unit to another Class should not duplicate the Unit.
The workflow should be:
Add Existing Unit
Select Unit
Choose scheduling options
Confirm
The Class then references the reusable Unit.

## 82. Template Library Experience

Templates should have a dedicated library.
Categories:
Block Presets
Compositions
Lesson Templates
Unit Templates
The library should support:
Search
Favourite
Duplicate
Edit
Archive
Preview

## 83. Saving as Template

From selected content, the teacher should be able to choose:
Save Block as Template
Save Section as Composition
Save Lesson as Template
Save Unit as Template
The system should strip context specific IDs where necessary.

## 84. Template Flexibility

Templates will develop through real use.
The UX should not assume the initial template categories are permanent.
The interface should support adding and refining templates later without redesigning the builder.

## 85. Curriculum Outcomes Experience

Outcome selection should use search and filtering rather than manual code entry.
The teacher should be able to search by:
Official code
Keyword
Subject
Outcome text
Selected Outcomes appear as references.
The official wording stays centrally stored.

## 86. Outcome Display

Unit and Lesson editors may show selected Outcome chips.
The full wording should appear on hover, click, or Inspector.
The interface should avoid consuming large amounts of Lesson canvas space with curriculum metadata.

## 87. Media Selection

When adding media, Google Drive is the preferred first provider.
The workflow should feel like:
Add Media
Choose Drive
Select file
System identifies type
Appropriate Block is inserted
The teacher should not need to manually configure embed code.

## 88. Media Permission Check

When Drive content is intended for students, the interface should check accessibility.
Possible states:
Student Accessible
Restricted
Unknown
Unavailable
Restricted resources should generate a visible warning.
Publishing should ask the teacher to resolve or explicitly acknowledge the issue.

## 89. Media Replacement

Replacing an Image or file should preserve Block position and presentation settings.
Example:
Replace Image
should not require deleting the Block and recreating layout settings.

## 90. Undo and Redo

The teacher builder requires reliable Undo and Redo.
Undo should cover normal editing operations such as:
Text change
Block move
Block deletion
Block insertion
Variant change
Visibility change
Accepted AI replacement where practical
Undo should operate independently from long term version history.

## 91. Version History Experience

Lesson version history should sit under More or History rather than occupying permanent screen space.
The history should show meaningful checkpoints.
Examples:
Published
Saved
AI change accepted
Restored
The teacher should be able to preview a previous version before restoring it.

## 92. Restore Version

Restore should create a new current draft from the selected old version.
It should not erase later historical records.
Restoring therefore becomes another recorded version event.

## 93. Archive

Archive should be available for:
Units
Lessons
Classes
Templates
Other reusable objects
Archived content disappears from active navigation but remains searchable through archive filters.

## 94. Trash

Delete sends content to Trash.
Trash should support:
Restore
View context
Permanent Delete
Permanent Delete requires a more deliberate action.
Items with active references require a warning.

## 95. Empty States

Empty screens should explain the next useful action.
Example empty Unit:
No lessons yet.
Primary actions:
Create Lesson
Use Lesson Template
Build with AI
Add Existing Lesson where supported
Avoid generic empty cards without an obvious next action.

## 96. Error States

Errors should be specific and actionable.
Poor:
Something went wrong.
Preferred:
Lesson saved locally, but server save failed.
Actions:
Retry Save
Continue Editing
Error states should preserve work wherever possible.

## 97. Network Failure

Offline support is not an initial product requirement.
Short network interruptions still require graceful behaviour.
If a save request fails:
Retain local editing state
Show Save Failed
Permit Retry
Do not discard the Lesson
The system does not require a full offline synchronisation architecture.

## 98. Confirmation Philosophy

Avoid confirmation dialogs for easily reversible actions.
Examples which usually do not need confirmation:
Move Block
Change variant
Duplicate Block
Add Block
Examples which deserve confirmation:
Publish with warnings
Trash a shared source
Permanent Delete
Detach linked content where consequences are unclear
Restore an old Lesson version over the current draft

## 99. Design Consistency

The first release should use one consistent theme.
Teachers should not choose arbitrary fonts, colours or page themes per Lesson.
Variation comes through:
Block semantics
Variants
Layout
Approved presets
The design system may expand later.
Consistency takes priority.

## 100. Teacher Glass Treatment

Teacher interface surfaces should use the Glass system where appropriate.
Good uses:
Navigation
Inspector
AI Panel
A4 panel
Floating controls
Selected Blocks
Menus
Search
Modal surfaces
Dense Lesson text should remain highly legible and more opaque.

## 101. Student Visual Treatment

Student pages use the same design identity in a quieter form.
Primary content uses:
Warm White surfaces
Strong readable typography
Restrained borders
Minimal shadows
Limited translucent effects
Glass may remain in:
Header
Navigation
Callouts
Media controls
Interactive components

## 102. Print Visual Treatment

A4 output removes most interface styling.
Print prioritises:
Black or dark readable text
Controlled pale fills
Clear headings
Clean borders
Reliable spacing
Minimal ink usage
Navigation buttons do not print.
Interactive content receives a printable representation.

## 103. Responsive Teacher Workspace

The teacher workspace is primarily designed for desktop use.
Tablet use should remain functional.
Phone teacher editing is not a primary first release requirement.
Student phone use is a primary requirement.
This distinction should influence development priorities.

## 104. Responsive Right Panel

On narrower teacher screens, the right panel should become an overlay or drawer rather than permanently reducing the Lesson canvas to an unusable width.
A4 preview may use a full screen mode on smaller devices.

## 105. Page Width

The student desktop Lesson page should use a controlled maximum content width.
Long text should not stretch across an entire large monitor.
Wide content such as charts, images and tables may use larger widths when required.
The Block renderer determines appropriate width.

## 106. Reading Blocks

Long reading content deserves a reading optimised width.
The builder should avoid placing dense passages beside unrelated content simply because grid space exists.
AI layout choices should respect readability.

## 107. Student Page Navigation During Scroll

A small sticky navigation option may remain available on long Lessons.
It should provide quick access to:
Unit
Previous
Next
The sticky element must stay compact and should not cover content.

## 108. Long Lesson Navigation

Lessons with several Heading Blocks may automatically offer a contents menu.
This should derive from heading structure.
The teacher should not maintain the contents list manually.
On mobile, it may appear as a collapsible Lesson Contents control.

## 109. Copy Student Link

Copy Student Link should be a prominent routine action.
The teacher should not need to open publication settings to retrieve the Lesson URL.
If unpublished changes exist, copying the URL still copies the current published Lesson URL and indicates:
Students will see the last published version.

## 110. Share Behaviour

Share should focus on student access.
Possible actions:
Copy Lesson Link
Open Student View
Copy Unit Link
Copy Class Link
QR code generation may be added because it has obvious classroom value.
A QR code should be generated locally where practical and should not require AI.

## 111. QR Codes

A Lesson, Unit or Class URL should support quick QR display.
This allows projection in class.
QR generation is deterministic.
No new Block or stored image is required unless the teacher deliberately inserts the QR into Lesson content.

## 112. Class Codes

Class codes should be visible in teacher navigation where they help distinguish groups.
Student pages may use a friendlier display name.
Example teacher label:
12ENGADV1
Student display:
Year 12 English Advanced
Both derive from the Class object.

## 113. Date Display

Scheduled Lessons should display dates according to Australian conventions.
Example:
12 August 2026
Compact views may use:
12 Aug
Internal data remains machine readable.

## 114. Sequence Versus Date

The interface should make the distinction intuitive.
Inside the Unit:
Lesson sequence is primary.
Inside the Class:
Scheduled date is primary.
The teacher should not need to understand the underlying data architecture to use either view.

## 115. Unscheduled Lessons

A reusable Unit may contain Lessons not yet scheduled for a Class.
Class planning should clearly distinguish:
Scheduled
Unscheduled
Delivered
This makes adding a Unit to a Class manageable.

## 116. Bulk Scheduling

Bulk scheduling should be supported after the core schedule works reliably.
Useful workflow:
Select several Lessons
Choose starting date
Apply initial sequence
Review resulting schedule
The teacher then adjusts dates.
Do not overbuild timetable intelligence in the first version.

## 117. Publishing Class and Unit Pages

Class and Unit pages also have draft and published content where manually authored Blocks exist.
Generated navigation sections always derive from current valid published relationships.
The technical implementation should ensure unpublished Lesson content does not leak through generated lists.

## 118. Current Unit

Class current Unit should be explicitly settable.
The system may suggest it based on current Scheduled Lessons.
The teacher retains control.
This prevents incorrect automation when school schedules change.

## 119. Recent Objects

The teacher workspace should remember recent working objects.
Examples:
Recent Lesson
Recent Unit
Recent Class
This should remain a convenience layer.
It should not require AI.

## 120. Favourites

Frequently accessed Classes, Units and Templates may be favourited.
Favourites should appear in convenient navigation areas.
This becomes useful as the archive grows over several years.

## 121. Academic Year Switching

The interface should clearly distinguish academic years.
Archived Classes from 2026 should not clutter 2027 daily navigation.
A global academic year filter or selector should be considered.
Current academic year should be the default.

## 122. Reusing Previous Year Content

The teacher should be able to reuse a previous Unit without duplicating the master unnecessarily.
For a new Class:
Create Class
Select Subject
Add Existing Units
Schedule Lessons
The same curriculum content remains reusable across academic years.
If substantial curriculum changes require a new independent version, the teacher may duplicate the Unit deliberately.

## 123. Command Language

Interface labels should use direct teacher centred language.
Preferred:
Add Lesson
Publish
Student View
Copy Link
Add from Drive
Save as Template
Customise for Class
Avoid technical labels such as:
Instantiate object
Commit snapshot
Resolve provider
Create entity
Technical implementation should remain invisible during normal use.

## 124. Daily Use Standard

Common actions should require minimal interaction.
The following should generally require one or two direct actions from the current Lesson:
Student View
Copy Student Link
Open A4 Preview
Insert Block
Ask AI about Selected Block
Publish
Move Block
Change Variant
Add Teacher Note
The product should feel designed for use while teaching, not only for planning outside class.

## 125. UX Acceptance Criteria

The user experience is acceptable when:
A teacher reaches today's Lesson quickly.
A new Lesson is created within seconds.
Normal text editing feels immediate.
Dragging Blocks does not trigger server builds or AI.
Save state is always understandable.
Published state is always understandable.
Student View is accessible directly from the Lesson.
Student URLs are easy to copy.
Teacher only content never appears in Student View.
A Lesson remains readable on a student phone.
Class pages populate Lesson navigation automatically.
Unit pages populate Lesson sequence automatically.
The teacher adjusts A4 behaviour without maintaining a separate document.
AI scope is visible before generation.
AI proposals never silently overwrite content.
Templates and Compositions reduce repeated Lesson construction.
Search remains useful after hundreds of Lessons exist.
Scope and Sequence provides a functional annual timeline.
Class scheduling remains separate from reusable Lesson content.
Class specific overrides remain possible without complicating normal use.
Google Drive resources insert with minimal configuration.
Restricted student resources are clearly flagged.
A failed Embed does not break the Lesson.
Undo protects normal editing actions.
Version history protects against larger mistakes.
Archive and Trash prevent accidental permanent loss.
The interface remains visually consistent across the system.
Teacher controls do not leak into public student pages.
Routine operations use no AI tokens.
Routine content changes do not require full site deployment.

## 126. Locked User Experience Decisions

The following decisions are locked for the initial build.
Desktop teacher workspace uses Left Navigation Rail, Top Context Bar, Main Canvas and Right Context Panel.
The left rail reflects Year to Subject curriculum hierarchy.
Classes remain a separate teaching navigation context.
Teacher Home prioritises today's teaching and recent work.
Lessons use a Block based Main Canvas.
Selected Block controls appear primarily in the Right Context Panel.
The Right Context Panel supports Inspector, AI and A4 Print modes.
A4 Print Preview lives in the side panel rather than as a separate page authoring system.
Teacher and student views use the same underlying Lesson content.
Teacher only Blocks are visibly marked in teacher view and absent from student view.
Save and Publish remain separate.
Students continue seeing the last published version while a new draft is edited.
AI changes appear as proposals before acceptance.
AI context defaults to the smallest relevant scope.
AI chat and history design follows the Life Hub project precedent.
Class homepages combine generated sections with editable Blocks.
Unit pages combine generated sections with editable Blocks.
Student Lesson navigation includes Class Page, Unit Page, Previous Lesson and Next Lesson.
Class navigation follows Scheduled Lesson chronology.
Unit navigation follows reusable Lesson sequence.
Student pages require no login.
Student interactive state remains local to the browser.
Phone student experience is a primary requirement.
Phone teacher authoring is not a primary initial requirement.
Google Drive is the preferred first media selection source.
Media permissions should be checked before publication.
Scope and Sequence supports Document and annual Timeline views.
Scope timeline changes planning metadata rather than creating duplicate Units.
Search must support large long term archives.
Quick navigation through search or a Command K style switcher should be supported.
Normal deletion uses Trash.
Version restore creates a new draft rather than erasing history.
One consistent page theme is used initially.
Teacher workspace uses the Clinical Glass design language.
Student pages use a quieter and more opaque expression of the same design system.
A4 print uses a simplified print specific expression.
Routine editing, navigation, rendering, saving and publishing do not invoke AI.
Routine content edits do not trigger full Netlify site rebuilds.
