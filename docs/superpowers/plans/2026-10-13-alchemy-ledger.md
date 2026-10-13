# Alchemy execution ledger

Approved design: 13 October 2026. Inline execution.
Pre-flight: Task 1 budget → Task 2 API → Task 3 controller → Task 4 integrations: interfaces match.
Ruling: use installation-wide operator budget because current signed sessions have no stable account identity; session IDs would let multiple devices multiply passive allowances.

Task 1: complete — seven budget tests pass including atomic reservation and persistence-before-release.
Task 2: complete — ten endpoint tests pass; authentication, deleted context/sources, caching, bounded payloads, hanging provider/store and Retry-After.
Ruling: default total deadline is 8 seconds because netlify.toml records live 10-second effective limits; a verified 26-second deployment may configure 20 seconds. The approved design explicitly permits shortening for actual deployment limits.
Ruling: isolated clone reused unchanged binary assets with hard links after disk exhaustion; edited source files remain independent. No user content was deleted.
Ruling: Teaching's existing typecheck errors are outside this feature; compare to baseline and report them rather than changing unrelated media/graph components.

Task 3/4: implemented and focused UI/scheduler tests pass, including nested edits, media refs, changed context, acceptance cancellation, batching and Sydney eligibility.
Final review: six material findings addressed with RED→GREEN regression evidence: oversized input permanence; document refs; disposed acceptance; delayed duplicate cache miss; invalid schema; meaningful contextual revisions. Legacy syllabus_outcomes fallback added.
Browser verification: Safari local disposable fixtures: lesson refinement + acceptance; unit acceptance + Undo; passive badge after quiet time; 390px iframe refinement + acceptance with all docked actions visible after text entry. No production records changed.
Ruling: use native Safari fixture page because the in-app browser was unavailable and sign-in approval stalled; local login was not required for the review UI check.
Ruling: rerun mandatory gate with two Vitest workers to reduce memory pressure; no checks skipped. Root tests, Tasks suite and Professional typecheck passed.
