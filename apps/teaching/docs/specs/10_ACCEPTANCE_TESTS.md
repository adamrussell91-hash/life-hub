# Acceptance Tests

## 1. Purpose

This document defines the acceptance tests for the Teaching Day Book.
These tests determine whether a feature, phase or release behaves according to the agreed product architecture.
A feature is not complete because:
It renders successfully.
It compiles.
It looks correct in one browser.
A single happy path works.
Cursor reports the implementation as finished.
A feature is complete when the relevant acceptance tests pass.
Acceptance testing should focus on actual teacher and student workflows rather than isolated technical behaviour.

## 2. Testing Principles

### 2.1 Test real workflows

Tests should mirror actual teaching use.
Example:
Poor test:
Lesson API returns HTTP 200.
Better test:
Teacher opens a real Lesson, edits it, saves it, publishes it, opens the student URL and sees only the published student content.
Both technical and workflow tests are necessary.

## 3. Test Realistic Content

Testing should use realistic teaching content.
Sample data should include:
Year 7 to Year 12.
English.
English Advanced.
English Standard.
Psychology where useful.
Multiple Classes.
Multiple Units.
Long Lessons.
Images.
Questions.
Teacher notes.
Google Drive resources.
Scope and Sequence data.
Short dummy text alone is insufficient for validating the product.

## 4. Test Environments

Testing should distinguish:
Development.
Preview.
Production.
Automated tests should normally run against isolated development or test data.
Production teaching records should not be modified during ordinary automated testing.

## 5. Test Categories

Acceptance testing is organised into:
Core Architecture.
Data Integrity.
Teacher Workspace.
Lesson Builder.
Publishing.
Student Experience.
Class and Unit Pages.
Scheduling.
Scope and Sequence.
Block System.
A4 Print.
Media and Google Drive.
Templates and Reuse.
Search.
AI.
Versioning and Recovery.
Security.
Performance.
Accessibility.
Failure Handling.
Portability.
Production Readiness.

## 6. Priority Levels

Tests should use three priority levels.
P0
Critical.
Failure prevents production use.
P1
Important.
Failure significantly damages normal workflow.
P2
Enhancement quality.
Failure does not prevent core use but should be resolved.

## 7. P0 Release Rule

No production release should proceed with a known failing P0 test.
P1 failures require deliberate review.
P2 failures may remain as documented technical debt where appropriate.

## 8. Core Architecture Tests

AT ARCH 001
Priority:
P0
Scenario:
Year and Subject hierarchy.
Steps:
Open Year 12.
View Subjects.
Confirm English Advanced exists.
Confirm English Standard exists.
Open each Subject.
Expected:
English Advanced and English Standard exist as separate Subject objects.
Neither is represented as a display variation of a generic senior English Subject.

## 9. AT ARCH 002

Priority:
P0
Scenario:
Unit reuse.
Steps:
Create one Unit.
Add it to Class A.
Add the same Unit to Class B.
Inspect both Class relationships.
Expected:
Both Classes reference the same Unit ID.
A second Unit copy is not silently created.

## 10. AT ARCH 003

Priority:
P0
Scenario:
Lesson reuse.
Steps:
Create a Lesson inside a reusable Unit.
Schedule it for Class A.
Schedule it for Class B.
Expected:
Both Scheduled Lesson records reference the same Lesson ID.
Teaching dates remain separate.

## 11. AT ARCH 004

Priority:
P0
Scenario:
Lesson sequence versus schedule chronology.
Steps:
Create Unit Lesson 01, 02 and 03.
Schedule Lesson 02 before Lesson 01 for a Class.
Expected:
Unit sequence remains 01, 02, 03.
Class chronology reflects the actual scheduled order.
Neither sequence overwrites the other.

## 12. AT ARCH 005

Priority:
P0
Scenario:
Rename without identity loss.
Steps:
Create a Lesson.
Record its ID.
Rename the Lesson.
Change its slug.
Expected:
Permanent Lesson ID remains unchanged.
All internal relationships still resolve.

## 13. AT ARCH 006

Priority:
P1
Scenario:
Term spanning Unit.
Steps:
Create a Unit beginning in Term 2.
Set its planning end in Term 3.
Expected:
The Unit remains one Unit.
The Scope and Sequence represents its span across both Terms.

## 14. Data Integrity Tests

AT DATA 001
Priority:
P0
Scenario:
Invalid Lesson schema.
Steps:
Attempt to save a Lesson missing required fields.
Expected:
Validation fails.
Existing valid Lesson data remains unchanged.
A useful error is returned.

## 15. AT DATA 002

Priority:
P0
Scenario:
Broken Unit reference.
Steps:
Attempt to create a Lesson referencing a nonexistent Unit ID.
Expected:
Save is rejected.
No orphan Lesson is created.

## 16. AT DATA 003

Priority:
P0
Scenario:
Invalid Scheduled Lesson reference.
Steps:
Attempt to schedule a nonexistent Lesson.
Expected:
Operation fails safely.
Class schedule remains unchanged.

## 17. AT DATA 004

Priority:
P0
Scenario:
Schema migration.
Steps:
Load a record using an older supported schema version.
Apply migration.
Save migrated record.
Expected:
Content remains intact.
Permanent ID remains unchanged.
Relationships remain valid.
Current schema validation passes.

## 18. AT DATA 005

Priority:
P1
Scenario:
Unsupported Block.
Steps:
Load a Lesson containing an unknown Block type.
Expected:
Lesson still opens.
Unsupported Block placeholder appears in teacher view.
Original Block data remains preserved.
The entire Lesson does not crash.

## 19. Teacher Workspace Tests

AT UX 001
Priority:
P0
Scenario:
Open today's teaching.
Steps:
Create Scheduled Lessons for today.
Open Teacher Home.
Expected:
Today's Classes and Lessons appear.
Teacher reaches the Lesson directly from the Home view.

## 20. AT UX 002

Priority:
P1
Scenario:
Navigation hierarchy.
Steps:
Expand Year 12.
Expand English Advanced.
Expand a Term.
Expand a Unit.
Open a Lesson.
Expected:
Current location is visually clear.
Hierarchy remains understandable.

## 21. AT UX 003

Priority:
P1
Scenario:
Navigation persistence.
Steps:
Expand several navigation branches.
Reload the teacher application.
Expected:
Expanded navigation state is restored where supported.
Core teaching data is unaffected.

## 22. AT UX 004

Priority:
P0
Scenario:
Save state clarity.
Steps:
Edit a Lesson.
Observe autosave.
Wait for successful save.
Edit a published Lesson.
Expected:
States clearly distinguish:
Saving.
Saved.
Unpublished Changes.
Published.

## 23. AT UX 005

Priority:
P1
Scenario:
Right panel.
Steps:
Select a Block.
Open Inspector.
Open AI.
Open A4 Print.
Expected:
Panel changes context correctly.
Main Lesson Canvas remains usable.

## 24. Lesson Builder Tests

AT BUILD 001
Priority:
P0
Scenario:
Create Lesson.
Steps:
Select a Unit.
Create a Lesson.
Enter title.
Save.
Expected:
Lesson receives permanent ID.
Lesson receives slug.
Lesson appears in Unit sequence.
Draft exists.

## 25. AT BUILD 002

Priority:
P0
Scenario:
Insert Block.
Steps:
Open Lesson.
Insert Rich Text Block.
Enter content.
Expected:
Block appears immediately.
Block receives permanent ID after normal application processing.
Lesson saves correctly.
No AI request occurs.

## 26. AT BUILD 003

Priority:
P0
Scenario:
Reorder Block.
Steps:
Create three Blocks.
Move the third Block to first position.
Expected:
Visual order changes.
Saved Block order reflects new position.
Block contents remain unchanged.
No AI request occurs.

## 27. AT BUILD 004

Priority:
P0
Scenario:
Duplicate Block.
Steps:
Duplicate an existing Block.
Expected:
Content is copied.
New Block receives a new ID.
Original Block remains unchanged.

## 28. AT BUILD 005

Priority:
P0
Scenario:
Teacher Only Block.
Steps:
Create a Block.
Set visibility to Teacher Only.
Save.
Expected:
Teacher renderer displays the Block with teacher treatment.
Student renderer excludes the Block.

## 29. AT BUILD 006

Priority:
P0
Scenario:
Undo Block deletion.
Steps:
Delete a Block.
Use Undo.
Expected:
Block returns to its prior position with prior content.

## 30. AT BUILD 007

Priority:
P1
Scenario:
Column mobile order.
Steps:
Create two Columns.
Set explicit mobile order.
Open phone preview.
Expected:
Blocks stack according to stored mobile order.
Desktop arrangement does not determine phone reading order automatically.

## 31. AT BUILD 008

Priority:
P0
Scenario:
Autosave batching.
Steps:
Type continuously for a sustained period.
Expected:
Local editing remains immediate.
Server does not receive a write for every keystroke.
A consolidated save occurs after the configured pause.

## 32. AT BUILD 009

Priority:
P0
Scenario:
Save reload.
Steps:
Edit Lesson.
Wait for Saved state.
Reload browser.
Expected:
Latest successfully saved draft returns.

## 33. AT BUILD 010

Priority:
P0
Scenario:
Failed save.
Steps:
Simulate server write failure.
Edit Lesson.
Expected:
Local working content remains visible.
Save Failed appears.
Retry action exists.
Older server content does not silently replace local work.

## 34. Publishing Tests

AT PUB 001
Priority:
P0
Scenario:
Initial Lesson publication.
Steps:
Create draft Lesson.
Publish.
Open public URL.
Expected:
Published student content loads without student authentication.

## 35. AT PUB 002

Priority:
P0
Scenario:
Draft isolation.
Steps:
Publish Lesson revision 1.
Edit draft to revision 2.
Do not publish.
Open student URL.
Expected:
Student still sees revision 1.

## 36. AT PUB 003

Priority:
P0
Scenario:
Republish.
Steps:
Continue from AT PUB 002.
Publish revision 2.
Reload student page.
Expected:
Student receives revision 2.

## 37. AT PUB 004

Priority:
P0
Scenario:
Teacher Only publication filtering.
Steps:
Add Teacher Only Block.
Publish.
Inspect public response and student page.
Expected:
Teacher Only Block does not appear in student data or markup.
It is not merely hidden by CSS.

## 38. AT PUB 005

Priority:
P0
Scenario:
Publication validation failure.
Steps:
Create invalid required Block structure.
Attempt publication.
Expected:
Publication fails.
Previous published version remains live.
Draft remains editable.

## 39. AT PUB 006

Priority:
P0
Scenario:
Publication atomicity.
Steps:
Simulate a failure during publication.
Expected:
Student receives either the previous complete version or the new complete version.
No partial Lesson state becomes public.

## 40. AT PUB 007

Priority:
P1
Scenario:
Unpublish.
Steps:
Publish Lesson.
Unpublish it.
Open old public URL.
Expected:
Draft and history remain.
Public route returns an appropriate unavailable state.
No draft content appears.

## 41. AT PUB 008

Priority:
P1
Scenario:
Slug redirect.
Steps:
Publish Lesson.
Record public URL.
Change title and slug.
Publish.
Open old URL.
Expected:
Old URL redirects or resolves to current Lesson where practical.

## 42. Student Experience Tests

AT STUDENT 001
Priority:
P0
Scenario:
No login.
Steps:
Open published Lesson in a browser without teacher authentication.
Expected:
Lesson loads.
No login prompt appears.

## 43. AT STUDENT 002

Priority:
P0
Scenario:
Phone rendering.
Test on narrow phone viewport.
Expected:
Text remains readable.
Columns stack.
Navigation fits.
No horizontal page overflow occurs from ordinary Blocks.
Touch controls remain usable.

## 44. AT STUDENT 003

Priority:
P0
Scenario:
Teacher data leakage.
Inspect public Lesson payload.
Expected:
Payload excludes:
Teacher Only Blocks.
Teacher answers marked private.
Draft revision data.
AI metadata.
Version history.
Storage configuration.
Teacher credentials.

## 45. AT STUDENT 004

Priority:
P1
Scenario:
Direct Lesson arrival.
Steps:
Open Lesson URL directly in a new browser session.
Expected:
Student immediately sees enough context to identify:
Lesson.
Unit.
Class where applicable.
Navigation.
Browser history is not required for orientation.

## 46. AT STUDENT 005

Priority:
P1
Scenario:
Long Lesson navigation.
Steps:
Create Lesson with several major headings.
Expected:
Derived Lesson contents navigation works where enabled.
Teacher does not maintain the contents list manually.

## 47. AT STUDENT 006

Priority:
P1
Scenario:
Interactive local state.
Steps:
Use Flashcards or Self Check.
Reload page.
Expected:
Supported local activity state persists through browser local storage.
No identified student record is created on the server.

## 48. Class and Unit Page Tests

AT PAGE 001
Priority:
P0
Scenario:
Unit generated Lesson sequence.
Steps:
Add three Lessons to Unit.
Publish two.
Open student Unit page.
Expected:
Published Lessons appear in correct Unit sequence.
Unpublished Lesson is hidden.

## 49. AT PAGE 002

Priority:
P0
Scenario:
Class recent Lessons.
Steps:
Schedule several published Lessons.
Open Class page.
Expected:
Recent Lessons derive from Scheduled Lesson records.
Teacher did not manually create the list.

## 50. AT PAGE 003

Priority:
P0
Scenario:
Current Lesson.
Steps:
Explicitly set Class current Lesson.
Open Class page.
Expected:
Selected Lesson receives Current Lesson prominence.
Date based suggestion does not override teacher choice.

## 51. AT PAGE 004

Priority:
P1
Scenario:
Manual Class content.
Steps:
Add announcement Block to Class homepage.
Publish Class page.
Expected:
Generated Lesson sections remain intact.
Manual Block appears in intended region.

## 52. AT PAGE 005

Priority:
P1
Scenario:
Manual Unit content.
Steps:
Add introductory Blocks to Unit page.
Publish.
Open student page.
Expected:
Manual content and generated Lesson sequence coexist correctly.

## 53. AT PAGE 006

Priority:
P0
Scenario:
Student hierarchy navigation.
Steps:
Open Lesson through a Class.
Select Unit Page.
Return to Lesson.
Select Class Page.
Expected:
Navigation resolves correctly using stored relationships.

## 54. AT PAGE 007

Priority:
P0
Scenario:
Previous and Next Lesson.
Steps:
Schedule Lessons A, B and C for a Class.
Open Lesson B.
Expected:
Previous points to A.
Next points to C.
Navigation follows Class schedule order.

## 55. Scheduling Tests

AT SCHED 001
Priority:
P0
Scenario:
Schedule reusable Lesson.
Steps:
Select Lesson.
Select Class.
Set date.
Save.
Expected:
Scheduled Lesson record is created.
Master Lesson content remains unchanged.

## 56. AT SCHED 002

Priority:
P0
Scenario:
Different Class dates.
Steps:
Schedule same Lesson for Class A on one date.
Schedule same Lesson for Class B on another date.
Expected:
One reusable Lesson exists.
Two Scheduled Lesson records exist.

## 57. AT SCHED 003

Priority:
P0
Scenario:
Reschedule.
Steps:
Change Scheduled Lesson date.
Expected:
Scheduled Lesson changes.
Master Lesson does not change.
Unit Lesson sequence does not change.

## 58. AT SCHED 004

Priority:
P1
Scenario:
Multiple Lessons on same date.
Expected:
Explicit schedule order determines chronology.
Previous and Next navigation remains deterministic.

## 59. AT SCHED 005

Priority:
P1
Scenario:
Delivered state.
Steps:
Mark Scheduled Lesson Delivered.
Expected:
Delivery status changes.
No assessment or student progress record is created.

## 60. AT SCHED 006

Priority:
P1
Scenario:
Bulk Unit scheduling.
Steps:
Add Unit containing multiple Lessons to Class.
Create schedule sequence.
Expected:
Scheduled Lesson records reference existing Lessons.
Reusable Unit and Lesson content is not duplicated.

## 61. AT SCHED 007

Priority:
P1
Scenario:
Class specific override.
Steps:
Open shared Lesson through Class context.
Choose Customise for Class.
Modify one Block.
Expected:
Master Lesson remains unchanged.
Class receives sparse override.
Teacher sees clear customised state.

## 62. AT SCHED 008

Priority:
P0
Scenario:
Edit Master from Class context.
Steps:
Open shared Lesson through Class.
Choose Edit Master.
Modify and publish.
Expected:
Master Lesson changes.
Classes referencing the Master receive the updated published Master unless they have relevant overrides.

## 63. Scope and Sequence Tests

AT SCOPE 001
Priority:
P0
Scenario:
Document and Timeline same Unit.
Steps:
Add Unit to Scope.
Open Document view.
Open Timeline view.
Expected:
Both views reference the same Unit ID.
No duplicate planning Unit exists.

## 64. AT SCOPE 002

Priority:
P0
Scenario:
Move Unit on annual timeline.
Steps:
Drag Unit to later weeks.
Expected:
Planning dates change.
Unit content does not change.
Lesson content does not change.

## 65. AT SCOPE 003

Priority:
P1
Scenario:
Unit spanning Terms.
Expected:
Timeline visually spans relevant Term boundary.
One Unit remains referenced.

## 66. AT SCOPE 004

Priority:
P1
Scenario:
Rename Unit.
Steps:
Rename Unit after it already appears on Scope timeline.
Expected:
Timeline automatically shows new Unit title.
Teacher does not update timeline label separately.

## 67. AT SCOPE 005

Priority:
P1
Scenario:
Outcome references.
Expected:
Scope, Unit and Lesson Outcome references resolve to central Outcome objects.
Official wording is not duplicated as independent uncontrolled text.

## 68. Block System Tests

AT BLOCK 001
Priority:
P0
Scenario:
Registry source of truth.
Expected:
Insert menu obtains Block definition from central registry.
Validator uses registered schema.
Renderer mapping derives from registry.
Allowed variants derive from registry.
No second independent Block vocabulary exists.

## 69. AT BLOCK 002

Priority:
P0
Scenario:
Invalid variant.
Steps:
Attempt to save unsupported variant for Block type.
Expected:
Validation rejects invalid variant.

## 70. AT BLOCK 003

Priority:
P0
Scenario:
Maximum nesting.
Steps:
Attempt unsupported recursive nesting beyond Page, Section, Block model.
Expected:
Builder prevents the invalid structure.

## 71. AT BLOCK 004

Priority:
P1
Scenario:
Rich Text.
Expected:
Paragraphs, emphasis, lists and links render consistently in teacher and student views.
Unsafe script content is removed.

## 72. AT BLOCK 005

Priority:
P1
Scenario:
Heading semantics.
Expected:
Heading hierarchy remains semantically valid.
Student page accessibility structure reflects headings correctly.

## 73. AT BLOCK 006

Priority:
P1
Scenario:
Question answers.
Steps:
Create Question Set with Teacher Only answers.
Publish.
Expected:
Questions appear.
Teacher answers do not appear publicly.

## 74. AT BLOCK 007

Priority:
P1
Scenario:
Accordion print behaviour.
Expected:
Screen view collapses appropriately.
Print view produces deterministic expanded content.

## 75. AT BLOCK 008

Priority:
P1
Scenario:
Tabs phone and print behaviour.
Expected:
Phone remains usable.
Print translates tabs into readable sequential content.

## 76. AT BLOCK 009

Priority:
P1
Scenario:
Collection Block.
Steps:
Create Collection filtered to current Unit Lessons.
Add Lesson to Unit.
Expected:
Collection updates automatically.
Teacher does not manually add a link.

## 77. AT BLOCK 010

Priority:
P0
Scenario:
Linked Block.
Steps:
Insert linked source Block.
Edit source.
Expected:
Linked instance reflects source.

## 78. AT BLOCK 011

Priority:
P0
Scenario:
Detach linked Block.
Steps:
Detach linked Block.
Edit source afterwards.
Expected:
Detached Block no longer changes.
Detached Block has independent ID.

## 79. AT BLOCK 012

Priority:
P1
Scenario:
Semantic preset.
Steps:
Insert Learning Intention from Insert menu.
Expected:
Underlying primitive Block matches registered preset architecture.
A separate arbitrary renderer is not created.

## 80. A4 Print Tests

AT PRINT 001
Priority:
P0
Scenario:
Same source content.
Steps:
Edit Lesson Block.
Open A4 Preview.
Expected:
Print renderer uses current Lesson Block data.
No separate worksheet content copy exists.

## 81. AT PRINT 002

Priority:
P0
Scenario:
Student Print.
Expected:
Teacher Only content is excluded.

## 82. AT PRINT 003

Priority:
P0
Scenario:
Teacher Print.
Expected:
Teacher Only content appears where configured.

## 83. AT PRINT 004

Priority:
P1
Scenario:
Real A4 boundaries.
Expected:
Preview shows actual page proportions and boundaries.
Page count reflects print output.

## 84. AT PRINT 005

Priority:
P1
Scenario:
Keep Together.
Steps:
Set small Callout to Keep Together.
Position it near page end.
Expected:
Entire Block moves to next page if required.

## 85. AT PRINT 006

Priority:
P1
Scenario:
Long text split.
Expected:
Long Rich Text splits when permitted.
No unnecessary whole Block movement creates large blank space.

## 86. AT PRINT 007

Priority:
P1
Scenario:
Start New Page.
Expected:
Selected Block starts on new page.
Screen layout remains unchanged.

## 87. AT PRINT 008

Priority:
P0
Scenario:
No glass dependency.
Expected:
Exported or printed page remains readable without blur, transparency or interface shadows.

## 88. AT PRINT 009

Priority:
P1
Scenario:
Video print translation.
Expected:
Video does not render as a broken player.
Printable representation contains useful title and link or QR representation where configured.

## 89. AT PRINT 010

Priority:
P0
Scenario:
Print readability.
Expected:
Automatic fitting does not reduce body text below defined minimum readable size.
Additional pages are created instead.

## 90. Media and Google Drive Tests

AT MEDIA 001
Priority:
P0
Scenario:
Drive file insertion.
Steps:
Select Google Drive file.
Insert into Lesson.
Expected:
Media Reference is created.
Appropriate Block is selected from file metadata.
File bytes are not copied into Lesson JSON.

## 91. AT MEDIA 002

Priority:
P0
Scenario:
Drive image.
Expected:
Image Block references Media ID.
Dimensions and relevant metadata are stored.
Student renderer loads appropriate responsive source where available.

## 92. AT MEDIA 003

Priority:
P0
Scenario:
Restricted Drive file.
Steps:
Add student visible restricted file.
Attempt publication.
Expected:
Teacher receives clear permission warning.
System does not silently claim student accessibility.

## 93. AT MEDIA 004

Priority:
P1
Scenario:
Missing Drive file.
Expected:
Teacher sees diagnostic failure state.
Student sees restrained unavailable resource state.
Rest of Lesson renders normally.

## 94. AT MEDIA 005

Priority:
P1
Scenario:
Shared Media Reference.
Steps:
Use same Media object in two Lessons.
Remove Block from one Lesson.
Expected:
Media remains available to the other Lesson.
Original Drive file is not deleted.

## 95. AT MEDIA 006

Priority:
P0
Scenario:
Provider independence.
Expected:
Block references generic Media object.
Google Drive specific implementation is not hard wired into Lesson schema.

## 96. AT MEDIA 007

Priority:
P1
Scenario:
Heavy media lazy loading.
Expected:
Initial Lesson render does not load every heavy video, Slides deck or website player immediately.

## 97. AT MEDIA 008

Priority:
P1
Scenario:
Blocked iframe.
Expected:
Embed failure produces external resource fallback.
Lesson continues functioning.

## 98. Templates and Reuse Tests

AT TEMPLATE 001
Priority:
P0
Scenario:
Save Composition.
Steps:
Select a Section.
Save as Composition.
Insert it into another Lesson.
Expected:
Composition structure inserts correctly.

## 99. AT TEMPLATE 002

Priority:
P0
Scenario:
Independent Composition copy.
Expected:
Inserted Blocks receive new IDs.
Editing inserted copy does not modify source Composition.

## 100. AT TEMPLATE 003

Priority:
P1
Scenario:
Lesson Template.
Steps:
Save Lesson as Template.
Create new Lesson from Template.
Expected:
New Lesson receives new identity.
Structure matches Template.
Context specific Lesson IDs are not reused.

## 101. AT TEMPLATE 004

Priority:
P1
Scenario:
Unit Template.
Expected:
New Unit is independent.
Template remains unchanged after new Unit editing.

## 102. AT TEMPLATE 005

Priority:
P1
Scenario:
Template edit.
Expected:
Editing Template does not retroactively modify previous independent copies.

## 103. Search Tests

AT SEARCH 001
Priority:
P0
Scenario:
Search Lesson title.
Expected:
Relevant Lesson appears with Year, Subject and Unit context.

## 104. AT SEARCH 002

Priority:
P1
Scenario:
Search Block content.
Expected:
Matching Lesson appears even when search phrase exists inside Block text rather than title.

## 105. AT SEARCH 003

Priority:
P1
Scenario:
Search curriculum Outcome code.
Expected:
Relevant Units and Lessons appear.

## 106. AT SEARCH 004

Priority:
P1
Scenario:
Search Class code.
Expected:
Correct Class appears immediately.

## 107. AT SEARCH 005

Priority:
P1
Scenario:
Command K.
Expected:
Teacher quickly opens Lesson, Unit or Class using keyboard driven search.
No AI request occurs.

## 108. AT SEARCH 006

Priority:
P1
Scenario:
Large archive.
Test with several hundred or synthetic thousand Lesson records.
Expected:
Search remains responsive enough for daily use.
Results include clear hierarchy.

## 109. AI Tests

AT AI 001
Priority:
P0
Scenario:
AI disabled.
Steps:
Remove or disable Anthropic configuration.
Open Lesson.
Edit.
Save.
Publish.
Open Student View.
Print.
Expected:
All non AI functionality remains operational.

## 110. AT AI 002

Priority:
P0
Scenario:
Default scope.
Steps:
Select Rich Text Block.
Open AI.
Expected:
Scope defaults to Selected Block.
Whole Lesson is not silently included.

## 111. AT AI 003

Priority:
P0
Scenario:
AI proposal.
Steps:
Request rewrite.
Wait for result.
Expected:
Existing Block remains unchanged until teacher accepts proposal.

## 112. AT AI 004

Priority:
P0
Scenario:
Reject proposal.
Expected:
Existing content remains unchanged.

## 113. AT AI 005

Priority:
P0
Scenario:
Accept proposal.
Expected:
Validated content replaces or inserts according to selected operation.
Normal Undo state records prior content.
Draft becomes changed.
Normal save process follows.

## 114. AT AI 006

Priority:
P0
Scenario:
Invalid AI schema.
Steps:
Simulate malformed AI output.
Expected:
Output is rejected.
Existing Lesson remains untouched.
Repair attempt follows configured rules.

## 115. AT AI 007

Priority:
P0
Scenario:
Hallucinated Outcome ID.
Expected:
Validation rejects nonexistent reference.
AI output does not add invalid curriculum relationship.

## 116. AT AI 008

Priority:
P0
Scenario:
Hallucinated Media ID.
Expected:
Invalid reference is rejected.

## 117. AT AI 009

Priority:
P0
Scenario:
No direct publication.
Steps:
Generate complete Lesson with AI.
Expected:
Generated Lesson remains draft.
Teacher publication action is still required.

## 118. AT AI 010

Priority:
P1
Scenario:
Reading Comprehension Composition.
Steps:
Select source text.
Request Reading Comprehension.
Expected:
AI uses approved Composition structure.
Output consists of valid registered Blocks.

## 119. AT AI 011

Priority:
P1
Scenario:
Broad context.
Steps:
Change scope from Block to Unit.
Expected:
Interface clearly indicates larger context.
Unit content is included only after deliberate selection.

## 120. AT AI 012

Priority:
P0
Scenario:
No entire archive.
Inspect AI request during ordinary Block generation.
Expected:
Request contains only relevant scoped context.
Archive content is absent.

## 121. AT AI 013

Priority:
P1
Scenario:
Stale AI proposal.
Steps:
Start AI generation against Block revision 4.
Edit Block to revision 5 before proposal arrives.
Proposal returns.
Expected:
Application detects revision mismatch.
Proposal does not silently overwrite revision 5.

## 122. AT AI 014

Priority:
P0
Scenario:
API key exposure.
Inspect browser bundle, network response and student page.
Expected:
Anthropic API key is absent.

## 123. AT AI 015

Priority:
P1
Scenario:
AI request usage record.
Expected:
System records relevant scope, action, provider usage and success state without requiring permanent storage of the full teaching source.

## 124. AT AI 016

Priority:
P1
Scenario:
AI history precedent.
Expected:
AI panel follows Life Hub chat and history design where referenced by specification.
Teaching Day Book specific context indicators are added without creating an unrelated second chat architecture.

## 125. Versioning and Recovery Tests

AT VERSION 001
Priority:
P0
Scenario:
Meaningful Lesson versions.
Steps:
Create several meaningful save events.
Expected:
Version history records appropriate checkpoints.
System does not create unusable history noise after every keystroke.

## 126. AT VERSION 002

Priority:
P0
Scenario:
Minimum retention.
Expected:
At least ten most recent meaningful Lesson versions remain recoverable.

## 127. AT VERSION 003

Priority:
P0
Scenario:
Restore.
Steps:
Preview old Lesson version.
Restore.
Expected:
Old state becomes a new current draft.
Later history remains preserved.
Student published version does not change until republished.

## 128. AT VERSION 004

Priority:
P1
Scenario:
Accepted AI version recovery.
Steps:
Accept major AI change.
Restore prior version.
Expected:
Original Lesson content is recoverable.

## 129. AT VERSION 005

Priority:
P0
Scenario:
Trash and restore Lesson.
Expected:
Lesson disappears from normal active navigation.
Lesson remains recoverable.
Restoration preserves ID and valid relationships.

## 130. AT VERSION 006

Priority:
P1
Scenario:
Archive Class.
Expected:
Class disappears from normal current year workflow.
Historical data remains available through archive access.

## 131. AT VERSION 007

Priority:
P0
Scenario:
Trash referenced Unit.
Steps:
Attempt to Trash Unit used by active Class.
Expected:
Dependency warning appears.
System does not silently break Class relationships.

## 132. AT VERSION 008

Priority:
P0
Scenario:
Permanent Delete.
Expected:
Advanced deliberate confirmation is required.
Dependency checks occur.
Ordinary Delete control does not immediately destroy data permanently.

## 133. Security Tests

AT SEC 001
Priority:
P0
Scenario:
Unauthenticated teacher write.
Steps:
Call save endpoint without valid teacher authentication.
Expected:
Request is rejected.
Content remains unchanged.

## 134. AT SEC 002

Priority:
P0
Scenario:
Unauthenticated publish.
Expected:
Publication request is rejected.

## 135. AT SEC 003

Priority:
P0
Scenario:
Public Blob access.
Expected:
Student browser does not receive unrestricted Blob credentials or raw private storage access.

## 136. AT SEC 004

Priority:
P0
Scenario:
Teacher Only API projection.
Expected:
Public API excludes teacher fields at server projection level.

## 137. AT SEC 005

Priority:
P0
Scenario:
HTML App sandbox.
Steps:
Run test App attempting to access parent authentication state.
Expected:
Access is blocked.

## 138. AT SEC 006

Priority:
P0
Scenario:
HTML App storage access.
Expected:
Sandboxed App does not receive unrestricted internal storage access.

## 139. AT SEC 007

Priority:
P0
Scenario:
AI endpoint misuse.
Steps:
Call AI endpoint without authentication.
Expected:
Request is rejected before provider invocation.

## 140. AT SEC 008

Priority:
P0
Scenario:
Secret backup exclusion.
Inspect GitHub content backup.
Expected:
No API keys, OAuth secrets, Netlify credentials or authentication tokens appear.

## 141. AT SEC 009

Priority:
P0
Scenario:
Rich Text script injection.
Steps:
Insert malicious script content.
Expected:
Unsafe content is sanitised or rejected.
Student page does not execute it.

## 142. AT SEC 010

Priority:
P0
Scenario:
Prompt injection from source document.
Expected:
Retrieved source text remains source material.
Embedded instructions do not override application AI system rules.

## 143. Performance Tests

AT PERF 001
Priority:
P0
Scenario:
Student Lesson initial render.
Expected:
Primary Lesson text and navigation render before heavy Embeds.

## 144. AT PERF 002

Priority:
P1
Scenario:
Student bundle separation.
Inspect student JavaScript.
Expected:
Student does not download large teacher only systems such as:
AI panel.
Drive picker.
Block drag controls.
Version history.
Inspector.

## 145. AT PERF 003

Priority:
P1
Scenario:
One Lesson data loading.
Expected:
Opening one Lesson does not retrieve the full Subject or archive.

## 146. AT PERF 004

Priority:
P1
Scenario:
Save payload.
Expected:
Saving one Lesson sends only the relevant Lesson draft or intended object payload.

## 147. AT PERF 005

Priority:
P1
Scenario:
Large image phone load.
Expected:
Student phone does not unnecessarily download original oversized image when an appropriate smaller representation exists.

## 148. AT PERF 006

Priority:
P1
Scenario:
Large Lesson.
Test realistic long Lesson with mixed Blocks.
Expected:
Teacher editing remains responsive.
Student page remains usable.
A4 renderer completes successfully.

## 149. AT PERF 007

Priority:
P0
Scenario:
No deployment on content edit.
Steps:
Edit Lesson.
Save.
Publish.
Expected:
No Netlify application build is triggered by any of these content operations.

## 150. AT PERF 008

Priority:
P0
Scenario:
No AI on deterministic operation.
Monitor provider requests while:
Moving Block.
Saving.
Publishing.
Changing print variant.
Scheduling Lesson.
Searching.
Expected:
No Anthropic request occurs.

## 151. Accessibility Tests

AT ACCESS 001
Priority:
P0
Scenario:
Keyboard teacher navigation.
Expected:
Core navigation and Block controls are reachable without a mouse.

## 152. AT ACCESS 002

Priority:
P0
Scenario:
Keyboard student navigation.
Expected:
Lesson links, activity controls and navigation are keyboard accessible.

## 153. AT ACCESS 003

Priority:
P0
Scenario:
Visible focus.
Expected:
Focused controls have clear visible focus state across light, dark and glass surfaces.

## 154. AT ACCESS 004

Priority:
P1
Scenario:
Image alt text.
Steps:
Publish student visible image without alt text.
Expected:
Teacher receives accessibility warning unless image is explicitly decorative.

## 155. AT ACCESS 005

Priority:
P0
Scenario:
Heading hierarchy.
Expected:
Student page uses meaningful semantic heading structure.

## 156. AT ACCESS 006

Priority:
P1
Scenario:
Table accessibility.
Expected:
Headers remain identifiable.
Mobile and print transformations preserve understandable structure.

## 157. AT ACCESS 007

Priority:
P0
Scenario:
Colour independence.
Expected:
Selected, error, warning, Teacher Only and publication states each include non colour indicators.

## 158. AT ACCESS 008

Priority:
P1
Scenario:
Reduced motion.
Expected:
Interface respects reduced motion preference.
Essential functionality remains intact.

## 159. AT ACCESS 009

Priority:
P0
Scenario:
Phone touch targets.
Expected:
Student navigation and interactive controls have suitable touch sizes.

## 160. Failure Handling Tests

AT FAIL 001
Priority:
P0
Scenario:
Blob read failure.
Expected:
Teacher receives understandable temporary failure state.
No corrupt local overwrite occurs.

## 161. AT FAIL 002

Priority:
P0
Scenario:
Blob write failure.
Expected:
Local unsaved Lesson remains available.
Retry exists.

## 162. AT FAIL 003

Priority:
P0
Scenario:
Drive unavailable.
Expected:
Non Drive Lesson content still renders.
Affected media Blocks show fallback.

## 163. AT FAIL 004

Priority:
P0
Scenario:
Anthropic unavailable.
Expected:
AI reports failure.
Lesson editing remains operational.

## 164. AT FAIL 005

Priority:
P0
Scenario:
Broken external Embed.
Expected:
Block displays fallback link or unavailable state.
Rest of page works.

## 165. AT FAIL 006

Priority:
P0
Scenario:
Invalid student URL.
Expected:
Student sees useful unavailable page.
No stack trace or storage detail appears.
Useful Class or Unit navigation appears where resolvable.

## 166. AT FAIL 007

Priority:
P1
Scenario:
Unsupported imported schema.
Expected:
System identifies unsupported version and avoids destructive loading.
User receives clear recovery or migration path.

## 167. Portability Tests

AT PORT 001
Priority:
P0
Scenario:
Lesson export.
Expected:
Export includes readable structured content.
Lesson remains understandable without proprietary binary decoding.

## 168. AT PORT 002

Priority:
P0
Scenario:
Unit export.
Expected:
Unit relationship and Lesson sequence remain evident.

## 169. AT PORT 003

Priority:
P0
Scenario:
Full archive export.
Expected:
Archive contains:
Manifest.
Objects.
IDs.
Relationships.
Schema versions.
Media references.
No secrets.

## 170. AT PORT 004

Priority:
P1
Scenario:
External media dependency.
Expected:
Export clearly records provider and file references.
Archive does not pretend external files are embedded when they are not.

## 171. AT PORT 005

Priority:
P0
Scenario:
GitHub backup.
Expected:
Backup contains readable teaching content.
Autosave does not generate a GitHub commit.

## 172. AT PORT 006

Priority:
P1
Scenario:
Restore from exported structure.
When import functionality exists:
Expected:
IDs and relationships restore correctly or conflicts are explicitly resolved.

## 173. Design System Tests

AT DESIGN 001
Priority:
P1
Scenario:
Teacher colour tokens.
Expected:
Core interface uses central design tokens.
Repeated hard coded colours do not independently define major components.

## 174. AT DESIGN 002

Priority:
P1
Scenario:
Teacher glass hierarchy.
Expected:
Glass treatment appears on navigation, panels and controls.
Dense reading text remains sufficiently opaque.

## 175. AT DESIGN 003

Priority:
P1
Scenario:
Student simplification.
Expected:
Student page visually belongs to the same product but contains less glass, fewer controls and less metadata.

## 176. AT DESIGN 004

Priority:
P1
Scenario:
High Sea restraint.
Expected:
High Sea is used selectively for decisive action or attention.
It does not become a general decorative colour across the interface.

## 177. AT DESIGN 005

Priority:
P1
Scenario:
Block fragmentation.
Expected:
Normal Lesson text does not appear as dozens of unnecessary permanent cards.
Contained surfaces are reserved for content which benefits from them.

## 178. AT DESIGN 006

Priority:
P1
Scenario:
Teacher Only visual state.
Expected:
Teacher recognises Teacher Only content instantly.
The state does not resemble an error or warning.

## 179. AT DESIGN 007

Priority:
P1
Scenario:
AI proposal state.
Expected:
Proposed AI content remains visually distinguishable from accepted Lesson content.

## 180. AT DESIGN 008

Priority:
P1
Scenario:
Consistent theme.
Expected:
Lessons do not contain arbitrary teacher selected fonts, custom CSS or uncontrolled colour themes.

## 181. Class Override Edge Tests

AT OVERRIDE 001
Priority:
P1
Scenario:
Master update with Class override.
Steps:
Create Master Lesson.
Add Class specific override.
Update unrelated Master Block.
Expected:
Class override remains valid.
Unrelated Master update appears normally.

## 182. AT OVERRIDE 002

Priority:
P1
Scenario:
Master update conflicts with override.
Expected:
Teacher receives conflict indicator.
Override is not silently discarded.

## 183. AT OVERRIDE 003

Priority:
P1
Scenario:
Remove Class override.
Expected:
Class returns to published Master Lesson content.
Master Lesson is unchanged.

## 184. Curriculum Outcome Tests

AT OUTCOME 001
Priority:
P0
Scenario:
Valid Outcome reference.
Expected:
Lesson stores official Outcome ID.
Display resolves official code and wording centrally.

## 185. AT OUTCOME 002

Priority:
P0
Scenario:
Invalid Outcome reference.
Expected:
Save or AI proposal validation rejects nonexistent Outcome ID.

## 186. AT OUTCOME 003

Priority:
P1
Scenario:
Outcome wording update.
Steps:
Update central Outcome metadata.
Open Unit and Lesson referencing it.
Expected:
Updated metadata appears without editing every Unit and Lesson record.

## 187. AT OUTCOME 004

Priority:
P1
Scenario:
Outcome coverage.
When coverage visualisation exists:
Expected:
Coverage derives from structured references.
Teacher does not maintain a second coverage list manually.

## 188. Trash and Dependency Tests

AT TRASH 001
Priority:
P0
Scenario:
Trash scheduled Lesson source.
Expected:
System identifies active Scheduled Lesson dependencies.
Teacher receives clear consequence warning.

## 189. AT TRASH 002

Priority:
P0
Scenario:
Trash shared Media Reference.
Expected:
Active Lesson references are identified.
System avoids silently breaking multiple Lessons.

## 190. AT TRASH 003

Priority:
P1
Scenario:
Restore trashed object.
Expected:
Previous status is restored where valid.
Relationships remain intact.

## 191. URL and Routing Tests

AT URL 001
Priority:
P0
Scenario:
Readable URL.
Expected:
Published pages use human readable slugs.
Internal ID remains separate.

## 192. AT URL 002

Priority:
P0
Scenario:
Title change.
Expected:
Existing internal relationships remain valid.

## 193. AT URL 003

Priority:
P1
Scenario:
Redirect chain.
Steps:
Change Lesson slug multiple times.
Open original slug.
Expected:
Original URL reaches current Lesson without unnecessary chained redirects where practical.

## 194. AT URL 004

Priority:
P0
Scenario:
Student route class context.
Expected:
Lesson opened through Class context receives correct Class specific navigation and scheduled date.

## 195. AT URL 005

Priority:
P1
Scenario:
Generic Unit context.
Expected:
Reusable Unit opened without Class context still renders coherent generic sequence information.

## 196. Browser Tests

AT BROWSER 001
Priority:
P0
Teacher desktop:
Latest supported Chrome.
Expected:
Core teacher workflow works.

## 197. AT BROWSER 002

Priority:
P0
Teacher desktop:
Latest supported Safari on macOS.
Expected:
Core teacher workflow works.

## 198. AT BROWSER 003

Priority:
P0
Teacher desktop:
Latest supported Edge.
Expected:
Core teacher workflow works.

## 199. AT BROWSER 004

Priority:
P0
Student phone:
Safari on iPhone sized viewport.
Expected:
Core student Lesson workflow works.

## 200. AT BROWSER 005

Priority:
P0
Student phone:
Chrome on Android sized viewport.
Expected:
Core student Lesson workflow works.

## 201. First Production Gate

The first production gate requires all of the following:
P0 architecture tests pass.
P0 data tests pass.
P0 Lesson Builder tests pass.
P0 publishing tests pass.
P0 student tests pass.
P0 security tests pass.
P0 basic failure tests pass.
Teacher uses at least one real Lesson successfully.
Student page has been tested on a real phone.
A4 output has been tested with real teaching content.
No content edit triggers an application build.

## 202. Core Product Gate

The core product is ready for sustained daily use when:
Year and Subject structure is reliable.
Reusable Units work.
Reusable Lessons work.
Classes work.
Scheduling works.
Lesson builder works.
Autosave works.
Publication works.
Student pages work.
Class Page works.
Unit Page works.
Previous and Next navigation works.
Teacher Only content remains private.
Google Drive resources work.
A4 rendering works.
Version recovery works.
Search works with realistic archive size.
Backup and export work.
AI is not required for this gate.

## 203. AI Production Gate

AI enters production only when:
Core product already works without AI.
Authenticated AI endpoint passes security testing.
API secrets remain server side.
Block scope works.
Scope indicator works.
Structured proposals work.
Invalid output is safely rejected.
Accept and Reject work.
Undo after acceptance works.
Anthropic failure does not affect core product.
Usage metadata is recorded.
Reading Comprehension Composition works reliably.
AI does not publish directly.
AI does not receive whole archive context during ordinary use.

## 204. A4 Production Gate

A4 is ready for reliance when:
Real A4 dimensions render.
Portrait works.
Landscape works.
Student Print works.
Teacher Print works.
Teacher Only visibility works.
Long Rich Text splits.
Keep Together works.
Start New Page works.
Interactive translations work.
Phone and desktop Block settings remain unaffected by print only changes.
Minimum readable typography is enforced.
Exported PDF or browser print matches preview closely enough for practical use.

## 205. Google Drive Production Gate

Drive integration is ready when:
Teacher authentication works securely.
File picker works.
File metadata resolves.
File type mapping works.
Media Reference is created.
Student accessible resources open.
Restricted resources generate warning.
Missing resources fail gracefully.
Original Drive file is not accidentally deleted through Lesson editing.
Media schema remains provider independent.

## 206. Scale Test Dataset

Before long term production reliance, create or generate a scale test dataset approximating future use.
Suggested minimum:
6 Years.
Several Subjects.
20 Classes across archived and current years.
50 Units.
700 Lessons.
Several thousand Blocks.
Several hundred Media References.
Multiple Templates.
Multiple Outcome records.
The goal is not to simulate millions of users.
The goal is to validate the expected personal teaching archive scale.

## 207. Scale Navigation Test

Using scale dataset:
Expected:
Left navigation remains usable.
Collapsed hierarchy remains responsive.
Opening one Unit does not render every Lesson in the archive.

## 208. Scale Search Test

Using scale dataset:
Expected:
Search remains practical for daily navigation.
Results provide hierarchy.
Search does not require AI.

## 209. Scale Save Test

Using scale dataset:
Expected:
Editing one Lesson updates only relevant data.
Archive size does not materially increase save payload.

## 210. Scale Publication Test

Using scale dataset:
Expected:
Publishing one Lesson does not process hundreds of unrelated Lessons.

## 211. Scale AI Test

Using scale dataset:
Expected:
Selected Block AI request remains approximately the same size whether archive contains 10 Lessons or 700 Lessons.
This is a critical architecture test.

## 212. Regression Suite

Once a feature passes its initial acceptance tests, critical tests should become regression tests where automation is practical.
Highest priority regression workflows:
Create Lesson.
Save Lesson.
Publish Lesson.
Draft isolation.
Teacher Only filtering.
Student route.
Reusable Lesson across Classes.
Scheduled chronology.
A4 visibility.
Drive fallback.
AI proposal safety.
Version restore.
Authentication.

## 213. Manual Versus Automated Testing

Not every test should be automated.
Automate where reliable:
Schemas.
Repositories.
API projection.
Authentication.
Publication isolation.
Revision handling.
Block validation.
Routing.
AI response validation.
Use manual or browser driven testing for:
Visual quality.
Drag behaviour.
A4 layout.
Phone usability.
Glass treatment.
Real classroom workflow.
Complex accessibility review.
Both are required.

## 214. Acceptance Evidence

For each implementation phase, completion should record:
Tests run.
Tests passed.
Known failures.
Relevant screenshots where useful.
Relevant automated test output.
Known technical debt.
This does not need to become bureaucratic.
It should provide enough evidence to distinguish working functionality from assumed functionality.

## 215. Cursor Completion Rule

Cursor should not mark a task complete merely because code was written.
Every Cursor implementation request should include relevant acceptance tests.
Example:
Implement Lesson draft saving.
Acceptance:
Draft survives reload.
Revision increments.
Invalid schema fails.
Conflict does not silently overwrite.
No site build occurs.
No AI request occurs.
This makes implementation prompts much more reliable.

## 216. Bug Fix Rule

When a production bug appears:
Reproduce it.
Add or identify an acceptance or regression test representing the failure.
Fix the issue.
Verify the test passes.
Check related core tests.
This reduces repeated regressions.

## 217. Specification Conflict Rule

If a test exposes conflict between specifications:
Do not silently code around it.
Identify the conflicting requirement.
Resolve the product decision.
Update the relevant specification.
Then update the acceptance test.
The numbered MD files remain authoritative.

## 218. Definition of Done for a Feature

A feature is Done when:
Implementation exists.
Relevant schema is defined.
Validation exists.
Relevant UI exists.
Error state exists.
Relevant responsive behaviour exists.
Teacher and student privacy rules are respected.
Relevant acceptance tests pass.
No unrelated architecture rule is broken.
Documentation remains accurate.

## 219. Definition of Done for a Block

A new Block is Done when:
Registered in Block Registry.
Has schema.
Has teacher renderer.
Has student renderer.
Has print behaviour.
Has mobile behaviour.
Has Inspector configuration.
Has visibility support where applicable.
Has accessibility behaviour.
Has failure behaviour.
Has AI capability declaration where applicable.
Passes validation tests.
Does not require unrelated custom architecture.

## 220. Definition of Done for a Public Page

A public page is Done when:
Loads without student login.
Contains only approved published data.
Works on phone.
Provides clear navigation.
Handles missing resources gracefully.
Does not expose teacher controls.
Does not expose draft information.
Does not expose security sensitive data.
Performs acceptably on realistic network conditions.
Remains usable if Anthropic is unavailable.

## 221. Definition of Done for an AI Feature

An AI feature is Done when:
Scope is explicit.
Request is authenticated.
Context is minimised.
Output schema is defined.
Output validates.
Existing content remains unchanged before acceptance.
Reject works.
Accept works.
Undo works where appropriate.
Failure leaves existing content safe.
Usage is measurable.
Student publication remains a separate teacher action.

## 222. Final Product Acceptance Scenario

The strongest complete system test should follow an authentic teaching workflow.
Scenario:
A teacher prepares a new Year 12 English Advanced Lesson.
Steps:
Open Year 12.
Open English Advanced.
Open the relevant Unit.
Create a new Lesson.
Add Learning Intention.
Add a reading passage.
Add an image from Google Drive.
Add Teacher Only notes.
Add Question Set.
Reorder Blocks.
Preview on phone.
Open A4 Preview.
Adjust one print rule.
Save.
Publish.
Copy Student Link.
Open Student Link without teacher authentication.
Navigate back to Unit.
Navigate to Class Page.
Move to Next Lesson where available.
Return to teacher workspace.
Edit the Lesson draft.
Confirm student still sees previous publication.
Use AI on one selected Block.
Reject first AI proposal.
Generate again.
Accept second proposal.
Undo accepted change.
Reapply or generate desired change.
Publish new revision.
Confirm student sees new content.
Restore an earlier Lesson version into draft.
Confirm published student Lesson remains unchanged.
Expected:
Every step behaves predictably.
No unrelated Lesson changes.
No site deployment occurs because of content editing.
No AI request occurs except the explicitly requested AI actions.
Teacher Only data never reaches student view.
Google Drive file remains externally stored.
Lesson remains portable structured content.

## 223. Locked Acceptance Principles

The following testing principles are locked.
P0 failures block production release.
Real teaching content is required during acceptance testing.
Student phone testing is mandatory.
Teacher Only content must be tested at API level, not merely visually.
Draft and published isolation is a critical P0 test.
Reusable Units and Lessons must be tested across more than one Class.
Scheduled chronology must remain separate from reusable Lesson sequence.
A4 must use the same content model as screen Lessons.
Google Drive files must remain external to Lesson JSON.
AI availability must not determine core product availability.
Deterministic operations must be tested for absence of unnecessary AI requests.
Normal content changes must be tested for absence of Netlify site rebuilds.
Permanent IDs must survive renaming and slug changes.
Invalid schemas must fail safely.
Version conflicts must not silently overwrite newer work.
Failed publication must leave the previous published version live.
Public APIs must exclude teacher and draft data.
HTML Apps must remain sandboxed.
Backups must exclude secrets.
Search must be tested at realistic archive scale.
Cursor implementation tasks should include specific acceptance criteria.
Regression tests should be added for important production bugs.
Specifications should be updated deliberately when implementation reveals a genuine architectural conflict.
A feature is not complete until its relevant teacher, student, mobile, print, error and privacy behaviours have been considered.
The final product must remain useful even with Anthropic unavailable.
