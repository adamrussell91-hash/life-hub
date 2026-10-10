# Creatine tracking implementation plan

**Goal:** Persist additive creatine intake within meals and standalone doses, estimate loading and depletion from durable history, and render the approved Elastic card below Macros by day at half-page width.

**Architecture:** One browser/server pure model reads nutrition event records. Meals carry `creatine_g` directly so a confirmed meal and its supplement cannot drift. Standalone `creatine` records use stable `dose_key` slugs for corrections and idempotent retries. `creatine_plan` records carry effective-dated intake plans. Central Node publishes a dated, explicitly estimated summary after nutrition mutations. Agents read that summary and Brisket receives a bounded intake scan.

**Tech Stack:** Existing ES modules, GitHub event persistence, Netlify chat/confirmation handlers, token CSS and chart-kit SVG.

## Tasks

- [x] Record contracts: test valid/invalid dose and plan records, optional meal creatine, additive dose keys and correction slugs; extend validation, tool schema and Brisket recordTypes.
- [x] Shared model: test empty history, additive intakes, duplicate record identity, backdating, future exclusion, missed days, baseline depletion, effective plans, ETA ranges, slow vs rapid loading, incomplete history and pending time. Implement one pure engine used by dashboard and server.
- [x] Persistence: test real persist entry with an in-memory GitHub client, verifying summary after additions/corrections/backdating/removal and honest failure reporting. Update current CN Creatine line from full available history without replacing unrelated CN fields.
- [x] Agent wiring: Brisket's bounded creatine scan and explicit logging/plan/correction processes; science with links and model assumptions; Sara/Hammond/Chadwick consume summary only when relevant. Preserve confirm flow.
- [x] UI: chart-kit Elastic geometry, compact card, ETA/status, actual daily intake and planned daily routine, pending dose; responsive half-width placement below macro card. No slogans or stacked explanation panel. One-shot animation and reduced motion.
- [x] Verification: run new behavior tests, full root suite, Tasks vitest pre-PR gate, production build and real Nutrition browser checks at 1440/390/320. Compare to approved mockup. Independent spec and quality review; fix findings, create PR and attach it.

## Acceptance cases

1. Confirm protein water with 7g creatine, then confirm a standalone 5g: dashboard and CN both show 12g today.
2. Correct first record to 3g, then reload: 8g today; retries cannot double count.
3. Backdate missed intake: rebuild today's progress and ETA; don't replace today's summary with the past date.
4. Unlogged days contribute zero and deplete supplementary stores; ordinary gaps lead to a routine, not gram-for-gram catch-up.
5. History loading/error never pretends a partial scan is a personal measured saturation.
6. Forecast and pending contribution are model estimates, never an exact hour of muscle availability or a measured gram deficit.

## Science and limitations

AIS supports rapid loading ~0.3g/kg/day split for 5–7 days, or maintenance-style 3–5g/day over roughly four weeks. ISSN reports decline toward baseline over ~4–6 weeks. Weight can inform a discussed plan, but body fat and scale muscle mass do not measure creatine saturation. The model is an adherence-based interval calibrated to these population time ranges, not a validated individual pharmacokinetic model. The default routine is 5g/day, pending a confirmed plan; no automatic high-dose prescription. Product label and current CN clinical constraints govern advice.

## Ledger

Baseline: npm test, 5538 passed, 0 failed, 1 skipped.
Isolated fresh clone: /Users/adamrussell/Projects/life-hub-creatine, branch feat/creatine-tracker.

Verification after updating to main 7a8cbb79: mandatory pre-PR gate passed, 5,585 root tests (one skipped), 1,128 Tasks tests, Professional typecheck and static guards. Independent review resolved single-dose/meal coverage, 3g calibration, schema and responsive heading findings.

Final release verification on main 37f0f406: gate exit 0; 5,593 root tests passed (one skipped), 1,128 Tasks tests passed, Professional typecheck and static guards passed. Six real Chrome checks passed: Elastic at 1440/800/390/320 and both 390px dose/routine Confirm cards after long edits. Local all-hub build completed with a 2 GiB Node heap limit before the final main update; PR CI will verify the final combined production build. The phone confirmation R4 repeat and conservative curve/target alignment were fixed and regression tested.
