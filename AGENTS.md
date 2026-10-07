# Life Hub — agent instructions

Canonical umbrella repo: `adamrussell91-hash/life-hub`. Design kit: `packages/design-kit/`.

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
- Principle: never weaken Pages / skip `npm test` / delete rail features to hide failures

Docs-only PRs with zero runtime/test/type impact may use `node scripts/pre-pr-check.mjs --docs-only` (still runs `npm test` + static guards).

**Exception: idea docs.** Edits that only touch `docs/future-build-ideas/` skip this gate and may be committed straight to `main` with no PR. These are concept docs for the what if rounds between Claude Code, Cursor and Codex; nothing builds from them. Pull `main` first, commit, push. If a change touches any file outside that folder, the gate applies as normal.

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
