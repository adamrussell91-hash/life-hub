# Design System

## 1. Purpose

This document defines the visual design system for the Teaching Day Book.
The design system applies across:
Teacher Workspace.
Student Class Pages.
Student Unit Pages.
Student Lesson Pages.
A4 Print output.
Builder controls.
AI interface.
Scope and Sequence views.
Interactive Blocks.
System feedback states.
The system takes its visual direction from the existing Clinical Glass Dashboard Style Guide.
The Teaching Day Book should adapt this visual language for education rather than reproduce a clinical dashboard.
The core design goal is:
A calm, premium, highly legible teaching workspace built from warm surfaces, maritime navy, controlled glass layers and selective blue and amber emphasis.
Consistency takes priority over unrestricted visual customisation.

## 2. Design Principles

### 2.1 Glass establishes hierarchy

Glass effects should communicate interface structure.
Good uses include:
Navigation.
Floating controls.
Selected Blocks.
Inspector panels.
AI panel.
A4 preview panel.
Search.
Menus.
Dialogs.
Status surfaces.
Glass should not sit behind every paragraph or activity.
Dense teaching content requires stronger opacity.

### 2.2 Content comes first

Every decorative decision must preserve comprehension.
Student reading passages, instructions, questions and resources should remain immediately readable.
The interface should never sacrifice text contrast for translucency.

### 2.3 Quiet interface

The product is used throughout the school day.
The interface should avoid:
Constant animation.
Bright competing colours.
Excessive shadows.
Large gradients behind reading content.
Overloaded toolbars.
Decorative widgets without teaching value.
The design should remain calm during extended use.

## 3. Colour System

The initial colour system comes from the existing Clinical Glass design language.
### 3.1 Depth

Hex:
#0A1536
Primary uses:
Main teacher navigation.
Highest importance headings.
Dark structural regions.
Strong contrast controls.
Selected dark surfaces.

## 4. Marine

Hex:
#142B51
Primary uses:
Secondary navigation surfaces.
Panel structure.
Dark supporting regions.
Chart detail.
Dark hover states.

## 5. Orca

Hex:
#424860
Primary uses:
Secondary text.
Inactive controls.
Metadata.
Supporting labels.
Less prominent navigation.

## 6. Shallow

Hex:
#A7ABB9
Primary uses:
Dividers.
Secondary borders.
Muted interface detail.
Placeholder states.
Supporting metadata.

## 7. Wave

Hex:
#376FB7
Primary uses:
Selection.
Links.
Standard actions.
Progress.
Active controls.
Focus state.
Selected Block treatment.

## 8. High Sea

Hex:
#F68620
Primary uses:
Primary decisive action.
Publish.
Important warning.
Action required.
Unpublished change emphasis.
High priority AI action where appropriate.
High Sea must remain selective.
If orange appears everywhere, its meaning disappears.

## 9. Shore

Hex:
#EAE7DA
Primary uses:
Quiet supporting panels.
Empty states.
Secondary page regions.
Subtle teaching callouts.
Print friendly supporting backgrounds.

## 10. Sand

Hex:
#F0CFAC
Primary uses:
Warm supporting callouts.
Low urgency emphasis.
Scaffold content.
Reflective content.
Supporting teaching prompts.

## 11. Warm White

Hex:
#FAF8F2
Primary uses:
Main page canvas.
Reading surfaces.
Student content.
Lesson canvas.
Print inspired content areas.
Warm White is the default light surface.
Pure white should be used selectively.

## 12. Semantic Colour

Colour should represent meaning rather than arbitrary teacher choice.
Examples:
Wave:
Selected.
Active.
Link.
Standard action.
High Sea:
Publish.
Important action.
Warning requiring attention.
Unpublished change.
Sand:
Scaffold.
Support.
Reflection.
Shore:
Neutral supporting material.
Depth:
Navigation.
Strong structural hierarchy.
The teacher does not receive unrestricted colour pickers in the initial build.

## 13. Status Colour Rules

Status must never rely on colour alone.
Every state should combine at least two signals such as:
Colour.
Icon.
Label.
Border treatment.
Examples:
Unpublished Changes:
Amber treatment plus text label.
Save Failed:
Error icon plus text.
Teacher Only:
Teacher icon plus label.
Selected:
Wave border plus selected surface.
Linked:
Link icon plus label.

## 14. Glass Surface Recipe

Standard teacher glass surfaces should use:
Warm White at controlled opacity.
Fine border.
Low opacity inner highlight.
Gentle background blur.
Wide low opacity shadow.
Strong enough opacity for readable content.
Glass should feel layered rather than glossy.
Avoid:
Mirror effects.
Strong shine.
Heavy gradients.
Large glowing edges.
Excessive blur.

## 15. Glass Strength Levels

The system should define controlled glass levels rather than allow arbitrary blur and opacity.
Suggested levels:
Glass 1.
Glass 2.
Glass 3.
Opaque.

## 16. Glass 1

Lightest glass treatment.
Use for:
Floating controls.
Compact menus.
Small filters.
Temporary overlays.
Requires a visually calm background.

## 17. Glass 2

Standard teacher interface surface.
Use for:
Inspector.
Search.
AI panel.
Context controls.
Selected interface cards.

## 18. Glass 3

Dense glass.
Use for:
Panels containing substantial text.
Navigation regions where background colour remains visible.
Teacher notes.
Complex controls.

## 19. Opaque

Use for:
Long reading passages.
Question Sets.
Tables.
Dense lesson content.
Student reading surfaces.
Print derived content.
Glass hierarchy must never reduce reading quality.

## 20. Teacher Workspace Background

The teacher workspace should use a warm light base rather than pure white.
Default base:
Warm White.
Large areas should remain visually calm.
Subtle background depth may appear near navigation or structural panels.
Avoid decorative page backgrounds behind the Lesson canvas.

## 21. Student Background

Student pages should use a cleaner version of the same palette.
Primary background:
Warm White.
Content cards:
Warm White or slightly lighter opaque surfaces.
Subtle Shore regions may separate major page sections.
Strong navy should remain concentrated in:
Header.
Navigation.
Key labels.
Student pages should feel like learning material rather than software administration.

## 22. Teacher Navigation Rail

The teacher navigation rail should use Depth or Marine.
Characteristics:
Fixed position on desktop.
Strong contrast.
Crisp text.
Thin line icons.
Clear selected state.
Minimal decoration.
Expanded and compact modes.
Selected items should use a visible Wave treatment.
Nested items should communicate hierarchy through spacing and indentation.

## 23. Navigation Hierarchy

Visual hierarchy should distinguish:
Year.
Subject.
Term.
Unit.
Lesson.
Recommended approach:
Year receives strongest section treatment.
Subject receives strong label treatment.
Term acts as a clear divider.
Unit receives medium hierarchy.
Lesson receives compact navigation treatment.
Do not rely on progressively smaller unreadable typography.
Use spacing, weight and indentation together.

## 24. Top Context Bar

The Context Bar should use a restrained translucent surface.
It should visually float above the Lesson workspace without becoming dominant.
Typical contents:
Title.
Context.
Save state.
Student View.
Share.
Publish.
The Lesson title remains the strongest element.
Publish uses High Sea when available as an action.
Student View and standard controls use Wave or neutral secondary treatments.

## 25. Main Lesson Canvas

The Main Canvas should resemble a refined document surface.
Suggested characteristics:
Warm White.
Generous outer breathing room.
Controlled maximum width.
Subtle Block separation during editing.
No permanent heavy card border around every piece of content.
Block boundaries should appear more strongly during:
Hover.
Selection.
Dragging.
AI proposal.
Teacher Only state.
Normal student visible content should resemble the final reading experience.

## 26. Block Surface Philosophy

Blocks should not all look like separate dashboard cards.
This is important.
A page made from dozens of permanently boxed cards will feel fragmented.
Instead:
Plain text may sit directly on the Lesson canvas.
Headings sit directly on the page.
Images sit cleanly within the flow.
Callouts use clear contained surfaces.
Question Sets use structured panels.
Interactive content uses contained surfaces.
Teacher controls appear around content when selected.
This keeps Lessons visually coherent.

## 27. Selected Block

Selected Block treatment should use:
Wave tinted border.
Subtle blue glass surface.
Small elevation increase.
Visible but restrained Block label where useful.
Inspector activation.
Selection must not cause the page layout to jump.

## 28. Hovered Block

Hover treatment should remain lighter than Selection.
Possible treatment:
Fine border becomes visible.
Small Block controls appear.
Minor elevation change.
Avoid major colour shifts on every mouse movement.

## 29. Teacher Only Block

Teacher Only Blocks require clear differentiation.
Recommended treatment:
Soft Sand or Shore tinted surface.
Teacher icon.
Teacher Only label.
Optional dashed or specialised border.
Text remains dark and readable.
The treatment should remain distinct from warning states.

## 30. Unpublished Changed Block

Where Block level changed state is displayed, use a subtle High Sea indicator.
Possible treatment:
Small amber dot.
Thin amber side marker.
Unpublished label on hover or inspection.
Do not fill the entire Block bright orange.
The overall Lesson Context Bar remains the primary publication status indicator.

## 31. Linked Block

Linked content should receive a small linked state in teacher view.
Possible treatment:
Link icon.
Source label.
Subtle border marker.
Student view should display normal content with no linked indicator.

## 32. AI Proposal Block

AI proposed content should remain visually separate from accepted Lesson content.
Recommended treatment:
Wave tinted proposal surface.
AI label.
Compare controls.
Accept.
Reject.
Regenerate.
The proposal should not look identical to committed content before acceptance.

## 33. Error Block

When Block content fails to render, teacher view should use a clear contained error state.
Display:
Error label.
Affected resource.
Likely reason where known.
Recovery action.
The rest of the Lesson remains usable.
Student fallback should be simpler and less technical.

## 34. Typography

Typography should favour high legibility.
Preferred families include:
Inter.
Manrope.
Geist.
The initial release should use one primary interface family.
Inter is a sensible initial default because of its readability and broad support.
Avoid mixing several font families.

## 35. Type Roles

The system should define semantic typography roles.
Suggested roles:
Display.
Page Title.
Section Heading.
Subsection Heading.
Body.
Small Body.
Label.
Metadata.
Button.
Caption.
Quote.
Data.
Roles should map to fixed design tokens.
Teachers should not set arbitrary font sizes.

## 36. Body Text

Student body text must remain comfortable for sustained reading.
Desktop body text should use a controlled readable line length.
Phone body text must not shrink to fit desktop layouts.
Reading passages may use a slightly larger line height than compact interface text.

## 37. Heading Hierarchy

Heading size should communicate structure clearly.
Suggested hierarchy:
Page Title.
Section Heading.
Subsection Heading.
Block Heading.
The system should avoid excessive heading levels.
Visual size and semantic heading level should remain aligned.

## 38. Font Weight

Use a restrained set of weights.
Suggested:

Regular.
Medium.
Semibold.
Bold only where strong emphasis is required.
Avoid excessive heavy typography across entire pages.

## 39. Line Length

Long prose requires a controlled reading width.
Recommended design principle:
Dense prose should remain narrower than wide visual content.
Images, charts and tables may extend wider.
The renderer should permit different maximum widths according to Block type.

## 40. Spacing System

Spacing should use a fixed scale.
Suggested conceptual scale:
XS.
S.
M.
L.
XL.
XXL.
The implementation should map these values to design tokens.
Block spacing should not use arbitrary teacher entered pixel values.

## 41. Vertical Rhythm

Pages should establish predictable spacing relationships.
Examples:
Heading to paragraph.
Paragraph to paragraph.
Section to Section.
Image to caption.
Question to response space.
Callout to surrounding content.
Consistent spacing helps the Block system feel like one document rather than assembled fragments.

## 42. Border Radius

The Glass system should use controlled rounded corners.
Suggested categories:
Small.
Standard.
Large.
Pill.
Pill should be reserved for:
Chips.
Filters.
Compact statuses.
Tags.
Large content panels should use Standard or Large radius.
Avoid excessive rounded containers around every paragraph.

## 43. Borders

Borders should remain fine and restrained.
Teacher Glass surfaces may use tinted Marine or Wave borders at low opacity.
Student content uses stronger simple borders only where structure benefits from them.
Print uses clean neutral borders.

## 44. Shadows

Teacher Workspace shadows should remain:
Broad.
Soft.
Cool toned.
Low opacity.
Student content uses minimal shadow.
Print removes shadows.
Avoid heavy card shadows.

## 45. Iconography

Use a consistent thin lined geometric icon set.
Icons should support labels rather than replace clear language where meaning is uncertain.
Primary use:
Navigation.
Block insertion.
Status.
Inspector controls.
AI actions.
Print.
Media type.
Link state.
Teacher Only state.
Icons should use consistent stroke weight.

## 46. Button Hierarchy

Buttons should use clear hierarchy.
Primary.
Secondary.
Tertiary.
Destructive.

## 47. Primary Button

Use for one decisive action within a context.
Examples:
Publish.
Accept AI Proposal.
Create Lesson.
Primary actions may use:
High Sea for major decisive action.
Wave for standard primary action.
Only one dominant primary action should usually appear in a local region.

## 48. Secondary Button

Use for supporting actions.
Examples:
Student View.
Copy Link.
Preview.
Duplicate.
Secondary buttons should use:
Translucent surface.
Fine border.
Wave or Depth text.

## 49. Tertiary Button

Use for low emphasis actions.
Examples:
More.
Cancel.
Close.
Minor layout control.
Tertiary actions should often appear as text or icon controls.

## 50. Destructive Button

Destructive actions require a dedicated semantic state.
Examples:
Move to Trash.
Permanent Delete.
Do not reuse High Sea simply because the action is important.
A separate destructive colour token should be defined during implementation.
The destructive colour must meet accessibility contrast requirements.

## 51. Button Labels

Labels should remain explicit.
Preferred:
Publish.
Copy Student Link.
Add from Drive.
Open Student View.
Move to Trash.
Avoid vague labels such as:
Go.
Do.
Continue.
Proceed.

## 52. Chips

Chips are suitable for:
Outcomes.
Tags.
Filters.
Status.
Class codes.
Block metadata.
Selected chips require a clear visual state.
Chips should not replace full buttons for major actions.

## 53. Inputs

Text inputs should use simple, high contrast surfaces.
Teacher Workspace inputs may use restrained glass styling where content remains clear.
Long form content editing should feel closer to document editing than filling out a database form.

## 54. Rich Text Editing

Rich Text controls should appear contextually.
Avoid a permanently large formatting toolbar.
Suggested behaviour:
Selecting text reveals compact formatting controls.
Keyboard shortcuts remain supported.
Common actions remain familiar.
The editor should not expose raw HTML during normal use.

## 55. Menus

Menus should use Glass 2 surfaces.
Characteristics:
Clear grouping.
Readable labels.
Icons where useful.
Search where menu size is large.
Strong selected and hover states.
Menus should close predictably and support keyboard navigation.

## 56. Dialogs

Dialogs should be reserved for tasks requiring focus.
Examples:
Publication warnings.
Permanent deletion.
Class customisation decision.
Restore version.
Complex media selection.
Routine Block editing should remain inside the Inspector rather than opening repeated dialogs.

## 57. Right Panel

The Right Context Panel should use Glass 2 or Glass 3 depending on density.
It should remain visually distinct from the Lesson canvas.
Panel header should clearly state current mode:
Block.
AI.
A4 Print.
Page.
Transitions between modes should remain quick and restrained.

## 58. Inspector Design

Inspector controls should be grouped by task.
Suggested order:
Content specific controls.
Variant.
Visibility.
Layout.
Print.
Reuse.
Advanced.
Do not display irrelevant settings.

## 59. AI Panel Design

The AI panel should follow the established Life Hub AI visual and history design.
Teaching Day Book additions should include:
Current scope indicator.
Selected content reference.
Proposal state.
Token conscious scope controls.
The AI interface should visually belong to the same Glass system.

## 60. AI Scope Indicator

Scope deserves a persistent compact visual treatment.
Examples:
Selected Block.
Current Section.
Whole Lesson.
Unit.
Broader scopes should appear progressively more prominent because they involve more context.
The teacher should always understand what material the AI receives.

## 61. A4 Print Panel Design

A4 Preview should visually resemble a physical page.
Use:
White page surface.
Subtle page shadow on screen.
Visible page edge.
Neutral surrounding panel.
Actual page proportions.
The preview should not use glass inside the printable page.
The surrounding controls remain part of the Glass teacher interface.

## 62. A4 Page Surface

A4 output should use:
White or near white paper background.
Dark text.
Minimal colour.
Controlled pale callout fills.
No blur.
No translucent background dependence.
No decorative shadow in exported output.

## 63. Student Header

Student page header should be compact.
Suggested treatment:
Depth or Marine structural region.
Warm White content area.
Wave links.
Restrained glass navigation where contrast remains strong.
The header should not consume a large portion of a phone screen.

## 64. Student Lesson Surface

Student Lesson content should feel closer to a well designed learning resource than a dashboard.
Use:
Clear heading hierarchy.
Generous spacing.
Minimal card fragmentation.
Readable text widths.
Contained interaction areas.
Strong media presentation.
Simple navigation.

## 65. Student Class Page

Class Page design should give prominence to:
Current Unit.
Current Lesson.
Recent Lessons.
Teacher authored material.
Current Lesson should receive the strongest student action treatment.
Avoid dashboard metric cards.
This is a navigation and learning page.

## 66. Student Unit Page

Unit Page should communicate sequence.
Visual hierarchy should emphasise:
Unit title.
Overview.
Current position.
Lesson sequence.
Supporting resources.
Completed or previous Lessons may use a quieter treatment.
Current Lesson receives stronger emphasis.
Future unpublished content does not appear.

## 67. Lesson Navigation Buttons

Lesson navigation should use consistent controls.
Desktop:
Previous Lesson.
Back to Unit.
Next Lesson.
Phone:
Previous.
Unit.
Next.
Class navigation may sit in the header or compact menu.
Navigation controls should remain visually distinct from activity buttons inside the Lesson.

## 68. Breadcrumb Design

Desktop breadcrumb should use muted text with clear clickable levels.
Current page appears as the final non interactive item.
Breadcrumb should remain visually secondary to the Lesson title.
Phone breadcrumb should collapse into a simpler Back to Unit interaction where necessary.

## 69. Learning Intention Preset

Learning Intention uses a Callout preset.
Suggested visual behaviour:
Clear label.
Calm Wave related accent.
Opaque or dense glass student surface.
Compact layout.
It should remain noticeable without dominating the Lesson.

## 70. Success Criteria Preset

Success Criteria should visually relate to Learning Intention without appearing identical.
It may use:
Structured checklist.
Clear label.
Supporting Wave or neutral accent.
The design should emphasise readability and action.

## 71. Extension Preset

Extension uses a restrained warm accent.
Sand is appropriate.
The design should communicate optional challenge rather than warning.

## 72. Scaffold Preset

Scaffold should use a calm supportive surface.
Suitable treatments include:
Shore.
Sand.
Light Wave accent.
The visual language should distinguish scaffold from extension and warning.

## 73. Homework Preset

Homework should use a clear semantic label and compact contained surface.
Avoid using warning colours unless urgency is present.

## 74. Warning Preset

Warning should use clear attention styling.
The final implementation should define an accessible warning token.
Colour must appear alongside:
Warning icon.
Warning label.
Clear action.

## 75. Teacher Note Preset

Teacher Note is visible only in teacher contexts.
Suggested treatment:
Soft Sand or Shore surface.
Teacher icon.
Compact label.
Teacher Notes should remain readable during teaching without being confused with student content.

## 76. Question Set Design

Question Sets should feel structured but not overly boxed.
Each question should have:
Clear number.
Prompt.
Response area where relevant.
Optional reveal interaction.
Adequate spacing.
Long Question Sets should avoid repeating heavy borders around every item.

## 77. Multiple Choice Design

Options require:
Large touch targets.
Clear selection state.
Keyboard support.
Readable spacing.
Do not rely on colour alone for selected state.

## 78. Response Areas

On screen, response area visuals should reflect expected answer length.
Short:
Compact.
Medium:
Moderate space.
Long:
Larger area.
Extended:
Substantial writing area.
If responses are not being submitted, fields should avoid giving the impression student work is centrally stored.

## 79. Flashcard Design

Flashcards should use one clear focal card.
Interaction should remain simple.
Controls:
Previous.
Flip.
Next.
Reset where relevant.
Avoid unnecessary 3D animation.
Reduced motion preferences must be respected.

## 80. Table Design

Tables should prioritise reading.
Use:
Strong headers.
Subtle row separation.
Minimal decorative grid lines.
Responsive overflow.
Print friendly repeated headers.
Large tables should not compress text until unreadable on phone.
Horizontal scrolling is preferable.

## 81. Image Design

Images should preserve useful proportions.
The system should support controlled crop behaviour.
Captions remain visually linked to the image.
Credits remain quieter than captions.
Decorative images should support decorative accessibility status.

## 82. Gallery Design

Gallery layout should favour visual comparison.
Avoid large decorative gaps.
Phone gallery should adapt to fewer columns or carousel presentation.
Print should translate Gallery into an appropriate grid.

## 83. Video Design

Before loading:
Thumbnail.
Title.
Play or Load control.
After loading:
Provider player.
Caption where present.
Avoid loading numerous full video players on initial page load.

## 84. Audio Design

Audio Block should remain compact.
Display:
Title.
Standard playback controls.
Duration where available.
Transcript control where provided.
The design should not recreate an elaborate music player for ordinary lesson audio.

## 85. Attachment Design

Attachment should resemble a resource card.
Display:
File type icon.
Title.
Optional description.
File type or size metadata where useful.
Open or Download action.
Do not expose provider implementation details to students.

## 86. Embed Design

Embed should use a consistent outer shell regardless of provider.
Display may include:
Title bar.
Provider icon.
Content area.
Fallback action.
The outer treatment should make YouTube, Slides, maps and websites feel like part of the same product.

## 87. HTML App Design

HTML Apps should receive a contained application frame.
Teacher view should identify the Block as Interactive App.
Student view should emphasise the activity itself.
The surrounding frame should prevent custom App design from visually breaking the rest of the Lesson.

## 88. Chart Design

Charts should use restrained visual styling.
Use:
Direct labels where practical.
Minimal grid noise.
Clear axes.
Consistent typography.
Accessible data representation.
Avoid unnecessary 3D charts or decorative effects.

## 89. Diagram and Mind Map Design

Structured visualisations should use the core palette.
Depth and Marine for structural lines.
Wave for active or selected relationships.
High Sea only for meaningful emphasis.
Warm White or Shore for node surfaces.
Print version should remain legible without relying on transparency.

## 90. Timeline Design

Lesson timeline and Scope timeline share related visual principles but different scales.
Use:
Clear chronology.
Strong labels.
Limited colour.
Visible current position where relevant.
Scope timeline Unit blocks should remain easy to distinguish across Terms.
Avoid project management visual density.

## 91. Scope and Sequence Timeline

The annual timeline should visually prioritise:
Terms.
Weeks.
Units.
Major milestones.
The teacher should see the year structure immediately.
Term boundaries should be strong.
Week divisions should remain lighter.
Units should use consistent cards or bars.
Selected Unit uses Wave treatment.
Warnings or planning conflicts may use selective attention states.

## 92. Current Teaching State

Where relevant, current teaching position should receive a clear but calm marker.
Examples:
Current Unit.
Current Lesson.
Current week.
Use Wave as the primary current state colour.
Do not use High Sea for ordinary current position.

## 93. Search Design

Search should be prominent and fast.
Search results should display:
Title.
Object type.
Hierarchy.
Relevant excerpt.
Selected result.
The interface should favour navigation speed over decorative result cards.

## 94. Command K Design

Quick Switcher should use a centred Glass panel.
Include:
Search input.
Recent items.
Matching results.
Actions.
Keyboard hints.
The visual treatment should resemble a serious productivity tool.

## 95. Empty States

Empty states should use restrained illustration or iconography where useful.
Primary focus remains:
What is empty.
What action should happen next.
Example:
No lessons yet.
Create Lesson.
Build with AI.
Use Template.
Avoid large decorative artwork which takes more space than the action.

## 96. Loading States

Loading should be local where possible.
Use:
Small skeleton state.
Progress indicator.
Clear generating state for AI.
Avoid full screen loading overlays for normal actions.

## 97. Save Feedback

Save feedback should be textual and stable.
Examples:
Saved.
Saving.
Save Failed.
Avoid repeated success toasts after every autosave.
A quiet persistent status is better.

## 98. Publish Feedback

Publishing deserves stronger feedback than autosave.
After publishing:
Brief success state.
Published time.
Copy Link.
Open Student View.
Then return to the normal Context Bar state.

## 99. Motion

Motion should support orientation.
Suitable uses:
Panel opening.
Block elevation.
Drag movement.
Menu appearance.
AI proposal arrival.
Accordion expansion.
Avoid:
Continuous motion.
Pulsing decorative objects.
Excessive bouncing.
Long page transition animations.

## 100. Motion Duration

Animations should remain short.
The interface should feel responsive.
Reduced motion settings must be respected.
Where reduced motion is enabled, transitions should minimise or disappear.

## 101. Focus States

Keyboard focus must remain visible.
Use a clear Wave related focus ring with adequate contrast.
Focus treatment should work on:
Light surfaces.
Dark navigation.
Glass panels.
Student interactive controls.

## 102. Contrast

Every text and interactive state must meet appropriate accessibility contrast.
Glass opacity must increase when the background would reduce contrast.
The design system should favour reliable readability over fixed opacity values.

## 103. Colour Independence

Never communicate:
Warning.
Selected state.
Publication state.
Teacher Only state.
Error.
Success.
solely through colour.
Pair colour with text, icon or structural treatment.

## 104. Touch Targets

Student phone controls require comfortable touch targets.
This includes:
Navigation.
Accordion headers.
Tabs.
Multiple choice options.
Flashcard controls.
Embed load controls.
Links which function as buttons.

## 105. Desktop Density

Teacher Workspace may use higher information density than student pages.
The teacher needs fast access to controls.
Density must remain organised through hierarchy rather than tiny text.

## 106. Student Density

Student pages should use more generous spacing.
Primary goal:
Read.
Understand.
Act.
Navigate.
Administrative metadata should remain minimal.

## 107. Responsive Breakpoints

The implementation should define central responsive breakpoint tokens.
Exact values belong in code.
Conceptual modes:
Wide Desktop.
Desktop.
Tablet.
Phone.
Components should respond through shared breakpoint rules rather than independent arbitrary values.

## 108. Desktop Grid

The Lesson layout uses twelve columns.
The visual grid should not normally be visible to students.
Teacher editing may reveal guides during:
Dragging.
Resizing.
Columns editing.
The grid should disappear during normal reading.

## 109. A4 Grid

Print uses its own page grid.
Screen column counts should not translate directly into physical print dimensions.
The print renderer maps Block intent into appropriate A4 layout.

## 110. Page Orientation

Default print orientation:
Portrait.
Landscape should be available for content such as:
Wide tables.
Charts.
Timelines.
Large visual comparisons.
Changing orientation affects print only.

## 111. Print Margins

Print margins should use controlled presets.
Suggested:

Standard.
Narrow.
Wide.
Avoid free numeric margin editing in the first version.

## 112. Print Typography

Print should use the same primary font family where reliable.
Body text should remain comfortably readable.
The system should enforce minimum print text sizes.
Automatic fitting must not break these limits.

## 113. Print Colour

Print should work in colour and greyscale.
Semantic meaning must remain clear when printed without colour.
Strong colour backgrounds should be avoided.
Use:
Borders.
Labels.
Icons.
Typography.
Light fills.

## 114. Print Interactive Translation

Interactive content requires deterministic print alternatives.
Accordion:
Expanded text.
Tabs:
Sequential sections.
Video:
Thumbnail, title and optional QR or URL.
Audio:
Title and optional QR or URL.
Website:
Title and URL or QR.
Map:
Static preview where available or link.
HTML App:
Static preview or resource link.
Flashcards:
Card list or excluded according to teacher option.

## 115. QR Design

Generated QR codes should use simple high contrast styling.
Do not decorate QR codes in ways which reduce scanning reliability.
QR labels should identify destination.
Example:
Open Lesson.
Watch Video.
Open Resource.

## 116. Design Tokens

The implementation should centralise design values.
Token categories should include:
Colours.
Typography.
Spacing.
Radius.
Borders.
Shadow.
Opacity.
Blur.
Motion.
Breakpoints.
Z index.
Print measurements.
Do not hard code the same design values separately across components.

## 117. CSS Architecture

The code specification should implement the design system through reusable variables or design tokens.
Conceptual examples:
color_depth
color_marine
color_wave
color_high_sea
surface_warm_white
space_medium
radius_standard
glass_blur_standard
Naming should remain consistent with the project coding convention.

## 118. Component Styles

Block renderers should consume shared design tokens.
Do not maintain isolated visual systems for:
Teacher Blocks.
Student Blocks.
Print Blocks.
Each renderer may interpret tokens differently, but the underlying design language stays shared.

## 119. Theme Architecture

The initial release uses one theme.
Do not build a full theme marketplace or arbitrary style editor.
The architecture should avoid blocking future theme support.
A future theme should override defined tokens and approved component variants rather than rewrite Lesson content.

## 120. User Customisation

Initial teacher visual customisation should remain minimal.
Permitted examples:
Compact or expanded navigation.
Right panel width.
A4 orientation.
A4 margins.
Possibly interface appearance preferences later.
Lesson content should not expose arbitrary:
Fonts.
Backgrounds.
Border colours.
Shadows.
Custom CSS.

## 121. Semantic Presets

Presets provide controlled visual variety.
Examples:
Learning Intention.
Success Criteria.
Extension.
Scaffold.
Homework.
Teacher Note.
Warning.
Example.
Reflection.
Presets map teaching meaning to design tokens.
This protects consistency.

## 122. Visual Consistency Across Years

Year 7 material and Year 12 material should use the same core design language.
Age appropriateness should primarily come from:
Content.
Typography scale where required.
Media.
Activity type.
Density.
Do not create unrelated visual themes for every Year.

## 123. Visual Consistency Across Subjects

Subjects should share the same application design.
Subject identity may later receive restrained accents.
The first version should avoid assigning large custom colour schemes to every Subject.
This would complicate design and weaken consistency.

## 124. Teacher Versus Student Visual Grammar

Teacher interface:
More glass.
More metadata.
More controls.
Visible state.
Editable boundaries.
Student interface:
More opacity.
Less metadata.
Fewer controls.
No editing boundaries.
Strong reading hierarchy.
Print interface:
No operational controls.
Minimal colour.
Clean document structure.
These are three expressions of one system.

## 125. Design State Matrix

The same content may appear differently according to context.
Example Rich Text Block:
Teacher normal:
Warm White canvas with minimal boundary.
Teacher selected:
Wave tinted selection treatment.
Student:
Clean reading content.
A4:
Plain printable text.
Example Callout:
Teacher:
Editable contained surface.
Student:
Semantic content panel.
A4:
Pale bordered box.
The data remains unchanged.

## 126. Design System Governance

New components should reuse existing patterns before adding new design rules.
Before adding a new visual treatment, ask:
Does an existing semantic preset already serve this purpose?
Does an existing surface level work?
Does an existing Block renderer already support the structure?
Does a new colour add meaning?
Does the new component remain readable on phone and A4?
Avoid one off styling.

## 127. Block Design Registry

The Block Registry should reference design capabilities.
For each Block:
Allowed variants.
Allowed semantic presets.
Surface behaviour.
Maximum width.
Print behaviour.
Responsive behaviour.
Inspector controls.
This prevents individual Block components from making unrelated design decisions.

## 128. Student Reading Width

The renderer should define a reading width token for prose.
Rich Text and long passages should default to this width.
A full twelve column container does not mean text should stretch across every available pixel.
Wide visual Blocks remain able to exceed reading width.

## 129. Section Width

Sections may define content width modes.
Suggested:

Reading.
Standard.
Wide.
Full.
These are renderer settings rather than arbitrary pixel widths.
This gives sufficient control for:
Essay text.
Questions.
Tables.
Images.
Interactive content.

## 130. Banner Variant

Banner should represent strong horizontal emphasis.
Suitable uses:
Lesson introduction.
Major instruction.
Unit introduction.
Important callout.
Banner should remain shallow enough to avoid consuming excessive vertical screen space.
On phone, Banner becomes a full width stacked component.

## 131. Full Page Variant

Full Page is primarily useful for:
Large visual.
Reading passage.
Worksheet style activity.
Interactive experience.
Print specific resource.
On screen, Full Page means dominant width and presentation.
It does not require a literal browser sized page.

## 132. Small Variant

Small is appropriate for:
Definition.
Short Callout.
Compact media.
Metadata resource.
Supporting activity.
Small should not mean tiny text.
The size refers to spatial prominence.

## 133. Medium Variant

Medium is the standard default for most Blocks.
It should require no special teacher decision in ordinary Lesson construction.

## 134. Large Variant

Large indicates significant Lesson importance.
Suitable for:
Reading.
Question Set.
Video.
Image.
Chart.
Interactive activity.
The renderer should give these Blocks appropriate visual prominence.

## 135. Design Acceptance Criteria

The design implementation is acceptable when:
The teacher workspace feels visually consistent across all primary views.
Student Lessons remain clearly related to the teacher interface without looking like an editing tool.
A4 output reads as a designed printable resource.
Glass effects establish hierarchy without reducing legibility.
Dense reading content uses sufficiently opaque surfaces.
The same palette appears consistently across components.
High Sea remains selective and meaningful.
Wave consistently indicates standard action, selection and active states.
Teacher Only content is instantly recognisable in teacher view.
Teacher Only styling never appears in student view.
Selected Blocks remain visually clear.
AI proposals remain visually distinct from accepted content.
Save and publication states remain understandable.
Buttons follow a consistent hierarchy.
Typography remains readable on desktop and phone.
Long reading text uses controlled line length.
Block spacing follows shared tokens.
Student phone navigation remains compact.
Heavy media does not dominate initial page loading.
Tables remain readable on phone.
Interactive controls use accessible touch targets.
Focus states remain visible.
Colour is never the sole carrier of meaning.
Reduced motion preferences are respected.
Print remains useful in greyscale.
Print does not depend on glass effects.
Print fitting never reduces text below approved readability limits.
Block renderers consume central design tokens.
Teachers do not receive arbitrary CSS controls.
New design patterns reuse existing semantic rules where practical.

## 136. Locked Design Decisions

The following decisions are locked for the initial build.
The design direction follows the existing Clinical Glass Dashboard Style Guide.
The design is adapted for teaching rather than copied as a clinical dashboard.
Warm White is the primary page canvas.
Depth is the primary dark structural colour.
Marine supports dark structure.
Wave represents standard interaction, active state and selection.
High Sea represents selective decisive action and attention.
Shore and Sand support quiet educational content.
Glass effects belong primarily to teacher interface hierarchy.
Dense teaching content uses more opaque surfaces.
Student pages use significantly less glass than teacher pages.
A4 output removes glass effects.
One primary sans serif family is used initially.
Typography uses semantic roles rather than arbitrary sizes.
Spacing uses a fixed token scale.
Border radius uses controlled tokens.
Shadows remain soft and restrained.
Iconography uses one consistent thin lined geometric family.
Primary, Secondary, Tertiary and Destructive button hierarchy is used.
Student content should not become a page of permanently boxed cards.
Selected Blocks use a Wave related glass treatment.
Teacher Only Blocks use a distinct restrained teacher treatment.
AI proposal content remains visually separate until accepted.
Unpublished change indicators use selective High Sea treatment.
Student Lesson pages prioritise reading over interface features.
Student Class pages prioritise Current Lesson and Unit navigation rather than dashboard metrics.
Unit pages visually emphasise sequence and current position.
A4 preview resembles a physical page inside the teacher interface.
Interactive Blocks receive deterministic print translations.
Print works effectively in colour and greyscale.
The desktop Lesson builder uses a twelve column grid.
Long prose uses a controlled reading width.
Standard Block size variants remain small, medium, large, banner and full page where supported.
Semantic teaching presets control visual meaning.
Teachers do not receive arbitrary font, colour or CSS controls in the initial release.
The initial release uses one consistent theme.
Design tokens act as the central visual source of truth.
Block renderers use shared design tokens.
Phone student experience receives full design priority.
Teacher phone authoring remains secondary.
