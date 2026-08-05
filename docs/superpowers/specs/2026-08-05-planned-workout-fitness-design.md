# Planned Workout on Fitness (Design Amendment)

**Date:** 2026-08-05  
**Status:** Approved  
**Parent:** Slice 1 Chadwick protocol + Fitness tab  
**Deploy rule:** Local commits only until Adam asks to push.

## Problem

Building a workout with Chadwick only produced chat text. Fitness stayed on “No session yet…” because protocol forbade `log_entry` until the session was finished. The UI already supports a `planned` hero; we never wrote one.

## Decision

When Adam asks Chadwick to **design / build today’s plan**, Chadwick may propose a workout `log_entry` with `status: planned`. After confirm, Fitness shows that session in the hero.

After training, Adam reports actuals; Chadwick proposes `status: completed` (same title). Confirm writes history and may upsert the template (existing completed-only template rule unchanged).

## Hero resolution (change)

1. Today’s **`completed`** session (if any)  
2. Else today’s **`planned`** session  
3. Else latest **`completed`** on or before display date  
4. Else empty state

This prevents a leftover planned file from hiding a finished session.

## Finish / overwrite

Prefer completing the same title on the same day via **overwrite** of the planned file when the path conflicts (existing confirm overwrite UX). If paths differ (different times), both may exist; hero still prefers today’s completed.

## Protocol / persona

- Allow `planned` proposals when Adam is designing today’s session.
- Still forbid mid-session / in-progress writes.
- Completed / skipped remain the finish path; templates upsert only on completed.

## Sidebar label

Replace hardcoded “Fixture mode · read only” with live status (synced / offline / signing in), so it matches reality.

## Non-goals

- In-progress set-by-set logging UI  
- Auto-write planned without confirm  
- Netlify push in this change set  
