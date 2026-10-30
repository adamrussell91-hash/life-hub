# Organisation Crests

Researched organisation marks are the fallback crest for an organisation that has no uploaded crest. Which organisations have one reflects Adam's network, so the images, the reference map and the source provenance live only in the private data repository. Nothing in this repository lists them.

## Where things live

- Private (`adamrussell91-hash/life-hub-data`, `main`): `data/professional/organisation-crests/`
  - `manifest.json`: `{ "shared:organisation:organisation_<id>": "<file>.png" }`
  - `<file>.png`: 440 x 520 PNG, at most 512 KiB, padded for the Hub's shield clip
  - `SOURCES.csv` and `README.md`: source page, asset URL and notes for each image
- Function: `netlify/functions/org-crest-image.mjs` (`/api/organisations/crest-image`, signed-in only)
  - `GET` returns `{ refs }`, the organisations that have a researched crest
  - `GET ?ref=<org ref>` returns the PNG
  - Reads the private repo with `GITHUB_TOKEN` (and `PROFESSIONAL_GITHUB_REPOSITORY`, default life-hub-data) through `_shared/private-data-file.mjs`; the manifest is cached for five minutes
- App: `apps/professional/src/components/org-ui.ts` resolves crest URLs for Orgs and People badges

## Resolution order

1. A manually uploaded crest (`logo_key`, `/api/organisations/crest`) takes precedence.
2. Otherwise, or if the upload can't be resolved, the researched crest is fetched once with the session cookie and kept as an object URL for the session.
3. Unknown organisations keep their monograms; a failed image load restores the monogram. If the private repo can't be reached, every organisation shows its monogram.

## Adding a crest

Add the PNG and its manifest line in the private repo, and record its source in the private `SOURCES.csv`. The organisation IDs are the deterministic IDs from `deriveOrganisationId(legacy_id)` in the GitHub professional-data reader.

Logos and crests remain the property of their organisations. The collection does not imply endorsement or grant rights for unrelated commercial use.
