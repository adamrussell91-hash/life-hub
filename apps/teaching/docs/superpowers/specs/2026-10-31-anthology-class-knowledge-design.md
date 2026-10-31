# Anthology map: class knowledge

Date: 31 Oct 2026. Status: design approved, not built.

## Why

The unit Anthology map shows the teacher's tagged poem notes grouped by theme, concept or text. Students have done a booklet of pre-readings (articles, context, critics). The class should build that reading into the same map, so it:

1. forms a lasting record of class knowledge, and
2. shows where ideas from the readings meet lines in the poems, through shared themes and concepts.

This is a knowledge graph, not a writing scaffold. Quote / Technique / Effect / Purpose / Link to syllabus is something the map feeds later; it is not the form.

## What the user sees

### Teacher | Class switch

A two-way switch sits in the map bar beside Themes / Concepts / Texts.

- **Teacher**: the teacher's poem notes only (the map as it is today).
- **Class**: the teacher's poem notes plus every shown student addition.

The teacher page opens on Teacher. The student page opens on Class. Both can switch. Print mode stays the teacher list.

### Student items on the map

- Each addition is one dot, labelled with its **title**.
- Student dots are drawn as hollow rings so they read apart from poem quotes (solid dots).
- They attach to the same theme and concept hubs as the poem notes. With Texts grouping, student items sit under one "Class knowledge" hub.
- Clicking a student dot opens the on-map card (PR 1245) with: title, the quote or line from the article, the general info, and theme/concept chips. No "Open in the lesson" link.

### Adding

On the Class tab, an **Add to the class map** button opens a card over the map with four fields:

| Field | Rule |
|---|---|
| Title | required, up to 80 characters; becomes the dot's label |
| Quote or line from the article | required, up to 600 characters |
| General info | optional, up to 1200 characters |
| Themes and concepts | at least one; chips picked from the unit's existing themes and concepts only, no new tags |

Plus an initials box, as in quizzes (2–4 letters).

On send, a clean item appears on the map at once. An item that the shared text filter (`flagText`) flags waits for the teacher, and the student is told it will appear once checked.

### Teacher controls

On the Class tab, a student card also shows the teacher the initials and a time, plus **Hide** and **Delete**. Flagged items appear for the teacher only, marked "Waiting", with **Show** and **Delete**. Students never see initials.

## Data

A new store, keyed by unit, kept apart from lesson drafts. Students can only add to it.

```
anthology-knowledge/{unit}/items/{id}        { title, quote, info, themes[], concepts[], initials, flagged, created_at }  create-only
anthology-knowledge/{unit}/moderation/{id}   { status: shown | hidden }  teacher only
```

- An item is shown when it isn't flagged and has no `hidden` moderation, or when moderation says `shown`. Delete removes both keys.
- Allowed themes and concepts are read server-side from the published unit's anthology, never trusted from the request. Unknown tags are dropped. An item left with no tags is refused.
- A cap of 30 items per initials per unit stops one device flooding the map.

### Endpoints

- `GET /api/published-anthology-knowledge/{unit}`: public; shown items without initials. The unit must be published and its plan must contain an anthology block.
- `POST /api/published-anthology-knowledge/{unit}`: public; adds one item. Validation as above.
- Teacher (signed in): list all items with initials and status; set moderation; delete.

Server code sits in `netlify/functions/_shared/anthology-knowledge.mjs` and follows the brainstorm module's patterns (strong reads, `onlyIfNew` writes, safe ids, `flagText`).

## Client

- `anthology-knowledge.ts` holds the item type, a fetch/add API, and the map-item conversion.
- `anthology-graph.ts`: `buildAnthologyGraph` takes optional knowledge items, maps them to entries with a marker so the graph draws them as rings, and labels them by title.
- `anthology-view.ts`: Teacher | Class switch, Add card, student-dot cards, teacher Hide/Delete/Show.
- The knowledge graph needs a per-node "ring" style hook in `forceGraph` (opt-in, like the existing `tools` and `theme` options) so Knowledge Hub maps are unchanged.

## Out of scope for now

Students adding poem quotes; editing after posting; QTEP output; linking an item to one specific dot (themes do the linking).

## Tests

- Server: tag allow-list, required fields and lengths, flag → waiting, cap, moderation, delete, unpublished unit refused.
- Client: graph includes knowledge only on Class; student entries carry the ring marker and title label; form refuses no-tag sends.
- Browser walk at desktop and 390px, on both the teacher page and the student page.
