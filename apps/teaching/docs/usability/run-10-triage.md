# Run 10 triage: Codex build-through findings

Source: [`reports/chatgpt-live-site-test-10-report.md`](reports/chatgpt-live-site-test-10-report.md) (Codex, 05/10/26, live umbrella).
Brief: [`chatgpt-live-site-test-10.md`](chatgpt-live-site-test-10.md).

Each finding was checked against the code before fixing. **Fixed** means the root cause is changed in this branch and covered by a test or a browser repro. **Open** means it still needs a decision or a larger build.

## Fixed in this branch

| ID | What Codex saw | Root cause | Fix |
|----|----------------|------------|-----|
| F01 | Permanently deleted Lesson C still opened for students, stayed on the public unit, and left a raw-id slot on the class schedule | Student endpoints read the `published/lessons/*` snapshot without checking the draft; permanent delete removed only the draft | `published-lesson` / `-unit` / `-class` now require a live draft (`isDeletedRecord`). Permanent delete purges the snapshot, every schedule slot and the unit's `lesson_ids` entry. Teacher class schedule hides slots whose lesson is trashed or gone |
| F02 | Whiteboard: `Failed to construct 'HTMLElement': Illegal constructor` | `packages/whiteboard/blocksuite-adapter.ts` called `presets/effects` only. That module imports `blocks/effects` but never calls it, so `editor-host` was never defined | Adapter calls `blocks/effects` then `presets/effects`. Reproduced and verified in Chromium (editor host and toolbar render). Also fixes the Tasks hub whiteboard, which shares the adapter |
| F04 | Direct MP4 showed "Video unavailable" | Video parser only knew YouTube/Vimeo | New `file` provider for https `.mp4/.m4v/.webm/.ogv/.ogg/.mov` renders a native `<video controls>`. Blocks saved before this re-parse their stored URL, so Lesson A's MP4 block plays without editing |
| F05 | YouTube `?t=90` started at 0s | Parser dropped `t` / `start` | `start_seconds` parsed (`90`, `90s`, `1m30s`) and sent as `?start=`; Vimeo `#t=` too. Existing blocks recover it from their stored URL. Also accepts `/shorts/` and `/live/` |
| F06 | Templates → Use: "Unable to create from template." | Unit chosen by typed number in `window.prompt` (also listed trashed units); browsers that block `prompt()` threw into the catch | Use opens the existing From template dialog with the template preselected and only active units |
| F06b | Composition save blocked (`prompt() is not supported`) | Same `window.prompt` pattern | Every `window.prompt` in the teacher UI replaced by kit `askTextCard` / `askSelectCard` (composition, unit template, template rename, unit-from-template subject/year, saved view, checkpoint label) |
| F07 | Nested image → Choose from library: "No images in library" | Section, columns and tabs editors never passed the editor context to child editors, so nested image pickers got an empty media list | Context is threaded through `createSectionEditor` / `createColumnsEditor` / `createTabsEditor` → nested editor → child editors |
| F08 | Student preview opened `class.adam-russell.com` (DNS failure) | All preview buttons used the student share host, which has no DNS record yet | Teacher "Student preview" / "View as student" open the same-origin `/teaching/s/…` route. Share / Copy still hand out the class host (see Open: infra) |
| F10 | Trash at 390: Restore / Delete off-screen, untappable | 4-column table plus `display:flex` on the actions `<td>` | Actions live in a flex wrapper inside a normal cell; under 640px each row is a card with full-width 44px buttons. Dates now `dd/mm/yy` |
| F13 | Schedule wizard offered and scheduled the trashed B copy | `schedule-unit` used `unit.lesson_ids` as-is; `scheduled-lessons` POST accepted trashed lessons | Both reject trashed or deleted lessons and classes |
| F14 | Trashed / deleted lessons in search and Recently opened | `/api/search`, the palette's client search and both recents lists never filtered status | Server search uses `withoutDeleted`; palette skips trashed lessons, units and classes; both recents lists only show records still live |
| F15 | @ connections picker showed nothing for CDX10 | The kit picker works with a good response (verified in Chromium). `/api/entities/search` runs ~13 providers in one `Promise.all`, so any one failing (GitHub, Knowledge, Tasks store) rejects the whole search | Each provider settles on its own; failed kinds come back in `unavailable`. Teaching kinds use `isDeletedRecord`. **Re-test live**: the original failing provider could not be confirmed without function logs |
| F16 | Scope: "Jump to undefined", "TERM undefined" | API created terms as `{ label: 'Term 1' }`; client reads `title` + `term_number` | API writes `title` + `term_number`; client normalises old scopes on load and after PATCH, so the CDX10 scope reads correctly without a migration |
| F17 | Lesson options → History: nothing opened | The context bar has `backdrop-filter` (own stacking context) and no `z-index`, so the canvas painted over the dropdown and the Connections section took the click | Context bar is `position: relative; z-index: 20`. Verified with `elementFromPoint` that the click lands on History and the panel opens |
| F25 | Scope "Lessons planned" still counted 4 | Count used `unit.lesson_ids.length`, which keeps trashed ids for restore | `liveUnitLessonCount` counts only live lessons (inspector and unit picker) |
| F26 | Second bulk tag replaced the first | Tags built from the cached row; saved tags never written back | Saved tags are written back immediately; comma-separated input becomes separate tags. "Move to unit" no longer lists trashed units |
| F09 | Add from Drive alert named Vite env vars | Picker keys not set on this deploy | Copy now says Drive isn't connected and to upload or paste a link. Real fix is infra (below) |

Register: new **S5** (dropdown under the next section) and **I10** (`window.prompt` for in-app choices); **R3**, **W2**, **W6** Seen lines extended. See `docs/CURSOR-UI-FAILURES.md`.

## Open

### Needs Adam (infra or data)

Codex brief for all four: [`chatgpt-admin-actions-10.md`](chatgpt-admin-actions-10.md).

- **Student share host has no DNS.** `class.adam-russell.com` is the intended student host (Worker `workers/class-site`, route in `wrangler.jsonc`) but does not resolve, so every Share / Copy link handed to students is dead. Deploy the Worker with its custom domain, or decide to share `/teaching/s/…` links instead.
- **F09 Google Drive picker.** Set `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_PICKER_API_KEY` (or the remote config) on Netlify.
- **F11 Year 9 missing.** The years catalog only holds Year 12, and New class / New unit require a year with no way to add one. Either add the years, or add a "New year" path in those modals.
- **Clean up CDX10 records** listed in the report's inventory, including the CDX10 literal comma tag on A and B.

### Product / build work (not started)

| ID | Finding | Suggested next step |
|----|---------|---------------------|
| F03 | Question sets aren't answerable for students and have no correct-answer / feedback editor | Biggest learning gap. Needs a brief: answer model in the schema, editor controls, student check + feedback, print fallback |
| F12 | Several views stay stale after a save until Refresh | Audit mutation paths for a shared curriculum invalidation; start with homepage save, publish, tag, duplicate |
| F18 | No undo for block delete | Timed undo toast on block delete (kit `offerTimedUndo` already exists) |
| F19 | Mind map auto-fit clips outer branches in the editor | Fit to full node bounds with padding; keep a deliberate zoom across edits |
| F20 | Student controls under 44px at 390 (graph zoom ~24px, tabs 36px) | Raise hit areas per R4 |
| F21 | Resources: no rename, no "where used" | Rename action plus a usage list from lesson blocks |
| F22 | Unit page has no New lesson; calendar only schedules existing lessons | Add context-preserving create from the unit page |
| F23 | PDF embed shows a link card, not an inline viewer | Inline viewer with link fallback |
| F24 | Full screen in both Lesson options and Page menu | Keep one |
| — | Gallery editor has URL fields but no library chooser | Reuse the image library picker |

### Not reproduced / not a product bug

- JSON export download timing out, and frame-targeting misses: Codex marked these as tool limits.
- Run 10 never tested anonymous student access in a private window. Re-run Step 9 in a real private window.
