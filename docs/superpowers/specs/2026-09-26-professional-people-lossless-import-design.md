# Professional People lossless import and profile rendering

**Date:** 2026-09-26  
**Status:** Approved  
**Source:** The user-provided Notion People export (CSV plus individual Markdown pages)

## Problem

The private data repository contains 350 Professional People identity rows,
but the current GitHub bridge deliberately normalises each row down to identity
fields. It drops contact information, Notion metadata, source notes, tags,
and every individual profile page body. The Professional Hub therefore renders
mostly empty profiles even when the Notion export contains rich material.

This is a migration fidelity problem, not a missing-identity problem.

## Goals

- Import every People CSV property and every available per-person Markdown body
  without lossy flattening.
- Keep stable existing `legacy_id` values and derived person URLs.
- Return one person profile in the existing entity-overview response; no
  additional browser request and no per-person GitHub request.
- Render useful facts in the Overview and all remaining source material in a
  dedicated Profile tab.
- Preserve source relationships and URLs as source references; surface a
  first-party hub route only when a verified resolver supplies one.
- Ensure a future Notion export cannot silently discard an unknown property.

## Non-goals

- Live Notion sync.
- Changing a person's durable shared-identity schema or making imported source
  content editable through the identity editor.
- Inventing Universal Links where the export contains only a label or an
  unverifiable source reference.
- Exposing People data outside the existing authenticated LifeHub session.

## Approved architecture

### Data ownership

`life-hub-data/data/professional/people.json` remains canonical. Each existing
row retains its identity fields and gains a versioned `profile` object. The
public app repository contains the importer, validation, API normalisation,
tests, and UI only; it must never commit the People export or resulting private
data.

### Lossless profile contract

```json
{
  "legacy_id": "existing-stable-id",
  "display_name": "Existing display name",
  "profile": {
    "schema_version": 1,
    "source": {
      "system": "notion",
      "page_url": null,
      "properties": {
        "AI summary": "Original value, including empty strings",
        "Back end": "Original value",
        "Books": "Original value",
        "Communications": "Original value",
        "Current Workplace": "Original value",
        "Email": "Original value",
        "Last Contacted": "Original value",
        "LinkedIn Profile": "Original value",
        "Notes": "Original value",
        "Phone": "Original value",
        "Podcasts": "Original value"
      }
    },
    "summary": null,
    "contact": {
      "email": null,
      "phone": null,
      "linkedin_url": null
    },
    "last_contacted": null,
    "current_workplace": [],
    "references": {
      "communications": [],
      "books": [],
      "podcasts": [],
      "notes": []
    },
    "body_markdown": null
  }
}
```

`source.properties` is the fidelity guarantee: it preserves every CSV column
and value, including new or currently-unmodelled fields. The typed fields are
convenience projections for safe presentation and may be `null`/empty when a
source value is absent or cannot be confidently parsed. `body_markdown` holds
the original Markdown content for the matching page, rather than a rendered
HTML copy.

Each `references` item has the stable shape:

```json
{ "label": "Source label", "source_url": null, "hub_href": null }
```

The importer records an external/source URL only when exported metadata
contains one. A later resolver may set `hub_href` after it verifies an existing
LifeHub record. It must never manufacture a link from a label alone.

### Import behaviour

The importer accepts the exported `_all.csv` and its individual Markdown
pages. It:

1. reads CSV headers dynamically and stores every value in `source.properties`;
2. joins profile rows to existing People rows by a normalised display-name
   lookup, reporting unmatched and ambiguous records instead of guessing;
3. maps known properties into the typed projections above while retaining their
   exact originals;
4. joins Markdown by the export's page title/file identity and stores the body
   unchanged;
5. emits a deterministic report: total CSV rows, matched rows, unmatched rows,
   ambiguous rows, Markdown matched/missing, and every unknown column;
6. fails its write mode when any source row is unmatched or ambiguous, unless a
   reviewed mapping file explicitly resolves it.

The importer is idempotent: re-running the same export produces identical
profile payloads and does not alter existing identity/relationship fields.

### API contract and cache behaviour

The existing GitHub bridge continues to load `people.json`,
`organisations.json`, and `relationships.json` as one cached dataset. Its
60-second process cache remains the only GitHub-read cache. Adding `profile`
does **not** create a new browser endpoint or a per-person GitHub fetch.

The normalised record retains the validated identity shape and carries a
sanitised `professional_profile` extension. `entity-overview` returns that
extension for the selected person only. The browser receives a single existing
overview response containing the profile; directory/search responses remain
identity-only.

### Professional Hub presentation

- **Header/Overview:** display contact actions (email, phone, LinkedIn) only
  when present; show summary, current workplace, and last-contacted context
  when present. Existing relationship cards remain the source of truth for
  current/historical employment.
- **Profile tab:** add a `Profile` tab immediately after Overview. Render
  Summary, Notes, References (Communications, Books, Podcasts, and source
  notes), and the original profile body. Source references are links only when
  they have a verified `hub_href` or safe `https:` source URL; otherwise they
  remain labelled source items.
- **Source details disclosure:** show all original CSV properties, including
  empty/unknown future fields, in a collapsed `Imported source details`
  disclosure. This is the no-data-left-behind guarantee without turning the
  primary page into a database dump.
- **Markdown safety:** render source Markdown through the app's existing safe
  text/Markdown primitive, or render it as text until a sanitised renderer is
  available. Never assign export content through `innerHTML`.

## Verification

- Importer fixtures prove all known CSV columns, an unknown future column,
  empty values, malformed URLs, ambiguity, and Markdown preservation.
- GitHub bridge tests prove a profile survives normalisation, is omitted from
  search/list candidates, and appears in one entity overview response only.
- Component tests prove populated details display, empty values do not create
  blank UI, links have safe URLs, and rich source text is not interpreted as
  HTML.
- A production-data dry run reports a one-to-one matched import before the
  private data commit is made.

## Rollout

1. Ship the public app's lossless contract, API handling, UI, and tests.
2. Run the importer against the supplied export into a reviewable private-data
   branch; resolve any explicit match report entries.
3. Commit the resulting `people.json` only to `life-hub-data`.
4. Deploy the public app and invalidate/wait out the 60-second API cache.
5. Open representative imported profiles and verify every source section and
   safe link is visible.
