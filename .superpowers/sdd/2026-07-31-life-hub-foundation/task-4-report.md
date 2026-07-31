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

## Fix Round 1

### Changes

- Tightened legacy provenance in `js/core/records.js`: a record is legacy only when the `schema_version` property is absent. A record that declares `schema_version`—including `schema_version: 1` with another common field missing—uses strict common-field validation and cannot bypass it by being reclassified as legacy. Schema-less historical records remain accepted without adding any metadata or observations.
- Added browser-compatible `validateUniqueIds(eventsOrRecords) -> string[]` in `js/core/validate.js`. It accepts raw records or parsed event wrappers, ignores missing/empty IDs (which record validation handles separately), counts every non-empty string ID, sorts duplicate IDs by code-point order, and emits one deterministic error per duplicated ID with its occurrence count.
- There is no existing recursive fixture/corpus boundary in Tasks 1–4. Task 8's planned recursive fixture validator is therefore documented as the first production consumer: after parsing the corpus, it must append `validateUniqueIds(events)` errors before reporting fixture validity.

### Regression tests

Updated `tests/unit/records.test.js` with:

- `rejects schema-versioned records missing common metadata instead of treating them as legacy`
- `reports every duplicate non-empty ID deterministically across records and parsed events`

The existing `marks missing historical common metadata as legacy without inventing values` test remains the regression guard for genuine schema-less history.

### RED evidence

Provenance regression command:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/unit/records.test.js
```

Observed expected failure before changing production code:

```text
✖ rejects schema-versioned records missing common metadata instead of treating them as legacy
AssertionError [ERR_ASSERTION]: Missing expected exception.
tests 11; pass 10; fail 1
```

The parser returned successfully because missing `id` incorrectly made the schema-v1 event legacy.

Duplicate-ID regression command after adding the second test and before adding the API:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/unit/records.test.js
```

Observed expected failure:

```text
✖ reports every duplicate non-empty ID deterministically across records and parsed events
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected
+ undefined
- [
-   'duplicate id "alpha" appears 2 times',
-   'duplicate id "zeta" appears 3 times'
- ]
tests 12; pass 11; fail 1
```

The wished-for collection API was absent, so the optional lookup returned `undefined` rather than deterministic duplicate errors.

### GREEN evidence

Focused command after both fixes:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/unit/records.test.js
```

Exact summary:

```text
tests 12; pass 12; fail 0
```

Full-suite command, run once after focused GREEN:

```sh
/Users/adamrussell/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
```

Exact summary:

```text
tests 17; pass 17; fail 0
```

### Fix-round self-review and concerns

- `Object.hasOwn(record, 'schema_version')` distinguishes truly absent historical provenance from a declared-but-null/invalid schema field; the latter is strict and rejected.
- Duplicate ordering uses an explicit lexical comparator rather than locale-dependent sorting.
- The collection validator contains no Node imports and does not mutate its input.
- Global uniqueness is now enforceable through a tested public API but is not automatic during single-document parsing. Task 8 must invoke it at the recursive corpus boundary as documented above.
