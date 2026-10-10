# Task 6 report — Capture sheet

## Verified
- `isCaptureSaveEnabled` rules (text / photo / voice) — `apps/travel/tests/unit/capture-sheet-save.test.ts`
- R4 docked Save/Cancel + 48px mode buttons — `capture-sheet-footer.test.ts`
- Toolbar + empty-day **Add moment** open capture sheet — `journal-render.test.ts`
- Travel vitest suite green

## Files
- `apps/travel/src/journal/capture-sheet.ts` — Photos/Voice/Text, dirty discard, IDB draft hookup
- `apps/travel/src/journal/drafts.ts` — 500ms idle + blur persist
- Wired `render-toolbar.ts`, `render-journal.ts`; multi-photo → `import-sheet` `initialFiles`

## Not verified
- Live save against API (fixture journal uses `version: fixture`)
- Manual 390 keyboard R4 measure (CSS + unit guards only)

## Follow-up (Important findings)
- Discard dirty dialog: `clearCaptureDraft(tripId, legId, localDate)` before `finishClose`
- `capture-sheet-footer.test.ts`: R4 safe-area + phone 3rem action buttons (parity with import sheet)
