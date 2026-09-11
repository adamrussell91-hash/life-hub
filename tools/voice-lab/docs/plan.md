# Chadwick Voice Lab Implementation Plan

> Execute using test-first development and independent UI implementation, then review the complete change. Do not commit or push.

**Goal:** one local command opens a casting page and generates playable Chadwick candidates.
**Architecture:** isolated Python HTTP server, one MLX worker, local WAV/JSON storage, plain web UI.
**Tech stack:** Python 3.13, uv lock, mlx-audio 0.5.1, HTML/CSS/JavaScript.
**Spec:** design.md.

## Constraints

- Use only tools/voice-lab plus root package.json launcher.
- Do not alter production behaviour or the user's existing dirty checkout.
- No commits/pushes. 4-bit 1.7B VoiceDesign; fixed model revision.
- All downloaded/runtime/generated files stay gitignored.

## Tasks

- [x] Core: add tests first for Request.parse validation (description, script_id, count, seed, temperature, top_p, top_k, repetition_penalty, max_tokens), immutable per-candidate saves, sequential job handling and recovery from model errors. Run unittest before and after implementing lab.py.
- [x] UI: implement static/index.html, app.js, style.css. GET /api/config returns scripts [{id,title,text}], presets [{id,title,description}], defaults, model and seed_note. GET /api/state returns job {status,message,completed,total,started_at,error} and candidates [{id,number,created_at,description,script_id,script,seed,settings,generation_seconds,load_seconds,duration_seconds,warning,wav_url}]. POST /api/generate takes Request fields and returns 202 with state or JSON error. POST /api/cancel stops between candidates. Include labels, native audio, download links, settings disclosure, durable results, visible pending/failure state and no remote assets.
- [x] Runtime: add pinned pyproject/uv.lock, launch.sh and backend.py. Sync isolated environment; inspect actual imports/signature; call generate_voice_design using supported arguments and mx.random.seed. Save full audio as PCM WAV and detect max_tokens exhaustion.
- [x] HTTP: test endpoints, malformed input, Host/origin checks, concurrent submit rejection, ID-only WAV retrieval and byte ranges; implement server.py, then exercise through browser.
- [x] Finish: add README with exact launch command, hardware/disk requirements, controls, cache locations, limitations, verification evidence and sources. Run scoped tests, syntax checks and diff/ignore audit; generate/listen to two real auditions if storage permits. Supply a launcher in task outputs for easy access.

## Inspection evidence

- Fresh isolated checkout: GitHub main 3b8417b, local branch codex/chadwick-voice-lab.
- Adam's ~/Projects/life-hub is older (5246bf3) with existing chat/UI edits; left untouched.
- Apple M1, arm64, macOS 26.5.2, 8 GB RAM, uv 0.12.1 and native Python 3.13.14 available.
- Initial free disk 2.2 GiB; model card lists ~2.31 GB, so real install/generation awaits sufficient disk capacity.
- Sources: https://pypi.org/project/mlx-audio/0.5.1/ ; https://github.com/Blaizzy/mlx-audio/blob/v0.5.1/mlx_audio/tts/models/qwen3_tts/qwen3_tts.py ; https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit
