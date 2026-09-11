# Chadwick Voice Lab

Authorized scope: an isolated, local casting tool. No production chat or agent changes, commits, pushes, microphone access, cloud inference, or deployment. Root package.json gets only a launcher script. Everything else lives here.

Architecture: Python 3.13, pinned MLX-Audio 0.5.1, a standard-library localhost HTTP server and plain HTML/CSS/JavaScript. One background generation worker owns MLX and its random state; candidates run sequentially on Adam's M1 / 8 GB Mac. Default model: mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit, pinned revision 5c390979e4b93af5f2932f90742ca99c7dd04687. MLX's generate_voice_design(text, instruct, language, temperature, max_tokens, top_k, top_p, repetition_penalty) is verified in the v0.5.1 source. Seeds use mx.random.seed, not an invented VoiceDesign argument. Reproducibility is best-effort for the same runtime/device.

The fixed conversation audition and editable presets follow Adam's direct character and audio specifications in docs/chadwick-persona.md: an early-twenties Californian gym bro. A second fixed numbers/exercises script tests pronunciation. All presets preserve that identity, varying hype and flustered delivery. The tool never reads or edits live persona files at runtime.

Each candidate has an immutable ID, a PCM WAV and JSON metadata: description, exact script, seed, sampling settings, model revision, runtime versions, creation time, load time, generation time, audio duration, and token-limit warning. Save only complete WAVs, atomically. Failed jobs remain visible; completed files survive restarts. No overwrite or delete UI. Local output/cache directories and weights/audio patterns are gitignored.

The launcher uses the existing uv or installs a task-local uv if absent, keeps Python/environment/download caches inside the lab, checks Apple Silicon/Metal/disk capacity, syncs a lockfile, then opens a loopback-only page. Loading/downloading happens when Generate is clicked and reports status. Insufficient space blocks download with an actionable message. Requests are size-bounded, reject unknown inputs, validate origin/Host, and never expose arbitrary files. Only saved WAV IDs can be retrieved.

Verification: test input boundaries, batch seed handling, durable candidates, truncated audio warnings, job concurrency/failure, localhost route restrictions and audio range playback without loading the model. Verify installed VoiceDesign signature. Exercise the browser. Run two real full-script candidates when disk space permits. Record unavailable checks honestly.
