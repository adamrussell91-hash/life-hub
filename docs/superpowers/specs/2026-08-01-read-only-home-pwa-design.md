# Read-only Home PWA Vertical Slice

Date: 1 August 2026
Status: Approved
Parent design: `docs/superpowers/specs/2026-07-31-life-hub-design.md`

## Outcome

Life Hub becomes a runnable, installable, read-only web application whose Home view renders the existing fixture data through the production core modules. This slice proves the browser shell, Markdown ingestion boundary, derived Home model, responsive interface, and offline read behavior before authentication, live GitHub access, or chat writes are introduced.

The fixture acceptance values are 1,130 calories, 80 g protein, 27 g fat, a 30-minute workout day type, and a workout streak of 1.

## Scope

The slice includes:

- a static semantic HTML application shell with the approved Clinical Glass visual system;
- desktop rail navigation and the mobile bottom navigation pattern, with non-Home destinations visibly unavailable in this slice;
- a fixture manifest that lists the canonical Markdown event paths to load;
- browser loading, parsing, and validation of those Markdown events using the existing `js/core` modules;
- a focused Home view model for nutrition totals, targets, workout status, streak, and five-category logging completeness;
- loading, empty, malformed-data, and offline/cached states;
- a web app manifest, locally hosted install icons, and a service worker that caches the shell and last successful fixture responses;
- automated unit and integration coverage plus browser acceptance at desktop and 390 px widths.

The slice excludes authenticated GitHub reads, Netlify functions, chat, writes, production credentials, domain detail pages, charts, calendar browsing, search UI, and push or scheduled behavior.

## Architecture

The application remains static and framework-free. `index.html` owns semantic document structure, `css/app.css` owns the visual system and responsive layout, and small ES modules under `js/app/` own loading, view-model construction, rendering, and application startup.

The browser YAML dependency is served locally rather than fetched from a CDN so the installed app can launch offline and no third-party runtime dependency receives private data. The existing core modules remain presentation-agnostic.

The application is served by a minimal local static server for development and acceptance checks. There is no compile or bundle step.

## Components and boundaries

### Fixture source

`fixtures/manifest.json` contains repository-relative canonical event paths. Fixture documents are served at those exact paths so `parseEventDocument` validates the same paths that a future repository provider will return.

The loader accepts a `fetch` dependency and returns successfully parsed events plus bounded, sanitized file-level warnings. One malformed file does not prevent valid records from rendering. If no valid records remain, the Home view enters an explicit unavailable state.

### Home model

A pure Home model function accepts parsed events, targets, and a Sydney date. It composes existing aggregation, target, streak, and completeness helpers into one stable presentation object. It contains no DOM access and is covered directly by tests.

For the fixture slice, the active display date is the greatest event date in the loaded corpus. This keeps the checked-in fixture deterministic while the later authenticated phase can supply today's Sydney date.

### Rendering

The renderer receives the Home model and updates named semantic regions. It never injects Markdown as HTML. User-controlled text is assigned as text content only.

Home leads with today's energy progress and supporting protein, fat, workout, and logging-completeness cards. A compact week strip and status treatment provide hierarchy without implying unavailable history. Values use tabular numerals and accessible text labels in addition to color.

### Navigation

Desktop shows the approved fixed rail. At 390 px the rail becomes a bottom bar with Home, Chat, Calendar, and More. Only Home is active in this slice. Activating an unavailable destination retains the Home view and announces that the section is coming in a later phase.

### Offline behavior

The service worker precaches the application shell, local browser dependencies, configuration, manifest, and fixtures. Successful same-origin data responses are updated in the cache. When offline, cached data remains readable, an offline timestamp is shown, and unavailable navigation remains non-mutating.

The first uncached offline visit shows a direct recovery message rather than fabricated values.

## Error handling

- A failed manifest request produces a full Home unavailable state with a retry action.
- Individual malformed or unavailable fixture documents are skipped and summarized in a visible completeness warning.
- Invalid targets prevent target comparisons but do not erase successfully calculated raw totals.
- Service-worker registration failure is non-fatal and leaves the online read-only application usable.
- Errors shown in the interface contain friendly categories and paths only, never stack traces or raw provider responses.

## Accessibility and responsive behavior

The page uses landmarks, a single primary heading, visible focus states, reduced-motion support, at least 44 px touch targets, and status announcements through an appropriate live region. Progress indicators expose numeric text equivalents. The layout has no horizontal overflow at 390 px and remains legible without backdrop-filter support.

## Testing

Development follows red-green-refactor.

Automated tests cover:

- manifest loading and partial malformed-file recovery;
- deterministic fixture-date selection;
- the exact approved Home totals and targets;
- empty and unavailable states;
- safe text-only rendering of warnings;
- service-worker cache inventory and offline fallback behavior;
- required manifest metadata and install assets.

Browser acceptance verifies desktop and 390 px navigation, exact rendered fixture values, keyboard operation, retry behavior, no horizontal overflow, and cached read-only rendering after the network is disabled.

## Definition of done

From a clean checkout, one documented command starts Life Hub locally. The Home screen renders the exact fixture acceptance values through the existing parser and aggregation modules, works at desktop and 390 px widths, remains readable after a successful load followed by network loss, exposes no secrets or remote runtime dependencies, and passes the complete automated suite without regressions.
