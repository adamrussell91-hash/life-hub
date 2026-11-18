# Meeting recording build — contract

19 November 2026. Builds the spec `docs/superpowers/specs/2026-11-18-meeting-recording-design.md` plus the addendum in that file ("Write-up, picks, profiles and failsafes"). Mockup: `docs/mockups/meeting-recording.html`. One PR, three parts built side by side on separate files. This file is the contract between them; each part keeps to it exactly.

All test data is invented (people, meetings, audio). Never put a real name, school or recording in code, tests, fixtures or docs.

## Shared shapes

`who` is `'me'`, a person ref (`shared:person:…`, the attendee's universal-link ref), `'room'` (someone in the audience at an event), or `null` (unnamed voice).

### Recording blob — `meeting-recordings/<meeting_id>.json` (private Professional store)

```json
{
  "id": "rec_<uuid>",
  "meeting_id": "meeting_<uuid>",
  "kind": "meeting",
  "status": "recording | uploaded | transcribing | writing_up | done | failed",
  "private": false,
  "consent_confirmed_at": "ISO",
  "started_at": "ISO",
  "stopped_at": "ISO | null",
  "duration_ms": 0,
  "parts_expected": null,
  "parts_received": [0, 1, 2],
  "taps": [{ "who": "me", "at_ms": 21000 }],
  "flags": [{ "kind": "task | poi", "at_ms": 600000 }],
  "notes": ["Essay first or viva first?"],
  "attendees": [{ "who": "shared:person:…", "name": "Priya Nandakumar", "role": "chair" }],
  "room": false,
  "attempts": 0,
  "error": null,
  "claimed_until": null,
  "transcript_key": null,
  "audio_deleted_at": null,
  "writeup_status": "none | running | done | unchecked | failed | private_none"
}
```

One recording per meeting. Taps capped at 500, flags at 200, notes at 80 lines of 300 chars.

### Transcript — `meeting-transcripts/<meeting_id>/<recording_id>.json`

```json
{
  "recording_id": "rec_…",
  "duration_ms": 3612000,
  "engine": { "words": "whisper.cpp large-v3-turbo-q5_0", "speakers": "sherpa-onnx titanet_small" },
  "voices": [{ "key": "S1", "who": "me", "source": "taps | picked | check | null", "talk_ms": 912000 }],
  "lines": [{ "start_ms": 724000, "end_ms": 731500, "speaker": "S2", "text": "…", "who_override": null, "moved": false, "unsure": false }],
  "speakers_checked": false
}
```

Line index in `lines` is the line id everywhere else.

### Write-up — `meeting-writeups/<meeting_id>.json`

```json
{
  "status": "done | unchecked | failed | private_none",
  "speakers_checked": true,
  "overview": "plain text, may contain <b> only",
  "flow": [{ "start_ms": 0, "mins": 3, "title": "Purpose", "text": "…", "who": ["shared:person:…"], "line": 0 }],
  "built": [{ "note_index": 0, "text": "…", "who": "me", "start_ms": 52000, "line": 7 }],
  "picks": {
    "mine":   [{ "text": "…", "due": "YYYY-MM-DD | null", "due_label": "End of Week 2 | null", "quote": "…", "start_ms": 0, "line": 0 }],
    "others": [{ "who": "shared:person:…", "text": "…", "due": null, "quote": "…", "start_ms": 0, "line": 0 }],
    "poi":    [{ "who": "shared:person:… | room | null", "text": "…", "quote": "…", "start_ms": 0, "line": 0 }]
  },
  "persons": [{ "who": "shared:person:… | me | room", "points": [{ "text": "…", "star": false }] }],
  "review": { "built": { "0": "kept | gone" }, "picks": { "mine:0": { "state": "done | x", "note": "Task added" } } },
  "error": null,
  "created_at": "ISO"
}
```

`built[].note_index` is an index into `recording.notes`, or `null` for "Not in your notes". Text is short and addresses Adam as "you", matching the mockup.

### People said — `people-said/<base64url(person_ref)>/<meeting_id>.json`

```json
{ "person_ref": "shared:person:…", "meeting_id": "…", "meeting_title": "…", "date": "YYYY-MM-DD", "kind": "meeting | event",
  "points": [{ "text": "…", "star": true }], "quote": "…", "line": 13 }
```

Written by the server when a write-up finishes (not for `me`, `room` or `null`). Rewritten when the write-up is redone or a voice is renamed. Deleted with the recording.

## Routes — `netlify/functions/meeting-recordings.mjs`, path `/api/meeting-recordings`

Browser routes use the normal operator gate (cookie). Worker routes accept `Authorization: Bearer <MEETING_TRANSCRIBER_TOKEN>` and nothing else; the token reaches only worker actions.

Browser:

| Method + action | Body / query | Returns |
|---|---|---|
| `GET ?meeting_id=` | | `{ recording, transcript, writeup, mac: { last_seen_at, version } }` (transcript and writeup only when stored) |
| `POST ?action=start` | `{ meeting_id, consent_confirmed: true, private, kind, attendees, room }` | `{ recording }` — 400 without consent. Replacing a done recording needs `replace: true`. |
| `POST ?action=part` | multipart `meeting_id, recording_id, index, file` (≤4.5 MB) | `{ index, bytes, parts_received }` — idempotent |
| `POST ?action=stop` | `{ meeting_id, recording_id, parts_expected, duration_ms, taps, flags, notes }` | `{ recording, missing: [indices] }`; status `uploaded` only when no part is missing |
| `POST ?action=notes` | `{ meeting_id, notes }` | `{ recording }` |
| `PATCH ?action=speakers` | `{ meeting_id, voices: { S1: who }, lines: { "12": who } }` | `{ transcript, writeup }` — merges voices given the same person, rewrites people-said |
| `POST ?action=writeup` | `{ meeting_id }` | `{ recording }` — reruns speaker check + write-up (Check speakers / redo) |
| `PATCH ?action=review` | `{ meeting_id, built?: {i: state}, picks?: {key: {state, note}} }` | `{ writeup }` |
| `POST ?action=retry` | `{ meeting_id }` | `{ recording }` — failed → uploaded |
| `GET ?action=audio&meeting_id=&index=` | | part bytes (`application/octet-stream`), 404 once deleted |
| `DELETE ?meeting_id=` | | deletes recording, audio, transcript, write-up, people-said |

Worker (Bearer):

| Method + action | Body / query | Returns |
|---|---|---|
| `POST ?action=heartbeat` | `{ version }` | `{ ok }` → `meeting-transcriber/heartbeat.json` |
| `GET ?action=queue` | | `{ work: [{ meeting_id, recording_id, parts_expected, duration_ms, taps, flags, attendees, room, private, notes, glossary }], delete_audio: [{ meeting_id, recording_id }] }` — `uploaded` (or lease expired), oldest first |
| `POST ?action=claim` | `{ meeting_id, recording_id }` | 200 `{ recording }`, 409 if leased (2 h lease) |
| `GET ?action=worker-part&meeting_id=&index=` | | part bytes |
| `POST ?action=transcript` | `{ meeting_id, recording_id, transcript, writeup? }` | `{ ok, stored_key }` — not private: status `writing_up` and the server starts the write-up job; private: stores the worker's `writeup` (or `writeup_status: private_none` when null) and status `done` |
| `POST ?action=delete-audio` | `{ meeting_id, recording_id }` | `{ ok }` — 409 unless the transcript is stored |
| `POST ?action=fail` | `{ meeting_id, recording_id, reason }` | `{ ok }` — attempts + 1, status `failed`, audio kept |

People: `GET /api/people-said?person_ref=` (operator) → `{ entries: [...] }`, newest first.

Write-up job: background function `netlify/functions/meeting-writeup-run.mjs` (path `/api/meeting-writeup-run`, `background: true`). Started by the `transcript` worker action and by `?action=writeup`. It accepts the worker token or the operator cookie. Status lives on the recording (`writeup_status`). A run older than 15 min counts as failed.

## Prompts — `netlify/functions/_shared/meeting-writeup.mjs` (pure, importable by the Mac worker)

- `sentenceChunks(transcript)` → chunks of about 120 lines, each with the previous 12 lines as context.
- `speakerCheckPrompt(ctx, chunk)` / `parseSpeakerCheck(reply, chunk)` → `{ changes: [{ line, who }], unsure: [line] }`. Rules from the spec: whole sentences, only changes, unsure only for meaningful lines.
- `writeupPrompt(ctx, transcript, notes, flags)` / `parseWriteup(reply, ctx, transcript, notes)` → the write-up shape above. Every `who` is checked against the attendees (else dropped to `null`), every `line` index bounds-checked, every string trimmed and capped, lists capped (flow ≤ 12, built ≤ 30, each pick list ≤ 15, persons ≤ attendees + 2, points ≤ 5 each).
- Model `claude-opus-5-5`, `output_config.effort: "low"`, JSON-only reply, through a `completeJson`-style helper that takes `model` and `effort` (extend `_shared/clare-comms-model.mjs` with optional `model` / `effort` params; existing callers unchanged).
- The write-up prompt: overview 3–5 sentences; flow segments by topic with start time and who led; `built` adds to Adam's own note lines (what was decided, said for and against, who will do what) and lists what he did not note; `picks.mine` every time Adam said he will do something, `others` every time someone else did, `poi` opportunities or things worth remembering (a program, role, call for applications, contact, resource, a strong idea); `persons` 1–5 points each, `star` on the contribution most worth remembering. Flags (`task`, `poi` taps) mark where to look hardest. Address Adam as "you". Never invent; only what was said.

## Mac worker — `tools/meeting-transcriber/`

- `worker.mjs` (Node 20, no npm deps): heartbeat → queue → delete pending audio → claim one → download parts → join → ffmpeg 16 kHz mono WAV in `mkdtemp` (0700) → `whisper-cli` (model from config, `-ml 1 -sow -oj`, no `--prompt`) → `diarize.py` (sherpa-onnx, speaker count = attendees + 1 (+1 if room)) → `lib/assemble.mjs` → tap naming → POST transcript → (private) local write-up via llama.cpp server if `LOCAL_LLM_URL` set, using the same prompts from `../../netlify/functions/_shared/meeting-writeup.mjs` → delete-audio → rm temp. Failures call `fail` and never delete audio.
- `lib/assemble.mjs` (pure, unit-tested): words → speaker at word midpoint; lines split at speaker change or pause > 1.5 s; tap vote (window t−2 s … t+1 s, most talk time; name needs ≥ 2 votes and ≥ 2/3 of the voice's votes; same name merges voices); talk_ms per voice.
- `diarize.py`: reads WAV + count, prints JSON segments. Runs in the spike's uv venv (`~/Tools/meeting-transcriber/.venv`).
- Config `~/.config/meeting-transcriber/config.json` (`api_base`, `whisper_model`, `diarize_python`, `local_llm_url`); token from Keychain `security find-generic-password -s life-hub-meeting-transcriber -w`.
- `com.adamrussell.meeting-transcriber.plist` (every 300 s + RunAtLoad) and `README.md` setup steps.

## Browser — Professional app

- `src/api/meeting-recordings.ts` — typed client for the routes above.
- `src/lib/meeting-recorder.ts` — MediaRecorder (`audio/webm;codecs=opus` 32 kbps, `audio/mp4` fallback), 60 s slices, **every slice written to IndexedDB (`life-hub-recordings`) before upload**, upload queue with retry and `online` listener, analyser level meter, silence detection (RMS under threshold for 15 s → alarm, buzz with `navigator.vibrate` where present), mic picker (`enumerateDevices`), wake lock, `beforeunload`, pause/resume, 3 h stop (warn at 2 h 50), crash recovery (on load, list IDB parts not yet in Life Hub for this meeting), "save a copy" (join IDB parts → download), IDB parts cleared only once the server reports `audio_deleted_at`.
- `src/views/meeting-recording-strip.ts` — Record button, consent panel with mic check, rec badge, meter, health line (saved here / in Life Hub / screen on), silent-mic and upload alarms, tap chips with counts and Undo, "That's a to-do" / "Remember this" flags. Mounted in `liveStrip()`.
- `src/views/meeting-recording-card.ts` — After phase card above Minutes: uploading / parts on device / waiting / transcribing / failed states with the three-place safety row, and Done: overview (+ feeds Summary), flow strip (fixed height, scrolls sideways), built-out notes (✓ appends to the notes block page under a "From the recording" rich text block; ✕ drops), picks (+ Task via `createTask` + tagged_with link; Track it via `createLedgerItem` they_owe; ★ Keep), who-said-what with Open profile, unnamed-voice prompt.
- `src/views/meeting-transcript-drawer.ts` — voices with pickers, Find, lines with Change who; times anywhere open it at a line.
- Person page: a "Said in meetings" tab in `src/components/person-tabs.ts` reading `/api/people-said`.
- Event page: same strip + card when the event has attendees, `kind: 'event'`, room chip on.
- Styles in the app's existing stylesheet conventions; 390 px works; no horizontal page scroll.

## Checks

Unit tests: assemble (tap vote, merges, late taps, line grouping), routes (consent, part size, token scope, delete order, never delete audio on failure or before transcript), write-up parsing (bad who, bad line index, caps), people-said writes and deletes. One `npm run pre-pr-check` at the end. No grove, no full Tasks suite.
