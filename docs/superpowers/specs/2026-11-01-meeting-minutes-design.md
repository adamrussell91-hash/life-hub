# Meeting minutes — design

Date: 1 November 2026. Status: approved in conversation, not built.

## Goal

Official minutes (a PDF or pasted text) go onto the meeting Adam names. Clare reads them once and offers four things to review: his action items, other people's action items, decisions, and places where the minutes disagree with his own notes. Nothing is saved until he ticks and saves.

Adam always says which meeting the minutes belong to. There is no series linking and no "last meeting's minutes" card.

## What it builds on

- **Promise ledger** (`apps/professional/src/api/ledger.ts`): `you_owe` / `they_owe` items tied to a person and a `comm_ref`, with an optional `task_ref`. The After-phase **✦ Summarise** already finds promises and offers tick-boxes plus **Add to the ledger** (`meeting-page.ts`, `wrapUpCard`). Minutes follows that pattern.
- **Decisions**: `{ id, text, agenda_heading }` on the meeting, capped at `DECISIONS_MAX`.
- **Follow-up task links**: `buildMeetingTaskLinks` on the meeting page.
- **Clare comms jobs**: one Claude call each through `completeJson` in `netlify/functions/_shared/clare-comms-model.mjs`, which already takes a content array.
- **Attendee roles**: `chair`, `minute_taker`.

## The Minutes card

Sits on the meeting page under the notes card in every phase (Before, During, After).

1. **Empty**: heading **Minutes**, line "Official minutes for this meeting", button **Add minutes** (PDF picker, or a paste box).
2. **Reading**: "Clare is reading the minutes…"
3. **Review**: four groups, each item a tick-box ticked by default.
   - **For you**: text plus due date if stated. Saves as a `you_owe` ledger item and a follow-up task link.
   - **For others**: person plus text. Saves as `they_owe` under that attendee, so it shows in Open promises next time.
   - **Decisions**: text plus agenda heading. Appended to the meeting's decisions.
   - **Check against your notes**: read-only flags ("Your notes say approved; the minutes say pending"). No tick-box.
   - **Unmatched**: an action Clare could not tie to an attendee shows with a person picker. She never guesses silently.
   - Button: **Save ticked items**.
4. **Saved**: the minutes as readable text split by agenda item, **Open the PDF**, and one line such as "Added 3 tasks, 2 promises, 4 decisions." A small **Replace minutes** link starts again.

Replacing minutes (a corrected version) overwrites the stored minutes. Items already saved are skipped, matched on normalised text and person, so nothing doubles.

## Who is who

Adam is never in the attendee list, and Clare's house prompt already names him, so the model returns `who: "me"` for his actions. For everyone else the server matches the name, first name or initials as written to an attendee. The server keeps a person only if they are an attendee; anything else comes back as unmatched.

## Server job

New Clare comms job `minutes`, next to `summary`, `drafts`, `brief` and `handwriting`.

**Input**: the meeting id; the minutes as a PDF (base64, `application/pdf`) or as text; the agenda headings; Adam's notes as plain text (`blockPlainText`); the attendees; Adam's identity.

**Model call**: the PDF goes in as a `document` content block, the rest as text. Model: `CLARE_COMMS_MODEL`. JSON-only reply.

**Reply shape**:

```json
{
  "sections": [{ "heading": "Assessment", "text": "…" }],
  "mine": [{ "text": "Circulate the draft unit plan", "due": "2026-11-14" }],
  "others": [{ "text": "Confirm excursion budget", "person_ref": "shared:person:…", "due": null }],
  "unmatched": [{ "text": "JT to follow up with the venue", "who_text": "JT" }],
  "decisions": [{ "text": "Year 10 exams move to Week 8", "agenda_heading": "Assessment" }],
  "differences": [{ "text": "Your notes say the trip was approved; the minutes say pending." }]
}
```

The server validates before returning: drops empty items, caps each list (30 actions, `DECISIONS_MAX` decisions, 10 differences), checks dates, and moves any `person_ref` that is not an attendee to `unmatched`.

**Limits**: one PDF up to 4 MB (base64 adds a third, and Netlify functions take about 6 MB of body). Bigger files get a plain message asking for the relevant part to be pasted. Scanned PDFs without a text layer still work, since Claude reads the pages as images.

**Failure**: "Clare couldn't read these minutes" plus **Try again**, via the existing `showClareError`.

## Storage

- **Meeting record**: new optional `minutes` field (no schema version bump, the same way `coaching_sheets` was added):
  `{ sections: [{ heading, text }], file_key: string | null, source: 'page' | 'chat', added_at, saved_counts: { tasks, promises, decisions } }`. Pending (unsaved) review results are not stored on the page route; they live in the card until Save.
- **PDF**: the private Professional Blobs store under `meeting-minutes/<meeting id>/<added_at>.pdf`, behind the same sign-in as meetings. Never public assets.
- **Decisions from minutes** carry `source: 'minutes'`. When notes are saved, `extractDecisions` rebuilds only the note-sourced decisions and keeps the minutes ones.

## Chat route (second phase, after chat carries PDFs)

Clare, Hammond and Ann get a `read_minutes` capability. Adam drops the PDF in chat and names the meeting; the assistant finds it with `search_professional`, runs the same `minutes` job, and stores the result as a pending review on the meeting (`minutes_pending`). The reply links to the meeting page, where the same review list and **Save ticked items** finish the job. One review screen serves both routes.

This needs chat attachments to deliver PDFs to the model, which they do not today (`hub-chat-attachments.js` only sends images and small `text/*` files). That fix is a separate piece of work.

## Cost

One Sonnet call per set of minutes. An ordinary 5–10 page set is roughly 15,000–30,000 input tokens. Check the real figure on the first live run.

## Privacy

Minutes hold real names and school business. The PDF and the parsed minutes live only in the private Blobs store. Tests, fixtures, mock API data and screenshots use invented meetings and people.

## Testing

- Unit: reply validation (caps, non-attendee person moves to unmatched, bad dates dropped); duplicate skipping on replace; decisions merge keeps `source: 'minutes'` items when notes are saved.
- Unit: the meeting schema accepts and round-trips `minutes`.
- Mock API: a `minutes` job fixture so the card can be walked in the dev preview.
- Browser walk at desktop and 390px: empty, reading, review, saved, replace, unmatched picker, error.

## Out of scope

- Linking meetings into a series, or a "previous minutes" card.
- Writing or sending minutes as the minute taker.
- Editing the minutes text after saving (Replace covers corrections).
