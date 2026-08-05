# Mind Tab + Chat Avatars

**Date:** 2026-08-05  
**Status:** Approved  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Mind is a later-phase stub. Diary data exists; Penelope/Vera voices exist without protocols. Chat has no visual personality picker.

## Decisions

| Topic | Choice |
|-------|--------|
| Mind charts | Mood score line · entries by mood · recurring themes (tags) |
| Ranges | Weekly · Monthly · 6M (default Monthly) |
| Logging | Conversation-first via Penelope; no quick-log fields |
| Vera | Reflection only — no `log_entry` |
| Protocols | `config/penelope-protocol.md`, `config/vera-protocol.md` |
| Avatars | Strip on Chat + chat panels; order Brisket→Chadwick→Hyaluronica→Hammond→Penelope→Vera→Sara |
| Sticky agent | Click avatar sets sticky personality for subsequent messages |

## Out of v1

Energy chart, Day One email, Vera session record type, full diary prose on the dashboard.

## Verification

- Unit: mind model series/counts; persona injects protocols; avatar sticky selection.
- Manual: Mind charts; click avatars switches voice/colour; Penelope can propose diary.
