# Is Where The Architecture Becomes Concrete. I Have Kept The Number Of Primitive Block Types Controlled, While Allowing Variants, Providers, Compositions, And Future Extensions Without Creating Dozens Of Separate Components.

03 BLOCK SYSTEM
## 1. Purpose

This document defines the Block system for the Teaching Day Book.
Blocks are the fundamental units used to construct:
Lessons.
Unit pages.
Class homepages.
Scope and Sequence documents.
Teacher only content.
Student facing content.
Printable A4 resources.
Reusable teaching compositions.
The Block system must provide enough flexibility for rich teaching materials without becoming an unrestricted page builder.
The central principle is:
The schema controls structure.
The renderer controls presentation.
The AI works inside the schema.
The teacher controls the final result.
The AI should not routinely generate arbitrary HTML, CSS, or page structures.

## 2. Core Block Principles

### 2.1 One Block system

Teacher pages, student pages and print pages use the same underlying Blocks.
A Block does not have separate teacher, student and print copies.
Different renderers interpret the same Block according to context.

### 2.2 Controlled flexibility

The system should provide a relatively small set of versatile Block types.
Variations should usually be handled through:
Variants
Settings
Providers
Compositions
Layout rules
rather than creating another Block type.

### 2.3 Blocks are semantic

A Block should describe what content is.
Examples:
reading
image
questions
embed
callout
rather than describing arbitrary visual CSS.
The renderer decides the precise visual implementation.

### 2.4 Blocks are portable

Block content must remain understandable outside the application.
Core teaching content should remain stored in readable JSON.
The Block system must not rely on proprietary binary page structures.

### 2.5 Blocks are individually addressable

Every Block has a permanent Block ID.
This supports:
AI actions on one Block
Drag and drop
Version comparison
Teacher notes attached to a Block
Linked Blocks
Selection
Print controls
Partial editing

## 3. Standard Block Structure

Every Block uses a shared base schema.
Example:
{
"id": "block_l008_004",
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
Required common fields:
id
type
block_type
variant
visibility
content
layout
print
settings
schema_version

## 4. Block Categories

The initial Block library is organised into six categories.
Content
Media
Interactive
Learning Activity
Visualisation
Structure and Utility
These categories organise the builder interface.
They do not require separate storage systems.

## 5. Content Blocks

Initial Content Blocks:
Rich Text
Heading
Callout
Quote
Definition
Table
Accordion
Tabs
Timeline
Rich Text should absorb most ordinary written content.
The system should avoid creating specialised Blocks for every possible text style.

## 6. Rich Text Block

Rich Text is the main written content Block.
Supported content should include:
Paragraphs
Bold
Italic
Underline
Lists
Numbered lists
Links
Inline quotations
Basic emphasis
Inline equations where supported
Example:
{
"id": "block_001",
"block_type": "rich_text",
"variant": "medium",
"visibility": "student_teacher",
"content": {
```
    "html": "<p>Content</p>"
```

}
}
Rich Text should use sanitised structured HTML or another validated rich text representation.
The editor must not permit unrestricted script execution.

## 7. Heading Block

Heading provides explicit document hierarchy.
Suggested levels:
page
section
subsection
Example:
{
"block_type": "heading",
"variant": "section",
"content": {
"text": "Memory and Identity"
}
}
Headings should participate in:
Page navigation
Accessibility structure
Automatic contents lists
Print pagination
AI understanding of section boundaries

## 8. Callout Block

Callout highlights supporting information.
Semantic styles should replace arbitrary colour selection.
Initial semantic types:
information
important
warning
extension
scaffold
example
remember
teacher
The visual design maps semantic types to the design system.
Example:
{
"block_type": "callout",
"variant": "medium",
"content": {
"style": "extension",
"title": "Extension",
"body": "..."
}
}

## 9. Quote Block

Quote displays textual evidence or significant quotations.
It should support:
Quote text
Attribution
Source
Page or line reference
Optional commentary
Example:
{
"block_type": "quote",
"variant": "medium",
"content": {
"quote": "...",
"attribution": "Kazuo Ishiguro",
"source": "An Artist of the Floating World",
"reference": ""
}
}

## 10. Definition Block

Definition presents a term and explanation.
Example:
{
"block_type": "definition",
"variant": "small",
"content": {
"term": "Unreliable narrator",
"definition": "..."
}
}
Multiple Definition Blocks may later be combined automatically into vocabulary activities or glossaries.

## 11. Table Block

Table supports structured information.
It should support:
Header rows
Header columns
Cell alignment
Merged cells where practical
Responsive mobile rendering
Print repetition of header rows
The schema should store data rather than raw table HTML where practical.
Example:
{
"block_type": "table",
"variant": "large",
"content": {
"headers": [
"Technique",
"Evidence",
"Effect"
],
"rows": []
}
}

## 12. Accordion Block

Accordion contains expandable content.
Uses include:
Answers
Extra detail
Definitions
Hints
Revision content
Teacher supplied explanations
Example:
{
"block_type": "accordion",
"content": {
"items": [
{
"title": "Hint",
"content": "..."
}
]
}
}
Print rendering should expand Accordion content unless the teacher explicitly excludes hidden content.

## 13. Tabs Block

Tabs organise closely related content within one screen region.
Uses include:
Text comparisons
Different perspectives
Worked examples
Source sets
Tabs should degrade into sequential sections in:
Print
Accessibility modes
Contexts without JavaScript

## 14. Timeline Block

Timeline presents ordered events or stages.
This is a lesson content Block.
It is separate from the specialised annual Scope and Sequence timeline renderer.
Timeline should support:
Date
Period
Label
Description
Optional media
Optional links
Horizontal desktop presentation may become vertical on phones.

## 15. Media Blocks

Initial Media Blocks:
Image
Video
Audio
Gallery
Attachment
Media Blocks should use Media Reference objects where relevant.

## 16. Image Block

Image supports:
Single image
Caption
Alt text
Credit
Crop behaviour
Focal point
Aspect ratio
Optional link
Example:
{
"block_type": "image",
"variant": "large",
"content": {
"media_id": "media_001",
"caption": "",
"alt_text": "",
"credit": ""
}
}
Images should load responsive versions where available.
Large source files should not always load at full resolution on student phones.

## 17. Gallery Block

Gallery is a specialised multi image form of media presentation.
The initial implementation may internally use the Image renderer.
Supported layouts may include:
Grid
Carousel
Comparison
The AI should use Gallery only when several images genuinely belong together.

## 18. Video Block

Video handles playable video media.
Possible sources include:
Google Drive
YouTube
Vimeo
Direct media
The Block should use provider specific rendering internally.
Example:
{
"block_type": "video",
"variant": "large",
"content": {
"provider": "youtube",
"external_id": "",
"title": "",
"caption": ""
}
}
The student page should not load heavy video players before needed.
Lazy loading is required.

## 19. Audio Block

Audio handles:
Recorded explanation
Podcast excerpt
Listening task
Oral text
Music where appropriate
Language activity
The Block should provide standard playback controls.
Optional supporting information:
Title
Transcript
Caption
Duration
Download permission

## 20. Attachment Block

Attachment is the universal downloadable file Block.
Do not create separate Block types for:
Word
PDF download
Excel
PowerPoint download
ZIP
Other ordinary files
Attachment identifies file type from Media Reference metadata.
Example:
{
"block_type": "attachment",
"variant": "small",
"content": {
"media_id": "media_worksheet_001",
"display_name": "Lesson Worksheet",
"description": ""
}
}

## 21. Embed Block

Embed is the universal external content Block.
This avoids separate primitive Block types for every external service.
Supported providers should include:
YouTube
Vimeo
Google Slides
Google Docs
Google Drive
PDF viewer
Google Maps
ArcGIS
Desmos
GeoGebra
Canva
Padlet
Generic iframe
Other providers may be added later.
Example:
{
"block_type": "embed",
"variant": "large",
"content": {
"provider": "google_slides",
"url": "",
"embed_url": "",
"title": ""
}
}
Provider behaviour belongs to the renderer.
The AI should select provider metadata rather than writing embed HTML manually.

## 22. Document Viewer Behaviour

PDFs, Slides, Docs and similar resources should normally use Embed rather than separate primitive Block types.
The builder may present friendly insertion actions such as:
Insert PDF
Insert Slides
Insert Document
Internally these produce an Embed Block with the correct provider settings.
This distinction keeps the user interface convenient while keeping the underlying schema small.

## 23. Website Window

A website window is implemented through Embed.
Example:
{
"block_type": "embed",
"content": {
"provider": "website",
```
    "url": "https://example.com",
    "embed_url": "https://example.com"
```

}
}
The renderer must handle sites which reject iframe embedding.
If embedding fails, the Block should fall back to a clear external link card.

## 24. Map

Maps are implemented through Embed where an external map provider supplies the experience.
Possible providers:
Google Maps
ArcGIS
OpenStreetMap based future provider
A custom map experience may later become a dedicated Interactive HTML App.

## 25. Slides

Slide decks are implemented through Embed.
The builder should still expose an obvious Slides insertion option.
Possible providers:
Google Slides
PowerPoint web viewer
Canva presentation
PDF slide deck

## 26. Interactive HTML App Block

Interactive HTML App supports self contained custom learning activities.
Examples:
Interactive diagram
Simulation
Sorting activity
Custom visualisation
Mini game
Interactive reading activity
Specialised lesson widget
Example:
{
"block_type": "html_app",
"variant": "large",
"content": {
"app_id": "app_example",
"title": "Interactive Activity"
},
"settings": {
"sandboxed": true
}
}
HTML Apps must run in a sandbox.
They must not receive teacher authentication state or unrestricted application access.

## 27. HTML App Storage

The Lesson JSON should not contain a large HTML application payload directly.
The Block should reference a stored App object or file.
Example:
{
"app_id": "app_unreliable_narrator_sort"
}
This prevents Lesson files becoming unnecessarily large.

## 28. Code Snippet

Code Snippet is not part of the initial core Block library.
If a later teaching context requires code display, Code Snippet may be added or implemented through a specialised Rich Text extension.
This should not increase initial builder complexity.

## 29. Learning Activity Blocks

Initial Learning Activity Blocks:
Question Set
Flashcards
Cloze
Self Check
The first version should focus on reusable learning structures rather than building a full assessment platform.
Student responses remain local unless a future specification changes this principle.

## 30. Question Set Block

Question Set is the main question activity Block.
It should support several question types within one Block.
Initial question types:
multiple_choice
short_response
extended_response
true_false
reflection
literal
inferential
evaluative
The literal, inferential and evaluative values describe pedagogical purpose rather than response mechanics.
Example:
{
"block_type": "question_set",
"variant": "large",
"content": {
"title": "Comprehension Questions",
"questions": [
{
"id": "q1",
"type": "short_response",
"purpose": "literal",
"prompt": "...",
"answer": "...",
"teacher_guidance": ""
}
]
}
}

## 31. Question Answers

Answers should remain within the teacher accessible data but hidden from student presentation unless explicitly revealed.
Example:
{
"answer_mode": "teacher_only"
}
Possible later modes:
teacher_only
student_reveal
always_visible
Student reveal state should remain local to the student device.

## 32. Response Space

Question Blocks should support expected response length.
Values may include:
none
short
medium
long
extended
This affects:
Screen presentation
A4 answer space
Print pagination
AI sizing decisions
Example:
{
"response_space": "medium"
}
This is more useful than word count alone when estimating print space.

## 33. Flashcards Block

Flashcards should support:
Front
Back
Optional image
Shuffle
Progress through current session
Student progress remains in browser local storage.
No student account is required.

## 34. Cloze Block

Cloze supports missing word activities.
The underlying content should retain:
Full source text
Blank positions
Accepted answers
Optional hints
Teacher answers remain hidden from normal student view.

## 35. Self Check Block

Self Check supports low stakes independent checking.
Examples:
Checklist
Reveal answer
Confidence check
Think then reveal
The system should avoid pretending this data represents formal assessment.
State remains on the student device.

## 36. Future Activity Blocks

Possible future additions include:
Drag and Drop
Matching
Ordering
Poll
Annotation
Image hotspot
These should not enter the initial Block library until there is a clear teaching use case.
HTML App already provides an escape route for specialised interactions.

## 37. Visualisation Blocks

Initial Visualisation Blocks:
Chart
Diagram
Mind Map
Concept Map
Equation
Visualisation should remain distinct from Image where underlying structured data matters.

## 38. Chart Block

Chart stores structured chart data.
Initial chart types:
bar
line
pie
scatter
The system should avoid storing a chart as a screenshot when structured data exists.
Example:
{
"block_type": "chart",
"variant": "large",
"content": {
"chart_type": "bar",
"title": "",
"data": [],
"x_label": "",
"y_label": ""
}
}
Charts should render accessibly and provide a text or table alternative where practical.

## 39. Diagram Block

Diagram supports structured explanatory diagrams.
The initial implementation may support:
Uploaded diagram image
Generated SVG
Structured nodes and connections
The first build does not need a sophisticated diagram editor.
The schema should leave room for future structured diagrams.

## 40. Mind Map Block

Mind Map stores nodes and relationships.
Example:
{
"block_type": "mind_map",
"content": {
"central_node": {},
"nodes": [],
"edges": []
}
}
The renderer may display:
Interactive screen version
Simplified static print version

## 41. Concept Map Block

Concept Map is similar to Mind Map but emphasises labelled relationships.
If implementation complexity becomes excessive, Mind Map and Concept Map may initially share the same renderer with different presets.
They do not need separate technical engines.

## 42. Equation Block

Equation supports mathematical notation.
Content should use a recognised mathematical representation such as LaTeX.
Example:
{
"block_type": "equation",
"variant": "small",
"content": {
"latex": "E = mc^2"
}
}
Inline equations may also exist inside Rich Text.
Equation Block is for prominent standalone mathematical content.

## 43. Structure Blocks

Initial Structure Blocks:
Section
Columns
Spacer
Divider
Navigation Collection
Structure Blocks should remain limited.
The builder should not become an unrestricted design application.

## 44. Section Block

Section groups related Blocks.
Example:
{
"block_type": "section",
"variant": "medium",
"content": {
"title": "Reading"
},
"child_block_ids": [
"block_001",
"block_002"
]
}
Section is the primary nesting mechanism.

## 45. Columns Block

Columns controls side by side desktop layout.
Recommended desktop options:
2 columns
3 columns
Asymmetric 8 and 4
Asymmetric 4 and 8
Asymmetric 7 and 5
Asymmetric 5 and 7
The stored model should use grid proportions rather than arbitrary pixel widths.
Example:
{
"block_type": "columns",
"content": {
"columns": [
{
"width": 8,
"child_block_ids": []
},
{
"width": 4,
"child_block_ids": []
}
]
}
}
Columns stack vertically on narrow screens.

## 46. Mobile Column Order

Every column should preserve an explicit mobile order.
Example:
{
"mobile_order": [
"column_1",
"column_2"
]
}
The renderer must never rely purely on visual desktop position to infer student phone reading order.

## 47. Spacer Block

Spacer provides deliberate breathing room.
Spacer should use controlled sizes:
small
medium
large
Arbitrary pixel spacing should not appear in normal authoring controls.
Spacer should largely disappear or reduce in print mode.

## 48. Divider Block

Divider separates sections visually.
Variants may include:
simple
labelled
section
The design system controls colour and weight.

## 49. Navigation Collection Block

Navigation Collection generates content links from relationships or queries.
Uses include:
All Lessons in this Unit
Recent Lessons
Unit Resources
Extension Materials
Lessons tagged Poetry
The Block stores a query rather than copied link cards.
Example:
{
"block_type": "collection",
"content": {
"source": "lessons",
"filter": {
"unit_id": "unit_aotfw"
},
"sort": "sequence"
}
}
This Block is especially important for Class and Unit homepages.

## 50. Teacher Specific Semantic Blocks

The following teaching concepts should generally use Callout or normal Blocks with semantic presets rather than unique primitive Block types:
Learning intention
Success criteria
Homework
Extension
Support
Scaffold
Teacher note
Warning
Reflection prompt
This keeps the primitive library smaller.
The builder may still present these as named insertion shortcuts.
For example:
Insert Learning Intention
creates:
{
"block_type": "callout",
"content": {
"style": "learning_intention"
}
}
The user experience may therefore contain more friendly Block choices than the underlying schema contains primitive types.

## 51. Primitive Blocks Versus Presets

This distinction is important.
Primitive Block:
callout
Preset:
learning_intention
Preset:
success_criteria
Preset:
extension
Preset:
homework
All four presets use the same underlying Callout renderer.
This reduces:
Code duplication
AI schema complexity
Testing requirements
Design inconsistency
Maintenance burden

## 52. Block Variants

Most Blocks support controlled variants.
Initial standard variants:
small
medium
large
banner
full_page
Not every Block needs every variant.
Each Block definition specifies its allowed variants.
Example:
Heading:
small
medium
large
banner
Image:
small
medium
large
full_page
Spacer:
small
medium
large

## 53. Variant Meaning

Variant describes relative presentation intent.
It does not store exact dimensions.
The renderer translates variant according to context.
Example:
large Image on desktop might occupy eight or twelve grid columns.
large Image on mobile occupies full width.
large Image in A4 print might occupy approximately half a page.
The Block remains:
{
"variant": "large"
}
The renderer decides context specific dimensions.

## 54. Screen Layout Grid

Desktop layout should use a twelve column grid.
Common widths:
3
4
6
8
9
12
The builder should favour standard combinations.
Examples:
6 + 6
8 + 4
4 + 8
3 + 3 + 3 + 3
12
Arbitrary fractional widths are unnecessary.

## 55. Phone Rendering

Phone view prioritises reading order over desktop composition.
General rules:
Blocks stack vertically.
Text uses full available width.
Images scale responsively.
Tables gain horizontal scrolling or mobile transformation.
Columns stack according to mobile order.
Heavy Embeds lazy load.
Navigation becomes compact.
Interactive controls retain appropriate touch target sizes.

## 56. A4 Print Renderer

Every Block has print behaviour.
The A4 print renderer sits in the teacher workspace side panel.
The same Lesson content drives print output.
No separate printable Lesson document exists.

## 57. Print Metadata

Standard print metadata:
{
"print": {
"variant": "medium",
"allow_split": true,
"keep_together": false,
"keep_heading": true,
"start_new_page": false,
"include": true
}
}
Possible properties:
variant
allow_split
keep_together
keep_heading
start_new_page
include

## 58. Print Variant

Screen size and print size may differ.
Example:
{
"variant": "large",
"print": {
"variant": "medium"
}
}
This supports a large interactive screen element becoming more compact on paper.

## 59. Print Splitting

Some Blocks should split across pages.
Typical split Blocks:
Rich Text
Long reading passage
Large Question Set
Table
Some Blocks should normally remain together.
Typical keep together Blocks:
Small Callout
Definition
Image with caption
Short question
Learning intention
Success criteria

## 60. Print Page Breaks

Teacher controls should permit:
Start new page
Keep with next Block
Keep together
Allow split
The A4 preview should show real page boundaries.
A page break inserted through the preview should update Block print metadata rather than inserting arbitrary print HTML.

## 61. Print Design Translation

Teacher glass effects should not print literally.
Print renderer should translate:
Glass surface → clean bordered panel
Translucency → pale or white fill
Shadow → removed or minimal
Navigation controls → removed
Interactive controls → static representation
Accordion → expanded content
Tabs → sequential sections
Video → title, thumbnail and optional URL or QR representation
Audio → title and optional URL or QR representation
Embed → printable preview or link

## 62. A4 Safety Rules

Print fitting must respect minimum readability.
The renderer must not silently reduce content below defined legibility thresholds.
Automatic fitting may adjust:
Spacing
Margins within approved limits
Image variant
Block spacing
Page break placement
It should not silently shrink all text until a Lesson fits.
If content requires another page, the interface should report the real page count.

## 63. Visibility

Initial visibility values:
student_teacher
teacher_only
Example:
{
"visibility": "teacher_only"
}
Teacher renderer:
Displays student_teacher and teacher_only.
Student renderer:
Displays student_teacher only.
Print renderer:
Teacher chooses Teacher Print or Student Print.
Student Print excludes teacher_only content.

## 64. Hidden State

A future hidden state may support temporarily disabled Blocks.
For the initial build, unpublished drafts already cover most of this requirement.
Do not create complex visibility conditions before real use demonstrates a need.

## 65. Block Selection

Selecting a Block in the teacher builder should open contextual controls.
Selected state should display through the Glass design system.
Possible selected Block controls:
Edit
Move
Duplicate
Delete
AI
Variant
Visibility
Layout
Print
Link
Convert
Save as Template
Advanced settings
The Block itself should not permanently show all controls.

## 66. Right Side Inspector

Advanced Block settings belong in the right side panel.
This prevents the Lesson canvas becoming cluttered.
The panel changes according to selected Block.
Possible panel tabs:
Block
AI
Print
Teacher
The A4 print renderer may occupy the same side panel through a dedicated view.

## 67. Drag and Drop

Blocks should support drag and drop ordering.
Drag behaviour must update structural references only.
Moving a Block should not trigger AI.
Moving a Block should not rebuild the site.
Moving a Block should not duplicate content.

## 68. Duplicate Block

Duplicate creates an independent new Block with a new ID.
The copied Block inherits:
Content
Variant
Layout
Print settings
Visibility
It does not retain the original Block ID.

## 69. Delete Block

Delete should remove the Block from the current document.
Recent deletion should support Undo.
Where the Block is shared or linked elsewhere, the system must distinguish:
Remove from this page
Trash source Block
The interface must not accidentally destroy shared content.

## 70. Linked Blocks

A linked Block points to a reusable source.
The linked instance should display a clear linked indicator in teacher view.
Student view should not display implementation details.
Teacher actions:
Edit Source
Detach
Detach duplicates the current source content into a new independent Block.

## 71. Composition

A Composition is an ordered group of Blocks used as one reusable teaching structure.
Examples:
Reading Comprehension
Source Analysis
Compare Texts
Vocabulary Study
Exit Ticket
Worked Example then Practice
Essay Planning Sequence
Composition is central to reducing repeated AI generation.

## 72. Composition Structure

Example:
{
"id": "composition_reading_comprehension",
"title": "Reading Comprehension",
"block_ids": [
"block_reading",
"block_vocabulary",
"block_literal_questions",
"block_inferential_questions",
"block_extension"
]
}
Compositions use ordinary Blocks.
They do not require a separate rendering engine.

## 73. Composition Insertion

When inserting a Composition, the teacher should choose between:
Independent copy
Linked composition
Independent copy creates new Block IDs.
Linked composition maintains relationships to the source structure where supported.
The default for teaching activities should usually be Independent copy because teachers often modify the specific activity.

## 74. AI and Compositions

The AI should prefer approved Compositions when a matching teaching structure exists.
Example request:
Turn this text into a reading comprehension activity.
Preferred AI behaviour:
Locate Reading Comprehension Composition.
Inspect supplied source text.
Determine required Block variants.
Populate approved Block structure.
Return structured Block data.
Preview result.
Wait for teacher acceptance.
The AI should not invent a new page architecture when a suitable Composition already exists.

## 75. AI Block Scope

Default AI scope is Selected Block.
The AI receives:
Selected Block content
Relevant Block schema
Requested action
Necessary teaching context
Small required style instructions
It should not receive:
All Lessons
Entire Subject
Entire Scope and Sequence
Full template library
Long AI conversation history
unless the task genuinely requires broader context.

## 76. AI Section Scope

A teacher may explicitly choose Section scope.
The AI then receives:
Selected Section
Child Blocks
Relevant schema
Necessary nearby context
This supports operations such as:
Reorganise this section.
Turn this section into guided practice.
Condense this section.

## 77. AI Lesson Scope

Whole Lesson scope must be explicit.
Possible uses:
Review Lesson flow.
Generate Lesson from supplied material.
Check alignment between activities and learning intention.
Create an A4 friendly version.
Whole Lesson operations should not become the default because they consume more tokens.

## 78. AI Output Rules

AI generated Blocks must:
Use valid block_type values.
Use valid variants.
Use valid visibility settings.
Pass schema validation.
Use known Composition templates where appropriate.
Avoid arbitrary CSS.
Avoid arbitrary scripts outside HTML App workflow.
Avoid inventing provider URLs.
Avoid altering unrelated Blocks.
Return only the smallest required replacement structure.

## 79. AI Preview

AI output should never immediately overwrite existing Blocks.
The teacher sees:
Original
Proposed result
Accept
Reject
Regenerate
Where practical:
Insert below
Replace
Accept selected parts
Accepted output becomes normal Block data.

## 80. AI Cost Controls

The Block system is a major token control mechanism.
Routine operations must not use AI.
Zero token operations include:
Move Block
Resize Block
Change variant
Change visibility
Change print setting
Duplicate Block
Delete Block
Insert approved template
Reorder Section
Change Columns
Open A4 preview
Publish
Save
Render student page
The AI is reserved for language, reasoning and transformation work.

## 81. Content Sizing

The system should estimate Block space through deterministic rules where practical.
Relevant inputs include:
Block type
Variant
Word count
Paragraph count
Question count
Expected response space
Image ratio
Table dimensions
Layout width
Embed ratio
The AI may suggest a variant.
The renderer remains authoritative for actual layout.

## 82. Automatic Size Suggestion

Example:
A teacher pastes 1200 words and requests Reading Comprehension.
The system or AI may determine:
Reading passage → large
Vocabulary → small
Questions → large
Extension → medium
The teacher remains free to change these variants without generating the content again.

## 83. Block Conversion

Where schemas are compatible, the teacher should be able to convert Blocks.
Examples:
Rich Text → Callout
Rich Text → Quote
Image → Gallery after adding more images
Question Set → Self Check
Callout → Rich Text
Conversion should preserve content where possible.
It should not require AI when deterministic transformation is sufficient.

## 84. Builder Insert Menu

The visible builder menu should use teacher friendly labels.
Suggested initial insert menu:
Text
Heading
Callout
Quote
Definition
Table
Accordion
Tabs
Timeline
Image
Gallery
Video
Audio
File
Embed
Slides
PDF
Website
Map
Interactive App
Questions
Flashcards
Cloze
Self Check
Chart
Diagram
Mind Map
Concept Map
Equation
Section
Columns
Divider
Spacer
Collection
Learning Intention
Success Criteria
Homework
Extension
Scaffold
Teacher Note
The visible menu may therefore contain more entries than the primitive schema.
Several entries map to presets or provider specific forms of the same primitive Block.

## 85. Insert Menu Search

The Insert menu should support text search.
Examples:
Typing PDF finds Embed with PDF provider.
Typing slides finds Embed with Google Slides provider.
Typing homework finds Callout with Homework preset.
Typing learning intention finds Callout with Learning Intention preset.
This keeps the system approachable without increasing schema complexity.

## 86. Recently Used Blocks

The builder should eventually show recently used Block types near the top of the Insert menu.
This is local user convenience.
It does not alter the Block schema.

## 87. Favourite Blocks and Compositions

The teacher should be able to favourite:
Block presets
Compositions
Lesson Templates
Frequently used favourites should appear prominently in the Insert menu.
This becomes increasingly valuable as the template library grows.

## 88. Accessibility

All Blocks must support accessibility appropriate to their type.
Examples:
Images require alt text or decorative status.
Headings retain logical hierarchy.
Tables retain header relationships.
Interactive controls support keyboard use.
Video should support captions where provided.
Audio should support transcript fields where provided.
Colour should not be the sole carrier of meaning.
Embed fallback links should remain available.

## 89. Accessibility Validation

Publishing should warn about clear accessibility problems.
Examples:
Image missing alt text.
Link with no label.
Heading hierarchy issue.
Interactive Block lacking accessible label.
The initial build should prioritise warnings rather than blocking all publication.

## 90. Glass Design System

Teacher Block surfaces should follow the Clinical Glass design precedent.
Normal student content should use more opaque surfaces.
Selected teacher Block:
Blue tinted glass.
Teacher only Block:
Distinct restrained teacher treatment.
Unpublished changed Block:
Subtle amber state.
Normal student Block:
Warm White or near opaque surface.
A4 Block:
Clean print translation.
Detailed visual rules belong in 05 DESIGN SYSTEM.md.

## 91. Block State Feedback

Teacher Blocks should support interface states:
Normal
Selected
Dragging
Saving
Saved
Changed
AI generating
AI proposal
Error
Linked
Teacher only
The state must remain visually clear without excessive animation.

## 92. Loading Behaviour

Heavy Blocks should lazy load.
Examples:
Video
External website
Map
Large document viewer
Interactive HTML App
Slides
The initial Lesson page should prioritise text and essential navigation.
This improves student phone performance.

## 93. Failed Embed Behaviour

If an external provider fails:
The rest of the Lesson must continue rendering.
The Block should show:
Resource title
Failure state
Open externally action
Teacher view should expose additional diagnostic information.

## 94. Missing Media Behaviour

If Media Reference fails:
Student view should show a restrained unavailable resource state.
Teacher view should identify:
Missing file
Restricted permission
Provider error
Unknown state
Publishing should warn before student visible restricted media goes live.

## 95. Google Drive Integration

Google Drive is the preferred initial provider for uploaded teaching files.
The builder should support selecting a Drive resource and automatically determining its appropriate presentation.
Examples:
Image → Image Block.
Video file → Video Block.
PDF → Embed with PDF viewer.
Google Slides → Embed.
Google Doc → Embed.
General file → Attachment.
The teacher should not need to manually determine provider configuration.

## 96. Provider Independence

Block schemas must not depend on Google Drive.
Provider details remain inside Media Reference or Embed configuration.
This allows future support for other storage providers without rewriting Lessons.

## 97. Student Local State

Blocks requiring temporary student interaction state use browser local storage.
Examples:
Flashcard position
Revealed answers
Self Check selections
Accordion state where useful
No student identity is required.
This state should not influence teacher data or publishing.

## 98. Block Versioning

Lesson version history captures Block states.
Individual Block version history does not require a separate complex system in the first build.
A restored Lesson version restores its Block structure.
Shared source Blocks may require their own versions later.

## 99. Schema Registry

All Block definitions should exist in a central Block registry.
The registry should define for each Block:
block_type
display name
category
icon
allowed variants
default variant
content schema
settings schema
layout capabilities
print capabilities
visibility capabilities
AI capabilities
renderer
student renderer
print renderer
Example conceptual structure:
{
"block_type": "image",
"display_name": "Image",
"category": "media",
"allowed_variants": [
"small",
"medium",
"large",
"full_page"
],
"default_variant": "medium"
}

## 100. Block Registry as Source of Truth

Cursor should not duplicate Block definitions throughout the codebase.
The registry should drive:
Insert menu
Validation
AI schema
Inspector controls
Renderer selection
Allowed variants
Print controls
Default settings
This is an important maintainability rule.

## 101. Unknown Block Types

If an imported Lesson contains a Block type unsupported by the current application:
Do not crash the Lesson.
Teacher view should show an Unsupported Block placeholder.
The original JSON should remain preserved.
This protects content portability and future migrations.

## 102. Schema Migration

Block schemas include schema_version.
When Block structures change, migration functions update older versions.
Migration should preserve original content.
Large migrations should support backup before conversion.

## 103. Initial Primitive Block Library

The initial primitive Block library is:
rich_text
heading
callout
quote
definition
table
accordion
tabs
timeline
image
gallery
video
audio
attachment
embed
html_app
question_set
flashcards
cloze
self_check
chart
diagram
mind_map
concept_map
equation
section
columns
spacer
divider
collection
This is the initial schema library.
Do not create additional primitive Block types during implementation without a clear reason.

## 104. Initial Preset Library

Initial presets should include:
Learning Intention
Success Criteria
Homework
Extension
Scaffold
Teacher Note
Important
Example
Remember
Reflection
Reading Comprehension
These presets reuse primitive Blocks or Compositions.

## 105. Initial Composition Library

Suggested first Compositions:
Reading Comprehension
Vocabulary Study
Source Analysis
Compare Texts
Worked Example and Practice
Discussion Sequence
Reflection Exit Ticket
Essay Planning
These should remain editable.
The exact teaching structures will develop through use.

## 106. Block System Acceptance Rules

A Block system implementation is acceptable when:
A teacher inserts Blocks without writing code.
Blocks reorder without AI.
Blocks resize through approved variants without AI.
Teacher only Blocks disappear from student view.
The same Block data renders on desktop, phone and A4.
A4 settings do not alter student screen layout unless explicitly intended.
AI operates on selected Blocks without receiving the entire Lesson by default.
AI output passes Block schema validation.
Embed providers use one shared Embed architecture.
Google Drive resources insert through appropriate Blocks.
Collections generate links from relationships rather than copied lists.
Compositions insert reusable teaching structures.
Linked Blocks support Edit Source and Detach.
Heavy media lazy loads.
Missing media does not break the Lesson.
Arbitrary HTML runs only through the sandboxed HTML App system.
Student interaction state remains local.
The Block registry remains the central source of truth.
Blocks remain readable and exportable as JSON.
The system remains manageable as the Block library grows.

## 107. Locked Block Decisions

The following decisions are locked for the initial build.
One Block system serves teacher, student and print contexts.
Primitive Block types remain deliberately limited.
Presets provide teacher friendly specialised options without expanding the primitive schema unnecessarily.
Embed is the universal external content architecture.
Slides, PDFs, websites and maps use Embed providers rather than separate underlying Block systems.
Attachment is the universal downloadable file Block.
Code Snippet is excluded from the initial core library.
HTML App provides the controlled escape route for specialised interactive experiences.
The desktop layout uses a twelve column grid.
Mobile layouts stack according to explicit reading order.
Standard variants are small, medium, large, banner and full_page where appropriate.
Screen and print variants may differ.
A4 behaviour is stored as structured Block metadata.
Teacher only content uses Block visibility.
Student interaction state stays in local browser storage.
Section is the main nesting mechanism.
Maximum conceptual nesting remains Page → Section → Block.
Unlimited recursive nesting is prohibited.
Compositions group approved Blocks into reusable teaching structures.
AI should prefer existing Compositions over inventing new Lesson structures.
AI scope defaults to the selected Block.
Routine Block operations use zero AI tokens.
AI output requires teacher acceptance.
AI generated Blocks must pass the same schema validation as manually created Blocks.
Google Drive is the preferred initial media provider.
Media and Embed architecture remains provider independent.
The central Block registry drives validation, rendering and builder controls.
The visual treatment follows the Clinical Glass design system in teacher view.
Student presentation uses a simpler, more opaque interpretation.
Print presentation removes unnecessary glass effects and interactive controls.
