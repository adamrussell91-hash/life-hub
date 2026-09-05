# Cursor instructions — live CN Clare/Ann directory (point 1)

Paste this whole file into a **new Cursor chat whose workspace is the `life-hub-data` repo**, not `life-hub`. That repo is private. The cloud agent that shipped the mailbox could not push it.

**Do this one edit. Then stop.** Do not continue into Clementine, heatmaps, `/api/clare`, or Vera/Penelope hops.

---

## Goal

The live Central Node Agent Directory still uses Notion-era titles for Clare and Ann. Hammond, Clare, and Ann now share a real Cross-Agent mailbox. Update **only those two directory bullets** so the live file matches the seed wording already on `life-hub` `main` / PR `cursor/hammond-whole-hub-coordination-c828`.

Parent spec: in `life-hub`, `docs/superpowers/specs/2026-09-05-hammond-whole-hub-coordination-design.md` (Files: “If live CN in `life-hub-data` has drifted, update that copy”). Seed source of truth for the two lines: `life-hub` `central-node.md` Agent Directory.

## Repo / branch

- Repo: `adamrussell91-hash/life-hub-data`
- Typical Mac path: `~/Projects/life-hub-data` (never `~/Documents` or `~/Desktop`)
- Start from latest `origin/main`. `git fetch origin main` first.
- Branch: `cursor/cn-clare-ann-directory` (or the cloud suffix form if this run requires `cursor/<name>-c828`)
- One commit. Push. Open a PR into `main`.
- If you already see local commit `18f8600` (`chore(cn): give Clare and Ann live mailbox directory bullets`) on `cursor/cn-clare-ann-directory-c828`, **do not redo the edit** — fetch/rebase onto latest `origin/main` if needed, then push that commit and open the PR.

## The only file

`central-node.md` → section `## 🤖 Agent Directory`

Leave Clare and Ann **where they already sit** (Clare after Hyaluronica, Ann after Penelope). Do **not** move them to the end to match the `life-hub` seed order. Do **not** add Clementine. Do **not** touch Constraints, Status, Cross-Agent, Recent Actions, Writing Rules, or any other section. Writing rule 10 may still mention “Clare's Morning Sweep” — leave it.

### Replace exactly

**Old Clare**

```markdown
- **Clare DeMind (Morning PA / Brain Dump):** Morning daily briefing, Central Node staleness check, brain dump processing into Tasks and Communications, scheduling conflict flagging, sprint protocols (Morning Sweep, Tomorrow Set-Up, Weekly Reset, Appointment Prep, Comms Follow-Up)
```

**New Clare**

```markdown
- **Clare DeMind (Tasks Agent):** Dump triage, Now/Later/Trash, confirm-before-write task mutations. Reads Hammond→Clare before a dump; writes Clare→Hammond (or Clare→[Agent]) when task load or a deadline collides with a Life constraint.
```

**Old Ann**

```markdown
- **Ann O'Tation (Teaching Reflection & Coaching):** Post-lesson reflection facilitation, longitudinal pattern synthesis, pre-lesson coaching, monthly Hammond handoff
```

**New Ann**

```markdown
- **Ann O'Tation (Teaching Agent):** Lesson diagnosis and classroom-ready repair. Reads Hammond→Ann before responding; writes Ann→Hammond (or Ann→[Agent]) when a lesson/load collision or teaching deadline hits a Life constraint.
```

Arrow character is Unicode `→` (`U+2192`), same as every other Cross-Agent line. Keep Ann’s apostrophe as `O'Tation`.

## Cuts (must not land)

- Any other `central-node.md` rewrite (medical copy, stale Status, Cross-Agent history, the existing `Hammond→Ann: July teaching handoff…` line)
- Asking Hammond to `replace_section` Agent Directory from chat (Confirm-class). This is a checked-in markdown edit.
- Adding Professor Clementine Haig
- Editing `life-hub` application code, allowlists, or persona blocks — that work already shipped
- Widening `DOMAIN_PATH` or calling 26s hub AI functions

## Verify

```bash
git diff origin/main -- central-node.md
```

Expect **exactly two lines** changed, both inside `## 🤖 Agent Directory`. `Clementine` still absent from that section. Then:

```bash
git add central-node.md
git commit -m "$(cat <<'EOF'
chore(cn): give Clare and Ann live mailbox directory bullets

Replace the Notion-era Morning PA / Teaching Reflection titles with the
Tasks and Teaching mailbox wording Hammond, Clare, and Ann now share.
Clementine stays absent.
EOF
)"
git push -u origin HEAD
```

## Success

- Live Agent Directory names Clare **Tasks Agent** and Ann **Teaching Agent**, with the read-before-respond / `Sender→[Agent]:` mailbox sentences.
- Diff is two directory bullets. Nothing else in the live CN moved.
- PR is on `life-hub-data` `main`, not on `life-hub`.
