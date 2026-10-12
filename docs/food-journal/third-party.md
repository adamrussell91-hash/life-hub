# Existing dependency reuse

The food journal adds no package dependencies.

The existing exifr 7.1.3 dependency supplies EXIF inspection. Its browser module and licence are copied to the published vendor directory.

The existing heic-to 1.5.2 dependency supplies HEIC decoding in a browser worker. Its ESM module loads only after HEIC selection. The package licence is copied to vendor/heic-to-LICENSE.txt. Source: https://github.com/hoppergee/heic-to. Package source remains available in the pinned npm package through package-lock.json. The decoder is unmodified.

Photo storage uses the existing AWS SDK and R2 signing helpers. Forms, filters, cards, lists, dialogs, motion, dates, map controls and feedback reuse packages/design-kit. Background jobs reuse the existing strongly consistent chat job store and authenticated operator wrapper.
