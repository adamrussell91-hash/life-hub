# Seven phase implementation plan

Author: Codex. Design contract: design-spec.md. Life Hub source and runtime patterns are reused throughout.

| Phase | Implementation | Acceptance |
| --- | --- | --- |
| 1. Foundation | food-journal/model.js, food-journal-schema.mjs, food-journal-repository.mjs, food-journal.mjs | Authenticated read, schema bounds, SHA conflict, deleted source reservation |
| 2. Visit cards | food-journal/view.js, food-journal.css, Life main/controller/index | One visit card with stacked dishes, independent ratings, shared list edit/reorder/delete/undo, draft recovery, rail and More navigation |
| 3. Capture | food-journal/capture.js, food-journal-media.mjs, food-journal-process.mjs, prepare-web.mjs | EXIF inspection before compression, HEIC lazy conversion, private upload, photo to dish association, editable OCR menu text, preservation of personal fields |
| 4. Custom Menu | model.js menuDishes, view.js paintMenu, shared hub filters | Meal/cuisine/tag/rating/search combine, dish first, Recipe and Restaurant routes |
| 5. Recipes | food-journal-assist.mjs, food-journal-run.mjs, food-journal-process.mjs, recipe editor | Background polling, ten verified source candidates, three shortlisted sources, explicit save, ingredient and step lists, fractions and serving adjustment |
| 6. Day One | model.js importDayOne, view.js import review | Select food entries, retain complete prose/date/tags/location/source identity, match media filenames, skip duplicate and deleted source identities |
| 7. Reliability | view.js draft/backup/restore, server tombstones, service worker, tests | Embed photo bytes in backup, restore without duplicates, preserve drafts on failure, sign out clears private view, desktop and 390/320 checks with reduced viewport |

## Verification commands

1. npm run build.
2. node --test tests/unit/food-journal.test.js.
3. node --test tests/browser/food-journal.spec.mjs. PLAYWRIGHT_CHROMIUM_EXECUTABLE supports a locally available Chromium binary.
4. TZ=Australia/Sydney npm run pre-pr-check. Existing excursion fixtures expect the Australian calendar day. Do not run the build, browser suite or root gate concurrently because they prepare the same dist directory.

The root tests now deny unmocked external fetches while retaining local integration servers. The missing Knowledge quick research mock is supplied. Publication fixtures supply the new vendor modules and licences. No gate assertion or existing feature was removed.
