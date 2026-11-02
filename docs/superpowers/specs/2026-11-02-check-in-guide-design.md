# Check-in guide: design

2 November 2026. Professional hub, meeting page, Guides shelf. Mockup: `docs/mockups/check-in/check-in.html`.

## Why

Wellbeing conversations come up in meetings with students without warning. Adam has mental health first aid training and university study on youth mental health, and wants a calm guide he can pull up mid-meeting that walks the steps and ends in a handover record.

## Decisions (Adam, 2 Nov)

- **A second kind of guide.** Meeting Guides measure (Motivation). Check-in is a protocol: ordered actions, safety first, ending in a handover. It gets its own engine and panel and sits on the same shelf.
- **Live, then a record.** Light step cards during the conversation; a short handover record finished afterwards.
- **Main path plus side cards.** Five steps (Open, Safety, Listen, Hope, Help). A "What's going on?" picker opens focused side cards only when needed.
- **Wording is private.** Every line of guide text lives in the private data repo (`data/professional/guides/check-in.json` in life-hub-data), loaded at runtime by `/api/check-in-text`, teacher only. The public repo holds shapes, icons and layout.
- **The safety exit is quiet.** A muted ⋯ in the panel header opens a small plain sheet (stay, call 000, school procedure, contacts). No red, no banner, nothing a student glancing at the screen would read as alarm.
- **Neutral name and emblem.** "Check-in", with a bridge emblem: two banks, one span.
- **Locked away.** The record is sealed and kept apart from the meeting.

## Storage

- Records are sealed with AES-256-GCM (key derived by HKDF-SHA256 from the `CHECK_IN_KEY` environment variable, at least 32 characters; the blob key is bound as associated data) and kept in their own Netlify Blobs store, `professional-check-ins`.
- An index, also sealed, holds summaries only: id, meeting, person, times.
- **Nothing is written to the meeting record**, not even a reference. Every reader of meetings (Clare, chat tools, agents, briefs, search, Notion sync) therefore cannot see that a check-in exists.
- With no key set, nothing is written or read (503). There is no plaintext fallback.
- `/api/check-ins` (teacher only, `no-store`): get one, list by meeting or by person (summaries only), save, delete.

## Surfaces

- **Shelf.** The Guides panel lists Check-in after the measuring guides. Picking it hands over to the Check-in panel.
- **Panel.** Step pills you can jump between, one step card at a time, an optional short factual line per step, side cards, the quiet sheet, and the handover. Closing with unsaved content asks first.
- **Handover.** Safety, side cards opened, what was said (drafted from the step lines), agreed help, handed over to, report status (shown when an opened side card may need one), follow-ups. Save seals it.
- **Meeting page.** A closed card: "Check-in · name", time, locked, Open. Open fetches and unseals it into the handover.
- **Profile timeline.** A marker, "Check-in · see meeting". Nothing from inside the record.
- **Tasks.** Each newly ticked follow-up becomes a task titled "Follow-up: …", tagged to the meeting. It says what to do, not who or why.

## Motion

One easing (the hub motion ease), short durations, nothing that bounces: the panel slides in, step screens slide in the direction of travel while the old one leaves, a highlight glides between step pills, list items rise in a short stagger, chips tick with a drawn check, the quiet sheet pops from the ⋯, the optional line and report field unfold, Save turns into a drawn "Saved". All of it stops under `prefers-reduced-motion`.

## Tests

- `tests/unit/check-ins.test.js`: sealing, tamper and key checks, no plaintext at rest, summaries only in lists, validation, teacher-only endpoints, private text loading and caching.
- `apps/professional/tests/unit/check-in.test.ts`: model, the full walk to a saved handover, the quiet sheet, the close guard, editing and deleting, choosing who, load failure, the shelf hand-over and the locked card.

## Setup

Set `CHECK_IN_KEY` on the Netlify site to a long random value (for example `openssl rand -base64 48`). Keep it; records sealed with it can't be read without it.
