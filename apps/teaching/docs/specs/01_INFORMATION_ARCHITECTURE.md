# Information Architecture

## 1. Purpose

This document defines the information architecture for the Teaching Day Book.
The system must organise teaching content from broad annual planning through to individual daily lessons while keeping content reusable, searchable, portable and easy to publish.
The architecture must support hundreds or thousands of lessons without becoming difficult to navigate.
The core hierarchy is:
Year → Subject → Term → Unit → Lesson
Classes sit alongside this curriculum hierarchy as teaching instances. A class references a Year and Subject, then schedules reusable Units and Lessons across the school year.
The system must avoid unnecessary duplication. Units and Lessons are reusable content objects rather than content owned permanently by one class.

## 2. Core Architecture

### 2.1 Curriculum Structure

The primary curriculum hierarchy is:
Year
Subject
Term
Unit
Lesson
Example:
Year 12
English Advanced
Term 1
Artist of the Floating World
Lesson 08: Memory, Identity and Ono
Year and Subject together establish the main curriculum context.
Subject names must remain explicit.
For example:
Year 10 → English
Year 11 → English Advanced
Year 11 → English Standard
Year 12 → English Advanced
Year 12 → English Standard
The system must not treat English Advanced and English Standard as variants hidden beneath a generic senior English subject. They are separate Subjects within their respective Years.

## 3. Year

A Year represents the student year level.
Examples:
Year 7
Year 8
Year 9
Year 10
Year 11
Year 12
A Year contains one or more Subjects.
A Year may also provide a high level overview of all Subjects associated with the teacher.
The Year is primarily an organisational container.
A Year does not directly own Lessons.

## 4. Subject

A Subject represents a curriculum area within a particular Year.
Examples:
Year 8 English
Year 9 Psychology
Year 10 English
Year 11 English Advanced
Year 11 English Standard
Year 12 English Advanced
Year 12 English Standard
Subject is the main curriculum level beneath Year.
Each Subject contains:
Scope and Sequence
Terms
Units
Curriculum Outcomes
Associated Classes
Subject resources
Subject level metadata
A Subject persists independently of a particular class.
This allows the same Subject structure to support several classes across different years or cohorts.

## 5. Scope and Sequence

Each Subject has a Scope and Sequence.
The Scope and Sequence is not a static uploaded document. It is a structured page within the system.
It uses the same underlying block system as other content pages while supporting specialised annual planning functions.
The Scope and Sequence must support:
Annual overview
Term divisions
Unit sequencing
Unit duration
Approximate dates
Curriculum outcomes
Major tasks or milestones
Resource links
Teacher notes
Editable content blocks
A visual year timeline
The timeline view is a core function.
The Scope and Sequence should allow Units to appear across the year according to their planned teaching period.
A Unit displayed within the Scope and Sequence must reference the actual Unit object.
The system must not require the teacher to enter the same Unit separately into the Scope and Sequence and the Unit library.
Editing the Unit title should therefore update its title wherever the Unit is referenced.
The Scope and Sequence provides both:
Document view
Timeline view
These are two representations of the same underlying information.

## 6. Term

Terms provide chronological organisation within a Subject.
Default structure:
Term 1
Term 2
Term 3
Term 4
Terms primarily organise Units and scheduled teaching.
A Unit should normally have a primary Term assignment but must not be technically restricted to one Term.
This supports Units which begin late in one Term and continue into the next.
Terms should therefore function as planning periods rather than rigid ownership containers.

## 7. Unit

A Unit is a reusable curriculum object.
A Unit belongs to a Year and Subject.
Example:
Year 12
English Advanced
Artist of the Floating World
The Unit contains:
Unit title
Description
Unit overview
Curriculum outcomes
Learning goals
Planned duration
Primary Term
Optional start and end periods
Unit resources
Lesson sequence
Editable Unit page blocks
Teacher only content
Student visible content
Unit metadata
The Unit page must support both automatic and manually authored content.
Automatically generated content includes:
Lesson sequence
Current lesson where relevant
Unit navigation
Associated resources
Curriculum information
Manually authored content may include:
Unit introduction
Videos
Images
Reading material
Key concepts
Important links
Extension material
Announcements
Custom HTML interactions
The same Unit may be used by more than one Class.
A Unit should not need duplication merely because two Classes study it.

## 8. Lesson

A Lesson is a reusable teaching content object.
A Lesson belongs to a Unit.
The Lesson contains the actual teaching material.
This includes both teacher only and student visible content.
The teacher view renders all permitted Lesson content.
The student view renders only student visible content.
There must not be separate teacher and student Lesson documents.
Both views derive from the same Lesson data.
A Lesson contains:
Permanent Lesson ID
Title
Slug
Unit reference
Sequence position
Suggested duration
Curriculum outcome references
Blocks
Teacher only blocks
Student visible blocks
Resources
Tags
Draft version
Published version
Version history
Created date
Modified date
Publication information
Lessons should have an intended sequence within their Unit.
For example:
Lesson 01
Lesson 02
Lesson 03
The sequence number is independent of the date on which a particular Class studies the Lesson.
This distinction is important.
Lesson order belongs to the Unit.
Teaching date belongs to the Class schedule.

## 9. Class

A Class represents a real teaching group.
Examples:
10ENGA 2026
11ENGADV1 2026
12ENGSTD2 2027
The precise naming format should remain configurable, but every Class must have a unique Class code.
A Class references:
Academic year
Year level
Subject
Class code
Display name
Active Units
Schedule
Current Unit
Current Lesson
Optional Class homepage blocks
Class specific overrides where required
A Class does not permanently own Units or Lessons.
Instead, it references reusable curriculum content.
Example:
Class:
12ENGADV1 2026
References:
Year 12
English Advanced
Unit: Artist of the Floating World
Lesson: Memory and Identity
Date: 12 August 2026
Another Class may reference the same Unit and Lesson on another date.

## 10. Scheduled Lesson

A Scheduled Lesson connects reusable curriculum content with actual classroom delivery.
This is a distinct object from the Lesson itself.
A Scheduled Lesson references:
Class
Lesson
Date
Sequence within the Class schedule
Optional start time
Optional duration override
Teaching status
Optional Class specific content overrides
Optional teacher notes related to this particular delivery
Example:
Class:
12ENGADV1 2026
Lesson:
Memory, Identity and Ono
Scheduled date:
12 August 2026
The Lesson itself remains reusable.
If the same Lesson is taught to another Class:
12ENGADV2 2026
Scheduled date:
14 August 2026
Both Scheduled Lessons reference the same underlying Lesson.
This provides chronology without permanently attaching dates to reusable curriculum content.

## 11. Class Specific Overrides

Class specific Lesson modification is expected to be uncommon, but the architecture must support it.
When editing a shared Lesson from within a Class context, the teacher must have two clear choices:
Edit Master Lesson
Customise for This Class
Edit Master Lesson modifies the reusable Lesson and therefore affects every Class using it.
Customise for This Class creates an override associated with the Scheduled Lesson or Class.
Overrides should store only the changed information where practical.
The interface must clearly identify customised content.
The system should avoid silently creating duplicate Lessons.

## 12. Student Lesson Page

Each published Lesson produces a stable student facing page.
Students do not log in.
The student page reads the published version of the Lesson.
The student page must include persistent navigation to:
Class Page
Unit Page
Previous Lesson
Next Lesson
The page should also display a clickable breadcrumb.
Example:
Year 12 → English Advanced → Artist of the Floating World → Memory, Identity and Ono
The student page must render effectively on:
Desktop
Tablet
Phone
A4 print
The student page should contain significantly fewer interface controls than the teacher workspace.

## 13. Class Homepage

Every Class receives a student facing Class homepage.
The Class homepage uses a hybrid model.
Some content is generated automatically from the system.
Other content is manually editable through the block builder.
Automatically generated sections may include:
Current Unit
Current Lesson
Recent Lessons
Lesson chronology
Unit list
Important resources
Upcoming published Lessons where enabled
Teacher authored sections may include:
Welcome information
Announcements
Images
Links
Embedded content
Reference resources
Revision material
Custom collections
The Class homepage must never require manual maintenance of the Lesson list.
Lesson navigation derives automatically from the Class schedule.

## 14. Unit Page

Every Unit has a student facing Unit page when published.
Like the Class homepage, the Unit page uses a hybrid model.
Automatic sections may include:
Unit title
Unit overview
Lesson sequence
Current Lesson where Class context exists
Curriculum information where appropriate
Shared resources
Navigation
Teacher authored sections may include:
Introductory material
Key concepts
Images
Videos
Documents
Maps
Interactive content
Extension material
Reference material
The Lesson sequence must derive from actual Lesson relationships.
The teacher should never maintain a separate manually typed Lesson index.

## 15. Navigation Model

Navigation reflects the information hierarchy without forcing every level into the student interface.
Teacher navigation uses the full structure.
Typical teacher navigation:
Year
Subject
Scope and Sequence
Term
Unit
Lesson
Class
Schedule
Student navigation is simpler.
Typical student navigation:
Class
Unit
Lesson
Previous Lesson
Next Lesson
Breadcrumb navigation provides upward movement through the content hierarchy.
Navigation references object IDs rather than manually entered URLs.

## 16. URL Structure

All public content requires readable URLs.
Example Class URL:
```
/classes/12engadv1/
```

Example Unit URL:
```
/year 12/english advanced/artist of the floating world/
```

Example Lesson URL:
```
/year 12/english advanced/artist of the floating world/memory and identity/
```

Final technical URLs should use web safe slugs.
Conceptually:

```
/year 12/english advanced/artist of the floating world/
```

becomes:
```
/year12/english advanced/artist of the floating world/
```

The precise route syntax will be defined in the technical specification.
Human readable slugs must not function as permanent identifiers.
Every content object receives an immutable internal ID.
Changing a title or slug must not break internal relationships.
Where a published slug changes, previous published URLs should redirect to the current URL where practical.

## 17. Identity

Every major object receives an immutable ID.
This includes:
Subject
Class
Scope and Sequence
Unit
Lesson
Scheduled Lesson
Block
Template
Curriculum Outcome
IDs must never depend solely on display names.
Example conceptual IDs:
subject_y12_engadv
class_2026_12engadv1
unit_aotfw
lesson_aotfw_008
scheduled_2026_08_12_aotfw_008
Human readable IDs are acceptable where uniqueness is enforced.
The architecture should not depend on random unreadable identifiers where a stable readable ID serves the same purpose.
Slugs and IDs remain separate concepts.

## 18. Curriculum Outcomes

Curriculum Outcomes are structured objects.
Existing syllabus coding should be preserved.
Examples might include syllabus codes already defined by the relevant curriculum authority.
Each Outcome record should support:
Outcome ID
Official code
Official title
Description
Year or Stage
Subject
Syllabus
Syllabus version
Optional official reference URL
Units and Lessons reference Outcome IDs.
The Outcome wording should not need duplication inside every Lesson.
This allows curriculum mapping across:
Subject
Scope and Sequence
Unit
Lesson
The system should later support visual identification of where each Outcome appears across the year.

## 19. Content Reuse

Reuse is a foundational architectural principle.
The system should support reuse at several levels.
Reusable Unit
Reusable Lesson
Reusable Block
Reusable Block Group
Reusable Composition
Reusable Lesson Template
Reusable Unit Template
The system must distinguish between copying and linking.
Copy creates a new independent object.
Link references the original object.
Linked content remains connected to its source.
When linked content appears inside another document, editing options should include:
Edit Source
Detach
Detach converts the linked content into an independent copy.
Linked content should not be edited locally without an explicit decision.

## 20. Templates

Templates exist at several levels.
Block Template
A predefined configuration for one Block.
Composition Template
A reusable group of Blocks.
Example:
Reading Comprehension Activity
This might contain:
Reading passage
Vocabulary
Literal questions
Inferential questions
Evaluative question
Extension
Lesson Template
A reusable structure for a complete Lesson.
Unit Template
A reusable structure for a Unit.
Template architecture must remain extensible because the teaching workflow will develop over time.
Templates should use the same Block schema as normal content rather than a separate rendering system.

## 21. Scope and Sequence Relationship to Units

The Scope and Sequence acts as the annual planning layer.
Units displayed in the Scope and Sequence are references to Unit objects.
The annual timeline should visually represent:
Term
Unit
Approximate start
Approximate finish
Duration
Overlap where relevant
Major milestones
Curriculum coverage
Moving a Unit within the timeline modifies planning metadata.
It does not duplicate or recreate the Unit.
The Scope and Sequence therefore becomes a functional navigation and planning interface rather than a static record.
Selecting a Unit from the timeline should open the Unit.

## 22. Lesson Sequence and Dates

Two different sequencing concepts must remain separate.
Unit sequence answers:
What order are these Lessons designed to be taught?
Class schedule answers:
When is this Class teaching each Lesson?
A Lesson has a sequence position inside the Unit.
A Scheduled Lesson has a teaching date inside a Class.
This allows Unit design to remain stable while teaching schedules change.
The Class schedule should support dragging or moving Scheduled Lessons between dates without modifying the underlying Lesson.

## 23. Draft and Published Content

Editable content has separate draft and published states.
Draft represents the teacher's current working version.
Published represents the version visible to students.
Saving does not automatically publish.
Students continue seeing the existing published version while the teacher edits the draft.
Publishing deliberately replaces the student facing version.
The architecture must make the difference between:
Saved
Unpublished changes
Published
clear throughout the teacher interface.

## 24. Archive and Trash

Content should not be permanently deleted through normal interface actions.
Objects may have states such as:
Active
Archived
Trashed
Archived content remains available for reference and reuse but disappears from normal active navigation.
Trashed content moves to a recovery area.
Permanent deletion should require a deliberate action from an advanced management interface.

## 25. Search Architecture

The information architecture must support global teacher search.
Search should eventually cover:
Year
Subject
Class
Unit
Lesson
Block content
Title
Curriculum Outcome
Tag
Date
Resource
Template
Search results should show their context.
Example:
Memory and Identity
Lesson
Year 12 → English Advanced → Artist of the Floating World
This prevents similarly titled Lessons becoming ambiguous.

## 26. Student Interaction State

Students do not have accounts.
Where interactive Blocks require temporary state, state should remain on the student's device through browser local storage.
Examples:
Flashcard progress
Revealed answers
Checklist state
Interactive activity progress
The system does not need to associate this information with an identified student.
No student progress tracking system is required.

## 27. Teacher Only Content

Teacher only material uses the same Block architecture as student content.
Each relevant Block includes visibility metadata.
Typical visibility values:
Student and Teacher
Teacher Only
Teacher only Blocks appear normally in the teacher workspace but do not render in student pages.
Where useful, a Teacher Only Block may be associated with a particular student facing Block.
This supports teacher annotations such as:
Suggested questioning
Answers
Differentiation notes
Timing
Teaching reminders
Misconceptions

## 28. Information Architecture Principles

The following rules are mandatory.
Content must have one source of truth.
Lessons must not be duplicated merely because several Classes use them.
Units must remain reusable.
Teaching dates belong to Scheduled Lessons rather than reusable Lessons.
Scope and Sequence Units must reference actual Unit objects.
Class and Unit lesson lists must generate from relationships rather than manual lists.
Teacher and student Lesson views must derive from the same Lesson data.
Public URLs must remain readable.
Internal relationships must rely on immutable IDs.
Saving and publishing must remain separate actions.
Normal deletion must be recoverable.
Linked content must clearly distinguish between source editing and detaching.
Curriculum Outcomes must use structured references.
The system must remain usable with hundreds or thousands of Lessons.
AI functionality must work within this architecture rather than inventing a parallel content structure.

## 29. Primary Relationship Model

The conceptual relationship is:
Year
→ Subject
→ Scope and Sequence
→ Terms
→ Units
→ Lessons
Alongside this:
Class
→ references Year
→ references Subject
→ activates Units
→ schedules Lessons
→ creates Scheduled Lesson records
Student facing navigation then derives from these relationships.
This separates curriculum design from actual classroom chronology while keeping both tightly connected.

## 30. Example

A complete example might be:
Year:
Year 12
Subject:
English Advanced
Class:
12ENGADV1 2026
Scope and Sequence:
Year 12 English Advanced 2026
Term:
Term 2
Unit:
Artist of the Floating World
Lesson:
Memory, Identity and Ono
Unit sequence:
Lesson 08
Scheduled Lesson:
12 August 2026
Student Class page:
12ENGADV1
Student Unit page:
Artist of the Floating World
Student Lesson page:
Memory, Identity and Ono
The same Lesson might also appear as:
Class:
12ENGADV2 2026
Scheduled Lesson:
14 August 2026
Both Scheduled Lessons reference the same reusable Lesson.
No duplicate Lesson content is required.

## 31. Existing Project Precedent

The AI chat interface, AI context management and AI history model should follow the established design from the existing Life Hub website or project.
The Teaching Day Book specification should refer to the Life Hub implementation rather than independently redesigning those systems.
Where Teaching Day Book requirements differ, the implementation should extend the Life Hub precedent rather than replace it.
Detailed AI behaviour will be defined in the dedicated AI specification.

## 32. Future Extension

The information architecture should permit later expansion without requiring a structural rewrite.
Possible future additions include:
Additional Subjects
Additional Year levels
Shared resource libraries
Cross Subject Units
Alternative school calendars
Additional curriculum frameworks
More sophisticated curriculum mapping
Additional template levels
Additional publication destinations
These are not required for the initial build.
The initial architecture should simply avoid preventing them.

## 33. Locked Architecture

For the initial build, the following structure is considered locked:
Year → Subject → Term → Unit → Lesson
Subject owns the Scope and Sequence.
Units and Lessons are reusable.
Class is a teaching instance associated with a Year and Subject.
Classes have unique Class codes.
A Scheduled Lesson connects a Class, reusable Lesson and teaching date.
Scope and Sequence provides both document and annual timeline views.
Class and Unit pages combine generated content with editable Blocks.
Teacher and student views use the same underlying content.
Student interaction state stays on the student's device.
Curriculum Outcomes use structured official codes.
Objects use immutable IDs plus human readable slugs.
Draft and published versions remain separate.
Deletion uses Archive and Trash.
Linked content supports Edit Source and Detach.
AI chat and history follow the existing Life Hub project precedent.
