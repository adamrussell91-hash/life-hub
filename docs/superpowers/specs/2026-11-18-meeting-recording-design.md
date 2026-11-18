# Meeting recording, transcript and speaker names — design

18 November 2026. Professional hub, meeting page. Status: approved in conversation, not built. The Phase 0 spike runs on the current Mac.

## Goal

Adam records a meeting on the meeting page. While it runs he taps an attendee's name when that person starts speaking. Afterwards his own Mac turns the recording into a transcript where every line carries a name. The audio is then deleted permanently.

No speech company hears the audio. It passes through Life Hub's own Netlify storage and is processed on Adam's Mac.

## Decisions

- **Local processing, not a paid API.** Privacy matters more than convenience here. AssemblyAI (about A$0.35 an hour) was the alternative and is a little more accurate on speaker labels. It stays a possible fallback, but is not built.
- **Tools on the Mac:** whisper.cpp with `large-v3-turbo` for the words (uses the Apple chip), and a separate speaker-labelling ("diarization") model for who spoke when. The labelling engine is sherpa-onnx with models from its GitHub releases, which needs no account. It was chosen in Phase 0. pyannote, which needs a Hugging Face account, stays in reserve if real meetings label poorly.
- **Taps name the voices.** Diarization returns anonymous speakers. Taps made during the meeting turn them into attendees.
- **AI clean-up decides who said what.** Voice matching alone failed on a real two-person recording: quick exchanges landed on one line. So after the voices are named, a language model re-reads the transcript sentence by sentence and fixes the speaker from meaning (questions and answers, who would say what, turn-taking, taps). Lines it moved are marked.
- **Claude by default, local when private.** A meeting has a **Private** switch, set before or after recording. Not private: the clean-up runs on Claude through the API, sending text only, never audio. Private: it runs on a local model on the Mac, and nothing leaves Life Hub. Health appointments are the obvious case for the switch.
- **Audio is deleted permanently** once the transcript is saved and readable. No grace period. The Mac's temporary copies go at the same time.
- **Meetings first.** Events can reuse it later if they have attendees. That is not in this build.
- **Voice notes are untouched.** Annotation and lesson voice notes keep going through Cloudflare Workers AI (`@cf/openai/whisper-large-v3-turbo`). Only meetings use the local path.

## What it builds on

- **Meeting page phases** (`apps/professional/src/views/meeting-page.ts`): During shows `liveStrip()` (timer, End, Read a photo), the Minutes card and the notes card. After shows Minutes, purpose check, wrap-up and notes.
- **Attendees** are Universal Links with relationship `attendee` and role `null | 'chair' | 'minute_taker'`. Adam is never an attendee.
- **Long audio upload in parts** (`netlify/functions/annotation-voice-part.mjs`): Netlify rejects bodies over 6 MB, so the recorder sends parts of 4 MB or less and a second call joins them. Meetings copy the pattern.
- **Private Professional Blobs store**, behind the same sign-in as meetings. It already holds minutes PDFs under `meeting-minutes/<meeting id>/`.
- **Mac background jobs**: launchd already runs `com.adamrussell.cleanup-merged-worktrees`. The transcription worker is a second launchd job.

## On the meeting page

### Before recording: consent

The live strip gets a **● Record** button. The first press opens a small panel:

- "Everyone in this meeting has agreed to it being recorded." with a tick box. **Start recording** stays disabled until it is ticked.
- One line underneath: "Recording people without their agreement is unlawful in NSW."

The tick is saved on the recording (`consent_confirmed_at`). There is no way past it.

### While recording

The strip shows a red dot, elapsed time, **Pause** and **Stop**. A row of name chips sits under it: **Me** first, then each attendee by name. Tapping a chip:

- logs `{ who, at_ms }`, where `who` is `'me'` or the attendee's `person_ref` and `at_ms` is milliseconds since recording start, excluding paused time;
- flashes the chip and shows a small count on it (`×2`);
- shows the hint "Tap when someone starts talking. Two or three taps each is enough." until each chip has at least one tap.

An **Undo last tap** link removes the most recent tap within 10 seconds.

Behaviour:

- **Format:** MediaRecorder, `audio/webm;codecs=opus` at 32 kbps mono where supported. Safari and iPhone fall back to `audio/mp4` (AAC). The Mac converts both.
- **Upload as it goes:** every 60 seconds the recorder uploads that slice as a part. A crash or closed tab loses at most a minute. Taps upload with each part.
- **Screen wake lock** is held while recording, so a phone on the table doesn't sleep and stop the recorder. If the browser can't hold one, the strip says "Keep this screen on while recording".
- **Leaving the page** while recording asks for confirmation.
- **Limit:** 3 hours. At 2 h 50 m the strip warns, and at 3 hours it stops by itself.
- **Pressing End ›** on the meeting while recording stops the recording first, then completes the meeting.

### After recording

A **Transcript** card sits in the After phase, under Minutes. Its states:

1. **Uploading** (`n of m parts`), if parts are still in the browser's queue.
2. **Waiting for your Mac**: "Your Mac will transcribe this next time it's on." The card also shows when the Mac last checked in ("Mac last checked in 2 hours ago").
3. **Transcribing**: "Your Mac is transcribing (about 20 minutes for an hour)."
4. **Done**: the transcript (below).
5. **Failed**: the reason in plain words and **Try again**. The audio is kept until a run succeeds.

### The transcript

- **Speakers** sit at the top: one row per voice found, showing the name (or "Unnamed voice 3"), the share of speaking time, and its first two lines as a sample.
  - A voice named by taps shows the name with a small "from your taps" note.
  - An unnamed voice has a **Who is this?** picker listing Me and the attendees. Choosing a name relabels every line from that voice.
  - Any voice can be renamed the same way. If two voices are given the same person, they merge.
- **Lines** follow, in time order: `12:04  Name  text`. Consecutive lines from the same voice join into one paragraph.
- A **Find** box filters lines to those containing the words.
- **Change who said this** on a single line covers short interjections that diarization got wrong. The change applies to that line only.
- The card is collapsed by default after the first visit. It opens to the Speakers summary.

The audio has gone by this point, so there is no playback. That is the trade for permanent deletion.

## The Mac worker

A small Node script in the repo at `tools/meeting-transcriber/`, run by launchd every 5 minutes and on wake. Each run:

1. **Checks in:** `POST /api/meetings/recordings/heartbeat`. This updates "Mac last checked in".
2. **Asks for work:** `GET /api/meetings/recordings/queue` returns recordings that are uploaded and not done, oldest first, with their meeting id, part count, taps, the attendee list (`person_ref` plus display name) and the glossary. It takes one at a time.
3. **Claims it:** `POST …/claim` sets `transcribing` with a 2-hour lease. Another run can't take it, and a run that dies is retried when the lease runs out.
4. **Downloads the parts**, joins them, and converts to 16 kHz mono WAV with ffmpeg. This all happens in a private temporary folder (`mkdtemp`, mode 700).
5. **Words:** whisper.cpp with `large-v3-turbo`, word-level timestamps, language `en`. The initial prompt is built from the attendee names plus the glossary, which helps with names, class codes and school acronyms.
6. **Speakers:** sherpa-onnx diarization (pyannote segmentation 3.0 plus the `nemo_en_titanet_small` voice model) with automatic speaker count, clustering threshold 0.5. In the spike, a fixed count did worse than automatic, and sherpa-onnx can't take a minimum and maximum.
7. **Join:** each word takes the speaker active at its midpoint. Words are grouped into lines at a speaker change or a pause over 1.5 s.
8. **Name the voices from taps.** A tap at `t` votes for the speaker with the most speaking time in the window from `t − 2 s` to `t + 1 s`, which allows for tapping late. Counting any speaker present in a wider window let the previous speaker's last words steal the vote, and no voice got named. Each voice takes the name with the most votes, if that name has at least 2 votes and at least two-thirds of the voice's votes. Two voices won by the same name merge. Everything else stays unnamed for the picker.
9. **Sends the result:** `POST …/transcript` with the sentences (each with its voice label), the speaker names from taps, duration and engine versions.
10. **AI clean-up.**
    - **Not private:** the server queues a Clare comms job, `transcript_speakers`, on `claude-opus-5-5` at effort `low` (not `CLARE_COMMS_MODEL`; Sonnet was tested and swapped speakers). It sends sentences in chunks of about 120 (each with id, time, voice label and text), with the last dozen labelled sentences repeated as context. It also sends the attendees with their roles and the taps. Each sentence arrives labelled with its voice's tapped name. The reply, in structured output, lists only the sentences to change, `{ changes: [{ id, who }], unsure: [id] }`, with unsure reserved for meaningful sentences, never fillers. The job writes `who`, `moved` and `confident` onto each line and joins consecutive lines from one person.
    - **Private:** the Mac does the same with a local model through llama.cpp and sends the cleaned transcript instead.
    - **If the clean-up fails**, the voice-labelled transcript stays, with a "Speakers not checked" note and **Check speakers** to retry.
11. **Deletes:** after the server confirms the transcript is stored, the Mac calls `POST …/delete-audio`, then removes its temporary folder. If the delete call fails, the next run retries it. The queue lists recordings whose transcript is saved but whose audio is still there.

### Errors

- A part that fails to download or a crashed tool marks the run `failed` with the reason.
- The audio is never deleted on failure.
- After three failures, the card says "Transcription keeps failing" and offers **Try again** and **Delete recording**.

### Credentials

The Mac doesn't have a browser session, so it uses its own key:

- A new secret, `MEETING_TRANSCRIBER_TOKEN`, set in Netlify env and stored in the Mac's Keychain. It is never written to a file.
- It is sent as `Authorization: Bearer …` and is accepted only by the `/api/meetings/recordings/*` worker routes.
- With it, the Mac can read queued recordings and the glossary, write a transcript and delete audio. It can't read or change anything else.

### Setup on the new Mac (done once, by Claude)

Homebrew `ffmpeg` and `whisper-cpp`; the `large-v3-turbo` model (about 1.6 GB); the chosen diarization engine and model, pinned to an exact version and checked by hash; the launchd plist; and the Keychain entry. Models are files on disk and run offline after download.

## Server

### Routes

All routes sit in `netlify/functions/meeting-recordings.mjs`.

| Route | Who | Does |
|---|---|---|
| `POST /api/meetings/:id/recordings` | browser | starts a recording (needs `consent_confirmed: true`) and returns its `recording_id` |
| `POST /api/meetings/:id/recordings/:rid/part` | browser | one slice, 4 MB or less, multipart with `index` and the taps so far |
| `POST /api/meetings/:id/recordings/:rid/stop` | browser | final part count, duration, all taps; status becomes `uploaded` |
| `PATCH /api/meetings/:id/transcript/speakers` | browser | name or rename a voice, merge voices, fix a single line |
| `DELETE /api/meetings/:id/recordings/:rid` | browser | delete a failed recording and its audio |
| `GET /api/meetings/recordings/queue` | Mac | work list, plus transcripts saved with audio still to delete |
| `POST …/heartbeat`, `…/claim`, `…/transcript`, `…/delete-audio`, `…/fail` | Mac | as above |

### Storage

- **Audio parts:** `meeting-audio/<meeting id>/<recording id>/<0000>`, deleted by `delete-audio`.
- **Transcript:** `meeting-transcripts/<meeting id>/<recording id>.json`, kept off the meeting record because an hour of transcript is around 60 KB:

  ```json
  {
    "recording_id": "rec_…",
    "duration_ms": 3612000,
    "engine": { "words": "whisper.cpp large-v3-turbo", "speakers": "…" },
    "speakers": [
      { "key": "S1", "who": "me", "source": "taps", "talk_ms": 912000 },
      { "key": "S2", "who": "shared:person:…", "source": "picked", "talk_ms": 640000 },
      { "key": "S3", "who": null, "source": null, "talk_ms": 41000 }
    ],
    "lines": [{ "start_ms": 724000, "end_ms": 731500, "speaker": "S2", "text": "…", "who_override": null }]
  }
  ```

- **On the meeting record**, an optional `recording` field with no schema version bump, the same way `minutes` was added: `{ id, status, consent_confirmed_at, started_at, duration_ms, parts, taps: [{ who, at_ms }], attempts, error, transcript_key, audio_deleted_at }`. Status is one of `recording`, `uploaded`, `transcribing`, `done` or `failed`. Taps are capped at 500.
- **Heartbeat:** `meeting-transcriber/heartbeat.json` with `{ at, version }`.
- **Glossary:** `meeting-transcriber/glossary.json`, a list of up to 200 words edited in Professional settings, such as class codes, acronyms and place names. It lives in private Blobs and is never in the repo.

One recording per meeting. Recording again replaces the old transcript, after a confirmation.

### Privacy

Transcripts are personal content. They live only in private Blobs and are never logged; server logs carry ids, sizes and durations only. Tests and fixtures use synthetic audio made on the Mac with `say` in two voices, reading invented lines with invented names.

## Clare reads the transcript (phase 3)

Once a transcript exists, the After-phase **✦ Summarise** and the Minutes job can include it as text, with names, alongside Adam's notes. This sends text, not audio, to Anthropic, the same as every other Clare job. A meeting with both minutes and a transcript gets an extra check: "The transcript has X agreeing to Y; the minutes don't mention it."

## Build order

One PR for the whole build (phases as commits), after Phase 0.

0. **Spike on the current Mac (M1, 8 GB), no PR.** The new Mac is weeks away, so the spike runs now. Use the quantised `large-v3-turbo-q5_0` model (about 550 MB) to stay inside 8 GB, and try sherpa-onnx first because it needs no account. Run a synthetic two-voice test, then one real meeting. Measure time per hour, read the transcript and check the speaker labels. Add pyannote only if sherpa-onnx's labels are poor. Timings on the M1 are a worst case, since the new Mac will be faster. If accuracy on real room audio is poor, stop and reconsider before building. The build itself can run against the current Mac and move to the new one later: the same setup steps, plus the Keychain token.
1. **Recording:** consent panel, recorder, tap chips, part upload, stop, recording state on the meeting record, Transcript card states 1, 2 and 5.
2. **Worker:** routes, token, Mac script, launchd job, tap naming, the AI clean-up (Claude job plus local path), the Private switch, transcript storage, audio deletion, Transcript card states 3 and 4 with Speakers, Lines, Find and fixes, plus the glossary editor.
3. **Clare:** transcript fed to Summarise and Minutes.

## Tests

- **Unit:** the tap vote (late taps, ties, too few votes, merges); joining words to speakers; grouping lines; route validation (consent required, part size, token scope); deletion order (audio is never deleted before the transcript is stored, and never on failure).
- **Worker end to end** on the synthetic two-voice file: the transcript comes back with both invented names from taps, and the audio is gone from Blobs.
- **Browser:** record for 2 minutes on desktop and at 390px, tap chips, stop, check the part count; check Safari and iPhone with `audio/mp4`; check wake lock on a phone.

## Accuracy to expect

- **Words:** about 95% right with the device close to the speakers, and 85–92% in a typical room with crosstalk. Names and jargon are the weak spot, which the glossary helps with.
- **Speakers:** long turns come out right. Short interjections and overlapping speech get some wrong labels; the single-line fix covers them.
- **Use:** good for minutes, decisions and finding what was said. Check wording before quoting anyone, since the audio is gone.

## Phase 0 results (18 November, M1, 8 GB)

Installed to `~/Tools/meeting-transcriber` (about 740 MB): Homebrew `ffmpeg` and `whisper-cpp` 1.9.5, `ggml-large-v3-turbo-q5_0.bin`, and sherpa-onnx 2.0.1 in a uv Python 3.12 environment with the models from its GitHub releases. No account was needed. The spike scripts are `bin/transcribe.py`, `bin/diar_test.py` and `bin/make_fake_meeting.py`.

The tests used synthetic meetings made with macOS voices reading invented lines:

- **Words:** every word was right, including Year 11, HSC and Week 7.
- **Speed:** whisper ran at 1.4–2.1× real time and speakers at about 2–3× real time, so an hour of audio takes roughly 45–75 minutes on this Mac. The spread comes from memory pressure while other apps run. Fine overnight, and the new Mac will be much faster.
- **Speakers, two near-identical Apple voices (Karen and Samantha):** merged, about 65% correct whatever the model. This is the known weakness: very similar voices.
- **Speakers, distinct voices (Australian, Irish and British):** 92% correct with titanet small and automatic count. The 3D-Speaker CAM++ and WeSpeaker ResNet34 models did worse (51–66%) and ResNet34 was three times slower.
- **Tap naming:** after the window fix, three taps each named all three voices correctly. A one-word "Yeah" stayed unnamed, as designed.
- **Weak spot:** turn boundaries drift by a few words. The start of one person's sentence can land on the previous speaker's line. The single-line fix covers this, and real voices should do better than synthetic ones.

**Real recording (21 minutes, two people, one device in a small room):**

- **Words:** good. One technical term was misspelt. Passing a vocabulary prompt made whisper skip most of the first 25 seconds, so the glossary should not go through `--prompt`. Fix spellings in the AI clean-up instead.
- **Speed:** 4.2× real time for words and 5.5× for speakers when the Mac was quiet, but only 1.2× under load.
- **Speakers:** automatic count found 127 voices. Fixing the count at two gave a sensible 10/10-minute split, but quick exchanges still landed on one line, and the doctor's tap was credited to the other voice.
- **AI clean-up:** turn-taking read correctly in the parts checked. Tuning on the same 21 minutes:
  - Opus 5.5, effort medium, a label for every sentence: US$0.54. Correct.
  - Sonnet 5.5, effort low, changes only: US$0.09. Swapped the two speakers for a whole passage. Rejected.
  - **Opus 5.5, effort low, changes only, whole sentences: US$0.14. Correct in the parts checked. Chosen.** That's about US$0.40, or roughly A$0.60, per hour of meeting.
  - Sentences must be whole (split at end punctuation or a pause, not at voice changes). Half-sentences made both models worse.
- **Conclusion:** voice matching can't carry a fast two-person conversation on its own, which led to the AI clean-up step. For speaker count, use the number of attendees plus one (Me), not automatic.

## Cost

Transcription and voice matching have no per-hour fees. They cost the Mac's processing time, and the audio sits in Blobs only until its transcript is saved. The AI clean-up costs about A$0.60 per hour of meeting on Claude, and nothing for private meetings run on the local model. Phase 3 adds the normal Clare cost for summarising a longer text.

## Not in this build

- Live transcription during the meeting.
- Events.
- Keeping audio for playback.
- Recognising voices across meetings. Each meeting is named from its own taps.
- A paid-API fallback.

## Addendum, 19 November: write-up, picks, profiles and failsafes

Approved from the mockup `docs/mockups/meeting-recording.html`. Where this conflicts with the sections above, this wins. The build contract is `docs/superpowers/plans/2026-11-19-meeting-recording-build.md`.

### The transcript is not the main view

The After card is **From the recording**. In order:

1. **Overview.** Three to five sentences on the whole meeting or event. It feeds ✦ Summary and the Minutes draft.
2. **How it went.** A thin bar for the whole meeting and topic cards (time, length, one line, who led) that scroll sideways. It never grows taller than one card row.
3. **Your notes, built out.** Adam's own note lines stay as written. Under each, the recording adds short lines: what was decided, what was said for and against, who will do what, each with who said it and a time. ✓ moves a line into the notes; ✕ drops it. **Not in your notes** lists what he didn't write down.
4. **Picked up.** *For you to do* (+ Task, with the due date heard), *Others said they'd do* (Track it, a they-owe promise on that person), and *Points of interest*: opportunities or things worth remembering, such as a program looking for people, a role or a strong idea (★ Keep, or + Task to follow up).
5. **Who said what.** A few points per person, with ★ on what's most worth remembering. Each attendee's points are saved to their profile under a **Said in meetings** tab, so months later the meeting, the point and a time to check the words are on the person.

The full transcript moves to a side drawer: voices and the *Who is this?* pickers, Find, and *Change who said this*. Any time shown on the card opens the drawer at that line.

During recording, two extra buttons sit under the name chips: **That's a to-do** and **Remember this**. A tap marks the moment so the write-up looks hardest there.

The write-up runs after the speaker check, on Claude Opus 5.5 at low effort, from the transcript, Adam's notes and the flags. It costs about A$0.30 per hour of meeting on top of the A$0.60 speaker check. Private meetings run both on the Mac's local model or skip the write-up if no local model is set up.

### Failsafes

- **Every minute is saved on the device first**, in the browser's own storage, then uploaded. The strip shows *Saved on this device* and *In Life Hub* separately. A failed upload keeps retrying and never loses a part.
- **Recovery.** If the page closes mid-recording, opening the meeting again shows what is saved on the device and offers to upload the rest, save a copy, or keep recording.
- **Save a copy** of the audio is available from the device at any time, and from Life Hub until the audio is deleted.
- **Device copies** are cleared only once Life Hub has the transcript and has deleted its own audio.
- **Mic check before recording.** The consent panel shows a live level meter and a mic picker.
- **Silent mic alarm.** A live meter in the strip. After 15 seconds of near silence while recording, a red banner says so, the phone buzzes where it can, and a mic picker is offered.

### Events

Events with attendees get the same recorder and card. Speakers are the attendees; a **Someone in the room** chip covers questions from the audience.
