# Professional Hub — agent instructions

Vanilla TypeScript SPA at `/professional/` using the umbrella's shared
authentication, root Functions, design kit, and hub switcher. See
`docs/universal-links/milestone-4-build-programme.md` (Job B) for the
originating spec.

## Read first

1. Root `CLAUDE.md`.
2. `packages/design-kit/AGENTS.md`, `RAIL.md`, `MOBILE.md`, `ICONS.md`.
3. This file.

## Scope (Slice 4)

Read-only apart from authentication:

- Professional Hub shell (rail + mobile chrome, four destinations).
- People / Organisations search and results.
- Person / Organisation pages (current + historical relationships,
  relationship timeline).
- Relationships landing page (search across both kinds).
- Communications: one honest empty state only — no storage, API, editor,
  or `@` picker. That is Slice 5.

Do not add Tasks integration, Meetings, Events, Applications, Career,
Knowledge migration, or StudentReference here.

## Server contracts consumed

- `GET /api/entities/search?q=<encoded>&kinds=<kind>` (`entity-search.mjs`)
- `GET /api/entities/overview?ref=<encoded canonical ref>` (`entity-overview.mjs`)
- `GET /api/session`, `POST /api/auth`, `POST /api/logout` (umbrella auth)

Canonical refs: `shared:person:<person_id>`, `shared:organisation:<organisation_id>`.

This app never assembles or authorises a relationship client-side — every
field rendered comes from the server response as-is.

## Local development

`npm install && npm run dev` starts Vite with an in-memory mock of the four
endpoints above (`scripts/mock-api.ts`, `fixtures/seed.json` — synthetic
data only). Local passphrase: `professional-hub-local`.

`npm run build` runs a TypeScript no-emit check before the Vite build —
this app's own TypeScript errors fail the umbrella `npm run build` too.
