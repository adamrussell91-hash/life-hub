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

## Read also

- Root `CLAUDE.md` (stress test / consolidation overseer roles)
- `packages/design-kit/AGENTS.md` before UI work
- Hub-specific `apps/*/AGENTS.md` when working in that app
