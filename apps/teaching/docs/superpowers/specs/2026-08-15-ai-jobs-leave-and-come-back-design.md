# Teaching Hub — Leave-and-come-back AI jobs + Jobs inbox

**Date:** 2026-08-15  
**Status:** Approved for implementation  
**Product name:** Teaching Hub  
**Slice:** Durable Clementine jobs that finish with no tab open; a small chrome Jobs panel; resume Accept in the lesson chat  
**Depends on:** `/api/ai/jobs` Blobs records, `completeWorkingAiJob`, lesson builder chat, teacher shell rail  
**Does not include:** SortableJS. **Won’t do:** live streaming onto the page; auto-publish. (Partial Accept, homepage/unit canvas, and student-view rewrite shipped in later slices.)

## Goal

A teacher can send Clementine a long-run job, leave Teaching Hub, come back later, see unfinished work in a small Jobs panel, open the lesson, and Accept or Reject the same plan card as if they had stayed.

## Locked decisions

| Topic | Choice |
|-------|--------|
| Surface | Chrome Jobs control (rail) opening a small panel. Not a Dashboard slab. |
| Row action | Click opens `/lessons/:id`. Accept/Reject stay in chat. |
| Inbox membership | `working`, unresolved `done`, and `error`. Accept/Reject drop the row. Failed stays until Dismiss. |
| Completion | Start on `POST`. GET is read-only (except 10-minute stale → `error`). Netlify background function runs archive + `/lesson_proposal`. |
| Conflict | One unresolved job per lesson (`working` or unresolved `done`). `POST` → 409 with existing id. Failed does not block retry. |
| Mutation | Still proposal-only. Page unchanged until Accept. Never publish. |

## Record

`ai_jobs/{id}` keeps `status: working | done | error` and gains optional `resolution?: 'accepted' | 'rejected' | 'dismissed'`.

Inbox visible when `!resolution` and status is `working`, `done`, or `error`.

Index blob `ai_jobs/_inbox`: compact rows `{ id, lesson_id, lesson_title, agent, status, created_at, message }`. Create, complete, stale-timeout, and resolve upsert or remove.

## API

- `POST /api/ai/jobs` — create `working`, upsert index, invoke background, return 202 `{ id, status: 'working' }`. 409 if unresolved job exists for that lesson (`error.details.id` + `status`).
- `GET /api/ai/jobs` — inbox rows (newest first).
- `GET /api/ai/jobs/:id` — job JSON. If still `working` and older than 10 minutes, persist `error` and update index.
- `PATCH /api/ai/jobs/:id` `{ resolution }` — `accepted`/`rejected` only when `done`; `dismissed` only when `error`. Removes from inbox.
- Background: `ai-job-run-background` with job id. Auth: teacher session **or** internal `x-ai-job-run-secret` (site/kernel secret). Runs `completeWorkingAiJob`. Mock completes via the same run path (in-process).

## Chrome

Always-visible **Jobs** button on the teacher rail (brand row). Badge = inbox count. Pulse if any row is `working`. Panel: lesson title, agent, status (Working / Ready / Failed), time, message excerpt. Empty: “No jobs waiting.” Failed rows include Dismiss. Cotton-glass, compact — not a page.

Poll inbox while the teacher shell is mounted (about 4s; faster in tests).

## Lesson chat

On mount, load inbox (or job for this lesson). Restore:

- `working` — pulse + poll that id
- `done` — pending Accept card from the job proposal (`snapshot_at` from the job)
- `error` — error text

Accept/Reject also `PATCH` resolution. Dismiss is inbox-only.

If `POST` 409s, resume the existing id instead of stacking cards.

## Failure

| Failure | Result |
|---------|--------|
| Background never starts | GET after 10 minutes marks `error`; row stays until Dismiss |
| Kernel fail | `error` in inbox and chat |
| Stale Accept | Existing confirm; then resolution `accepted` if apply succeeds |
| AI down | Canvas still works; panel shows failed jobs |

## Tests

- Inbox upsert/remove/unresolved-per-lesson/resolution rules
- Mock: auth, 409, list, read-only GET until run, PATCH drops inbox, dismiss only on error
- Panel: renders rows, navigates, dismiss, badge/pulse
- AI panel: resume working/done; Accept/Reject PATCH; 409 resumes
