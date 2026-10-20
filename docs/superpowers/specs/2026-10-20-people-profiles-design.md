# People profiles: roles, history, LinkedIn paste, archive

Date: 20 October 2026. Professional Hub, People page. One build, one PR, five phases as commits.

All names in this doc, its tests and mockups are invented. The repo is public.

## Why

Adam's walk-through of the live People page (20 Oct):

- Add person gives no feedback. The person is saved, but the form stays open and the page sits for seconds.
- A person can hold only one visible workplace. Many people (Adam included) hold several roles at several organisations.
- There is no work or education history beyond free notes.
- The "Your relationship so far" arc reads badly.
- The buttons clustered around the profile name look crowded.
- A person cannot be removed.
- The Add person form is plain, and typing a LinkedIn profile in by hand is slow.

## Decisions (agreed in chat)

| Question | Decision |
|---|---|
| Arc graph | Replace it with one **timeline** that merges career milestones and touchpoints with Adam. |
| Where history lives | **Linked organisations.** Every role and qualification is a Universal Link to an Organisation record. |
| LinkedIn input | Adam **pastes the profile text**; nothing is fetched or scraped. Claude extracts it into a **review card** of tickable rows. The same card serves new and existing people. |
| Delete | **Archive** is the everyday action, with a 10-second Undo. The Archived filter offers **Restore** and **Delete permanently** (typed confirmation). |
| Unknown organisation in a paste | **Created on confirm**, with a monogram crest until a real crest is added. |
| Look | Life Hub's own styling (navy and cream, Inter, crest shields), not the generic mockup look. |

## What already exists (no new storage)

- Link types `employee_at`, `member_of` and `studied_at` in `netlify/functions/_shared/relationship-registry.mjs`. All are person → organisation, many-to-many, `temporalMode: 'period'`, `roleMode: 'optional_text'`. A role is the link's `role`, and dates are `valid_from` / `valid_to`. **Current** means `valid_to` is null and the status isn't ended.
- Lifecycle actions on `/api/entities?action=archive|activate|deidentify|delete`. For a Person the graph is `active → archived → active`, and `archived → deidentified → deleted`. Deidentify and delete redact identifying fields (`entity-lifecycle.mjs`). A self identity can't be archived or deleted, and the UI hides those actions for self.
- Organisation crests: `logo_key` plus a monogram fallback, already drawn in directory rows.
- The Anthropic client in `netlify/functions/_shared/anthropic-client.mjs`. The model default follows `alchemy-agent.mjs` (`claude-sonnet-5-5`).
- Touchpoints: `model.arcPoints` from the entity overview, currently drawn by `domain/relationship-arc.ts`.

## Phase 1: Add person feedback and speed

The cause: `add-person-form.ts` creates the person, then each link and the observation one after another. `people.ts` `onCreated` then waits for a full fresh directory scan, and the form is never closed.

- Create links and the observation in parallel once the person exists.
- On success: close and reset the form, insert the new row into the in-memory directory straight away, select and open the new person, and show the toast **"Added {name}"** with **Open** and **Undo**. Undo archives the person.
- The fresh directory reload still runs, in the background, without blocking anything.
- If a link fails, the person is still created and the toast says what didn't save ("Added {name}. Workplace didn't save. Retry"). This keeps today's `warnings`.

## Phase 2: Archive, restore, delete permanently

- The "…" menu in the profile header offers **Archive person**. The person leaves the list at once, with the toast "Archived {name}" and Undo (10 s). Undo calls `activate`.
- Directory rows carry `lifecycle_status`. The client hides archived people by default. The Filter sheet gains **Show archived**; archived rows are greyed and show an "Archived" pill.
- An archived person's profile shows a banner with **Restore** and **Delete permanently**.
- Delete permanently opens a dialog that asks Adam to type the person's name. It runs `deidentify` then `delete`. A tombstone remains, links to it stop resolving, and the row disappears for good. The dialog copy says this can't be undone.
- None of these appear for the self identity.

## Phase 3: Roles and history

- A Person's **roles** are their `employee_at` and `member_of` links. Their **education** is their `studied_at` links. Each one shows the organisation crest, the role text and a date range.
- The header lists every current role. Past roles and education appear in the timeline.
- **Add role** and **Add education** open an inline row with these fields:
  - organisation picker (search, or create a new one: the existing `searchEntities` / `createEntity` pattern from `add-person-form.ts`)
  - role or qualification text
  - from and to as month and year, or year alone
  - a "Current" checkbox that clears "to"
- Each existing row has **Edit** (role and dates), **End** (sets `valid_to`) and **Remove** (archives the link), using the existing Universal Links endpoints.
- The Add person form's single "Organisation, when known" becomes the first role row.
- The directory's one-line subtitle stays "{first current role} · {organisation}", with "+N" when there are more.

## Phase 4: Profile header and timeline

**Header** (`components/person-header.ts`):

- Avatar with the crest of the main organisation.
- Name, with a small warmth dot and its label.
- One stacked line per current role: crest, role, organisation.
- One quiet line: "Met at {where} · {date}".
- Only two controls: a pencil icon (Edit) and a "…" menu holding Update from LinkedIn, Check for links and Archive person.
- The colleague/student pill is dropped; the role lines carry that meaning.

**Timeline** (`domain/person-timeline.ts`, pure, plus `components/person-timeline.ts`):

- Merges career entries (roles and education, keyed by `valid_from`) with touchpoints (`arcPoints`). Newest first, with a year gutter.
- Markers:
  - role: filled crest shield
  - education: outlined crest shield
  - touchpoint: dot
- Career rows read "Role, Organisation · 2016 – 2022" (or "– now"). Touchpoint rows read "label · day month".
- More than 12 rows collapse behind "Show all".
- Empty state: "Add their roles and education, or link a meeting or note."
- It replaces "Your relationship so far". `relationship-arc.ts` and its tests are deleted.

`people.ts` is already 1,823 lines. The header, timeline and roles editor go in their own modules, and `people.ts` only mounts them.

## Phase 5: Add person redesign and Paste from LinkedIn

**Add person panel** (Life Hub styling, per the approved mockup):

- At the top, a "Paste from LinkedIn" box with one line of help. Below it, "or type it in": Name, Where you met, Who introduced you, a first role row, an optional observation and a date.
- Esc and a close icon both close it.

**Parse endpoint** `POST /api/people/linkedin-parse`. Operator-gated.

- Body: `{ text, person_ref? }`. The text is capped at 30,000 characters.
- One Claude call (`claude-sonnet-5-5`, max output 2,000 tokens) with a strict JSON schema:
  - `name`, `headline`, `about` (≤ 280 chars)
  - `positions[]`: `title`, `organisation`, `start`, `end`, `current`, `kind` (`employee` or `member`)
  - `education[]`: `qualification`, `institution`, `start`, `end`
- Dates are `YYYY` or `YYYY-MM`, and null when absent. The prompt says to extract only what the text states, never to invent anything.
- The server then matches each organisation name to existing Organisations by exact name or alias, case- and punctuation-insensitive, through the entity search used today. The match isn't fuzzy, so there are no silent wrong matches. Unmatched rows are marked `new_organisation`.
- With `person_ref`, rows are compared with the person's existing links. A row is `same` (hidden by default) when organisation and role match, `changed` when the dates differ, and `new` otherwise.
- The pasted text is never stored or logged; only the confirmed rows are saved.

**Review card:**

- Sections: Current roles, Past work, Education, About.
- Every row is ticked by default and shows its crest and a "matched" or "new organisation" pill.
- **Back to paste** returns to the paste box. **Add {first name} with N items** (or **Save N changes** on an existing person) saves.
- Saving creates any new Organisations first, then the person if new, then all links in parallel. About is saved as an observation sourced "LinkedIn paste". Then the Phase 1 success flow runs.
- On an existing person the card opens from "…" → Update from LinkedIn. The paste box and review are the same.

**Errors:**

- No API key: the paste box says "Paste reading is not set up" and the manual form still works.
- Claude error or unparseable output: "Couldn't read that paste. Try again or type it in."
- Over the cap: "That's longer than a profile. Paste just the profile page."

## Testing

- **Unit, pure:** timeline merge and sort; diff of parsed rows against existing links; organisation name normalising and matching; date formatting.
- **Handler:** `linkedin-parse` with an injected `complete`, covering matching, `new_organisation`, the existing-person diff, the cap, unconfigured, and bad model output.
- **People page (vitest):**
  - Add closes the form, shows the toast and opens the person, all before the directory reload finishes.
  - Undo archives.
  - Archive hides the row; Show archived reveals it; Restore works; Delete permanently needs the typed name and runs deidentify then delete.
  - The header shows several current roles; the self profile has no archive or delete.
  - The roles editor's add, end and remove flows.
  - The review card's untick, confirm and the order of create calls.
- `npm run pre-pr-check` passes.
- Rendered-view check at desktop and 390px with the preview script and sample data, with screenshots in the PR.

## Out of scope

Profile photos, fetching LinkedIn by URL, bulk import, re-crawling profiles, and changing the student directory.
