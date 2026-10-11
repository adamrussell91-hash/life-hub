# Private Grove backfill implementation

Approved scope: user instructed use modelled data and backfill without estimate UI labels. Existing TypeScript/Netlify private prefs storage.

1. Implement strict shared-compatible private history validation/storage and pure deterministic Grove adapter. RED→GREEN tests cover invalid counts/ranges, replace/reload stability, baseline subtraction, deleted/reopened inputs, future cutoffs, mapping/late/books/terms. Do not commit user data.
2. Integrate Grove loading and import JSON control into existing view, preserve preferences and all live tasks, no task-board writes, omit Open task for history IDs. Native 390px control tests including >=44px actions and bounded resources. Independent review of final diff, fix concrete findings through implementer.
3. Owner: construct local private payload from validated table, realistic deterministic distribution with configured late and eight supplied book dates, include Grove-only four term dates. Mandatory pre-PR gate and full build, publish reviewed code, wait deployment, use authenticated browser import UI to load JSON into private preferences. Reload actual Grove and verify the supplied baseline + any uncovered/additional live history, zone/category totals, earned wildlife, no future growth. Save local read-only evidence and verification report. No private history payload in public Git/PR.
