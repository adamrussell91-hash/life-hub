# Chadwick Voice Lab

An isolated local casting studio for Life Hub. Describe a voice, generate numbered auditions, listen in the browser and download the WAVs. It never calls Life Hub chat, changes agent behaviour, records your microphone or uses cloud inference.

## Start

From this checkout's Life Hub root:

```sh
npm run voice-lab
```

Or, without Node/npm, run `bash tools/voice-lab/launch.sh` from that same directory. The launcher prepares its own Python environment and opens **http://127.0.0.1:8765**. Keep its terminal open; Control-C stops the server. Running the command again opens the existing lab.

First use needs an internet connection for dependencies and model downloads. Casting uses the approximately 2.3 GB VoiceDesign model. Voice Lock uses a separate 1.71 GB Base model, with shared files deduplicated in the local Hugging Face cache. Each model downloads only when its Generate button is first used. Allow at least 5 GB free before a model download and keep 1 GB free for normal operation. This prototype targets native Apple Silicon macOS; do not launch through Rosetta. Tested machine: M1 MacBook Pro with 8 GB unified memory, macOS 26.5.2. Generation speed is measured from real runs on that Mac.

## Cast Chadwick

1. Choose a starting point and edit the voice description. **Chadwick Flexington** follows Adam's specification: early twenties, Californian gym frat, bright baritone, fast and impulsive, warm and slightly raspy, with explosive hype and flustered asides. **Maximum hype** and **More flustered** vary that same character's delivery. The default acoustic prompt is in `chadwick-voice.txt`; Adam's full specification is preserved in `docs/chadwick-persona.md`. These are audition presets only.
2. Keep **Conversation audition** selected to compare voices reading identical text. **Numbers and exercise names** provides a second fixed pronunciation test. Text is deliberately fixed within each audition.
3. Choose 1–8 candidates. Leave seed blank for a random starting seed, or set one to revisit a result. A batch advances the seed for each candidate, wrapping after 4294967295.
4. Click **Generate candidates**. Candidates run one at a time to limit memory use. You can play completed candidates while the next one generates. **Cancel after current** lets the current candidate (or model download) finish, then stops the batch.
5. Play and compare the candidates, expand their details or download the WAVs. Results survive refreshes and server restarts. Each candidate retains its description, exact text, seed, sampling settings, model revision, runtime versions and timing.

Sampling settings are supported by MLX-Audio's actual `generate_voice_design` API: temperature, top P, top K, repetition penalty and max tokens. Defaults match the model's sampling defaults, with a 1536-token safety ceiling for these short scripts. If the model reaches that ceiling, the candidate is visibly marked as potentially cut off. Increase max tokens or try a new seed if necessary.

The seed is applied with `mlx.core.random.seed` immediately before inference. Repeatability is best effort on the same hardware/model/runtime; a seed does not guarantee the same voice across different scripts or software versions. Pitch and pace are prompt targets, not exact synthesis controls. Accent, age and personality are model interpretations that Adam judges by listening.

## Lock Candidate 6

The **Voice Lock** panel uses approved Candidate 6 as the source voice for Qwen3-TTS Base voice cloning. It extracts a clean 9.944-second opening passage and supplies the exact matching transcript; the full approved WAV remains untouched and is available beside the controls for comparison. The shorter excerpt follows MLX-Audio's recommended 5–15 second reference range.

1. Leave all six validation lines selected for a full identity test: a reaction, ordinary coaching, numbers and exercise terms, a joint-safety cue, a quiet flustered aside and a longer passage.
2. Click **Generate validation pack**. The first run downloads and loads the smaller Base model. Casting and Voice Lock jobs cannot overlap, and switching stages unloads the other model before loading the next one to fit the 8 GB Mac.
3. Compare every new clip with Candidate 6. Each result shows generation time, WAV duration and render factor. A factor of `2.00× audio length` means two seconds of generation for each second of audio.
4. Voice Lock clips and their complete metadata persist in `voice-lock/`. They remain local and gitignored.

This validates whether the selected identity transfers to unseen text. The approved identity is also available to Life Hub's workout player; it does not change Chadwick's chat or agent prompts.

## Use Chadwick in Life Hub

Keep the local voice companion running while you use Life Hub:

```sh
npm run chadwick-voice
```

When a planned workout appears, Life Hub sends its existing Chadwick coaching cues to this loopback-only companion. The companion clones Candidate 6, prepares the complete cue playlist and stores content-addressed WAVs in `life-hub-cache/`. Repeated cues and future workouts reuse matching cached audio. The workout card shows play, pause, skip and mute controls; audio starts only when you press play.

The browser bridge accepts the deployed Life Hub origin and localhost development origins. Casting controls remain available only inside the local Voice Lab page. If the companion is closed, the workout continues normally and shows a retry action for voice.

**Timing:** generation seconds cover inference, audio conversion and completion of the model generator. Load seconds include first-use download and model loading, and are zero for later candidates with the model already loaded. Audio seconds are measured from the saved WAV's sample count. All outputs are mono PCM16 WAV at the model's reported sample rate (24 kHz for this model).

## Local files

Everything below is relative to `tools/voice-lab/`:

| Location | Contents |
| --- | --- |
| `outputs/<candidate-id>.wav` | Immutable audition audio |
| `outputs/<candidate-id>.json` | Matching settings, timing and identity record |
| `approved/chadwick-approved-seed-45.wav` | Adam's approved Chadwick reference, selected from Candidate 6 |
| `approved/chadwick-approved-seed-45.json` | Exact prompt, script, seed, settings, model revision and runtime for the approved reference |
| `voice-lock/<clip-id>.wav` | New Candidate 6 voice-clone validation audio |
| `voice-lock/<clip-id>.json` | Validation text, seed, settings, reference identity, timing and model revision |
| `life-hub-cache/<content-id>.wav` | Candidate 6 workout cue audio, reused by text and locked settings |
| `life-hub-cache/<content-id>.json` | Cue text, deterministic seed, voice identity, timing and model revision |
| `chadwick-profile.json` | Tracked manifest for Candidate 6 and the production clone settings |
| `.venv/` | Isolated Python packages |
| `.cache/huggingface/` | Model weights, tokenizer and downloads |
| `.cache/uv/` | Package download cache |
| `.runtime/` | Launcher lock, temporary files, optional private Python/uv installation |

These directories, plus audio and weight extensions, are gitignored. Only source, tests, docs, dependency declarations and `uv.lock` belong in Git. The output JSON is never published automatically. Preserve each WAV with its matching JSON if keeping a voice for later work.

## Approved voice

Adam selected **Candidate 6** as Chadwick on 6 September 2026. Its immutable candidate ID is `1ec4ccc7fdbb42da9fc1b8c772f15916`, seed `45`, using the default sampling settings and the deep six-foot-four Californian frat-bro direction. A protected local copy of its WAV and complete metadata lives in `approved/`. `chadwick-profile.json` locks the identity, checksum, reference window, clone model revision and production settings.

The server binds only to `127.0.0.1`, rejects foreign browser origins/hosts, and serves only its own page and valid candidate WAV IDs. It does not expose the model cache, source tree or arbitrary filesystem paths. There is no account, API key or Hugging Face login requirement.

## Verified installation route

Checked on 6 September 2026 **before installation**:

- **MLX-Audio 0.5.1**, released on [PyPI](https://pypi.org/project/mlx-audio/0.5.1/). The isolated Python 3.13 environment and full dependency resolution are pinned in `uv.lock`.
- Native [MLX-Audio VoiceDesign implementation](https://github.com/Blaizzy/mlx-audio/blob/v0.5.1/mlx_audio/tts/models/qwen3_tts/qwen3_tts.py), specifically `Model.generate_voice_design`. This setup does not install or use `qwen-tts` or a PyTorch inference path.
- [MLX Community Qwen3-TTS 12Hz 1.7B VoiceDesign 4-bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit), pinned revision `5c390979e4b93af5f2932f90742ca99c7dd04687`. The 4-bit variant was selected for Adam's 8 GB Mac. Its speech tokenizer is included in the same snapshot.
- [MLX Community Qwen3-TTS 12Hz 0.6B Base 4-bit](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit), pinned revision `0d6bb6fe33f92d47a507e23b9148940e8366ab5b`. This is MLX-Audio's native `ref_audio` + `ref_text` voice-cloning route and is listed as a 1.71 GB model.
- Installed API signature checked directly; MLX 0.32.2 reported Metal available and completed a native array calculation.

The loader verifies the VoiceDesign method and model type again before inference. No model repository code is enabled with `trust_remote_code`.

## Development and checks

```sh
# From tools/voice-lab after the first launch:
.venv/bin/python -m unittest discover -s tests -v

# From the Life Hub root:
npm run voice-lab -- --no-open
npm run voice-lab -- --port 8766
```

Tests exercise real persistence, request validation, shared job exclusion, reference clipping, clone arguments, failure/cancellation, audio encoding and loopback HTTP/range serving for both stages. Only the expensive inference boundary is replaced for unit/HTTP tests. Real-model validation is recorded separately in `docs/verification.md`.

If the page cannot connect, restart the command and choose **Try loading again**; your form edits remain in that open page. Model errors appear beside the candidates and leave finished auditions intact. An unauthenticated Hugging Face download notice is normal. If the terminal is closed midway through generation, that unfinished candidate is not added to the saved list; existing candidates remain available.

For this task, work is in a fresh isolated checkout on local branch `codex/chadwick-voice-lab` based on `3b8417b`. Adam's existing `~/Projects/life-hub` checkout had uncommitted chat/UI changes and was left untouched. No commits or pushes were made.
