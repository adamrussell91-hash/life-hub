# Cursor brief: research start and end dates for the Programs catalogue

**Status:** ready. Data only. No UI work, so the UI failure register doesn't apply.
**Written:** 14/10/26 by Claude Code, alongside the date fields in [#842](https://github.com/adamrussell91-hash/life-hub/pull/842).
**Builder:** Cursor. Read this whole file before editing anything. Where this brief says STOP, stop and report; do not improvise.

---

## 1. Why

The personal line builder ([`docs/future-build-ideas/personal-line/`](../future-build-ideas/personal-line/README.md))
draws each catalogue entry on a calendar: a 10-week program must look like a 10-week pill. The catalogue
only had a `month` and a rough `competition_length`. #842 added real date fields and filled 30 entries
whose own text stated their dates. **Your job is the other ~260.**

## 2. The fields (already in the schema; don't change it)

In `apps/tasks/fixtures/competitions.json`, each entry can carry:

| Field | Meaning |
|---|---|
| `starts_on` | ISO `YYYY-MM-DD`, or `null` |
| `ends_on` | ISO `YYYY-MM-DD`, or `null` |
| `dates_source_url` | The organiser page that states the dates |
| `dates_checked_on` | The day you confirmed them (ISO) |

How the two dates combine:

- **Both set:** it runs from start to end, and draws as a pill.
- **`starts_on` only:** it happens that one day.
- **`ends_on` only:** it is due that day (an essay deadline, say), start unknown.
- **Both null:** dates not known. It draws as a stop at its `month`, labelled "dates TBC".

## 3. Decisions (do not re-open these)

| # | Decision |
|---|---|
| D1 | `apps/tasks/fixtures/competitions.json` is the only source. Never Notion, never Blobs, never a second file. Production reads the fixture's dates through `netlify/functions/_shared/catalogue-dates.mjs`. |
| D2 | **Only dates the organiser has published for the current cycle**: the next occurrence on or after 1 January 2026. Never shift last year's dates forward. Never estimate a length from "Long Term". If this cycle's dates aren't published, leave both `null`. |
| D3 | **What start and end mean:** see the table below. |
| D4 | **A registration or entry-closing date is not a start or end** for a program or competition. It stays in `registration_window`. The one exception is writing and essay competitions, where the submission deadline *is* the `ends_on`. |
| D5 | Change only the four date fields. If what you find contradicts `month`, `competition_length` or `registration_window`, **don't edit them**. List the entry in the PR body. |
| D6 | An entry that no longer runs stays in the file. List it in the PR body. Never delete entries. |

What start and end mean (D3), by kind:

| Kind | `starts_on` | `ends_on` |
|---|---|---|
| Program or course | first session | last session |
| Competition with rounds | first round | final (or the last round a school team can reach) |
| Writing or essay competition | submissions open, if stated | submission deadline |
| One-day event or exam | the day | `null` |
| Two-day or multi-day event | first day | last day |
| Year-round or rolling (`Recurring`, "open year round") | `null` | `null`, and list it in the PR body |

## 4. Rules

- **R1 · Source every date.** `dates_source_url` is the page where the date appears, usually the organiser's own site. `dates_checked_on` is the day you read it. No source, no date.
- **R2 · The 30 entries Claude filled** have `dates_checked_on: null`. Check each against its source. If it's right, set `dates_checked_on`. If it's wrong, fix it and list it in the PR body.
- **R3 · Keep the file's shape.**
  - Edit entries in place. Two-space indent.
  - Add the four keys after `updated_at`, in the order above (as the 30 existing entries do).
  - Don't reorder entries or keys, and don't reformat other lines. The diff should only add or change date lines.
  - Leave `updated_at` alone.
- **R4 · Work in batches of about 40 entries**, in file order, one commit per batch.
- **R5 · STOP** if a source page contradicts itself, or gives dates for two different streams (e.g. Junior and Senior on different days). Leave that entry `null` and list it with the URL. Don't pick one.

## 5. Verify before each push

From `apps/tasks`:

```bash
npx vitest run tests/unit/programs.test.ts
```

It checks that every date is ISO, every end is on or after its start, and every source is a URL.

Then, from the repo root:

```bash
npm run pre-pr-check
```

Exit 0 is required.

## 6. PR body

1. Counts: dated (pills, single days, due dates), not yet published, no longer runs, year-round.
2. A table of every entry left `null`, with the reason and the page you checked.
3. Every entry where D5 found a contradiction: the field, what the catalogue says, and what the source says.
4. Any of the 30 pre-filled entries you corrected.
