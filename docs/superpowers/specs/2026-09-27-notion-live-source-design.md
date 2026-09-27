# Notion Communications live-source design

## Scope

Plan 5's source is the authenticated Notion Communications data source, not a
user-supplied export.  The importer continues to write only through the
Professional Hub repositories and keeps all source data outside the public
repository.

## Data flow

1. Codex reads the Communications rows and pages through the authenticated
   Notion connector.  Page IDs are the permanent source identifiers.
2. A pure live-page normalizer turns Notion's page properties, relation URLs,
   and enhanced Markdown content into the same `NotionComm` structure used by
   `plan.mjs`.  It preserves direct date values, resolves relation IDs to their
   current Notion titles, and never tries to infer a person from a URL slug.
3. Normalized batches exist only in an OS-private temporary location.  They
   are not exports, are not committed, and are removed after the batch has
   been applied or rejected.
4. The existing plan and apply pipeline previews first, reconciles the import
   map, and writes people, records, threads, links, and promises in Plan 5's
   order.  Page IDs are recorded immediately after each created record.

## Recovery and safety

The live store currently has person import-map entries but no page or thread
entries.  Those mappings are preserved and validated as reusable inputs; no
mapping is deleted or replaced merely because it is old.  A failed batch stops
at its annotated stage and Notion page ID.  A later batch reuses page, person,
and thread mappings, so it cannot duplicate completed work.

## Verification

Unit tests cover live-property normalization, date-only and timed dates,
relation-ID name resolution, body-to-block conversion, and recovery maps.
Before writes, the live preview reports only counts and unresolved people.
After the authorised write, the same live preview must report zero records to
create and the private Hub must contain representative comm, meeting, thread,
and link records.
