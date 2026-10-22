# Gear Shifter: plan set

Spec: `docs/superpowers/specs/2026-10-22-get-things-done-design.md`.
Branch: `claude/tender-mccarthy-a298ad`. PR: adamrussell91-hash/life-hub#1047 (draft until Plan 6, then ready with auto-merge).
Source: the private pack at `life-hub-data/book-packs/get-things-done/` (checker exit 0 against `main` at `456f8e6e`).

There are six plans and one PR, as with Decision Maker. Each plan is written once the plan before it has landed, against real code.

| Plan | Phase | Status | Ends with |
| --- | --- | --- | --- |
| 1 | Foundations | **Built; awaiting Adam's design approval** | Catalogue, route, glyphs recoloured to Adam's palette, tokens, the `gear_shifter` model, a book register replacing the `'decision'` checks in the engine, the `shift` and `start` session kinds, `/api/get-things-done`, and mockups. **Adam approves the design before Plan 2** |
| 2 | Charts | Not started | The scales `min`, the ratings family, the Kanban and 5 Whys variants, the `.gt-scope` re-skin, and a contact sheet |
| 3 | The techniques | Not started | The importer, then configs and notes for all 37 entries, one section per commit |
| 4 | Coach, Commit, Record and Review | Not started | Rubric, catalogue lines, discernment, `gt_commit`, the action record and Review |
| 5 | The app | Not started | Landing, session, route, medal, track and shelf; the record on a page; the mock API route |
| 6 | Quick start and checks | Not started | Quick start, live coach evaluation, Playwright at both widths, `pre-pr-check` and the PR marked ready |

## Plan 1: Foundations

Every task is test-first and ends with a commit. Problem Solver's and Decision Maker's tests stay green throughout.

1. **Catalogue** (`packages/get-things-done/catalogue.mjs`, test `tests/unit/get-things-done-catalogue.test.js`). The five sections (key, title, chapter range, route station) and 37 entries (id, section, title, chapter, family, tier, `seeAlso`, `pairsWell`, `reuse`, `merged`). Generated once from the pack, then committed; no anchor text. The test covers 37 entries, unique ids, every link resolving to a kept entry, the variants naming real Problem Solver tools, and the merged and cut entries absent.
2. **Route** (`packages/get-things-done/route.mjs`). The five stations in a work's order, mapping to the book's sections; `parseRoute` keeps up to two known ids, as `parseCompass` does.
3. **Glyphs** (`scripts/import-gear-shifter-glyphs.mjs`, `packages/get-things-done/glyphs/`, `glyphs.ts`). Copies the pack's 35 entry emblems, 5 section emblems and identity marks, recoloured from the pack's colours to cobalt `#2b7de9`, vermilion `#ea4f2a` and ink `#2a3340`. The test checks there is one emblem per non-variant entry and per section, and that no pack colour remains.
4. **Tokens** (`packages/get-things-done/get-things-done.css`). `.gt-scope` with paper, ink, blue, red, amber, the label shades, tints and the shared motion curves.
5. **Model and plan** (`packages/get-things-done/model.mjs`, `packages/problem-solver/steps.mjs`). `GEAR_SHIFTER_MODEL` with explore, commit and review, planned like `decision_book`.
6. **Book register** (`packages/problem-solver/books.mjs`). One entry per coached book kind: kind, model, frame keys, the multi-choice frame key and its parser. `session.mjs`, `coach.mjs`, `coach-schema.mjs` and `scripted-coach.mjs` read the register instead of testing for `'decision'`, with Decision Maker's behaviour unchanged. The `shift` kind (frame keys `need`, `route` and `known`) is registered.
7. **Scripted framing** for `shift`: the opening message is the need, then the route, then what is known.
8. **API** (`netlify/functions/get-things-done.mjs`, `get-things-done-run.mjs`). Store prefix `get-things-done/v1`, kind `shift`. `start` joins the endpoint in Plan 6, when Quick start is built. Until Plan 4 gives `shift` its own prompt, a live `shift` turn uses the full prompt; nothing reaches the endpoint before Plan 5.
9. **Mockups** (`docs/mockups/gear-shifter/`): landing, session, and the three tools side by side on the Tools rail. They are served and checked at desktop and 390px. **Approval gate.**
