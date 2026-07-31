# Task 4 report: canonical Life Hub event parsing and domain validation

## Implementation

Added the browser-compatible event trust boundary requested by the task brief:

- `parseCanonicalPath(path)` accepts only the canonical Life Hub domain/subdomain layout, verifies that the path date is a real calendar date, and checks that its year/month directories agree with the filename date.
- `parseEventDocument(text, path, loadYaml)` uses the injected YAML loader, splits frontmatter/body, preserves canonical temporal strings when `js-yaml` would otherwise coerce them to `Date`, marks incomplete historical common metadata as `legacy`, validates the record, and rejects record/path date or domain disagreement.
- Legacy parsing does not add `schema_version`, `id`, timestamps, `time`, or `source`; it returns only values present in the historical document.
- `validateRecord(record, options)` validates common metadata and all ten approved record types: `meal`, `workout`, `diary`, `weight`, `composition`, `measurements`, `sleep`, `heart`, `skincare`, and `fragrance`.
- Common validation covers schema version, non-empty IDs/sources, semantic calendar dates, 24-hour times, and ISO timestamps carrying the offset actually in effect in `Australia/Sydney`. `Z` timestamps and incorrect seasonal offsets are rejected.
- Domain validation covers finite/non-negative numbers, the 0–10 bounds, meal/mood/energy/day-type/status/routine enumerations, nullable optional observations, arrays and booleans, unknown-type rejection, and recursively validated workout exercises/sets with finite non-negative reps and weights.
- Canonical type-to-domain matching prevents, for example, a workout record from being accepted below `data/nutrition/`.
- Added the section 15.4 full breakfast fixture with the brief's common metadata and the corresponding negative-calorie fixture.

The Notion skill was used read-only to retrieve the authoritative section 5 and section 15.4 schemas referenced by the local brief. It determined the complete fixture nutrient fields and the exact enum vocabularies; no Notion content was modified.

## RED

After creating `tests/unit/records.test.js` and before either production module existed, ran:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/unit/records.test.js
```

Observed expected failure:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../js/core/records.js'
code: 'ERR_MODULE_NOT_FOUND'
✖ tests/unit/records.test.js
tests 1; pass 0; fail 1
```

This was the expected RED state: the test imported the not-yet-created canonical parser module.

## GREEN

Focused command after the minimal parser/validator implementation:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/unit/records.test.js
```

Focused result:

```text
tests 10; pass 10; fail 0
```

The ten passing behaviors cover canonical parsing/body preservation, legacy metadata, invalid nutrition/path disagreement, semantic canonical paths, type/domain matching, common metadata, all ten domain validators, nullable observations, enum and unknown-type rejection, non-finite/negative values, and nested workout validation.

Fixture boundary verification:

```text
fixtures verified: valid meal parsed; negative meal rejected
```

Fresh full-suite command, run once after focused GREEN and fixture verification:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
```

Full result:

```text
tests 15; pass 15; fail 0
```

## Files

- `js/core/records.js`
- `js/core/validate.js`
- `tests/unit/records.test.js`
- `tests/fixtures/valid/meal.md`
- `tests/fixtures/invalid/negative-meal.md`
- `.superpowers/sdd/2026-07-31-life-hub-foundation/task-4-report.md`

## Self-review

- The two core modules contain no Node imports and remain browser-compatible ESM.
- `js-yaml` remains injected; production code has no YAML dependency.
- Semantic date checks cover leap years and reject normalised impossible dates such as `2026-02-30` even when the injected loader returns a `Date` object.
- Record parsing creates a shallow copy only when restoring input temporal scalars; it does not mutate the loader's result or synthesize legacy fields.
- Every named domain has a validator, and every numeric path uses `Number.isFinite` before range checks.
- Nullable observations remain `null` and are never converted to zero. Numeric zero is accepted where it is a real non-negative observation.
- Workout arrays are structurally traversed; malformed exercises, missing/non-array sets, non-object sets, and invalid reps/weights all produce errors.
- Test expectations use literal, hand-checked values and exercise the real parser and validator. No mocks are used.
- The final suite was clean with no warnings or failures.

## Concerns

- The specification intentionally permits historical records with incomplete common metadata by marking them `legacy`; without a separate migration provenance flag, missing metadata itself is the only available legacy signal.
- Domain observation fields other than the explicitly structural fields are nullable/optional to preserve sparse historical data. If a future write API requires a non-null primary observation for newly created weight, composition, sleep, or heart events, that stricter write-payload rule should be applied before this historical-compatible record boundary.
