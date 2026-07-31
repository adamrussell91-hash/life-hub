# Life Hub Delivery Roadmap

The approved design is split into six independently testable implementation plans. Each phase ends with working software and a review gate.

1. **Foundation and data engine** — repository scaffold, effective-dated targets, Sydney-time helpers, canonical Markdown parsing and validation, calculations, trends, search, fixtures, and Central Node migration.
2. **Read-only PWA** — Clinical Glass shell, responsive navigation, fixture-backed Home and domain views, charts, Calendar, local search, sanitized Markdown, install assets, and cached read-only offline behavior.
3. **Authenticated GitHub sync** — Netlify authentication/session functions, allowlisted repository reads, manifest caching, incremental refresh, health checks, and credential-expiry states.
4. **Agent chat and write loop** — Notion instruction migration, deterministic routing, recent-history digests, Anthropic streaming and tools, schema-validated/idempotent GitHub writes, partial-failure recovery, and immediate domain refresh.
5. **Day One delivery** — Penelope diary completion, Resend dispatch, symbolic `DAYONE_EMAIL`, saved-entry/send-failure behavior, and authenticated resend.
6. **Release hardening and deployment** — final agent colours, accessibility and browser acceptance, secret audit, operational runbook verification, Netlify preview, production promotion, and rollback exercise.

Plans are written immediately before their phase so they can incorporate the verified interfaces and review findings from the preceding phase without silently changing product behavior.

