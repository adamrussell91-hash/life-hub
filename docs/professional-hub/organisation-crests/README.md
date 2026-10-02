# Organisation Crests

104 researched organisation marks collected on 2 October 2026. `SOURCES.csv` records the source and matching organisation for each image.

## Integration

- PNGs: `apps/professional/public/organisation-crests/`.
- Canonical reference map: `apps/professional/src/data/organisation-crests.json`.
- Shared URL resolution: `apps/professional/src/components/org-ui.ts`, also used by People badges.
- The organisation IDs are the deterministic IDs from `deriveOrganisationId(legacy_id)` in the GitHub professional-data reader.
- Vite publishes the images below its configured base URL, including `/professional/` on the umbrella deployment.
- A manually uploaded crest takes precedence. Bundled images are the fallback when an organisation has no uploaded crest or the crest URL cannot be resolved. Unknown organisations retain their monograms; failed image loads also restore the monogram.

No R2 configuration, credential, or remote third-party image hotlink is required to display the bundled files. Organisation records remain in the private data repository; this collection contains public organisation marks and source provenance, not contact profiles.

## Artwork

Images are 440 x 520 pixels and below 512 KiB. Padding protects the full artwork from the Hub's shield clip. Proportions are preserved; some site icons have limited original resolution. White artwork uses a dark background. The SVG wordmarks for Tintern and Sydney were used to extract their intact crests.

Current Xavier Albury, Trinity Adamstown, and Independent Schools NSW branding is used. The separate St Pius X Adamstown record retains its historical crest. Government organisations use their shared NSW Government mark; UConn uses its parent university logo. Learning with Lee uses its official site icon. Secondary sources and other qualifications are recorded in `SOURCES.csv`.

## Not Installed

All Areas Education and Douglas Daly School have no confidently verified logo. The historical Wade High candidate was not installed because the current school is changing its branding. Five employer-group labels are not five distinct organisations and retain monograms. Kolbe and the unlinked Mercedes duplicate were removed from the directory at the user's request and are not mapped here.

Logos and crests remain the property of their organisations. This collection does not imply endorsement or grant rights for unrelated commercial use.
