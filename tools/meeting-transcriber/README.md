# Meeting transcriber (Mac worker)

Turns meeting recordings from Life Hub into transcripts on this Mac. No audio goes to a speech company. Every five minutes a launchd job asks Life Hub for work, downloads the audio, makes the transcript, sends it back and then has Life Hub delete the audio. Design: `docs/superpowers/specs/2026-11-18-meeting-recording-design.md`.

## Setup (once)

1. Install the tools.
   ```
   brew install ffmpeg whisper-cpp node
   ```
   Node 20 or newer. The worker has no npm dependencies.
2. Put the models in `~/Tools/meeting-transcriber/models/` (the default paths):
   - `ggml-large-v3-turbo-q5_0.bin` (whisper.cpp, about 550 MB)
   - `nemo_en_titanet_small.onnx` and the `sherpa-onnx-pyannote-segmentation-3-0/` folder (from the sherpa-onnx releases on GitHub, no account needed)
3. Make the speaker environment. It needs Python 3.12 with `sherpa-onnx` and `soundfile`.
   ```
   cd ~/Tools/meeting-transcriber
   uv venv --python 3.12 .venv
   uv pip install --python .venv/bin/python sherpa-onnx soundfile numpy
   ```
4. Make a secret and put it in two places. Use a long random string.
   - Netlify: add the environment variable `MEETING_TRANSCRIBER_TOKEN` to the Life Hub site and redeploy.
   - Keychain on this Mac (the token is never written to a file):
     ```
     security add-generic-password -a "$USER" -s life-hub-meeting-transcriber -w
     ```
     It asks for the secret. Check with `security find-generic-password -s life-hub-meeting-transcriber -w`.
5. Optional config at `~/.config/meeting-transcriber/config.json`. Every key has a default.
   ```json
   {
     "api_base": "https://life-hub.adam-russell.com",
     "whisper_bin": "/opt/homebrew/bin/whisper-cli",
     "whisper_model": "~/Tools/meeting-transcriber/models/ggml-large-v3-turbo-q5_0.bin",
     "ffmpeg_bin": "/opt/homebrew/bin/ffmpeg",
     "diarize_python": "~/Tools/meeting-transcriber/.venv/bin/python",
     "diarize_models": "~/Tools/meeting-transcriber/models",
     "local_llm_url": null
   }
   ```
   `api_base` is the site address; the worker adds `/api/meeting-recordings`. Set `local_llm_url` (for example `http://127.0.0.1:8080`) to a llama.cpp server if private meetings should get their speaker check and write-up on this Mac. Leave it `null` and private meetings get a transcript with no write-up.
6. Install the launchd job. Replace the three placeholders in the template.
   ```
   REPO=~/Projects/life-hub
   sed -e "s#__NODE_PATH__#$(which node)#" -e "s#__REPO_PATH__#$REPO#g" -e "s#__HOME__#$HOME#g" \
     "$REPO/tools/meeting-transcriber/com.adamrussell.meeting-transcriber.plist" \
     > ~/Library/LaunchAgents/com.adamrussell.meeting-transcriber.plist
   launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.adamrussell.meeting-transcriber.plist
   ```
   It runs at login and every 300 seconds. Logs: `~/Library/Logs/meeting-transcriber.log`. They hold ids, sizes and timings, never transcript text.

To stop it: `launchctl bootout "gui/$(id -u)/com.adamrussell.meeting-transcriber"`.

## Check it works

1. Make a synthetic test meeting (invented people, macOS voices) outside the repo:
   ```
   tools/meeting-transcriber/make-test-meeting.sh ~/Desktop/mt-test
   ```
2. Upload that file as a recording in a test meeting, or run the pieces by hand against `~/Desktop/mt-test/test-meeting.wav` and `taps.json`. An hour of audio takes roughly 45 to 75 minutes on an M1 with 8 GB.
3. Delete `~/Desktop/mt-test` afterwards.

## What it does each run

1. Sends a heartbeat (Life Hub shows "Mac last checked in").
2. Deletes audio for any recording whose transcript is already saved.
3. Claims the oldest waiting recording (a two hour lease), downloads the parts and joins them.
4. Converts to 16 kHz mono WAV in a private temporary folder (mode 700).
5. Words with whisper.cpp (word timestamps, no `--prompt`), speakers with sherpa-onnx (attendees plus one for you, plus one if the room chip is on).
6. Joins words to speakers, groups lines, names voices from your taps.
7. Sends the transcript. If the audio was marked private and a local model is set, the speaker check and write-up run here first.
8. Asks Life Hub to delete the audio, then removes the temporary folder.

If anything fails the worker reports a plain-words reason, keeps the audio and removes its temporary files. A lock file at `~/.config/meeting-transcriber/worker.lock` stops two runs overlapping.
