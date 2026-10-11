# Task 1 — encrypted release transfer

Implemented reusable `transferGroveRelease(repository, {deploymentKey,inputKey})`, CLI, conditional Pages transfer before ordinary installation, and ciphertext-only `grove-deployment-ciphertext` artifact with seven-day retention.

Contract:
- Missing release-input.enc returns skipped without keys. Present input requires both 32-byte hexadecimal keys.
- Original animals.enc must authenticate with the deployment key before incoming archive processing or installation.
- Incoming ciphertext authenticates with its transfer key; existing authenticated installer validates archive paths/types, complete hash inventory, exactly twenty required ready models, declared model hashes and motion evidence before replacing project-only.
- Shared installer now accepts optional `{requireModern:true}`. Default false preserves pinned legacy eight compatibility. Strict release mode rejects absent modern inventory before migration or target mutation.
- Exact verified incoming archive is resealed with the existing deployment key. Ciphertext replacement uses a temporary sibling and rename. Clear archive extraction remains within the existing private OS temporary directory and is cleaned in finally; target must be Git-ignored.
- CLI logs only fixed summaries, never keys or archive content. Workflow uploads only animals.enc; existing publication-exclusion checks remain green.

Verification:
- RED: `node --test tests/unit/grove-release-transfer.test.js`, against inert feature stub: all 14 tests failed with expected result/rejection assertions. See task-1-red.log. An earlier missing-module probe was replaced with this proper assertion-based RED run.
- GREEN: focused transfer suite 14/14, including clean installation/key continuity, missing input, missing/wrong keys, tampered input/original, 8/19/21 counts, archive path/symlink and legacy rejection. Self-contained synthetic fixtures contain no purchased models and exercise the existing integrity contract, not a GLB rendering claim.
- Combined focused suite: `GROVE_LEGACY_TEST_BUNDLE=<owner-private-legacy-fixture> node --test tests/unit/grove-release-transfer.test.js tests/unit/grove-authenticated-deployment.test.js tests/unit/grove-private-bundle.test.js tests/unit/grove-recovery-publication.test.js`: 29 passed, 0 failed, 0 skipped. Includes real modern20 installation, exact pinned legacy8 compatibility, strict-mode pre-mutation legacy rejection and publication exclusions. See task-1-green.log.
- Full gate/build/GPU deliberately not run per delegated task instruction; parent owns those before PR/deployment. No secret/auth access, network, upload, or publish performed.

Operational limit: installation and ciphertext replacement are separate filesystem transactions; a ciphertext write failure fails the job and prevents artifact publication, but can leave the verified incoming private installation on the disposable Actions runner. Retry starts from checkout and original ciphertext. Neither malformed nor unauthenticated input mutates the installation.
