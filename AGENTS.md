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

## Deleted means gone (every hub)

Anything dead, trashed, deleted or removed must never reach an agent, tool, or live view. Archiving is the only soft state that stays readable.

- Server code: filter hub lists with `withoutDeleted` / `isDeletedRecord` from `netlify/functions/_shared/record-liveness.mjs`, and tasks with `isOpenTask` / `isClosedTask` from `_shared/task-liveness.mjs`. Never hand-write your own status check. `tests/unit/task-liveness.test.js` fails if a module redefines one.
- A new deleted state (e.g. `status: 'discarded'`) goes into `record-liveness.mjs`, not into one caller.
- Only Trash / restore screens read deleted records on purpose.

## Read also

- Root `CLAUDE.md` (stress test / consolidation overseer roles)
- `packages/design-kit/AGENTS.md` before UI work
- Hub-specific `apps/*/AGENTS.md` when working in that app
