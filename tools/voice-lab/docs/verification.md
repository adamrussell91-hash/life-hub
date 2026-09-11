# Voice Lab verification — 6 September 2026

Machine: Apple M1 MacBook Pro, 8 GB unified memory, macOS 26.5.2. Native arm64 Python 3.13.14. MLX 0.32.2 reported Metal available. Model: `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit`, revision `5c390979e4b93af5f2932f90742ca99c7dd04687`, using MLX-Audio 0.5.1.

## Automated checks

- 17 core and audio-adapter tests passed: input boundaries, fixed scripts, seed batches, immutable WAV/JSON persistence, cancellation, failure recovery, shared job exclusion, exact reference clipping, Base-model clone arguments, PCM conversion and token-limit warnings.
- Five loopback HTTP tests passed outside the restricted task sandbox: origin and host restrictions, malformed and oversized request rejection, explicit asset allowlisting, WAV byte ranges and HEAD requests, Candidate 6 reference serving, Voice Lock generation/state and cloned-WAV serving.
- Python compilation, JavaScript syntax and shell syntax passed after the final revision.
- An independent read-only review found no significant backend, persistence, HTTP-route, concurrency or launcher defects. It checked the adapter against the installed MLX-Audio source.

## Real model and browser checks

The model downloaded into the lab-local ignored cache and loaded through Apple Metal. Four real candidates were generated and persisted. The final revised pair used Adam's deeper, faster and more stereotypically Californian frat-bro direction:

| Candidate | Seed | Generation | Audio | Format | Result |
| --- | ---: | ---: | ---: | --- | --- |
| 3 | 44 | 106.013 s | 47.36 s | mono PCM16, 24 kHz, 1,136,640 frames | Complete, no truncation warning |
| 4 | 45 | 81.910 s | 47.92 s | mono PCM16, 24 kHz, 1,150,080 frames | Complete, no truncation warning |

Both WAVs reached browser ready state 4 with the correct duration. Candidate 3 played, then starting Candidate 4 paused Candidate 3 and advanced Candidate 4, confirming exclusive native playback. The candidate metadata contains the correct model revision, runtime versions, script, seed, settings, timing and revised voice description.

The Hz and words-per-minute values are natural-language casting targets. The model does not expose deterministic controls for measured fundamental frequency or speaking rate, so Adam's listening judgment remains the acceptance test for the voice itself.

## Casting decision

Adam selected **Candidate 6** as Chadwick. Candidate 6 is a complete 54.0-second mono PCM16 WAV at 24 kHz, generated with seed 45 in 100.491 seconds. Its candidate ID is `1ec4ccc7fdbb42da9fc1b8c772f15916`. The WAV and exact metadata were copied to the ignored `approved/` directory under stable filenames for future voice-cloning work.

## Voice Lock validation

Verified the installed MLX-Audio 0.5.1 `generate()` Base-model path with `ref_audio` and exact `ref_text` before download. The cloning model is `mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit`, pinned revision `0d6bb6fe33f92d47a507e23b9148940e8366ab5b`. Hugging Face lists the snapshot at 1.71 GB. It downloaded into the ignored lab-local cache, loaded through Apple Metal and used a 9.944-second mono PCM16 excerpt from the untouched approved Candidate 6 WAV.

The full six-line pack completed and persisted with no truncation warnings:

| Validation line | Seed | Generation | Audio | Render factor | Tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Short reaction | 600 | 52.657 s | 4.96 s | 10.616× | 62 |
| Normal coaching | 601 | 77.239 s | 9.92 s | 7.786× | 124 |
| Numbers and exercise terms | 602 | 28.460 s | 10.00 s | 2.846× | 125 |
| Joint-safety cue | 603 | 26.852 s | 9.92 s | 2.707× | 124 |
| Quiet flustered aside | 604 | 20.723 s | 10.08 s | 2.056× | 126 |
| Longer coaching passage | 605 | 33.276 s | 18.64 s | 1.785× | 233 |

The first job's 712.385-second load time includes the one-time download plus model and Metal initialization. Peak MLX memory was 6.216 GB for the first five lines and 6.703 GB for the longer passage. Every file is mono PCM16 at 24 kHz, its frame count matches the recorded duration, and all six appeared as playable browser audio controls. The decreasing render factor reflects reusable reference/model caches warming during this first pack.

Adam listened to the complete validation pack and accepted all six clips on 6 September 2026. Candidate 6 is therefore approved as both the casting reference and the reusable Chadwick clone voice.

## Life Hub workout bridge — 11 September 2026

The locked Candidate 6 profile was connected to the existing planned-workout `coach_cues` without changing chat or agent behaviour. The loopback companion generated a real seven-cue workout request through the 0.6B Base clone model. All seven clips completed as mono PCM16 WAV at 24 kHz; one repeated rest cue reused the content-addressed cache. Unique cue generation times were 14.180, 15.567, 22.065, 46.030, 25.891 and 37.959 seconds. HTTP byte-range serving returned `206` with a valid RIFF/WAVE header, and the deployed Life Hub origin received the exact CORS allow-origin header.

The final browser pass used a current-dated local planned-workout fixture with three Candidate 6 cues. Life Hub reported `3 Chadwick cues ready · Candidate 6`; Play changed to Pause and showed cue 1 of 3, Pause stopped playback, resume restored it, Skip advanced to cue 2 of 3, and Mute disabled playback before returning cleanly to an unmuted ready state. The exact public command `npm run chadwick-voice` started the companion successfully on `127.0.0.1:8765`.

Final automated checks passed: 29 Voice Lab Python tests, 2,001 Life Hub unit tests, the production build across Life, Teaching, Knowledge and Tasks, JavaScript/Python/shell syntax checks, `git diff --check`, ignore checks for virtual environments/runtime/model/audio caches, and a tracked-file scan confirming no audio or model-weight files are included. The production build and full unit suite ran from an exact clean mirror of commit `3b8417b` plus these changes because unrelated files in the iCloud-backed checkout had been offloaded; the checked-out source files used by this feature were fully resident.
