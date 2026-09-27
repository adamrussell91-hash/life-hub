# Plan 5 (for Codex): import Adam's Notion Communications into the Professional Hub

You're working in the `life-hub` repo. Read this whole file before starting.

## What you're building

A command-line import. It reads Adam's **Communications** database **straight from Notion** and writes the records into the Professional Hub's private storage:
- comms, meetings and events
- the people in them
- threads
- open promises

**No export zip.** You have Notion access through your Notion connector. The import has two halves:
1. **Pull (you, using the connector):** read every row and page body of the Communications database, and save it as a local **snapshot** folder outside the repo.
2. **Import (code):** the script reads only that snapshot. It never calls Notion itself. This keeps it testable, and re-runnable without hitting Notion again.

Fallback: if the connector can't page through the whole database, ask Adam for a Notion integration token (`NOTION_TOKEN`, shared with the Communications and People databases). Then write `scripts/lib/notion-comms/pull.mjs`, which calls the Notion REST API and writes the **same snapshot format**. Never print or commit the token.

The import:
- **previews by default** and only writes with `--apply`
- is **safe to run twice**
- never puts Adam's real data in this repo

## Rule zero: this repo is public

`adamrussell91-hash/life-hub` is a public GitHub repo. Adam's Communications contain students (minors), parents and colleagues, and sometimes health or family detail.

- **Never commit the snapshot or any report.** Keep the snapshot outside the repo, for example `~/notion-comms-snapshot/`. Write reports to `os.tmpdir()`, or to a `--report` path Adam gives you outside the repo.
- **Add these lines to `.gitignore`** as a guard: `notion-comms-snapshot*/`, `notion-comms-import-report*`.
- **Test fixtures use invented people only** (for example "Sam K.", "Ollie P.", "Grace P.", "Ms Lee"). Never copy a real row, name, title or sentence from Notion into a test, a fixture, a commit message, a code comment or a PR description.
- **Keep terminal output to counts and field names.** When you inspect Notion, print property names, value shapes and counts. Don't print page bodies. If you must look at one real row to understand a format, keep it to the terminal and don't paste it anywhere that gets saved.

## Where things live

| Thing | Where it's written | Code to use |
|---|---|---|
| Comms | Netlify Blobs store `professional-hub-content` | `netlify/functions/_shared/communication-repository.mjs` (schema v2: `communication-schema.mjs`) |
| Meetings | same store | `meeting-repository.mjs` (v2: purpose, blocks, decisions) |
| Events | same store | `event-repository.mjs` (v2: `event_type` `professional_development` or `general`, talks, blocks) |
| Threads | same store | `thread-repository.mjs` (kind `general` or `case`, `goals`) |
| Promises | same store (the People ledger) | `ledger-repository.mjs` (v2: `due`, `checked_in_ref`; dedupes by `source_key`) |
| People | Blobs store `universal-link-content` | `identity-repository.mjs` `createIdentity({ kind: 'person', input: { display_name, aliases } })` |
| Links (recipient, attendee, `in_thread`) | `universal-link-content` | Pass them through the record repositories' `links` input where they take one. Otherwise use the universal link repository that `netlify/functions/universal-links.mjs` uses. |

Relationships live **only** as Universal Links, never as ids stored on records. Read `netlify/functions/_shared/relationship-registry.mjs` for the allowed link types. Use `createAccessContext({ workflow: 'professional' })` from `entity-access.mjs` wherever a repository wants an access context.

**Opening the stores from a local script:** copy the pattern in `scripts/copy-hub-blobs.mjs`. That means `getStore({ name, siteID: UMBRELLA_BLOBS_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN })`, with `UMBRELLA_BLOBS_SITE_ID` taken from `netlify/functions/_shared/teaching-blobs.mjs`. Never print the token.

**Building repositories:** build each one exactly the way its Netlify function does (`netlify/functions/communications.mjs`, `meetings.mjs`, `events.mjs`, `threads.mjs`, `people-ledger.mjs`, `universal-links.mjs`, `entities.mjs`). Read those files and pass the same dependencies. Don't write to Blobs keys by hand except for the import map below.

## Files to create

```
scripts/import-notion-comms.mjs            CLI: read snapshot, plan, print report, --apply writes
scripts/lib/notion-comms/read-snapshot.mjs read + validate the snapshot folder
scripts/lib/notion-comms/parse-row.mjs     one snapshot page → a normalised NotionComm
scripts/lib/notion-comms/dates.mjs         Notion date values → { start, end, allDay, timeZone }
scripts/lib/notion-comms/markdown-to-blocks.mjs  page body markdown → hub blocks + to-do items with their heading
scripts/lib/notion-comms/people.mjs        match names to hub People; list people to create
scripts/lib/notion-comms/plan.mjs          everything above → an ImportPlan (pure, no I/O)
scripts/lib/notion-comms/apply.mjs         write an ImportPlan through the repositories
tests/unit/notion-comms-*.test.js          node:test, invented fixtures
tests/fixtures/notion-comms/               a tiny invented snapshot (5–6 pages + people)
```

Everything except `read-snapshot.mjs`, `apply.mjs` and the CLI must be pure: no file, network or Blobs access. That keeps it testable.

## Step 1: pull Notion into a snapshot (don't commit anything)

Use your Notion connector to find the **Communications** database (search for it by name; confirm with Adam if more than one matches). Then:

1. **List every row**, paging until there are no more. Record each page's id, URL, `created_time`, `last_edited_time` and properties.
2. **Fetch every page's body** as markdown (the connector's page fetch).
3. **Resolve Attendees:** collect the distinct People page ids from the Attendees relations and fetch each one's title once. Don't fetch anything else from the People database.
4. **Write the snapshot:**

```
~/notion-comms-snapshot/
  manifest.json         { database_id, pulled_at, row_count, page_count }
  pages/<pageId>.json   one per row (format below)
  people/<pageId>.json  { id, name } for each attendee
```

```json
{
  "id": "32-hex page id (no dashes)",
  "created_time": "ISO",
  "last_edited_time": "ISO",
  "properties": {
    "Meeting Title": "…",
    "Meeting Name": "…",
    "Meeting Type": "…",
    "Communication Method": "…",
    "Date": { "start": "…", "end": "… or null", "time_zone": "… or null" },
    "Attendees": ["peopleId", "…"],
    "Student Name": "…",
    "Location": "…",
    "Notes and Follow Up": "…",
    "Follow-up Required": true,
    "Follow-up Date": { "start": "…", "end": null, "time_zone": null },
    "Parent item": ["pageId"],
    "Sub-item": ["pageId"],
    "Tasks": 0,
    "Projects": 0,
    "Status": "…"
  },
  "body_markdown": "…"
}
```

Empty values are `null` (or `[]` for relations). Record `Tasks` and `Projects` as **counts only**.

**Re-pulls are incremental.** If `pages/<id>.json` exists with the same `last_edited_time`, skip it. Write each file as soon as it is fetched, so an interrupted pull resumes.

When the pull is done, report to Adam in chat, with no row content:
- the database title and id, the row count, and the page files written;
- rows with no Date, no Attendees, or an empty body (counts);
- for `Date` and `Follow-up Date`: 3 value *shapes* with digits kept and words replaced by `X`. For example, `2025-08-28T10:36:00.000+10:00 → 2025-08-28T10:51:00.000+10:00`, or date-only `2025-08-28`;
- the distinct Meeting Type and Communication Method values, with counts.

The Notion database schema (from the live database) is:

| Property | Type | Notes |
|---|---|---|
| Meeting Title | title | |
| Meeting Name | text | often empty |
| Meeting Type | select | Case Management, Curriculum Meeting, Mentoring Meetings, Gifted Education, Parent Communication, Staff Meetings, Professional Development, Student Meeting, Faculty Meeting, Other |
| Communication Method | select | Email, In-person Meeting, Phone Call, Video Call, Text Message, Chat, Mail |
| Date | date | a date or a datetime range |
| Attendees | relation → Notion **People** database | shows people's names |
| Student Name | text | a student's name when the comm is about one |
| Location | text | |
| Notes and Follow Up | text | a short summary |
| Follow-up Required | checkbox | |
| Follow-up Date | date | |
| Parent item / Sub-item | relation to Communications | chains of related comms |
| Tasks, Projects | relation | not imported (see Out of scope) |
| Person | Notion user | ignore |
| Status, Completed | status | Not started / In progress / Done |

If a property name or option differs from this table in the live database, tell Adam and use the live one. Build your fixtures to match the **real shapes** you found, using invented words.

## Step 2: parsing (pure, test-first)

For each part, write the failing tests first, then the code.

**Snapshot** (`read-snapshot.mjs`): read `manifest.json`, every `pages/*.json` and every `people/*.json`. Validate each page against the format above. A malformed file is **reported and skipped**, not guessed. Attendee ids resolve to names through `people/`; an id with no people file is reported.

**Dates** (`dates.mjs`): Notion date values are ISO strings:
- date only: `2025-08-28`
- a datetime with an offset: `2025-08-28T10:36:00.000+10:00`
- a datetime with no offset, plus a `time_zone` (for example `Australia/Sydney`)
- any of these with an `end`

If the connector gave you a different shape (for example English text like `August 28, 2025 10:36 AM`), parse that too. Test it with the shapes you recorded in Step 1.

Return `{ start, end, allDay, timeZone }`:
- Times with no stated offset are wall time in `time_zone`, or **Australia/Sydney** when there is none. Convert them with the server's wall-time helper (`netlify/functions/_shared/wall-time.mjs`), so daylight saving is right.
- An explicit offset wins.
- Unparseable dates return `null`, and the report lists them.

Test every shape you saw in Step 1, and both sides of a daylight-saving change (early April and early October).

**Page body** (`markdown-to-blocks.mjs`): take `body_markdown`. If the connector put the title or a property list at the top, drop those. Notion-flavoured tags such as `<callout>`, `<details>` or `<mention-page>` become plain text. Convert the rest into hub blocks, using the same shapes the Tasks block engine creates (`apps/tasks/src/blocks/create-block.ts`):

| Markdown | Hub block |
|---|---|
| `#`, `##`, `###` | `{ block_type: 'heading', variant: 'section', content: { text } }` |
| paragraphs, bullets, numbered lists, quotes, `<aside>` callouts | `{ block_type: 'rich_text', variant: 'medium', content: { html } }`, with consecutive list items merged into one `<ul>`/`<ol>`, and `**bold**`, `*italic*` and links kept |
| `- [ ] x` / `- [x] x` | stays in the text as `☐ x` / `☑ x`, and is also returned as a to-do item `{ text, checked, heading }`, where `heading` is the nearest heading above |
| images, attachments, embedded databases, child pages | one line: `[Attachment kept in Notion: <file name>]` |

- Escape HTML in the text. The server also runs `sanitizeBlocksDeep`.
- Block ids are `notion_<n>`, unique per page.
- Add a first block: `rich_text` with `<p><em>Imported from Notion</em></p>`.

## Step 3: the plan (pure, test-first)

`plan.mjs` takes these inputs:
- the parsed rows
- the hub's existing People (as `{ ref, display_name, aliases }`)
- the existing import map (Step 4)
- `todayKey` (Sydney `YYYY-MM-DD`)

It returns an `ImportPlan`: records to create, people to create, threads, links, promises, and a report.

**Which kind of record:**

| Notion | Hub |
|---|---|
| Meeting Type is Staff Meetings, Faculty Meeting or Curriculum Meeting | **meeting**. People are `attendee` links. Timed from `Date`; a date-only value becomes 09:00–10:00 Sydney. |
| Meeting Type is Professional Development | **event**, `event_type: 'professional_development'`, `hours: null` (the PD dashboard ignores events with no hours, so nothing inflates). Attendees are `attendee` links. |
| Everything else | **comm**. People are `recipient` links. |

**Comm fields:**
- **Channel:** In-person Meeting → `in_person`; Email → `email`; Phone Call → `phone`; Video Call → `video`; Text Message and Chat → `message`; Mail → `other`; empty → `other`.
- **Direction:** `outbound`, unless the title starts with "Email from", "Reply from" or "Message from", which makes it `inbound`.
- **Timing:** a datetime range gives `scheduled_start`, `scheduled_end` and `time_zone: 'Australia/Sydney'`, with `occurred_at = start`. A date only gives `occurred_at` = that day 09:00 Sydney and no scheduled window, so it shows as a pin. No date at all: use the page's `created_time`.
- **Text fields:**
  - `subject` = Meeting Title.
  - `summary` = Notes and Follow Up, trimmed to the schema limit.
  - `purpose_tag` = Meeting Type, lower-cased (null for Other).
  - `blocks` = the converted page body. If Location is set, add `rich_text` `<p>Location: …</p>` after the "Imported from Notion" block.
- The same text-field rules apply to meetings (`title`, `location_text`, `blocks`, `purpose: null`) and events (`title`, `location_text`, `blocks`).

**People:**
- The people on a record are its Attendees names, plus Student Name if it isn't already one of them.
- **Match to hub People** on a normalised name: lower-case, collapse spaces, strip "Mr/Ms/Mrs/Dr", and compare `display_name` and `aliases`.
- A full name also matches a hub "First L." when that's the only match.
- An exact single match links to that person.
- No match means **create** the person with the Notion name. In line with Adam's decision, students are ordinary People.
- Two or more possible matches are **ambiguous**: don't link, and list it in the report. Adam decides.
- Never create the same new person twice in one run (dedupe by normalised name).

**Threads.** Apply these in order. A record joins at most one thread.

1. **Case:** Meeting Type is Case Management → the thread key is `case:<normalised student or first person name>`, kind `case`, title `<Name> · case management`, `purpose_tag: 'case management'`.
2. **Chain:** a record with a `Parent item` joins its root's thread. Walk up the parents, with a cycle guard. If the root has no case thread, create `chain:<rootNotionId>`, kind `general`, titled with the root's title and tagged with the root's purpose.
3. **Pair:** two or more records share the same first person and the same Meeting Type (not Other) → `pair:<person>:<type>`, kind `general`, title `<Name> · <type in lower case>`.
4. Otherwise, no thread.

Each member gets an `in_thread` link. A thread's `updated_at` becomes its newest member's date, so the "going quiet" nudges make sense. If the repository doesn't allow setting it, leave it and note that in the report.

**Promises** (ledger items, `author: 'adam'`, `comm_ref` = the record's ref):

- **To-dos:** only to-dos under a heading matching `/action items|next steps|follow[- ]?up|to ?do|commitments/i`. Checklists elsewhere are usually templates, not promises.
  - **Owner:** text starting with the student's or another attendee's first name, "Student to" or "They" → `they_owe`, owed by that person. Anything else ("Mentor to", "Mr Russell to", "I will", no subject) → `you_owe`, owed to the record's first person.
  - **Status:** checked → `done`, which gives the case page honest kept/made numbers. Unchecked, with the record in the last 60 days → `open`. Unchecked and older → `dismissed`, kept for history but no nagging.
- **Follow-up Required** ticked → `you_owe` "Follow up: <title>", `due` = Follow-up Date (date only). Status `open` if the due date is today or later, or within the last 60 days; otherwise `dismissed`. No due date and a record older than 60 days → skip.
- **Skip** any promise with no person to attach to, and count it in the report.

**The report** (Markdown, written to the `--report` path or `os.tmpdir()`, never the repo). It shows **counts only**, plus names only where Adam must decide (the ambiguous people, which he already knows):
- rows read, rows matched to pages
- records to create by kind
- people matched, to create, and ambiguous (with the names and their candidates)
- threads by rule
- promises by status
- rows skipped, with reasons
- records already imported (from the import map)

## Step 4: safe to run twice

Keep an import map in `professional-hub-content`:
- `imports/notion-comms/pages/<notionId>` → `{ kind, id }`
- `imports/notion-comms/threads/<threadKey>` → `{ id }`
- `imports/notion-comms/people/<normalisedName>` → `{ ref }`

The plan skips anything already mapped, and marks threads and people that exist as "reuse". Write each map entry **right after** its record is created, so a crashed run resumes cleanly. Ledger items already dedupe on `source_key`.

## Step 5: apply

`apply.mjs` writes in this order:
1. People to create.
2. Records with their people links, then each record's `blocks` (and `summary` for comms) through the repository's update.
3. Threads.
4. `in_thread` links.
5. Promises.

For each step:
- Log a one-line count as it goes.
- On an error, stop, print which step and which notion id failed (no content), and leave the map as it is so the next run resumes.
- Pause 50 ms between writes, so the Blobs write limits are safe.

The CLI:

```
node scripts/import-notion-comms.mjs --snapshot ~/notion-comms-snapshot [--report /tmp/notion-comms-report.md] [--apply]
```

- It requires `NETLIFY_BLOBS_TOKEN`.
- Without `--apply` it reads the live People and import map, prints the report path and writes nothing.
- With `--apply` it asks `Type IMPORT to write N records:` on stdin, unless `--yes` is also given.

## Step 6: tests (invented data only)

Using the invented fixture snapshot in `tests/fixtures/notion-comms/`:
- snapshot reading: a malformed page file is reported and skipped; a missing attendee file is reported
- every date shape, including across daylight saving
- markdown to blocks (headings, lists merged, to-dos with their heading, attachment line, HTML escaped)
- kind, channel and direction mapping
- people matching: exact, alias, "First L.", ambiguous, created once
- the three thread rules, plus cycle-safe chains
- promise rules, including template to-dos ignored
- the plan skipping already-mapped pages

Plus **one apply test** using in-memory stores for both Blobs stores (the memory store pattern in `tests/unit/threads.test.js`), running the real repositories. It must show that:
- a second run creates nothing
- a comm has its blocks, its recipient link and its `in_thread` link
- the case thread has its members

Run: `node --test tests/unit/notion-comms-*.test.js`, then `npm test`.

## Step 7: run it with Adam

1. Pull (Step 1), then a dry run against the snapshot. Send Adam the report's summary counts and the ambiguous-people list. Wait for him to say go, and for his answers on the ambiguous people. Add a `--people-map <file outside repo>` option if he wants to hand you name → person choices.
2. `--apply`.
3. Dry run again: it must report 0 to create.
4. Ask Adam to open the Professional Hub calendar, one case thread and one comm page, and check they look right.

## Git

- Work on a branch `codex/notion-comms-import`, made from `claude/calendar-comms`.
- Commit per step, with plain messages and no real data.
- When it's done and Adam is happy, merge it back into `claude/calendar-comms`, not `main`. Adam ships the whole calendar as one PR.
- Before every commit, run `git diff --cached` and check it for anything from Notion. If in doubt, leave it out.

## Out of scope

- **Notion `Tasks` and `Projects` relations.** Those Notion tasks aren't in the hub's Tasks. List the counts in the report so Adam can decide later.
- **Notion meeting-note transcripts.** If the page fetch returns them as text, they come in as part of the page body. There's no audio.
- **Editing or deleting anything in Notion.** The pull only reads.
- **Any change to hub UI code.** If the import needs a repository change (for example setting a thread's `updated_at`), make the smallest change, with a test, and say why in the commit.

## Done means

- [ ] Every test passes, and `npm test` is green.
- [ ] The dry run report was sent to Adam and he said go.
- [ ] Applied. A second dry run shows 0 to create.
- [ ] Adam has checked the calendar, a case thread and a comm page.
- [ ] The snapshot is outside the repo, and nothing from Notion is in git (`git log -p codex/notion-comms-import` shows only code, invented fixtures and `.gitignore`).
