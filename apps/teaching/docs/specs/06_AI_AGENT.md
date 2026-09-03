# Ai Agent

## 1. Purpose

This document defines the AI architecture, behaviour, context rules, interaction model and cost controls for the Teaching Day Book.
The AI exists to assist with teaching work which genuinely benefits from language generation, transformation, judgement or reasoning.
The AI must not become the mechanism through which ordinary application behaviour occurs.
The core principle is:
Deterministic software manages the system.
Structured data manages content.
The AI performs deliberate intelligence tasks.
The teacher approves consequential AI generated changes.

## 2. Existing Life Hub Precedent

The AI chat interface, conversation history system, interaction patterns and general AI experience should follow the established implementation from the existing Life Hub website or project.
The Teaching Day Book should reuse that precedent wherever practical.
This specification defines the Teaching Day Book specific AI behaviour which sits on top of that established system.
Where no Teaching Day Book specific requirement exists, the Life Hub approach should be preferred rather than designing another AI framework.

## 3. Primary AI Principle

AI use must be intentional.
The application must not send AI requests during:
Typing.
Saving.
Autosaving.
Publishing.
Moving Blocks.
Changing layout.
Changing Block size.
Changing visibility.
Opening pages.
Rendering student content.
Rendering A4 preview.
Searching ordinary structured data.
Scheduling Lessons.
Changing dates.
Copying Lessons.
Duplicating Blocks.
Opening Drive files.
Generating navigation.
Routine formatting.
These actions use deterministic application logic.

## 4. AI Appropriate Tasks

AI should be used for work such as:
Generating teaching material.
Transforming supplied text.
Rewriting for a different reading level.
Generating questions.
Generating explanations.
Creating examples.
Creating vocabulary activities.
Condensing material.
Expanding material.
Generating scaffolds.
Generating extension tasks.
Creating Lesson structures from source material.
Analysing teaching content.
Reviewing Lesson flow.
Suggesting differentiation.
Generating structured teaching activities.
Mapping supplied content into approved Block structures.

## 5. AI Is Not the Renderer

The AI must not decide how HTML pages are technically rendered.
The renderer remains deterministic.
The AI produces structured content conforming to approved schemas.
Example:
Teacher request:
Turn this passage into a reading comprehension activity.
AI responsibility:
Generate the teaching content and populate the approved Reading Comprehension Composition.
Renderer responsibility:
Display those Blocks correctly on desktop, phone and A4.

## 6. AI Is Not the Database

The AI should not manage application relationships directly.
It should not independently:
Create storage keys.
Generate database paths.
Change object IDs.
Change Class relationships.
Change Unit ownership.
Modify Scheduled Lesson chronology.
Delete content.
Publish content.
Modify authentication.
The application layer performs these actions.

## 7. AI Provider

The initial AI provider is Anthropic.
API access occurs server side.
The Anthropic API key must never appear in:
Browser code.
Client JavaScript.
Lesson JSON.
GitHub source.
Student pages.
Public environment output.
The key should exist only in secure server side environment configuration.

## 8. AI Request Route

Browser AI requests should flow conceptually through:
Teacher Workspace
→ Netlify Function
→ Request validation
→ Context construction
→ Anthropic API
→ Response validation
→ Structured proposal
→ Teacher review
The browser must not call Anthropic directly.

## 9. AI Context Philosophy

Context is expensive.
The system should send the smallest useful amount of information required to complete the task.
Default context:
Selected Block.
Broader context is opt in.
This is a foundational cost control.

## 10. Context Levels

Supported AI scopes should include:
block
section
lesson
unit
subject
Each scope represents increasingly large context.
The interface must make the selected scope visible before the request is submitted.

## 11. Block Scope

Block scope is the default.
The request may include:
Selected Block.
Relevant Block schema.
Immediate teacher instruction.
Small amount of nearby context where essential.
Relevant Year and Subject metadata.
Necessary Composition definition.
Block scope should serve most everyday AI actions.

## 12. Section Scope

Section scope includes:
Selected Section.
Child Blocks.
Relevant schema definitions.
Required nearby context.
Teacher instruction.
Useful actions include:
Reorganise this section.
Turn this into guided practice.
Add scaffolding to this section.
Improve the progression of these questions.
Condense this section.

## 13. Lesson Scope

Lesson scope includes the current Lesson.
This should require explicit teacher selection.
Useful actions include:
Review the Lesson sequence.
Identify gaps in Lesson flow.
Generate a Lesson summary.
Check whether activities align with the learning intention.
Suggest where additional scaffolding is needed.
Transform the whole Lesson for another purpose.
Lesson scope should not become the default generation mode.

## 14. Unit Scope

Unit scope is broader and should be used sparingly.
Useful actions include:
Review progression across Lessons.
Identify repeated content.
Suggest missing conceptual steps.
Generate a Unit overview.
Analyse curriculum Outcome coverage.
Suggest Lesson sequencing.
The entire Unit should only be transmitted when the request genuinely needs it.

## 15. Subject Scope

Subject scope is the broadest initial context level.
Possible uses:
Analyse curriculum coverage across the year.
Review Scope and Sequence coherence.
Identify Outcome gaps.
Compare Units.
Suggest annual sequencing changes.
Subject scope should be clearly marked as a large context operation.

## 16. No Whole Archive Context

The application must never send the entire teaching archive to the AI for an ordinary request.
Hundreds or thousands of Lessons must not form default AI context.
Relevant content should be selected through:
Current context.
Explicit references.
Search.
Structured metadata.
Teacher choice.

## 17. Context Indicator

The AI interface must always display scope clearly.
Examples:
Working with: Selected Block
Working with: Reading Section
Working with: Whole Lesson
Working with: Unit
Working with: Subject
The teacher should never need to guess what content is being sent.

## 18. Broad Scope Warning

When moving from Block or Section scope to Unit or Subject scope, the interface should indicate that more context will be used.
The message should remain brief.
Example:
Larger context selected.
This request will include the Unit.
The system should not use frightening token warnings for routine legitimate operations.
The goal is awareness.

## 19. Explicit Context References

The teacher should be able to deliberately reference additional content.
Examples:
Use Lesson 4 as context.
Use this PDF.
Use these three Blocks.
Use the Unit overview.
Use the Success Criteria.
Use this Drive document.
Use this Composition.
Explicitly referenced material becomes part of the request context.

## 20. Nearby Context

For some Block operations, a small amount of nearby context improves quality.
Example:
Selected question Block.
Nearby context might include:
Previous Heading.
Associated Reading Block.
Learning Intention.
The application should gather only the smallest relevant surrounding context.
Do not automatically send every neighbouring Block.

## 21. Structured Context

Where possible, context should be represented structurally.
Example:
{
"year": "Year 12",
"subject": "English Advanced",
"unit": "Artist of the Floating World",
"lesson_title": "Memory, Identity and Ono",
"selected_block": {}
}
This is preferable to generating a long prose explanation of application state.

## 22. Context Compression

Repeated application instructions should remain compact.
The AI does not need a full product explanation on every request.
Reusable system instructions should define:
Role.
Output rules.
Schema requirements.
Safety constraints.
Relevant style rules.
Then each request supplies only task specific context.

## 23. Schema First Generation

AI generation should target approved schemas.
The AI should receive only the schemas relevant to the requested output.
Example:
Generating a Question Set should provide the Question Set schema.
There is no need to send schemas for:
Maps.
Video.
Charts.
Mind Maps.
Audio.
unless those Blocks are relevant.

## 24. Block Registry Integration

The central Block Registry is the source of truth for AI supported Block types.
The registry should define:
Whether AI generation is supported.
Allowed AI operations.
Output schema.
Allowed variants.
Required fields.
Optional fields.
Validation rules.
Relevant Composition references.
The AI layer should read these definitions rather than maintain a separate Block vocabulary.

## 25. AI Capability Registry

Each Block type should declare supported AI actions.
Conceptual example:
{
"block_type": "rich_text",
"ai_actions": [
"rewrite",
"shorten",
"expand",
"simplify",
"change_reading_level",
"summarise"
]
}
Question Set might support:
generate_questions
increase_difficulty
decrease_difficulty
generate_answers
generate_extension
improve_question_sequence
This keeps the interface contextual.

## 26. Contextual AI Actions

Selecting a Block should surface useful actions relevant to that Block.
Example Rich Text actions:
Rewrite.
Shorten.
Expand.
Simplify.
Make more academic.
Generate questions.
Turn into activity.
Example Question Set actions:
Add questions.
Increase difficulty.
Add inferential questions.
Generate answers.
Add scaffold.
Create extension.
Example Image actions may include:
Generate activity from image description where supported.
Write alt text where sufficient image context exists.
Image editing itself belongs to the relevant image workflow rather than text generation.

## 27. Freeform AI Chat

The AI panel also supports freeform instructions.
Examples:
Turn this into a Year 9 reading activity.
Give me three ways to teach this concept.
Add a stronger extension task.
Rewrite the instructions so students understand them immediately.
Build a short Lesson from this source.
The agent should translate freeform intent into appropriate structured operations.

## 28. AI Action Versus AI Chat

Quick AI actions and freeform chat use the same underlying AI infrastructure.
Quick action:
Shorten this.
Freeform chat:
This paragraph is too dense. Make it about 30 percent shorter but keep the explanation of negative capability.
Both should produce the same proposal based workflow.

## 29. AI Proposal Model

AI generated content does not immediately replace current content.
Output enters a proposal state.
Possible proposal actions:
Accept.
Reject.
Regenerate.
Replace.
Insert Below.
Insert Above.
Keep Both.
Compare.
Where relevant:
Accept Selected Changes.

## 30. Existing Content Preservation

Before an AI proposal is accepted, the existing Block remains the authoritative Lesson content.
Rejecting a proposal leaves existing content unchanged.
Closing the AI panel must not silently accept proposed changes.

## 31. Accepted AI Content

After acceptance, AI generated content becomes ordinary structured Lesson content.
It no longer requires special AI treatment.
It receives:
Normal Block IDs.
Normal versioning.
Normal saving.
Normal publishing.
Normal editing.
Normal rendering.

## 32. AI Version Event

Accepting a meaningful AI change should create a recoverable version event where appropriate.
Example reason:
AI accepted.
This does not require storing the entire AI conversation.
The important recovery object is the resulting Lesson state.

## 33. Regeneration

Regenerate should use the same task context unless the teacher changes the instruction.
Previous generated attempts should not automatically accumulate into the next prompt.
This prevents growing context without clear benefit.

## 34. Refining a Proposal

The teacher should be able to refine an AI proposal.
Example:
Make question 4 harder.
The system should send:
Current proposal.
Teacher instruction.
Relevant schema.
Necessary source context.
It should not resend unrelated Lesson material.

## 35. Partial Acceptance

Where technically practical, structured proposals should permit partial acceptance.
Example Question Set:
Accept questions 1, 2 and 5.
Reject questions 3 and 4.
This is particularly useful for generated collections.
Partial acceptance does not need to exist for every Block type in the first implementation.

## 36. Composition First Behaviour

Where an approved Composition matches the request, the AI should use it.
Example:
Turn this article into a reading comprehension task.
The AI should use:
Reading Comprehension Composition.
Rather than inventing:
New headings.
New custom layout.
Unapproved Block structures.

## 37. Composition Selection

The application may determine a likely Composition from the request.
Where several are plausible, the AI may propose one.
Examples:
Reading Comprehension.
Source Analysis.
Compare Texts.
Essay Planning.
Reflection Exit Ticket.
The teacher should be able to select another Composition before generation.

## 38. Template Awareness

The AI should be aware of relevant teacher templates when explicitly appropriate.
It should not load the entire Template Library into every prompt.
The application should retrieve only:
Selected template.
Matched Composition.
Relevant favourites where explicitly requested.

## 39. Saved Teaching Structures

Repeated structures should increasingly move out of AI prompts and into templates.
Example:
The teacher repeatedly uses the same Reading Comprehension structure.
That structure should live as a Composition.
The AI then fills it.
This reduces:
Prompt size.
Output variability.
Token use.
Layout inconsistency.
Repeated teacher correction.

## 40. AI Generated Lesson

Whole Lesson generation should be available as an explicit action.
Suggested workflow:
New Lesson.
Build with AI.
Teacher supplies source material or instructions.
Teacher selects or confirms:
Year.
Subject.
Unit.
Lesson purpose.
Optional template.
The AI returns structured Lesson Blocks.
The Lesson remains a draft.
Nothing is automatically published.

## 41. Whole Lesson Generation Rules

Whole Lesson generation should prefer:
Existing Lesson Template.
Existing Compositions.
Approved Block types.
Consistent design variants.
Reasonable content density.
Logical teaching progression.
It should not create arbitrary HTML layouts.

## 42. Source Material Ingestion

The teacher may provide source material through:
Pasted text.
Selected Blocks.
Drive files.
Existing Lessons.
Unit content.
Uploaded resources where available.
The application should extract or retrieve only the material required for the request.

## 43. Large Pasted Text

Large pasted text should not automatically become permanent chat history.
For a transformation request:
Source text enters temporary request context.
AI creates structured output.
Accepted result enters Lesson content.
The original source may be stored only if the teacher deliberately inserts or saves it.

## 44. Google Drive Context

Where a Drive file is explicitly selected for an AI task, the application should retrieve relevant readable content where technically supported.
Examples:
Create questions from this PDF.
Summarise this document.
Turn these slides into a Lesson.
The AI request should contain the necessary extracted content rather than arbitrary Drive authentication information.

## 45. Drive File Privacy

AI processing of a Drive resource should occur only after explicit teacher action.
The system should not automatically inspect every Drive file referenced in a Lesson.
A file being displayed to students is not equivalent to permission to send its contents to the AI provider for generation.

## 46. AI Generated Media References

The text AI should not invent Google Drive file IDs, resource URLs or embed URLs.
When an AI generated structure requires media, it should either:
Reference media explicitly supplied in context.
Create a placeholder media requirement.
Request an existing Media Reference through deterministic application logic.
Example placeholder:
{
"media_required": true,
"media_role": "supporting_image"
}
The application or teacher resolves the resource.

## 47. No Fake Resources

The AI must not create fabricated:
Drive links.
Document links.
Video links.
Syllabus URLs.
Lesson IDs.
Unit IDs.
Curriculum Outcome codes.
Existing resource references.
Structured references should originate from application data.

## 48. Curriculum Outcome Context

Curriculum Outcomes exist as structured records.
When AI needs Outcome information, the application should supply the relevant official Outcome records.
The model should not be asked to recall official Outcome codes from memory when structured system data exists.

## 49. Outcome Mapping

Possible AI actions include:
Suggest relevant Outcomes.
Check Lesson alignment.
Identify Outcome gaps.
Outcome suggestions remain proposals.
The teacher decides whether references are added.
The application should only permit references to valid Outcome IDs.

## 50. AI and Scope and Sequence

AI may assist with annual planning.
Potential actions:
Suggest Unit sequencing.
Summarise annual structure.
Identify curriculum gaps.
Suggest timeline adjustments.
Review Outcome coverage.
It should output planning proposals.
The AI does not directly move Units on the timeline without teacher acceptance.

## 51. AI and Scheduling

Routine Lesson scheduling must remain deterministic.
AI should not be required to assign dates.
A future optional planning action may suggest scheduling patterns.
Any suggested schedule remains a proposal.
The actual Scheduled Lesson records are created by application logic after teacher approval.

## 52. AI and Class Overrides

If the teacher invokes AI while viewing a Class specific customised Lesson, the interface should make scope clear.
AI may operate on:
Master Lesson.
Class override.
The teacher should know which one receives the proposed change.
Default behaviour should respect the current editing context.

## 53. AI and Teacher Only Content

Teacher Only Blocks may be included in AI context when the teacher is working in teacher scope.
The AI must preserve visibility metadata.
A teacher note transformed by AI should remain Teacher Only unless the teacher explicitly changes visibility.

## 54. Student Facing Safety

AI generated content intended for students remains a draft until teacher acceptance and publication.
The AI should never publish directly to student pages.
This is a hard rule.

## 55. AI Generated HTML

Normal AI actions must not output unrestricted HTML, scripts or CSS.
Structured Block JSON is preferred.
The only pathway for custom executable content is the HTML App workflow.

## 56. HTML App Generation

If the system later supports AI generation of Interactive HTML Apps, that workflow requires additional controls.
Generated Apps must:
Run inside the defined sandbox.
Pass security checks.
Remain isolated from teacher credentials.
Remain isolated from internal application state.
Receive only approved network permissions.
Require teacher preview before use.
This is separate from ordinary Lesson Block generation.

## 57. Output Format

AI responses intended to modify application content should use machine validated structured output.
Conceptual response:
{
"operation": "replace_block",
"target_id": "block_l008_004",
"proposal": {
"block_type": "rich_text",
"variant": "medium",
"visibility": "student_teacher",
"content": {}
}
}
The exact transport schema belongs in implementation documentation.

## 58. Operation Types

Supported AI proposal operations may include:
replace_block
insert_block_before
insert_block_after
replace_section
insert_composition
create_lesson_draft
update_metadata
suggest_outcomes
review_only
The AI should not invent operation types.

## 59. Review Only Responses

Some AI interactions do not need to alter content.
Examples:
What is weak about this Lesson?
Does this activity sequence make sense?
Where is the cognitive load too high?
What is missing?
These should return analysis in the AI panel.
No Block proposal is required unless the teacher requests one.

## 60. AI Explanations

The AI panel should distinguish:
Advice.
Content proposal.
Structural proposal.
This reduces ambiguity.
A teacher asking a question should not receive a hidden content mutation.

## 61. Schema Validation

Every structured AI output must pass validation before reaching the proposal interface.
Validation should check:
Operation type.
Target existence.
Block type.
Required fields.
Allowed variants.
Visibility values.
Nested structure.
Referenced object IDs.
Content limits.
Schema version.

## 62. Invalid AI Output

If AI output fails validation:
Do not write it into the Lesson.
The application may attempt one structured repair request.
If repair also fails, show a clear failure state.
The existing Lesson remains untouched.

## 63. Structured Repair

Repair requests should send:
Invalid response.
Validation errors.
Required schema.
The repair request should not resend the entire original context unless required.
This reduces repeated token usage.

## 64. Hallucinated References

If AI output includes an object ID not present in supplied system context, validation must reject the reference.
The AI must not invent:
Lessons.
Units.
Outcomes.
Media objects.
Classes.
Templates.

## 65. Deterministic Post Processing

Simple transformations after AI output should use application logic.
Examples:
Assign Block ID.
Set timestamps.
Generate slug.
Attach parent ID.
Validate media references.
Calculate sequence position.
The AI does not need to produce these system fields.

## 66. AI Generated IDs

The AI should not be responsible for permanent application IDs.
New Blocks receive IDs from deterministic application logic after acceptance.
AI proposal objects may use temporary identifiers where necessary for internal relationships.

## 67. Prompt Architecture

Prompts should be assembled from modular components.
Conceptual structure:
System role.
Teaching Day Book output rules.
Requested operation.
Relevant Block schema.
Selected context.
Teacher instruction.
Optional Composition.
Avoid monolithic prompts containing the entire product specification.

## 68. Core System Prompt

The persistent system instruction should remain compact.
It should establish:
The AI is a teaching content assistant.
Output must respect supplied schemas.
Existing content outside scope must remain unchanged.
References must not be invented.
Teacher approval is required.
Australian English should be used where language choice matters.
The AI should prefer clear, useful classroom content.

## 69. Australian English

Generated teaching material should use Australian English by default.
Examples:
organise.
analyse.
colour.
behaviour.
Where quoting source material, preserve the source wording.

## 70. Teaching Context

Useful structured context may include:
Year level.
Subject.
Unit.
Lesson title.
Learning intention.
Selected curriculum Outcomes.
Student facing or teacher facing purpose.
This information should only be supplied when relevant.

## 71. Year Level Adaptation

The AI should use supplied Year level as a meaningful constraint.
Year level may influence:
Vocabulary.
Sentence complexity.
Question difficulty.
Scaffolding.
Expected independence.
Explanation depth.
It should not automatically oversimplify content merely because students are younger.

## 72. Difficulty Adjustment

Difficulty should be adjustable independently from Year level.
Useful controls may include:
Support.
Core.
Challenge.
Extension.
This is preferable to assuming one level suits every student in a Year group.

## 73. AI Action Presets

Common teacher requests should be available as quick actions.
Suggested initial actions:
Rewrite.
Shorten.
Expand.
Simplify.
Increase Challenge.
Add Scaffold.
Generate Questions.
Generate Answers.
Create Extension.
Create Vocabulary Activity.
Turn Into Reading Comprehension.
Summarise.
Create Learning Intention.
Create Success Criteria.
Review Lesson Flow.

## 74. Quick Actions and Tokens

Quick actions should use concise fixed instructions.
They should not load unnecessary AI chat history.
Example:
Shorten this Block.
Context:
Current Block only.
Instruction:
Reduce length while preserving essential meaning and teaching purpose.
This should remain significantly cheaper than sending a long conversation.

## 75. Persistent AI Chat

The AI panel may support persistent conversation using the Life Hub precedent.
Persistent history is a user experience feature.
It must not mean the entire historical transcript is automatically sent with every new request.
Context management and displayed history are separate concepts.

## 76. AI History Storage

Follow the Life Hub implementation.
General principle:
Retain enough history for useful continuity.
Avoid treating unlimited raw conversation as core teaching data.
Accepted teaching content should exist independently in Lesson Blocks.

## 77. Conversation Summaries

Where Life Hub already uses conversation summarisation or equivalent context compression, reuse that approach.
Do not independently create a second history compression system.
Teaching Day Book specific metadata may be added where useful.

## 78. New Lesson Chat Context

Opening a different Lesson should update the AI workspace context.
The interface should clearly show the current Lesson.
The system should avoid accidentally applying a previous Lesson's context to the new Lesson.

## 79. Cross Lesson Requests

The teacher may explicitly reference another Lesson.
Example:
Use yesterday's Lesson and create a follow up activity.
The application should retrieve the relevant Lesson content deliberately.
Do not send the entire Unit merely because two Lessons are involved.

## 80. Search Assisted Context

For requests involving existing teaching material, deterministic search should locate relevant objects first.
Example:
Use my Lesson on negative capability.
Workflow:
Search Lesson titles and content.
Identify likely result.
Add selected Lesson as AI context.
This is preferable to asking the model to infer what might exist in the archive.

## 81. AI Search Versus Product Search

Normal application search is deterministic.
The AI may interpret a natural language request for content retrieval, but actual retrieval should use the application's search system.
The model receives only returned relevant records.

## 82. Token Budget Awareness

Each request should have an estimated scope before submission.
The application does not need to expose exact token counts initially.
It should internally understand that:
Block is cheap.
Section is moderate.
Lesson is larger.
Unit is large.
Subject is very large.
Large requests should only occur deliberately.

## 83. Context Limits

The application should enforce maximum context sizes.
If selected content exceeds safe limits, the system should:
Trim irrelevant metadata.
Use targeted retrieval.
Chunk source material.
Summarise where appropriate.
Ask the teacher to narrow scope only when no reliable automatic strategy exists.
The product should not blindly submit enormous payloads.

## 84. Large Document Processing

Large source documents may require chunked processing.
Example:
A long PDF.
Possible workflow:
Extract text.
Divide into meaningful sections.
Process relevant sections.
Combine structured results.
This should occur only when the task requires the whole document.

## 85. Avoid Repeated Source Transmission

Where a multi stage AI workflow processes the same large source repeatedly, the architecture should minimise unnecessary retransmission where provider capabilities permit.
If provider caching or equivalent features are used later, they should remain an optimisation rather than a dependency of the content model.

## 86. No AI for Word Counting

Word count is deterministic.
No AI request.

## 87. No AI for Reading Time

Estimated reading time is deterministic.
No AI request.

## 88. No AI for Layout

Changing:
Columns.
Block size.
A4 size.
Margins.
Page breaks.
Mobile order.
uses deterministic logic.
The AI may suggest a layout when explicitly asked.
It does not execute layout as an invisible background service.

## 89. No AI for Navigation

Class Page links.
Unit links.
Previous Lesson.
Next Lesson.
Breadcrumbs.
Lesson lists.
Current Unit links.
derive from structured relationships.
No AI request.

## 90. No AI for Publication

Publishing is a validation and storage operation.
No AI request.
Accessibility and media checks should use deterministic validation wherever possible.

## 91. No AI for Basic File Detection

When a Drive file is selected, file type detection should use metadata.
Examples:
PDF.
Image.
Slides.
Document.
Video.
No AI request is necessary.

## 92. No AI for Template Insertion

Inserting an existing Template or Composition is deterministic.
AI is only required when the teacher asks it to populate or transform the template content.

## 93. AI Cost Logging

The application should maintain lightweight AI usage information.
Useful fields:
Request ID.
Timestamp.
Scope.
Action type.
Model.
Input usage.
Output usage.
Success or failure.
Latency where useful.
Accepted or rejected.
Detailed prompt contents do not need to be permanently stored by default.

## 94. Usage Dashboard

A detailed AI analytics dashboard is not required for the initial build.
A simple usage view may later show:
Requests this month.
Approximate usage.
Most common actions.
Scope distribution.
The architecture should capture enough metadata to make this possible.

## 95. Cost Guardrails

The server layer should support configurable safeguards.
Examples:
Maximum request size.
Maximum output size.
Maximum Unit or Subject context request.
Rate limit.
Model selection.
Timeout.
These values should live in configuration rather than scattered across components.

## 96. Model Selection

The initial system should avoid presenting the teacher with unnecessary model choices.
The application should select an appropriate configured Anthropic model.
Model selection belongs to technical configuration.
A future advanced setting may expose model options if there is a meaningful benefit.

## 97. Different Models for Different Tasks

The architecture should leave room for using different models according to task complexity.
Example:
Simple rewrite.
Question generation.
Whole Unit analysis.
This is an optimisation path.
The initial implementation may use one default model if simpler.
The content model must not depend on a particular model name.

## 98. AI Failure States

Possible failure states include:
Provider unavailable.
Request timeout.
Rate limit.
Invalid output.
Context too large.
Authentication failure.
Network failure.
The teacher's existing content must remain safe in every case.

## 99. AI Failure Interface

Failure message should be specific.
Example:
AI generation failed. Your Lesson has not been changed.
Actions:
Retry.
Edit Request.
Reduce Scope.
Close.
Avoid generic errors which leave the teacher uncertain about content state.

## 100. Retry Behaviour

Retry should not create duplicate accepted content.
A failed request remains separate from Lesson state.
Retry uses the same operation unless the teacher changes context or instruction.

## 101. AI Cancellation

Where technically feasible, the teacher should be able to dismiss or cancel an active AI generation.
Closing the AI panel should not accidentally apply partial output.
Only validated complete proposals enter the proposal state.

## 102. Concurrent Editing

If Lesson content changes while an AI proposal is being generated, the application should verify that the target still matches the source revision.
If the target changed, the proposal should be marked as based on an older version.
The teacher may then:
Review.
Apply manually.
Regenerate from current content.
This prevents stale AI output overwriting newer edits.

## 103. Target Revision

AI requests modifying content should include the current target revision.
Conceptual example:
{
"target_id": "block_l008_004",
"target_revision": 17
}
Application logic verifies this before applying accepted output.

## 104. AI and Version History

AI does not need an independent full content backup system.
Lesson version history already provides recovery.
Accepted AI changes become part of normal Lesson versions.
This keeps architecture simpler.

## 105. Teacher Trust

The AI interface should make four things obvious:
What content it is using.
What it is being asked to do.
What it proposes changing.
Whether the change has been accepted.
The system should avoid invisible autonomous modification.

## 106. AI Autonomy Boundary

The AI may:
Generate.
Suggest.
Analyse.
Transform.
Recommend.
It must not independently:
Publish.
Permanently delete.
Change authentication.
Change storage configuration.
Change Class ownership.
Send material to students.
Modify unrelated Lessons.
Alter curriculum references without approval.

## 107. Student AI

Direct student AI interaction is not part of the initial product.
The AI serves the teacher authoring environment.
Student pages render published teaching resources.
This keeps the initial scope focused.

## 108. AI Generated Student Activities

The teacher may use AI to create interactive or written student activities.
Once published, those activities behave as normal student Blocks.
They do not require a live AI connection unless a future feature explicitly introduces one.

## 109. AI Dependency Rule

Published Lessons should remain usable if Anthropic is unavailable.
AI availability must not affect:
Student page loading.
Navigation.
Media loading.
Existing interactive Blocks.
A4 printing.
Existing Lesson content.
The AI is an authoring enhancement rather than runtime infrastructure for ordinary student pages.

## 110. AI and Performance

AI code should be loaded primarily within teacher authoring contexts.
Student pages should not load unnecessary AI client libraries or AI interface code.
This supports fast student page performance.

## 111. AI Security Boundary

Only authenticated teacher requests may reach AI generation endpoints.
Student public routes must not expose AI endpoints for unrestricted use.
Server functions should validate authentication before forwarding requests.

## 112. Request Validation

Before an Anthropic request is created, server logic should validate:
Authenticated teacher.
Allowed operation.
Allowed scope.
Valid target.
Payload size.
Referenced object existence.
Required schema.
Rate limits.
This prevents the AI route from becoming a generic public proxy.

## 113. Response Validation

After the provider responds, server or trusted application logic should validate:
Expected format.
Allowed operation.
Schema.
Reference integrity.
Content size.
Target revision.
The proposal only becomes available after validation.

## 114. Prompt Injection From Resources

External documents and websites used as AI context may contain hostile or irrelevant instructions.
Resource content should be treated as source material, not system instruction.
The core AI prompt should explicitly separate:
Teacher instruction.
Application rules.
Retrieved source material.
Source material must not override system behaviour.

## 115. External Website Context

If a future workflow allows website content to enter AI context, the system should treat retrieved webpage text as untrusted source material.
The AI must not follow embedded instructions which attempt to:
Change application behaviour.
Reveal secrets.
Ignore schemas.
Perform unrelated actions.

## 116. Sensitive Configuration

AI prompts must never include:
API keys.
Authentication tokens.
Netlify secrets.
Google OAuth secrets.
Internal credentials.
Private server configuration.
The context builder should use allowlisted teaching data rather than dumping application state.

## 117. Data Minimisation

Only data required for the teaching task should be sent to the provider.
Class codes or other metadata should not be included merely because they are available.
The AI context builder should deliberately select fields.

## 118. AI Request Builder

A central request builder should assemble AI requests.
Do not construct unrelated prompt formats throughout individual components.
The request builder should manage:
System instructions.
Scope.
Context.
Schemas.
Teacher request.
Output format.
Model configuration.
Usage metadata.

## 119. AI Response Handler

A central response handler should manage:
Parsing.
Validation.
Repair.
Proposal creation.
Usage logging.
Errors.
Target revision checks.
This prevents every Block from implementing a different AI pipeline.

## 120. AI Service Layer

Conceptual architecture:
Teacher UI

AI Panel

AI Request Builder

Netlify AI Function

Anthropic

AI Response Validator

Proposal Store

Teacher Approval

Content Save
Each layer has a distinct responsibility.

## 121. Proposal Storage

Temporary proposals do not need to become permanent Lesson content before acceptance.
Proposal state may live temporarily in application state or short lived server state.
Accepted proposals enter the standard content model.
Rejected proposals may be discarded according to the Life Hub AI history precedent.

## 122. AI Activity Record

A lightweight record may capture:
{
"id": "ai_action_001",
"scope": "block",
"target_id": "block_l008_004",
"action": "generate_questions",
"model": "configured_model",
"accepted": true,
"created_at": "timestamp"
}
Usage metadata may be associated with this record.
Full prompt storage is not required by default.

## 123. AI Model Output Length

Output limits should reflect task type.
Short rewrite should not permit enormous responses.
Whole Lesson generation requires a larger limit.
Action definitions should specify reasonable output ranges.
This reduces waste and runaway generations.

## 124. AI Action Definitions

Each quick action should define:
Name.
Supported Block types.
Default scope.
Instruction template.
Expected operation.
Output schema.
Maximum context.
Maximum output.
Whether a Composition is required.
Example conceptual action:
{
"id": "generate_questions",
"default_scope": "block",
"expected_operation": "insert_block_after",
"output_block_type": "question_set"
}

## 125. Reading Comprehension Action

The Reading Comprehension action should:
Take selected source text.
Use the Reading Comprehension Composition.
Generate appropriate vocabulary.
Generate literal questions.
Generate inferential questions.
Generate evaluative or extension material where defined by the Composition.
Return structured Blocks.
The structure remains editable through the Composition Library.

## 126. AI Layout Suggestion

The AI may suggest Block variants based on content.
Example:
Long Reading Block:
large.
Vocabulary:
small.
Question Set:
large.
Extension:
medium.
The teacher may alter these sizes without another AI request.

## 127. AI Print Awareness

AI generated content should not be responsible for exact pagination.
It may use semantic size and response space metadata.
The A4 renderer determines actual pagination.
AI should not insert arbitrary page breaks unless the teacher explicitly requests a print oriented transformation.

## 128. AI Response Space

When generating questions, the AI may assign semantic response space.
Values:
none.
short.
medium.
long.
extended.
This helps screen and print rendering.
It should not generate pixel heights.

## 129. AI Visibility

AI generated Blocks default to student_teacher unless:
The selected source is teacher_only.
The action explicitly creates teacher guidance.
The Composition defines another visibility.
Visibility must always pass schema validation.

## 130. Teacher Guidance

Question and activity generation may include teacher guidance in teacher only fields.
This may include:
Suggested answers.
Expected responses.
Misconceptions.
Discussion prompts.
Differentiation notes.
The student renderer excludes this material.

## 131. Generated Answers

Generated answers should default to Teacher Only.
The teacher may explicitly change a Question Set to student reveal mode.
The AI should not make answers immediately visible to students unless requested.

## 132. Differentiation

AI differentiation should modify or create structured content rather than create unrelated duplicate Lessons by default.
Possible actions:
Add Scaffold.
Create Extension.
Simplify Instructions.
Generate Support Version.
Where a genuinely separate version is required, the teacher chooses duplication deliberately.

## 133. AI and Shared Lessons

AI editing a Master Lesson affects the shared Lesson after acceptance.
The interface should maintain the same Edit Master versus Customise for Class distinction used for manual editing.
AI must not bypass that distinction.

## 134. AI and Linked Blocks

When AI targets a linked Block, the teacher should choose:
Edit Source.
Detach and Edit.
The AI should not silently break or modify linked relationships.

## 135. AI and Templates

Editing a Template through AI modifies the Template only after explicit teacher approval.
Using AI to populate a Template for a Lesson creates Lesson content rather than modifying the source Template.
The interface must distinguish:
Edit Template.
Use Template.

## 136. AI and Versioned Templates

If Template versioning is later introduced, AI generated changes should follow normal Template versioning rules.
No separate AI specific Template format is required.

## 137. Prompt Reuse

Repeated prompts should become:
Quick actions.
Composition rules.
Template instructions.
Saved teacher instructions where useful.
The product should gradually reduce reliance on repeatedly typing long prompts.

## 138. Personal Instruction Layer

A future teacher preference layer may store concise generation preferences.
Examples:
Australian English.
Preferred question structure.
Default Lesson duration.
Preferred explanation style.
These preferences should remain compact.
Do not append a large personal profile to every request.

## 139. Lesson Specific AI Notes

If a Lesson requires special AI constraints, these may exist as teacher metadata.
Example:
Use terminology from the supplied article.
Do not introduce material beyond this extract.
These instructions should only enter requests involving that Lesson.

## 140. Unit Specific AI Notes

A Unit may optionally define concise generation guidance.
Examples:
Core conceptual focus.
Required terminology.
Texts being studied.
Important exclusions.
These notes should be loaded for Unit or Lesson requests only where relevant.

## 141. AI Suggestions Without Invocation

The interface should avoid constantly presenting unsolicited AI suggestions.
AI controls remain available.
The system should not repeatedly interrupt the teacher with:
Would you like AI to rewrite this?
Would you like AI to improve this?
This adds clutter and encourages unnecessary token use.

## 142. AI Entry Points

AI should be accessible through:
Right AI Panel.
Selected Block action.
Slash or command action where appropriate.
Create with AI.
Template or Composition population.
These should all route through the same AI service layer.

## 143. Keyboard AI Shortcut

A keyboard shortcut for opening AI with selected content may be useful.
The shortcut should open the AI panel with the current scope visible.
It should not immediately send a request.

## 144. AI Acceptance Speed

Accepting a valid proposal should feel immediate.
Acceptance should:
Create final IDs where required.
Apply structured change.
Record Undo state.
Update draft.
Trigger normal batched save.
Record AI action metadata.
No second AI request is required.

## 145. AI Rejection

Rejecting a proposal should simply discard or archive it according to the Life Hub precedent.
No content mutation occurs.
No AI request is required.

## 146. AI Undo

After accepting an AI proposal, ordinary Undo should restore the prior state where practical.
This is separate from long term Lesson version history.

## 147. AI Auditability

The teacher should be able to identify recent AI assisted changes through version history or activity metadata where useful.
The application does not need to permanently label every sentence as AI generated.
Once accepted, the teacher owns and edits the content normally.

## 148. Background AI

The initial release should avoid autonomous background AI processing.
Do not silently:
Analyse every Lesson.
Generate suggestions overnight.
Reclassify content.
Rewrite metadata.
Scan every Drive resource.
These behaviours create cost without clear teacher intent.

## 149. Future Optional Automation

Future versions may introduce explicit AI automation.
Any automation should require:
Clear teacher opt in.
Defined scope.
Defined frequency or trigger.
Usage limits.
Reviewable output.
This is outside the initial build.

## 150. AI Availability

If AI functionality is temporarily unavailable, the rest of the product should continue operating normally.
Teacher should still be able to:
Create Lessons.
Edit Blocks.
Insert Templates.
Use Compositions.
Schedule Lessons.
Publish.
Print.
Share.
Search.
Use Drive resources.
AI failure must never block the core day book.

## 151. Initial AI Features

The first AI implementation should prioritise a small number of high value actions.
Recommended initial set:
Rewrite selected text.
Shorten selected text.
Expand selected text.
Adjust difficulty.
Generate questions from selected content.
Generate answers.
Add scaffold.
Create extension.
Create Reading Comprehension from selected text.
Generate Learning Intention.
Generate Success Criteria.
Build Lesson draft from supplied material.
Review Lesson flow.
This is enough to validate the architecture before adding more actions.

## 152. Features Deferred From Initial AI Build

The first version does not require:
Autonomous agents operating across the archive.
Student AI chat.
Automated marking.
Student profiling.
Automatic assessment reporting.
Constant background Lesson analysis.
AI driven scheduling.
Automatic publishing.
Autonomous curriculum rewriting.
Unrestricted AI generated HTML applications.
Complex multi agent systems.
These may be reconsidered later if genuine need emerges.

## 153. AI Acceptance Criteria

The AI implementation is acceptable when:
AI requests require authenticated teacher access.
The Anthropic API key never reaches the browser.
Block scope is the default.
Current AI scope is always visible.
Broader scope requires deliberate selection.
Ordinary editing uses no AI requests.
Saving uses no AI requests.
Publishing uses no AI requests.
Navigation uses no AI requests.
Layout changes use no AI requests.
AI output uses approved structured schemas.
Structured output passes validation.
Invalid output never modifies Lesson content.
AI generated changes appear as proposals.
Teacher approval is required before content replacement.
Rejecting a proposal preserves existing content.
Accepted output becomes ordinary Lesson content.
AI generated IDs are replaced by application generated IDs where permanent identity is required.
The AI does not invent curriculum references.
The AI does not invent media references.
Existing Compositions are preferred for recognised teaching structures.
The AI does not receive the full archive by default.
Large context operations are deliberate.
AI history follows the Life Hub precedent.
Displayed conversation history does not automatically equal request context.
Accepted AI changes participate in Undo and version recovery.
Stale proposals do not silently overwrite newer edits.
External resource text is treated as untrusted source material.
Provider failure does not affect existing Lesson use.
Student pages operate without Anthropic.
AI usage metadata is captured sufficiently for future cost analysis.
The architecture supports later model changes without changing Lesson data.

## 154. Locked AI Decisions

The following decisions are locked for the initial build.
Anthropic is the initial AI provider.
Anthropic requests occur through authenticated server side Netlify Functions.
The API key never reaches browser code.
The AI chat and history experience follows the existing Life Hub project precedent.
The Teaching Day Book does not create a separate AI history architecture without a specific requirement.
AI use is explicit rather than automatic.
Selected Block is the default AI scope.
Section, Lesson, Unit and Subject scopes require deliberate selection.
The entire teaching archive is never default context.
Context should be the smallest amount necessary for the task.
Only relevant Block schemas enter each request.
The central Block Registry drives AI capabilities.
Existing Compositions should be used instead of repeatedly generating page structures from scratch.
AI generated application content uses structured output.
AI output must pass schema validation.
AI output is a proposal until accepted.
AI never publishes content automatically.
AI never permanently deletes content.
AI never changes unrelated content.
AI never invents permanent object references.
Permanent IDs come from deterministic application logic.
Accepted AI content becomes normal Block content.
Rejected AI proposals do not modify Lesson data.
AI generated answers default to Teacher Only.
Student facing AI interaction is excluded from the initial build.
Published student pages do not depend on AI availability.
Google Drive resources enter AI context only through explicit teacher actions.
Displaying a Drive resource does not automatically send that resource to Anthropic.
External content is treated as untrusted source material.
Routine operations use zero AI tokens.
AI usage should remain measurable.
AI request size and output size should use configurable guardrails.
Initial AI functionality focuses on high value teaching transformations rather than broad autonomous behaviour.
Future AI expansion should extend this architecture rather than bypass it.
