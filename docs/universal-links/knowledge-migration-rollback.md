# Knowledge Universal Links migration — rollback and inverse-links retirement

## Slice 7 stance

Slice 7 migrates Knowledge `connected` HubRefs into canonical `related_to` Universal Links. It does **not** delete legacy `connected` fields and does **not** remove rollback support.

## Rollback report (how to roll back)

1. Leave `KNOWLEDGE_UNIVERSAL_LINKS_WRITE_CUTOVER` unset / false so Knowledge page saves continue to accept `connected` updates.
2. Keep dual read enabled (`KNOWLEDGE_UNIVERSAL_LINKS_DUAL_READ` default true) so ordinary views still combine legacy `connected` with Universal Links.
3. Authoritative legacy values remain on each page JSON `connected` array and in `manifest.json` rows that mirrored them.
4. Migrated Universal Links carry `metadata.migration_source = "knowledge_connected_v1"`. Operators can list those links for review; they are not required for rollback of Knowledge content.
5. Do not delete Universal Links as part of a content rollback unless an operator explicitly chooses to — Knowledge pages remain readable from `connected` alone while dual read is on.

## Dual read / write cutover

| Flag | Default | Effect |
| --- | --- | --- |
| `KNOWLEDGE_UNIVERSAL_LINKS_DUAL_READ` | on | Combine legacy `connected` with indexed Universal Links; dedupe equivalents |
| `KNOWLEDGE_UNIVERSAL_LINKS_WRITE_CUTOVER` | off | When on, `saveKnowledgePage` preserves existing `connected` (no relationship mutation via that field); relationship edits write only through Universal Links |

There is **no dual write**. After cutover, new relationships are Universal Links only; old `connected` values stay stored for comparison.

## Retirement plan for `inverse-links.mjs`

`collectInverseLinks` / `defaultLoadInverseLinks` perform a linear scan of every Knowledge page's `connected` array. That scan must not remain on the ordinary request path after parity passes and write cutover is active.

Retirement sequence (post Slice 7, gated on parity):

1. Confirm parity report: legacy convertible pairs ≈ canonical `related_to` pairs; sampled comparisons match; unresolved/malformed lists are accepted or repaired.
2. Enable write cutover in production configuration.
3. Switch ordinary Knowledge backlink handlers to `listIndexedKnowledgeBacklinks` (Universal Link `listIncoming` on `knowledge:page:<id>`). No ordinary request may list every Knowledge page for backlinks.
4. Keep `inverse-links.mjs` as a **rollback and admin comparison** helper until a later slice explicitly deletes it.
5. Only then remove scan-based calls from `knowledge-page.mjs` / `knowledge-backlinks.mjs` request paths.
6. Document the deletion in a later slice PR; do not delete `connected` fields in the same change.

## Safety

- Migration dry-run is the CLI default (`scripts/migrate-knowledge-connected.mjs`).
- Slice 7 verification uses local fixtures and mocked stores only.
- Do not run migration against production Knowledge data from Cloud Agent runs.
- Do not write to the private `knowledge-hub-data` repository from this slice's automated verification.
