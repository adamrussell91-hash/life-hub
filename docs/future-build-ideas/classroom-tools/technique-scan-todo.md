# Technique scan: to-do for ChatGPT

The technique scan is built and tested end to end, including the teacher review screen and the spinner. **One thing is left:** port the Periodic Table widget's **Passage Scanner** call into `requestTechniqueScan`. Until then the Technique scan button says "The technique scan is not connected yet." Idea and decisions: [../classroom-tools.md](../classroom-tools.md).

## What the scan is for

A teacher scans a text block. The scan finds which of the 310 Periodic Table techniques the passage uses. The teacher ticks the ones to keep. The classroom tools' **technique spinner** then spins only through the ticked techniques, never all 310. Students see nothing until the teacher has reviewed the list.

## Already built (do not rebuild)

| Piece | Where | What it does |
|---|---|---|
| Job, background run, poll | `POST /api/text-tools` with `tool: 'techniques'`, `netlify/functions/_shared/text-tools.mjs` | Same job, cache and poll as the Dictionary scan. Own model setting `TEXT_TOOLS_TECHNIQUES_MODEL` (default `gpt-4o`) and a 6,000 character limit |
| The one gap | `requestTechniqueScan` in `netlify/functions/_shared/technique-scan.mjs` | Throws "The technique scan is not connected yet." **This is the function to write** |
| Reply parser | `parseTechniqueResult` in the same file | Reads the widget's JSON shape (grouped, wrapped or the old flat shape, with or without code fences). Keeps only quotes that are really in the passage and hits at 20% confidence or above, highest first |
| Page side | `apps/teaching/src/blocks/technique-scan.ts` | Maps technique names to table ids and drops names the table does not have. Saves on `block.settings.technique_scan`. `approveTechniques` records the teacher's ticks. `spinnerTechniques` is the spinner's list. `confidenceTier` gives Likely, Possible or Worth considering |
| Client call | `scanTechniquesAsTeacher(html, table)` in `apps/teaching/src/blocks/text-tools-client.ts` | Starts the job, polls it, returns findings with table ids |
| Student filter | `studentTechniqueScan`, called from `filterBlocksForStudent` | Published lessons only carry the approved techniques and their quotes. The model's explanations and unticked hits stay with the teacher |
| Teacher review screen | "Technique scan" button in a text block's toolbar, `apps/teaching/src/blocks/rich-text-tools.ts` and `blocks/technique-review.ts` | Shows each quote with its techniques, confidence bar, tier and explanation. Likely finds start ticked. Save writes `settings.technique_scan`. A strip under the block lists what is approved, with Review and Clear, and warns when the text has changed since the scan |
| Spinner | Technique tool in the classroom toolbox, `apps/teaching/src/blocks/classroom-tools/tools.ts` | Picks a text block on the page with approved techniques and spins only through those |
| Tests | `tests/unit/technique-scan.test.js`, `apps/teaching/tests/unit/technique-scan.test.ts`, `apps/teaching/tests/unit/classroom-tools.test.ts` | Parser, job, endpoint, student filter, approval, spinner |

## To do

1. **Write `requestTechniqueScan`** in `netlify/functions/_shared/technique-scan.mjs`.
   - Take the prompt from the widget's `/* SCANNER */` section (`widgets` repo, `English/Tools/Widgets/Periodic-Table-of-Literary-Elements.html`). Keep its rules: use only names from the list, several techniques per quote is normal, an honest 0 to 100 confidence each, and an empty list is a fine answer.
   - The prompt needs all 310 technique names. The server cannot read the page's table, so generate a names module (for example `_shared/literary-technique-names.mjs`) from `apps/teaching/scripts/sync-literary-elements.mjs`, so it stays in step when the table is re-synced.
   - Call OpenAI **from the server only**. `completeWithProvider` in `_shared/html-app-providers.mjs` already calls OpenAI with `OPENAI_API_KEY`. Reuse it or follow it. Never call the widget's public proxy from the hub, and never send a key to the browser.
   - Use the `model` argument (it follows `TEXT_TOOLS_TECHNIQUES_MODEL`), about 1,400 max tokens, and the `signal` you are given.
   - Like the widget, if the reply parses but has no findings, ask once more before giving up.
   - Return the raw reply text. `parseTechniqueResult` does the rest.
   - Throw `TextToolError` with a plain message when the key is missing ("The technique scan is not configured (OPENAI_API_KEY).").
2. **Bump `TEXT_TOOL_VERSION`** in `text-tools.mjs` when the prompt goes in, so no old result is served.
3. **Add `OPENAI_API_KEY` to the Netlify site** if it is not already set for this function. Adam does this. Do not put it in the repo.
4. **Tests.** Mock `fetch` for `requestTechniqueScan`. The test network guard blocks real calls. Cover: a good reply, an empty reply that retries once, a missing key, and an upstream error.
5. **Run `npm run pre-pr-check`** from the repo root. It must exit 0 before the PR.

## Done looks like

- Scanning a 150-word extract returns a short list of real table techniques, each tied to a quote from the extract.
- Nothing reaches a student until Adam ticks and saves.
- The spinner only ever lands on a ticked technique.
- Scanning the same text twice costs one model call.

## Must not

- Send unreviewed scan results, or the model's explanations, to students.
- Spin through all 310 techniques.
- Put any API key, or any student's name, in the repo, tests or build files.
