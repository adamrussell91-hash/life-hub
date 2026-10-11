# Grove production release plan

> Use superpowers:subagent-driven-development for the transfer helper and independent review. User explicitly authorised going live on11October2026; no renewed permission pause.

**Goal:** Publish verified annual Grove,20animated animals and25tree variants through existing GitHub Pages deployment.
**Architecture:** Existing GROVE_ASSET_KEY remains only in GitHub Actions. Local private ready archive is AES256GCM sealed with a temporary distinct transfer key, added via stdin as GROVE_RELEASE_INPUT_KEY. A conditional Pages step authenticates existing deployment ciphertext, validates/installs the incoming20asset catalogue and reseals it using the existing deployment key; only resealed ciphertext is uploaded as an Actions artifact. After successful deploy, retrieve that artifact, replace durable animals.enc, delete temporary input ciphertext, rerun gate, merge cleanup and delete temporary secret. Public web preparation excludes deployment ciphertext. No plaintext purchased models enter Git or artifact output.
**Tech Stack:** Existing Node22 crypto/tar/integrity/install helpers, GitHub Actions and gh CLI. No dependency additions.
**Spec:** docs/superpowers/specs/2026-10-11-grove-final-expansion-design.md; user11October2026instruction to get live.

## Task 1 — Encrypted release transfer
- [x] RED tests for authenticated transfer/keycontinuity/tampering/failing closed, exactly20ready assets, archive/pathvalidation inherited, publication exclusions.
- [x] Implement reusable helper script/library and conditional Pages step before ordinary deployment install. Missing input skips step; present input requires both valid keys. Validate existing deployment key before mutation, validate strict20incoming before resealing. Upload only final deployment ciphertext as grove-deployment-ciphertext-${{ github.run_attempt }} artifact. Logs never expose secret or clear archive.
- [x] Focused tests green, commit, independent review clean. Parent generates ciphertext/key locally only after helper is reviewed.

## Task 2 — Release and live verification
- [ ] Prepare encrypted transfer under deployment/release-input.enc; keep temporary key in ignored local scratch at0600, set GitHub secret through stdin; no value in tool output.
- [ ] Unchanged fullpre-PR gate, production build, release branch push/PR/attach, merge with expectedhead and wait Pages success.
- [ ] Fetch resealedciphertext artifact; verify deployed20manifest/models hashes and Grove/Home interactions.
- [ ] Replace durable ciphertext, remove transferinput, repeat fullgate; merge cleanup and wait finalPages success. Delete only newlycreated temporarysecret after durable deploy.
- [ ] Save release evidence and final recovery outputs; keep explicit physicalphone acceptance open.
