# People experience — source brief

> **Purpose of this file.** Everything in this folder came out of one Claude
> Code conversation with Adam (not committed as it happened). This file is
> that conversation's output, compiled so a *fresh* session can write the
> real build document without re-deriving any of it — no need to re-read
> this file's own history, just read it once and go. It is source material,
> not the build document itself.
>
> Companion files: `mockups/*.png` (six rendered screens), `mockups/*.html`
> (their real HTML/CSS source, reproducible), `mockups/README.md`.

---

## Part A — the product vision brief (Adam's original, verbatim)

This is the full brief Adam gave for the People section of Professional Hub.
Nothing in it has been implemented yet as a product surface — see Part D for
what *has* been built (the data/architecture layer underneath it).

<details>
<summary>Full 54-section brief (click to expand)</summary>

PROFESSIONAL HUB PEOPLE EXPERIENCE

Detailed Product and Design Brief

1. PRODUCT PURPOSE

People is the unified relationship intelligence layer for Professional Hub.

The experience must answer six questions with minimal effort.

Who is this person?

How do I know them?

What roles, organisations, projects, events, communications and work connect us?

How has our relationship changed over time?

What matters about this relationship now?

What deserves my attention next?

People must not behave like a contacts database, address book, sales CRM, or static directory.

The experience represents each person as one durable identity surrounded by changing relationships, contexts, organisations, activities and evidence.

Person and Organisation already sit conceptually as shared identities across the broader Hub architecture. Professional Hub provides the professional workflow and viewing layer over those shared identities. Universal Links provide the common relationship architecture connecting People with Tasks, Teaching, Knowledge, Events, Meetings, Communications, Applications, Projects and Organisations.

The product therefore has two simultaneous jobs.

First, People must provide an excellent individual relationship record.

Second, People must make the wider professional network understandable as a living system.

Knowledge Hub represents knowledge as a universe.

Professional Hub represents relationships as a biosphere.

2. CORE PRODUCT PRINCIPLES

Principle 1. Identity stays stable while context changes.

A person remains one person across job changes, organisation changes, new roles, changed contact details and changed professional contexts.

Principle 2. Relationships belong in context.

A person does not receive one permanent category.

One person might simultaneously be a colleague, collaborator, mentor, NORTH+ participant, research contact and professional referee.

Principle 3. History must survive editing.

Changing a role does not erase the previous role. The previous period closes and a new period begins.

Principle 4. Evidence and interpretation stay separate.

The system must distinguish observed information, user entered information, imported information and inferred information.

Principle 5. The interface should answer questions, not expose database structure.

A Person page should explain the relationship rather than present raw fields.

Principle 6. Relationship intelligence describes evidence about interaction, not human worth.

No person receives a numerical value, influence score, usefulness score or relationship quality grade.

Principle 7. Visualisation must encode meaning.

Forests, reefs, mangroves, wetlands, savannahs, islands, corridors and ecotones represent structural properties of the professional network.

Principle 8. Professional Hub retains Life Hub identity.

The current shared design kit defines Warm White, Cotton, Depth, Marine, Wave, High Sea, Inter typography, restrained glass surfaces, fine borders and controlled elevation. People should extend this language rather than create an unrelated product.

3. PRIMARY INFORMATION ARCHITECTURE

The People experience contains seven major destinations.

People Home.

Person Profile.

Person Brief.

Network Ecology.

Organisations.

Relationship Search.

Professional Overview.

People Home acts as the entry point.

Person Profile represents one person.

Person Brief prepares the user for an upcoming interaction.

Network Ecology represents the wider professional ecosystem.

Organisation pages assemble people and activity around one organisation.

Relationship Search answers relational questions across the entire system.

Professional Overview surfaces daily relationship intelligence.

4. PEOPLE HOME

People Home should not open with a giant alphabetical contact list.

The first screen should answer what is happening in the professional network now.

The page begins with a compact heading area.

Title: People.

Subtitle: Your professional relationships, activity and network.

Primary action: Add person.

Secondary action: Search.

The upper section contains four live signals.

Active relationships.

Upcoming interactions.

Recent relationship changes.

Current opportunity windows.

These signals remain descriptive rather than evaluative.

Below sits a modular People Today area.

Reconnect suggestions appear here.

Upcoming meetings and events appear here.

Recent relationship changes appear here.

New connections appear here.

Dormant relationships worth reviewing appear here.

Newly detected organisation changes appear here.

A Dynamic Cohorts section follows.

Examples include:

St Aloysius colleagues.

Former St Pius colleagues.

UNSW contacts.

Gifted Education network.

HALT network.

NORTH+ participants.

Current project collaborators.

People met during 2026.

Academic network.

Research network.

Cohorts derive from Universal Links, dated relationships and shared contexts rather than permanent tags.

A Recent Activity strip appears near the lower portion of the screen.

Activity should show meaningful relationship events rather than every system event.

Examples include:

Met Vicky at Gifted Education Network event.

Nina moved to UNSW.

Michael began a new role.

Sarah joined a shared project.

A dormant relationship reactivated.

A Person Brief became available for tomorrow morning.

People Home should feel alive without becoming busy.

5. RAPID PERSON CAPTURE

Adding a new person must require minimal effort.

The initial capture form should request only essential information.

Name.

Where you met.

Organisation, when known.

Who introduced you, when relevant.

One optional observation.

Date.

The system should create a lightweight person state.

No huge empty form appears.

No requirement exists to complete role, organisation, biography, communication details, tags, categories and notes before saving.

Additional structure appears through later activity.

A newly created person should receive a visible status such as New connection.

The initial relationship event enters the Relationship Event Ledger immediately.

Example:

15 September 2026.

Met at Gifted Education Network event.

Introduced by Nina.

Discussed twice exceptional learners.

The profile then grows through real activity.

6. PERSON PROFILE, OVERALL STRUCTURE

The Person Profile is the most important screen in People.

The page should answer relationship questions in layers.

Layer 1. Immediate understanding.

Layer 2. Current context.

Layer 3. Activity and relationship history.

Layer 4. Evidence and observations.

Layer 5. Wider network position.

The profile must avoid one long vertical record.

Use clear modules and optional tabs.

Recommended top navigation:

Overview.

Timeline.

Shared Work.

Observations.

Network.

Evidence.

History.

The Overview tab acts as the fitted person page.

7. FITTED PERSON PAGE

Every person receives the same core visual language.

Module priority adapts to the relationship.

A colleague might foreground shared projects, meetings, tasks and organisation.

An academic contact might foreground institution, research, publications, shared notes and meetings.

A recruiter might foreground organisation, applications, interviews and communications.

A mentor might foreground observations, meetings, advice related notes and relationship history.

A conference contact might foreground event context, mutual connections and suggested follow up.

The page does not randomly rearrange itself.

Use deterministic placement rules.

The stable upper zone should always contain identity, relationship summary and current context.

The middle zone adapts according to active relationship types and linked work.

The lower zone contains history, evidence and deeper context.

This provides couture style fitting without sacrificing predictability.

8. PERSON HEADER

The Person header should contain:

Portrait or initials.

Preferred display name.

Current role.

Current organisation.

Primary current relationship descriptions.

Human relationship labels.

Quick actions.

Example:

Dr Vicky Leighton

Senior Lecturer, Gifted Education

University of Melbourne

Academic contact

Mentor

Research collaborator

Personal description:

"Gifted education person I bounce ideas off."

Actions:

Message.

Schedule.

Add observation.

Add relationship.

Open Person Brief.

More.

The header should remain visually calm.

Do not place every known fact in the header.

9. PERSON SUMMARY STRIP

Directly beneath the header, show four to six high value relationship signals.

Last meaningful interaction.

Next scheduled interaction.

Current organisation.

Active shared contexts.

Active shared work.

Relationship activity state.

Example:

Last meaningful interaction: 3 months ago.

Next interaction: Coffee meeting, 8 May.

Current organisation: University of Melbourne.

Shared contexts: Gifted Education, HALT, Research.

Shared work: Research proposal.

Activity state: Active.

Relationship state wording should always remain explainable.

Clicking Active reveals the evidence.

Example explanation:

Three meaningful interactions during the past six months.

One upcoming meeting.

Two current shared contexts.

One active project.

10. CURRENT RELATIONSHIPS

The Current Relationships module shows all ongoing professional relationships.

Each relationship displays:

Canonical relationship type.

Human description.

Context.

Organisation.

Start date.

Optional role.

Source.

Examples:

Academic contact.

Context: Gifted Education.

Since March 2022.

Mentor.

Context: Career development.

Since August 2023.

Collaborator.

Context: Research.

Since February 2024.

Relationship roles should remain independently dated.

Editing a current role closes the existing period and opens a new period.

No historical information disappears.

11. HUMAN RELATIONSHIP LABELS

Structured data and personal meaning must coexist.

Canonical relationship:

Collaborator.

Human description:

"Research person I bounce ideas off."

Canonical relationship:

Former colleague.

Human description:

"Worked together at Pius."

Canonical relationship:

Mentor.

Human description:

"Gives useful career advice."

Human labels remain optional.

These labels should appear in briefing contexts, search results and relationship summaries because personal language often carries more meaning than formal classification.

12. UPCOMING AND PAST ACTIVITY

Activity should split into Upcoming and Past.

Upcoming includes:

Meetings.

Events.

Application stages.

Tasks.

Scheduled communications.

Professional development.

Shared deadlines.

Follow up commitments.

Past includes:

Meetings completed.

Events attended.

Communications exchanged.

Projects completed.

Role changes.

Organisation changes.

Introductions.

Important observations.

This structure keeps the profile operational.

The user sees both relationship memory and what happens next.

13. INTERACTION SEMANTICS

Different activity types must retain different meanings.

Received email.

Sent email.

Reply.

Meeting scheduled.

Meeting completed.

Event invitation.

Event attendance.

Task mention.

Task collaboration.

Project ownership.

Introduction.

Observation.

Role change.

Organisation change.

Application interaction.

These events should not collapse into one generic activity count.

Relationship intelligence should weight meaningful reciprocal interaction more heavily than passive co occurrence.

14. OBSERVATIONS

Observations hold small human details which do not deserve permanent database fields.

Examples:

"Thinking about applying for an EdD."

"Suggested I contact Jane."

"Interested in educational neuroscience."

"Looking at leadership roles."

"Values practical classroom application."

Each observation stores:

Text.

Date.

Context.

Source.

Optional linked record.

Optional person.

Optional organisation.

Observations should support search.

Repeated observations might prompt a structured update.

Example:

Three observations across nine months reference a new organisation.

The system prompts:

Possible organisation change detected. Review evidence.

15. RELATIONSHIP EVENT LEDGER

Every meaningful relationship change should enter one chronological ledger.

The ledger becomes the canonical source for relationship history.

Events include:

Person created.

First encounter.

Introduction.

Relationship created.

Role created.

Role changed.

Organisation joined.

Organisation left.

Meeting occurred.

Communication occurred.

Project started.

Project ended.

Event attended.

Application created.

Observation added.

Relationship ended.

Relationship reactivated.

The ledger should remain accessible through the Timeline and History views.

The ledger supports later analytics, briefs, visualisation and AI retrieval.

16. RELATIONSHIP TIMELINE

Timeline should combine duration and point events.

Ongoing periods appear as horizontal bands.

Examples:

Colleague at St Pius, 2020 to 2024.

Research collaborator, 2023 to present.

Mentor, 2024 to present.

Point events appear as dots.

Examples:

Met at conference.

Joined UNSW.

Introduced to Jane.

Research project began.

HALT event attended.

Filters include:

Current relationships.

Historical relationships.

Organisation.

Project.

Program.

Meeting.

Event.

Communication.

Application.

Observation.

Evidence strength.

The timeline should remain a working information surface, not decorative animation.

17. EVIDENCE LEDGER

Important profile facts require provenance.

Each evidence row includes:

Fact.

Current value.

Source.

Date.

Evidence type.

Confidence.

Observed or inferred status.

Example:

Fact: Current employer.

Value: UNSW.

Source: Email signature.

Date: 14 September 2026.

Confidence: High.

Status: Observed.

Another example:

Fact: Interested in educational neuroscience.

Source: Meeting note.

Confidence: Medium.

Status: Inferred.

Conflicting evidence should remain visible.

Example:

LinkedIn import says University of Melbourne.

Recent email signature says UNSW.

The system marks UNSW as the stronger current source while preserving both pieces of evidence.

18. COLLECTION GAPS

Missing information becomes explicit relationship intelligence.

Collection gaps might include:

Current organisation uncertain.

Current role outdated.

Preferred communication channel unknown.

Current project status unclear.

No recent interaction.

Relationship context inferred but unconfirmed.

Conflicting organisation evidence.

No source attached to a key fact.

The interface should present gaps calmly.

No red warning state unless a genuine error exists.

Collection gaps represent opportunities to improve understanding.

19. PERSON BRIEF

Person Brief prepares the user before a meaningful interaction.

The brief should open as a focused reading surface rather than another profile page.

Header:

Person.

Current role.

Organisation.

Meeting or event.

Time.

Location.

Primary relationship contexts.

The main body contains six sections.

Who they are.

Why the relationship matters now.

Since you last spoke.

Recent changes.

Open loops.

Talking points.

Additional sections include:

Current shared work.

Mutual connections.

Questions worth clarifying.

Relevant observations.

Introduction paths.

Suggested follow up.

The strongest section is Since you last spoke.

Example:

You last spoke two months ago at the Gifted Education Network event.

Since then:

Nina moved to UNSW.

Nina joined a research panel.

A new shared network formed.

A relevant article entered Knowledge Hub.

One previous follow up remains incomplete.

The brief should feel like professional preparation, not surveillance.

20. RECONNECT INTELLIGENCE

Reconnect suggestions should remain scarce and meaningful.

Do not produce a backlog of 150 neglected people.

Surface three to five suggestions at a time.

Every suggestion must explain the reason.

Example:

Reconnect with Nina.

You worked together on three projects.

Last meaningful interaction was five months ago.

Nina appears at an upcoming event.

Two active shared contexts remain.

Possible action:

Send a message.

Schedule coffee.

Dismiss.

Snooze.

Mark relationship dormant.

The user remains in control.

21. RELATIONSHIP ACTIVITY STATES

Relationship state should use understandable language.

Active.

Cooling.

Dormant.

Reactivated.

New.

Each state derives from interaction evidence.

Example:

Active.

Recent meaningful interaction.

Upcoming contact scheduled.

Current shared work.

Example:

Cooling.

No meaningful interaction for five months.

No upcoming interaction.

One current shared context remains.

No opaque score appears.

22. CHANGE DETECTION

Professional Hub should surface meaningful change.

Examples:

Moved to UNSW.

Started new role.

Left organisation.

Joined project.

New shared context.

Relationship period ended.

New mutual connection.

Dormant relationship reactivated.

A change should become a timeline event and, when relevant, appear in Person Brief and People Home.

23. INTRODUCTION PATHS

Relationship paths show credible routes between the user and another person or organisation.

Example:

You.

Nina.

UNSW.

Target person.

Another path:

You.

Vicky.

Gifted Education Network.

Target person.

Paths should display why each connection exists.

Do not show meaningless degrees of separation.

Prioritise current, evidenced and contextually relevant connections.

24. DYNAMIC COHORTS

Cohorts emerge from shared context.

A person belongs to several cohorts simultaneously.

Examples:

St Aloysius colleagues.

UNSW network.

Gifted Education.

HALT.

NORTH+.

Research collaborators.

Former colleagues.

People met during 2026.

People linked to active applications.

People attending an upcoming event.

Each cohort receives its own overview.

Cohort view includes:

People.

Organisations.

Shared contexts.

Recent activity.

Current opportunities.

Network Ecology position.

25. ORGANISATION PAGE

Organisation pages follow the same relational philosophy.

UNSW should not receive one permanent type.

UNSW might simultaneously be:

Study institution.

Professional development provider.

Research institution.

Event venue.

Potential employer.

Organisation connected to multiple professional contacts.

The Organisation page contains:

Organisation identity.

Current relationship contexts.

People connected to the organisation.

Current work.

Upcoming activity.

Recent changes.

Organisation timeline.

Opportunity windows.

Related networks.

AI relationship search.

The Organisation timeline should show the user's changing relationship with the institution across years.

26. NETWORK ECOLOGY, CORE CONCEPT

Network Ecology becomes the signature visual system for Professional Hub.

The interface should not look like a standard force graph with decorative green circles.

The professional network becomes a living atlas.

Different network structures become different ecological habitats.

People remain people.

Organisations remain landmarks.

Events remain temporal gathering sites.

Projects remain activity sites.

The ecology represents the network around those entities.

27. NETWORK ECOLOGY WORLD VIEW

The widest view displays the entire professional biosphere.

The map should resemble a sophisticated ecological atlas viewed from above.

The environment contains multiple connected biomes.

Each biome communicates structural properties through form, density, spacing and texture.

The design should feel scientific, editorial and immersive.

Avoid game graphics.

Avoid cartoon animals.

Avoid fantasy world styling.

Avoid literal person avatars floating randomly over scenery.

The ecology must encode real network structure.

28. FOREST HABITAT

Forest represents a mature, dense professional community.

Use forest when:

Internal relationship density is high.

Relationships have long duration.

Repeated interaction occurs.

Several people share multiple contexts.

Visual language:

Dense canopy.

Established trunks.

Clearings representing organisations.

Visible new growth at community edges.

Paths between clusters.

Example:

Gifted Education Forest.

Deep forest indicates mature central relationships.

Younger growth near the edge indicates newer contacts.

29. CORAL REEF HABITAT

Reef represents diversity, overlap and relational complexity.

Use reef when:

Many roles overlap.

Several organisations interact.

Cross disciplinary activity exists.

Multiple professional contexts coexist.

Visual language:

Branching reef forms.

Layered structures.

Distinct but interconnected coral systems.

Channels between reef sections.

Example:

University Research Reef.

Different disciplines and institutions appear as distinct reef formations within one connected system.

30. MANGROVE HABITAT

Mangrove represents bridges.

Use mangrove when:

People connect otherwise separate communities.

Cross domain relationships are strong.

Shared people or organisations sit between habitats.

Visual language:

Interlocking roots.

Water channels.

Transition zones.

Dense connective structures.

Example:

HALT Mangrove Corridor.

The corridor physically links School Leadership, Gifted Education and University Research.

31. SAVANNAH HABITAT

Savannah represents broad, dispersed professional networks.

Use savannah when:

Many relationships exist.

Relationship density is moderate.

People span several institutions.

Interaction occurs across distance and time.

Visual language:

Open space.

Distinct groves.

Long pathways.

Large visual distances.

Example:

School Leadership Savannah.

32. WETLAND HABITAT

Wetland represents temporary opportunity concentration.

Use wetland when:

A conference approaches.

A committee becomes active.

A short project begins.

A professional development event creates temporary overlap.

Visual language:

Seasonal water.

Gathering points.

Expanded activity zones.

Temporary paths.

Example:

HALT Conference Wetland.

The area grows before the event and recedes afterwards.

33. ISLAND HABITAT

Island represents specialisation and isolation.

Use island when:

A community has strong internal relevance.

Few outward links exist.

Activity remains relatively self contained.

Visual language:

Separate land mass.

One or two narrow connection routes.

Strong internal detail.

Example:

Educational Neuroscience Island.

The island might remain quiet until a new project creates a bridge to University Research.

34. ECOTONES

An ecotone represents the boundary between two ecosystems.

These transition areas deserve special emphasis.

Ecotones often represent the most interesting relationship growth.

Example:

Gifted Education begins connecting more strongly with University Research.

The environmental boundary becomes richer.

More people occupy the transition zone.

More pathways appear.

New projects appear near the boundary.

The interface labels the area Emerging Ecotone.

This is one of the strongest visual expressions of professional opportunity.

35. PEOPLE INSIDE NETWORK ECOLOGY

People should remain visually human.

Use small portrait markers or initials.

Marker placement communicates network position.

A deeply embedded person sits inside one habitat.

A bridge person sits near a habitat boundary.

A major connector sits inside a mangrove corridor.

A new connection appears near the outer edge.

A dormant person becomes subdued.

Selecting a person opens EGO Ecology.

36. EGO ECOLOGY

EGO Ecology recentres the map around one selected person.

The selected person occupies the visual centre.

Nearby people appear according to direct relationship relevance.

Shared organisations become landmarks.

Shared projects become activity sites.

Events appear as temporal gathering points.

Relationship themes become environmental regions.

Example:

Open Vicky.

The map redraws around Vicky.

One side might show Gifted Education Forest.

Another might show University Research Reef.

Vicky sits where both ecosystems meet.

People shared by Vicky and the user appear nearby.

Current shared projects remain visible.

Upcoming interactions remain visible.

This view answers:

What surrounds this person?

Where do our worlds overlap?

Who connects us?

What work connects us?

Where does the relationship sit inside my wider professional world?

37. MYCELIUM LAYER

The visible biosphere sits above the Universal Links architecture.

A dedicated Mycelium layer reveals the hidden relational structure underneath.

When activated, the surface ecology becomes partially translucent.

Below the terrain appears an interconnected network of fine branching connections.

Different endpoint types remain recognisable.

People.

Organisations.

Projects.

Events.

Notes.

Tasks.

Meetings.

Communications.

Applications.

The Mycelium layer communicates a core architectural truth.

The visible habitats look separate above ground.

Universal Links connect the whole system underneath.

This layer should remain elegant and restrained.

Avoid turning the screen into a technical graph debugger.

38. ECOLOGICAL SUCCESSION, HISTORY MODE

History becomes ecological succession.

A horizontal time scrubber allows movement through years.

Example range:

2015 to 2026.

Dragging through time shows:

New communities appearing.

Old workplaces becoming quieter.

University relationships emerging.

Gifted Education expanding.

HALT creating bridges.

Projects creating temporary activity.

Old communities fragmenting.

New organisations forming landmarks.

Dormant communities receding.

The user watches the professional world evolve rather than reading a static timeline.

39. ECOLOGY LAYERS

Network Ecology should provide layer controls.

Habitats.

People.

Organisations.

Projects.

Events.

Opportunity.

Dormancy.

Connectivity.

Mycelium.

History.

Current view should never show every layer simultaneously.

Users choose the question they want the map to answer.

40. OPPORTUNITY LAYER

Opportunity highlights short term relational relevance.

Highlight:

Upcoming events.

Emerging ecotones.

Shared organisation changes.

New project overlap.

Mutual connections.

Dormant contacts appearing at upcoming events.

New bridge people.

Opportunity should use restrained High Sea orange.

The current design kit reserves High Sea as a decisive accent, so opportunity moments should use orange sparingly rather than colouring entire habitats.

41. DORMANCY LAYER

Dormancy should alter environmental vitality.

Dormant communities become quieter.

Vegetation loses saturation.

Reef activity reduces.

Wetlands recede.

Paths become faint.

Do not make dormant networks look dead.

Dormant means inactive, not irrelevant.

Selecting a dormant area explains:

Last meaningful activity.

People still connected.

Remaining bridge paths.

Previous relevance.

Possible reconnection triggers.

42. PROFESSIONAL NETWORK ECOLOGY INSIGHTS

Network Ecology should derive understandable system level observations.

Examples:

Gifted Education remains your most connected professional community.

University Research has grown fastest during 2026.

School Leadership has become less active.

HALT remains the strongest bridge between three communities.

Educational Neuroscience remains specialised but isolated.

Three upcoming events create temporary overlap between four communities.

Avoid abstract network science terminology unless the user requests detailed analytics.

43. BRIDGE PEOPLE

A dedicated panel shows people linking different professional communities.

Each entry displays:

Person.

Communities linked.

Current shared context.

Why the bridge matters.

Example:

Vicky Leighton.

Gifted Education.

University Research.

Educational Innovation.

Bridge people should remain descriptive.

No ranking by personal value.

44. OPPORTUNITY WINDOWS

Events, role changes, new projects and organisational changes sometimes create short periods of increased relevance.

Professional Hub should detect those periods.

Example:

Gifted Education Network Event.

Three existing contacts attending.

Two mutual connections.

One dormant contact attending.

Two relevant organisations.

One active project overlapping.

Professional Hub surfaces this as an Opportunity Window.

The event page includes:

People you know.

People connected through trusted contacts.

Relevant organisations.

Shared work.

Dormant relationships to reconsider.

Suggested preparation.

45. RELATIONAL SEARCH

Search must extend beyond names.

Users should search relationally.

Examples:

Who do I know at UNSW connected to gifted education?

Who has worked with me on assessment reform?

Who have I not spoken with recently but share an active project with?

Who changed organisation since I last spoke with them?

Who connects my gifted education network and university research network?

Which people are attending the upcoming HALT event?

Which former colleagues now work in universities?

Search results should explain why each result matched.

46. PROFESSIONAL OVERVIEW

Professional Overview becomes the daily operational layer.

The page should contain:

Today's people related meetings.

Upcoming relationship activity.

Recent professional changes.

Open follow ups.

Current opportunity windows.

Three reconnect suggestions.

New observations requiring review.

Recent organisation changes.

Upcoming events with network overlap.

The overview should remain selective.

Professional Hub should surface what matters rather than generate another inbox.

47. VISUAL DESIGN SYSTEM

People remains anchored in the shared Life Hub design language.

Primary canvas:

Warm White.

Secondary background:

Cotton.

Primary deep colour:

Depth.

Navigation and strong structural elements:

Marine and Navy.

Interactive blue:

Wave.

Opportunity accent:

High Sea.

Supporting ecological colours derive from existing pastel families where practical.

Forest:

Pastel Sage.

Reef:

Pastel Blue.

Savannah:

Pastel Gold.

Wetland:

Pastel Lilac.

Warm transition environments:

Pastel Peach.

Typography remains Inter.

Large headings use strong spacing and limited weight variation.

Glass surfaces remain restrained.

Environmental visualisations receive more visual richness than standard data surfaces.

Traditional screens remain calm.

This difference matters.

The Person Profile should feel editorial and precise.

Network Ecology should feel immersive.

Person Brief should feel focused.

People Home should feel operational.

Organisation pages should feel institutional.

Visual difference should come from purpose, not random decoration.

48. RESPONSIVE BEHAVIOUR

Desktop provides the full ecological atlas.

Tablet reduces environmental detail while preserving habitat relationships.

Mobile replaces the full world map with a vertical ecological navigator.

Mobile Network Ecology flow:

Community cards.

Mini habitat previews.

Bridge people.

Opportunity windows.

EGO Ecology as a focused local view.

Avoid shrinking the entire atlas into an unreadable miniature.

Person Profile on mobile prioritises:

Identity.

Next interaction.

Current relationships.

Upcoming activity.

Observations.

Person Brief.

Secondary modules move behind tabs.

49. ACCESSIBILITY

All ecological meaning must have a non visual equivalent.

Colour alone never communicates state.

Every habitat needs a text label.

Every environmental signal needs a textual explanation.

Keyboard navigation must reach every selectable person, organisation and habitat.

Screen reader descriptions must explain the network meaning.

Reduced motion mode disables animated environmental transitions.

History mode requires textual year summaries.

Example:

HALT network formed.

Three new relationships connected Gifted Education and School Leadership.

University Research community gained two new organisation links.

High contrast mode should simplify habitat textures while preserving structural boundaries.

50. EMPTY STATES

Empty Person record:

No current relationships recorded.

Add a relationship or observation to begin building context.

Empty Timeline:

No relationship events recorded yet.

Empty Evidence:

No evidence sources recorded yet.

Empty Network Ecology:

Your professional biosphere begins when People and Organisations gain connected relationships.

Empty Opportunity:

No current opportunity windows detected.

Empty Brief:

No upcoming interaction found.

Open a person and create a meeting or event first.

Empty states should explain the next meaningful action.

51. DATA INTEGRITY RULES

One person equals one shared identity.

One organisation equals one shared identity.

Relationships use Universal Links.

Relationship roles remain contextual and dated.

Historical relationships remain preserved.

Source domains remain authoritative for their own records.

Tasks stay Tasks.

Meetings stay Meetings.

Events stay Events.

Applications stay Applications.

Professional Hub assembles relationship views rather than copying records into Person.

Observed information stays distinguishable from inference.

Every inferred claim needs a source path.

Manual user corrections take precedence over automated inference until stronger evidence appears.

52. PRIVACY AND VISIBILITY

Person views must respect source access.

Hidden linked records must not leak through:

Counts.

Search.

Network graphs.

Timeline.

Briefings.

AI retrieval.

Opportunity windows.

Backlinks.

Organisation pages.

A protected endpoint should behave as absent.

53. INTERACTION PRIORITIES

Phase 1 should perfect the Person Profile.

Focus:

Identity.

Current relationships.

Upcoming and past activity.

Timeline.

Observations.

Evidence.

Organisation links.

Phase 2 should build People Home and Professional Overview.

Focus:

Recent changes.

Reconnect.

Dynamic cohorts.

Upcoming interactions.

Phase 3 should build Person Brief and relational search.

Focus:

Since you last spoke.

Open loops.

Recent changes.

Mutual connections.

Relationship queries.

Phase 4 should build Network Ecology.

Focus:

World view.

Habitats.

EGO Ecology.

Bridge people.

Ecotones.

Opportunity.

Dormancy.

History.

Phase 5 should add Mycelium and deeper network intelligence.

Focus:

Universal Links visual layer.

Cross habitat analysis.

Ecological succession.

Advanced opportunity detection.

54. SUCCESS CRITERIA

People succeeds when the user opens a person and understands the relationship within seconds.

People succeeds when historical context remains available without cluttering current context.

People succeeds when upcoming activity feels more visible than forgotten data.

People succeeds when the user sees professional communities rather than a list of names.

People succeeds when Network Ecology communicates structural information without needing technical network analysis knowledge.

People succeeds when Person Brief reduces preparation time before meetings.

People succeeds when reconnect suggestions feel relevant rather than nagging.

People succeeds when the wider Hub architecture feels connected through real shared identities.

People succeeds when Professional Hub feels visually and conceptually distinct from Knowledge Hub while remaining recognisably part of Life Hub.

Knowledge Hub is a universe of ideas.

Professional Hub is a biosphere of relationships.

Universal Links form the mycelium beneath both visible structure and professional activity.

The central design idea is simple.

People are not records.

Relationships are not fields.

Professional life is a changing ecosystem of people, organisations, work, history, opportunity and context.

</details>

Adam's own framing when he gave this brief: an earlier chat had already produced mockups against this brief using the existing Life Hub design language, and he judged them "not great." He asked for a from-scratch redesign, deliberately withholding the old mockups so the new attempt wouldn't be anchored to them.

---

## Part B — the six mockups produced this session

All six are real rendered PNGs (headless Chromium screenshots of hand-built
HTML/CSS, not an AI image-generation service — see "Why PNGs, not an image
model" below), desktop only, 1680px wide. Files live in `mockups/`.

1. **`01-people-home.png`** — People Home. Header (title/subtitle/Add
   person/Search), a row of 4 signal cards (Active relationships / Upcoming
   interactions / Recent relationship changes / Current opportunity
   windows — each with one descriptive line, no bare scores), a "People
   Today" row of 4 cards (Reconnect / Upcoming / Change detected /
   Opportunity, each with a chip, a one-line reason, and an action link),
   a Recent Activity feed, and a Dynamic Cohorts chip row using the five
   pastel families.

2. **`02-person-profile.png`** — Person Profile, Overview tab. Header
   (avatar, name, role/org, three relationship-type chips, one italic
   human-language description, action buttons), the seven-tab row
   (Overview/Timeline/Shared Work/Observations/Network/Evidence/History)
   with Overview active, a 6-up summary strip (last contact / next
   interaction / organisation / shared contexts / shared work /
   relationship state — state uses a colour dot + word, never a score),
   Current Relationships (each row shows canonical type + human context +
   since-date, independently dated per Principle 3), Upcoming & Past
   Activity split in two columns, Observations, Collection Gaps (calm,
   no red/warning styling), Shared Contexts chips.

3. **`03-person-brief.png`** — Person Brief. Deliberately *not* another
   profile page — a centred reading-surface "sheet" on the Cotton
   background (distinct from every other screen's rail+canvas layout, per
   the brief's instruction that Person Brief "should feel focused").
   Header with meeting context. Body sections: Who they are; a
   visually-distinct "Since you last spoke" box (pastel-blue background,
   the section the brief calls the strongest); Open loops / Current shared
   work two-up; Talking points (numbered) / Mutual connections two-up;
   action row (Snooze / Open full profile).

4. **`04-network-ecology.png`** — Network Ecology, world view. The
   showpiece. Hand-placed SVG "habitats" as soft organic blobs (not force-
   graph circles): Forest (Gifted Education, pastel sage), Coral Reef
   (University Research, pastel blue), Mangrove Corridor (HALT, pastel
   lilac, physically linking Forest and Reef), Savannah (School Leadership,
   pastel gold), Wetland (HALT Conference, seasonal/dashed outline),
   Island (Educational Neuroscience, pastel peach, isolated). An "Emerging
   Ecotone" dashed circle at the Forest/Reef boundary, styled in High Sea
   orange per the brief's "opportunity sparingly" rule. Small avatar
   markers (initials in circles) placed inside habitats per person. Right
   rail: Legend, Bridge people, Insights (plain-language system
   observations, no network-science jargon, per section 42).

5. **`05-organisation.png`** — Organisation page (UNSW). Header with
   multiple simultaneous relationship-context chips (Study institution /
   Research institution / Potential employer / Event venue — the brief's
   point that no org gets one permanent type). People connected to UNSW
   grid, Organisation Timeline (dated, multi-year), an Opportunity Window
   card (High Sea-tinted), Current Work, Related Networks, Recent Changes.

6. **`06-your-network.png`** — "Your Network," added after Adam's
   follow-up ask for "the network view that shows how all of these people
   are connected to me, others, etc in one connected view." This is the
   brief's **EGO Ecology** (section 36) made literal: "You" at the centre,
   solid lines to direct contacts, a dashed "not yet connected" suggested
   tie, a dashed mutual-connection arc between two contacts who know each
   other independently of you, an orange shared-work diamond node linking
   three people, muted 2nd-degree contacts clustered behind an
   organisation landmark, and a right rail with Legend / Introduction
   Paths (plain-text chains, e.g. "You → Nina → UNSW → James Cho") /
   Network stats. Still uses the same soft habitat-tinted backgrounds as
   screen 4 so it reads as the same world, recentred.

### Design system used (all six)

Pulled directly from `packages/design-kit/tokens.css` — not invented:
`--warm-white #fbf8f2`, `--cotton #f5f1e9`, `--depth #0a1536`, `--marine
#142b51`, `--navy #17375e`, `--wave #376fb7`, `--high-sea #f68620`
(rail/decisive-accent only, per the token file's own comment — used
sparingly for Opportunity, never as a habitat fill), pastel families
(`--pastel-sage/-blue/-gold/-lilac/-peach` + their `-ink` text variants),
Inter, the 8-step type scale, the radius/elevation scale. The left rail
follows `packages/design-kit/RAIL.md` exactly: 15rem (`240px` at this
render scale), Depth→Marine vertical gradient, `--on-dark*` text only, 18px
outline icons + title-case labels, no coloured dots.

### Why PNGs, not an image-generation model

No dedicated image-generation tool was available in-session. The Canva MCP
connector was tried but its CDN domains (`design.canva.ai`,
`export-download.canva.com`) are blocked by this environment's egress
policy — a generated design could not be previewed or downloaded, only
handed off as an unverifiable link. Instead: real HTML/CSS built against
the actual design tokens above, rendered to PNG with the environment's
pre-installed headless Chromium (`/opt/pw-browsers/chromium-1194/`), with
Inter fetched from Google Fonts and embedded as base64 `@font-face` so
rendering has no other runtime dependency. Every image was visually
inspected (via the `Read` tool's image support) and iterated before being
sent — this is not a blind AI-image-model output.

---

## Part C — what already exists in this codebase (the reuse map)

This is the important part for scoping. A prior pass in this same
conversation under-credited the codebase — it said "no dedicated
image/graph tool exists" and called Network Ecology "a standalone R&D
project." On closer reading of the actual files (not just grepping for
matching names), that was wrong. Two independent, production, *tested*
graph engines already exist in this repo and do most of the mechanical
work Network Ecology needs. Treat the table below as verified — every path
was actually opened and read this session, not inferred from a filename.

### Data layer (Universal Links / entities) — already built, already wired to `apps/professional`

| Brief concept | Existing implementation | Path |
|---|---|---|
| Person / Organisation as shared identity | `identity-schema.mjs`, `PersonRecord`/`OrganisationRecord` types | `netlify/functions/_shared/identity-schema.mjs`, `apps/professional/src/domain/types.ts` |
| Universal Links (dated, typed, contextual relationships — Principles 2 & 3) | Canonical link repository, 8 typed relationship declarations, `valid_from`/`valid_to` periods | `netlify/functions/_shared/universal-link-repository.mjs`, `relationship-registry.mjs`, `universal-link-schema.mjs` |
| Current + historical relationships, timeline, linked records (section 6, 10, 16) | `EntityOverview` assembler — one server call returns `current_relationships`, `historical_relationships`, `timeline`, `linked_records` | `netlify/functions/_shared/entity-overview.mjs` (assembler) + `netlify/functions/entity-overview.mjs` (route `/api/entities/overview`), consumed by `apps/professional/src/components/entity-detail.ts` |
| Person/Organisation search (People Home search, relational search groundwork) | MiniSearch-backed, route `/api/entities/search` | `netlify/functions/entity-search.mjs`, `apps/professional/src/components/entity-search.ts` |
| "@ mention a person/org" picker (section 5 rapid capture; Communications; Tasks integration) | Already built, in the shared design kit, not app-local | `packages/design-kit/js/entity-picker.js`, `entity-chips.js` |
| Relationship Timeline renderer | Already built as a shared design-kit component | `packages/design-kit/js/relationship-timeline.js`, consumed by `apps/professional/src/components/relationship-timeline.ts` |
| Auth, hub shell, left rail, routing | All real, wired into the umbrella build (`build:professional`, hub-switcher entry) | `apps/professional/src/auth/gate.ts`, `src/shell/shell.ts`, `src/app/router.ts` |

Current scope is explicitly read-only (`apps/professional/AGENTS.md`,
"Scope (Slice 4)"): People/Organisations search, person/org pages with
current+historical relationships and a timeline, and Communications as "one
honest empty state only." Person page today (`apps/professional/src/views/
person-page.ts`) is a *flat* detail view — no tabs, no summary strip, no
human relationship labels, no Observations, no Evidence Ledger. Confirmed
by reading the file directly, not inferred.

### Graph/visualisation layer — the piece originally (wrongly) called "needs new R&D"

Two independent, mature, tested canvas/SVG graph engines already exist in
this exact repo, built for other hubs, doing almost exactly what Network
Ecology and EGO Ecology need structurally:

| Brief concept | Existing implementation | Path | Notes |
|---|---|---|---|
| Force-directed graph rendering, hover/drag/select, two view modes, animated fade transitions between states | `mountForceGraph` — 788-line production canvas engine, `"constellation"` (focused) vs `"showAll"` (full graph) variants | `apps/knowledge/src/archive/forceGraph.ts` | Built for Knowledge's note graph. Domain-agnostic mechanically — swap the node/link data source. |
| Habitat clustering (section 26–34: grouping into forest/reef/etc.) | `collapseConstellation` / `applyConstellationHubClick` — clusters leaf nodes around a "hub" node, expand/collapse | `apps/knowledge/src/archive/keywordGraph.ts` | Today: hub = topic keyword, leaf = note. Direct analogue: hub = organisation/shared context, leaf = person. This is the single biggest thing the earlier pass in this conversation got wrong by calling it "needs new graph-analysis research" — the *clustering mechanism* already exists; what's actually new is only the *rule* for which cluster gets called "forest" vs "reef" vs "savannah" (see Part F). |
| EGO Ecology (section 36 — recentre on one person, dim outside N hops) | `selectionCluster`, `isFocusNode`, `isFocusLink`, `searchCluster`, and `neighborhood(edges, focus, hops)` | `apps/knowledge/src/archive/graphFocus.ts`, `apps/life/js/app/chart-kit/theme-constellation.js` | This is EGO Ecology already built, for notes instead of people. `neighborhood()` is literally the hop-traversal function. |
| A second, independent proof this generalises: two entity kinds + two relationship "layers" toggled on one graph | `buildWorkstreamModel`, d3-force (`forceLink`/`forceManyBody`/`forceCollide`/`forceX`/`forceY`), `'blockers'` vs `'workstreams'` modes | `apps/tasks/src/views/graph.ts` (500 lines) | Structurally identical to "people + organisations" with "direct relationship vs shared work" layers — this is close to a template for screen 6 (Your Network). |
| Introduction Paths (section 23) as a real flow diagram instead of a text list | Generic `{from, to, count}` → Sankey layout | `apps/life/js/app/chart-kit/sankey-flow.js` (uses `d3-layout.js`'s `sankey`) | Direct upgrade path for the "You → Nina → UNSW → James Cho" chains drawn as plain text in mockup 6. |
| Ecological Succession / History mode (section 38 — scrub through years) | Full year-circle with per-date values, angle math already solved | `apps/life/js/app/chart-kit/radial-year.js` | Pairs naturally with Universal Links already storing dated `valid_from`/`valid_to` periods — the data for history mode already exists, this primitive helps the UI. |

`d3-force` is a devDependency at the repo root and is already proven in
production in three places: `apps/tasks/src/views/graph.ts`,
`apps/knowledge/src/archive/forceGraph.ts` /
`constellationSimulation.test.ts`, `apps/life/js/app/chart-kit/d3-layout.js`.
Not a new library to introduce or evaluate.

Also checked and confirmed **not** directly reusable, so don't assume
otherwise: `apps/life/js/app/bloods-explainers.js` (hand-written medical
reference content, not a generic evidence/confidence/provenance pattern —
Evidence Ledger and Collection Gaps have no existing analogue and are
genuinely new, see Part F). `hub-places-map.js` / `view-on-map.js` are
literal geographic maps (maplibre-gl) — only relevant if an Organisation
page ever wants a real map of where an org is located, not for the
relationship graph itself.

### Related planning documents already in the repo

| Doc | Covers | Relevant how |
|---|---|---|
| `docs/proposals/comms-hub-people-unification.md` | Why Person/Organisation must be shared identities; Universal Links as the single relationship mechanism across all hubs; the `@` picker as the standard relationship-creation UI. Status: "draft for discussion, not adopted" per its own header, but its architecture is what's actually implemented today. | Read this for *why* the data layer looks the way it does. |
| `docs/universal-links/implementation-programme.md` (1587 lines), `milestone-4-build-programme.md`, `milestone-5-6-build-programme.md` | Slice-by-slice engineering build-out (Slice 1: entity-ref/access/resolvers/registry; Slice 2: write repository; Slice 3: identity + entities API; Slice 4: `apps/professional` itself; Slice 5: Communications storage + entity picker/chips; Slice 6: Tasks integration). | This is the *build document that exists* — but only for data/API plumbing. Explicitly excludes (Slice 4 AGENTS.md): "Do not add Tasks integration, Meetings, Events, Applications, Career, Knowledge migration, or StudentReference here." Says nothing about People Home, Person Brief, Dynamic Cohorts, Evidence Ledger, or Network Ecology — those concepts do not appear anywhere in it. |
| `docs/universal-links/repository-map.md` | A Slice-0 snapshot (dated 2026-09-11) auditing what existed on `origin/main` at that time — useful for *method* (how to verify claims against the real repo) but stale on specifics: it lists Slices 1–4 as "missing," which is no longer true as of this session's direct file reads. Don't trust its status column without re-verifying against current `HEAD`. |
| `apps/professional/AGENTS.md`, `README.md` | Current scope, server contracts consumed, local dev (`npm run dev`, passphrase `professional-hub-local`), test/build commands. | Read first — this is the house style/conventions for anything added to this app. |
| `docs/consolidation/plan.md` + `docs/consolidation/checkpoints/` | Umbrella fold (one repo, one auth, one design kit) — a *different*, now-complete project. Not about People. | Background only; don't confuse with the above. |

**No document anywhere in the repo currently covers the product/UX vision
in Part A or the six mockups in Part B.** Confirmed by grep across
`**/*.md` for "People Home," "Person Brief," "Dynamic Cohorts," "Network
Ecology," "relationship intelligence," "habitat" — zero hits outside this
new folder.

---

## Part D — honest gap analysis: what's genuinely new work

Not everything is reuse. Three things were checked specifically and found
to have no existing analogue anywhere in the repo:

1. **Evidence Ledger / Collection Gaps** (brief sections 17–18) — the
   concept of a fact having a source, a confidence level, and an
   observed-vs-inferred status, with conflicting evidence staying visible
   rather than overwritten. Nothing like this exists. Closest thing
   checked was Communications' `incomplete_links` tracking
   (`apps/professional/src/domain/types.ts`) — not the same thing, that's
   link-completion status, not fact provenance.

2. **Relationship Activity State** (section 21 — Active / Cooling /
   Dormant / Reactivated / New, computed from interaction evidence, never
   an opaque score) — needs a real classifier function over interaction
   timestamps + upcoming meetings + shared-context count. Bounded, clear
   rules per the brief, but there's no existing "compute a relationship
   state" function to extend.

3. **Habitat classification rule** — the *mechanism* to cluster people
   around a hub (organisation/context) already exists (Part C), but the
   *rule* that decides a given cluster reads as Forest vs Reef vs Mangrove
   vs Savannah vs Wetland vs Island (density, duration, cross-context
   bridging — sections 28–33) is a genuine new product/algorithm decision,
   not a lookup anywhere in the repo.

4. **Person Brief's "Since you last spoke"** (section 19) — this is the
   first point where actual LLM generation over a structured diff (not
   just query+render) is needed. The *mechanism* to call an LLM
   server-side already exists and is proven (`netlify/functions/ai-job.mjs`,
   `ai-jobs.mjs`, the `knowledge-clementine-*.mjs` / `knowledge-curator.mjs`
   pattern) — so this is "another one of those," but the prompt design and
   the "feel like preparation, not surveillance" tone (section 19's own
   warning) is real product work, not just plumbing.

5. **Dynamic Cohorts, Reconnect Intelligence, Opportunity Windows, Bridge
   People, Introduction Paths** (sections 20, 23, 24, 40, 43, 44) — these
   are graph-query/aggregation features over Universal Links data that
   already exists (query by shared `context_key`, multi-hop traversal,
   join against calendar/event data). Real engineering, but it's writing
   new *queries* over an existing indexed graph, not new architecture —
   the by-source/by-target Blobs index pattern is already established
   (`netlify/functions/_shared/universal-link-blobs.mjs`).

---

## Part E — what the requested build document should do

Adam asked (in this conversation, not repeated here) for a build document
covering these six views specifically, written so a fresh Claude Code
session — or Cursor, which maintains `docs/consolidation/plan.md` and the
universal-links programme docs in this repo's existing convention — can
pick it up without re-deriving Parts A–D above.

Suggested home: `docs/professional-hub/people-experience/BUILD-PLAN.md`
(sibling to this file), following the section conventions already used by
`docs/universal-links/milestone-5-6-build-programme.md` (Outcome →
Repository state → Scope and ownership → Mandatory source reading →
per-feature contract sections → Required tests → Verification commands →
Stop condition) so it reads as one family of documents with the existing
programme rather than a stylistically different one-off.

It should give each of the six mockups (Part B) a concrete implementation
path: which existing files/functions to extend or fork (Part C), what's
genuinely new (Part D), what server contract or route it needs, what
tests it needs, and where it sits in a phase sequence — ideally aligned
with the brief's own Phase 1–5 plan (section 53) rather than inventing a
new sequence, since Phase 1 (fitted Person Profile) is the closest to
already-built.
