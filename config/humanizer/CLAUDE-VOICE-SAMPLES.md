# Voice sample authoring

Read and write personalised voice samples only in the private repository `adamrussell91-hash/life-hub-data`, branch `main`, at `config/humanizer/voices/{slug}.md`. Record provenance in the private `config/humanizer/voices/SOURCES.md`.

Use authenticated GitHub access. Read the current private file and preserve its SHA before updates. Never copy samples, private source passages or personal details into public code, tests, documentation, PR bodies or screenshots.

The chat server loads the selected sample through `loadPrivatePersonalityWritingSample` using the existing private data client. It passes the sample explicitly to `buildSystemPrompt`. Samples are optional. An unavailable private sample omits the sample block and retains the normal personality and shared Humanizer guidance. No public filesystem fallback is permitted.

Use synthetic text when testing sample placement. Verify each personality retains its identity and receives the shared Humanizer layer exactly once. Run the mandatory pre PR gate before submitting runtime changes.
