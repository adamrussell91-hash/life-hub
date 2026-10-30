> Storage rule, 15 October 2026: personal Central Node content belongs only in private `adamrussell91-hash/life-hub-data/central-node.md` on `main`. Personalised voice samples and SOURCES.md belong in that private repository under `config/humanizer/voices/`. References below to public personal seed copies or writing samples are superseded. The public Central Node is a structural template only. Use authenticated private reads and writes, never copy personal content into code, tests, docs, prompts, screenshots or public build assets.

# Life Hub — agent instructions

Canonical umbrella repo: `adamrussell91-hash/life-hub`. Design kit: `packages/design-kit/`.

## Public repo privacy (mandatory)

This repository, its PR titles and bodies, and its commit messages are public. Personal content goes only to the private `adamrussell91-hash/life-hub-data` repository; the app reads it at runtime through the authenticated data client.

- Personal content means real people (partner, family, students, parents, colleagues, clinicians), health (conditions, medications, doses, appointments, results), diary or session text, finances, addresses, travel bookings, employer and school history, academic records, and exports from Notion, Day One or Gmail.
- Code, prompts, tests, fixtures, docs, mockups, screenshots and PR text use invented people and synthetic records. Code refers to roles ("partner", "gastroenterologist"), never names.
- Prompts point agents at the private Central Node for facts about Adam. They do not state those facts.
- `scripts/privacy-guard.mjs` runs in `pre-pr-check` and in PR CI. It checks files, file names, and the PR title and body against generic rules and a private denylist. Never weaken it, or allowlist a real term, to get green; move the content instead.

## Before any PR (mandatory)

**MUST** run and pass the pre-PR gate before opening or updating any life-hub PR (`ManagePullRequest`, `gh pr create`, force-push follow-ups, etc.):

```bash
npm run pre-pr-check
# same as: node scripts/pre-pr-check.mjs
```

Exit 0 required. Do not open/update the PR if the gate is red.

- Script (command source of truth): `scripts/pre-pr-check.mjs`
- Agent checklist + failure inventory: Project store `docs/mandatory-pre-pr-check.md`
- User workflow: Project user store `workflows/life-hub-pre-pr-gate.md`
- The gate runs root `npm test` and the Tasks Hub vitest tests the change reaches (`vitest run --changed`; anything named grove, Tasks config or workflows runs the full suite; `--full` forces it). Pages runs both full suites in a `test` job beside the deploy, so a slow Grove run no longer blocks the site
- Principle: never weaken Pages / skip `npm test` or the Tasks vitest suite / delete rail features to hide failures

Docs-only PRs with zero runtime/test/type impact may use `node scripts/pre-pr-check.mjs --docs-only` (still runs `npm test`, the Tasks Hub vitest suite and static guards).

**Ready, then auto-merge.** Open life-hub PRs as ready for review, not draft, unless Adam asks for a draft. Once `pre-pr-check` passes and the PR is pushed, enable auto-merge (merge commit). If auto-merge stalls on a merge conflict, merge `main` in, regenerate generated files (e.g. `node scripts/generate-alchemy-schema.mjs`, `node scripts/generate-block-css.mjs`), rerun the gate and push.

**Exception: idea docs.** Edits that only touch `docs/future-build-ideas/` skip this gate and may be committed straight to `main` with no PR. These are concept docs for the what if rounds between Claude Code, Cursor and Codex; nothing builds from them. Pull `main` first, commit, push. If a change touches any file outside that folder, the gate applies as normal.

## Product language (every hub)

Life Hub is the product of record. Never mention Notion in user-facing copy,
agent replies, provenance labels, or migration messages, and do not offer
links back to that service. Existing internal identifiers and compatibility
readers may remain so stored records and Knowledge links keep working.

## Deleted means gone (every hub)

Anything dead, trashed, deleted or removed must never reach an agent, tool, or live view. Archiving is the only soft state that stays readable.

- Server code: filter hub lists with `withoutDeleted` / `isDeletedRecord` from `netlify/functions/_shared/record-liveness.mjs`, and tasks with `isOpenTask` / `isClosedTask` from `_shared/task-liveness.mjs`. Never hand-write your own status check. `tests/unit/task-liveness.test.js` fails if a module redefines one.
- A new deleted state (e.g. `status: 'discarded'`) goes into `record-liveness.mjs`, not into one caller.
- Only Trash / restore screens read deleted records on purpose.

## Phone form / sheet actions (mandatory)

Any sheet, dialog, modal, or long form with Save / Add / Cancel / Confirm / Remove: before claiming done, run failure-register **R4** at 390. Actions must be docked (not lost under the fold), each button ≥ 44px tall, clear of the home indicator (`env(safe-area-inset-bottom)`). Untappable bottom pills after data entry are a ship blocker — see `docs/CURSOR-UI-FAILURES.md` R4 and `.cursor/rules/ui-failure-register.mdc`.

## Read also

- Root `CLAUDE.md` (stress test / consolidation overseer roles)
- `packages/design-kit/AGENTS.md` before UI work
- Hub-specific `apps/*/AGENTS.md` when working in that app
- `docs/CURSOR-UI-FAILURES.md` before any UI change
